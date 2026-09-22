import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/authorization";
import {
  ACTIVE_TRIP_STATUSES,
  crewWhere,
  studentUsesBus,
} from "@/lib/transport";
import { pushNotification } from "@/lib/notification-delivery";
import {crewAttendanceFilter} from '@/lib/attendance-import-source'

export const dynamic = "force-dynamic";
const ACTIONS = ["PICKED_UP", "DROPPED_OFF"] as const;

export async function GET() {
  const actor = await getCurrentUser();
  if (!actor)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const where =
      actor.role === "PARENT"
        ? { parentId: actor.id, trip: { status: { in: ACTIVE_TRIP_STATUSES } } }
        : actor.role === "DRIVER"
          ? {
              trip: {
                ...crewWhere(actor.id),
                status: { in: ACTIVE_TRIP_STATUSES },
              },
            }
          : actor.role === "SUPER_ADMIN"
            ? {}
            : ["ADMIN", "SCHOOL_ADMIN"].includes(actor.role)
              ? {
                  student: {
                    organizationId: actor.organizationId || "__none__",
                  },
                }
              : null;
    if (!where)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const requests = await prisma.attendanceRequest.findMany({
      where,
      include: {
        student: { select: { id: true, name: true } },
        parent: { select: { name: true } },
        trip: {
          select: { id: true, serviceType: true, status: true, date: true },
        },
      },
      orderBy: { requestedAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ requests });
  } catch (error) {
    console.error("Attendance request GET error", error);
    return NextResponse.json(
      { error: "Unable to load parent confirmations" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "PARENT")
    return NextResponse.json(
      { error: "Only a parent can submit this confirmation" },
      { status: 403 },
    );
  const body = await request.json().catch(() => ({}));
  const action = ACTIONS.includes(body.action) ? body.action : "PICKED_UP";
  if (typeof body.studentId !== "string")
    return NextResponse.json({ error: "Choose a student" }, { status: 400 });
  try {
    const student = await prisma.student.findFirst({
      where: { id: body.studentId, parentId: actor.id, isActive: true },
      select: {
        id: true,
        name: true,
        busId: true,
        routeId: true,
        organizationId: true,
        isSelfPickup: true,
        selfPickupSession: true,
      },
    });
    if (!student?.busId || !student.routeId)
      return NextResponse.json(
        {
          error: "The school must assign this student to a bus and route first",
        },
        { status: 409 },
      );
    const trip = await prisma.trip.findFirst({
      where: {
        busId: student.busId,
        routeId: student.routeId,
        status: { in: ACTIVE_TRIP_STATUSES },
      },
      orderBy: { date: "desc" },
      select: {
        id: true,
        driverId: true,
        maintainerId: true,
        serviceType: true,
        route: { select: { organizationId: true } },
      },
    });
    if (
      !trip ||
      trip.route.organizationId !== student.organizationId ||
      !studentUsesBus(
        student,
        trip.serviceType as "MORNING" | "PM" | "AFTER_SCHOOL",
      )
    ) {
      return NextResponse.json(
        {
          error:
            "No active bus trip is available for this student’s current transport mode",
        },
        { status: 409 },
      );
    }
    const existingAttendance = await prisma.attendance.findFirst({
      where: { tripId: trip.id, studentId: student.id, action, ...crewAttendanceFilter },
      select: { id: true, timestamp: true },
    });
    const now = new Date();
    const confirmation = await prisma.attendanceRequest.upsert({
      where: {
        tripId_studentId_action: {
          tripId: trip.id,
          studentId: student.id,
          action,
        },
      },
      create: {
        tripId: trip.id,
        studentId: student.id,
        parentId: actor.id,
        action,
        status: existingAttendance ? "CONFIRMED" : "PENDING",
        confirmedAt: existingAttendance?.timestamp,
      },
      update: {
        status: existingAttendance ? "CONFIRMED" : "PENDING",
        requestedAt: now,
        confirmedAt: existingAttendance?.timestamp || null,
        confirmedById: null,
      },
    });
    const management = await prisma.user.findMany({
      where: {
        organizationId: student.organizationId || "__none__",
        role: { in: ["ADMIN", "SCHOOL_ADMIN"] },
        isActive: true,
      },
      select: { id: true },
    });
    const recipientIds = [
      trip.maintainerId || trip.driverId,
      ...management.map((item) => item.id),
    ].filter(
      (id, index, all): id is string =>
        Boolean(id) && all.indexOf(id) === index,
    );
    const label = action === "PICKED_UP" ? "boarded the bus" : "arrived home";
    const notifications = await Promise.all(
      recipientIds.map((userId) =>
        prisma.notification.upsert({
          where: {
            dedupeKey: `parent-confirmation:${trip.id}:${student.id}:${action}:${userId}`,
          },
          create: {
            userId,
            title: "Parent attendance confirmation",
            body: `${student.name}'s parent confirmed that the child ${label}. ${existingAttendance ? "Crew attendance already matches." : "Assigned crew must verify the attendance."}`,
            type: "ATTENDANCE_REQUEST",
            dedupeKey: `parent-confirmation:${trip.id}:${student.id}:${action}:${userId}`,
            metadata: JSON.stringify({
              requestId: confirmation.id,
              tripId: trip.id,
              studentId: student.id,
              action,
              parentConfirmed: true,
            }),
          },
          update: { read: false, createdAt: now },
        }),
      ),
    );
    await Promise.allSettled(notifications.map(pushNotification));
    return NextResponse.json({ request: confirmation });
  } catch (error) {
    console.error("Attendance request POST error", error);
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    return NextResponse.json(
      {
        error: ["P2021", "P2022", "42703", "42P01"].includes(code)
          ? "Database update is pending. Run npx prisma migrate deploy."
          : "Unable to send the parent attendance confirmation",
      },
      { status: code ? 503 : 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || actor.role !== "DRIVER")
    return NextResponse.json(
      { error: "Only assigned crew can review this request" },
      { status: 403 },
    );
  const body = await request.json().catch(() => ({}));
  if (typeof body.id !== "string" || body.status !== "REJECTED")
    return NextResponse.json(
      { error: "Invalid review details" },
      { status: 400 },
    );
  const item = await prisma.attendanceRequest.findUnique({
    where: { id: body.id },
    include: { trip: true },
  });
  if (
    !item ||
    (item.trip.driverId !== actor.id && item.trip.maintainerId !== actor.id)
  )
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (item.status !== "PENDING")
    return NextResponse.json(
      { error: "This request was already reviewed" },
      { status: 409 },
    );
  const updated = await prisma.attendanceRequest.update({
    where: { id: item.id },
    data: {
      status: "REJECTED",
      confirmedAt: new Date(),
      confirmedById: actor.id,
    },
  });
  return NextResponse.json({ request: updated });
}
