import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

const RESET_SCOPES = ["ATTENDANCE", "ACADEMIC_CALENDAR"] as const;
type ResetScope = (typeof RESET_SCOPES)[number];

export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Only Super Admin can reset school data" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const scope = typeof body.scope === "string" ? body.scope as ResetScope : "";
  const confirmation = typeof body.confirmation === "string" ? body.confirmation.trim() : "";
  if (!organizationId || !RESET_SCOPES.includes(scope as ResetScope)) {
    return NextResponse.json({ error: "Select a school and a valid reset type" }, { status: 400 });
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!organization) return NextResponse.json({ error: "School not found" }, { status: 404 });
  if (confirmation !== organization.name) {
    return NextResponse.json({ error: "Type the exact school name to confirm the reset" }, { status: 400 });
  }

  try {
    const counts = await prisma.$transaction(async (tx) => {
      if (scope === "ATTENDANCE") {
        const [parentConfirmations, attendance, importedHistory] = await Promise.all([
          tx.attendanceRequest.deleteMany({ where: { trip: { route: { organizationId } } } }),
          tx.attendance.deleteMany({ where: { trip: { route: { organizationId } } } }),
          tx.attendanceImportRecord.deleteMany({ where: { organizationId } }),
        ]);
        return {
          parentConfirmations: parentConfirmations.count,
          attendance: attendance.count,
          importedHistory: importedHistory.count,
        };
      }

      const [events, imports] = await Promise.all([
        tx.academicEvent.deleteMany({ where: { organizationId } }),
        tx.academicCalendarImport.deleteMany({ where: { organizationId } }),
      ]);
      return { events: events.count, imports: imports.count };
    }, { maxWait: 10_000, timeout: 30_000 });

    await writeAuditLog({
      actorId: actor.id,
      organizationId,
      action: "RESET",
      entityType: scope,
      details: counts,
    });
    return NextResponse.json({ success: true, scope, organization, counts });
  } catch (error) {
    console.error("School data reset failed:", error);
    return NextResponse.json({ error: "Reset failed; no partial reset was committed" }, { status: 500 });
  }
}
