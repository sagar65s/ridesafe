import { NextResponse, NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getUserFromSession } from "@/lib/auth";
import { canAccessOrganization, getCurrentUser } from "@/lib/authorization";
import {ARCHIVE_MIGRATION_ERROR,isArchiveTableMissing} from '@/lib/attendance-archive'
import {isImportedAttendance,crewAttendanceFilter} from '@/lib/attendance-import-source'
import {
  nextAttendanceAction,
  distanceKm,
  studentUsesBus,
} from "@/lib/transport";
import {
  pushNotification,
  transportMessage,
} from "@/lib/notification-delivery";

export const dynamic = "force-dynamic";

class AttendanceError extends Error {
  constructor(
    message: string,
    readonly code = "ATTENDANCE_ERROR",
    readonly details: Record<string, number | string> = {},
  ) {
    super(message);
  }
}
const ADMIN_ROLES = ["ADMIN", "SUPER_ADMIN", "SCHOOL_ADMIN"];

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromSession();
    if (!user || !ADMIN_ROLES.includes(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const actor = await getCurrentUser();
    if (!actor)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const dateParam =
      searchParams.get("date") ||
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
    const routeId = searchParams.get("routeId") || undefined;
    const requestedOrganizationId =
      searchParams.get("organizationId") || undefined;
    if (actor.role === "SUPER_ADMIN" && !requestedOrganizationId)
      return NextResponse.json({ trips: [], archived: [], date: dateParam });
    const organizationId =
      actor.role === "SUPER_ADMIN"
        ? requestedOrganizationId
        : actor.organizationId || "__none__";

    const dayStart = new Date(`${dateParam}T00:00:00.000+08:00`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    if (isNaN(dayStart.getTime())) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const selectedRoute = routeId ? await prisma.route.findFirst({where:{id:routeId,organizationId},select:{name:true}}) : null;
    if(routeId&&!selectedRoute)return NextResponse.json({error:"Route not found in this school"},{status:404});
    let archiveAvailable=true;
    const [trips,archived] = await Promise.all([prisma.trip.findMany({
      where: {
        date: { gte: dayStart, lt: dayEnd },
        ...(routeId ? { routeId } : {}),
        route: { organizationId },
      },
      orderBy: { date: "asc" },
      include: {
        route: { select: { id: true, name: true } },
        driver: { select: { id: true, name: true } },
        bus: { select: { plateNumber: true } },
        attendances: {
          orderBy: { timestamp: "asc" },
          include: {
          student: { select: { id: true, name: true, grade: true, studentCode: true } },
          },
        },
        attendanceRequests: {
          select: { studentId: true, action: true, status: true, requestedAt: true },
        },
      },
    }),prisma.attendanceImportRecord.findMany({
      where:{organizationId,date:{gte:dayStart,lt:dayEnd},...(selectedRoute?{routeName:{equals:selectedRoute.name,mode:'insensitive' as const}}:{})},
      orderBy:{createdAt:'desc'},take:5000,
      select:{id:true,date:true,session:true,status:true,studentName:true,studentCode:true,matchedStudentId:true,routeName:true,busLabel:true,time:true,sourceFile:true},
    }).catch(error=>{
      if(!isArchiveTableMissing(error))throw error;
      archiveAvailable=false;
      return [];
    })]);

    const routeIds = [...new Set(trips.map((t) => t.routeId))];
    const rosterByRoute = new Map<
      string,
      {
        id: string;
        name: string;
        grade: string;
        studentCode: string | null;
        busId: string | null;
        isSelfPickup: boolean;
        selfPickupSession: string | null;
      }[]
    >();
    if (routeIds.length > 0) {
      const students = await prisma.student.findMany({
        where: { routeId: { in: routeIds }, isActive: true },
        select: {
          id: true,
          name: true,
          grade: true,
          studentCode: true,
          routeId: true,
          busId: true,
          isSelfPickup: true,
          selfPickupSession: true,
        },
      });
      for (const s of students) {
        if (!s.routeId) continue;
        if (!rosterByRoute.has(s.routeId)) rosterByRoute.set(s.routeId, []);
        rosterByRoute.get(s.routeId)!.push({
          id: s.id,
          name: s.name,
          grade: s.grade,
          studentCode: s.studentCode,
          busId: s.busId,
          isSelfPickup: s.isSelfPickup,
          selfPickupSession: s.selfPickupSession,
        });
      }
    }

    const result = trips.map((t) => {
      // Latest attendance record per student (in case of duplicate taps)
      const latestByStudent = new Map<string, (typeof t.attendances)[number]>();
      for (const a of t.attendances) {
        const previous=latestByStudent.get(a.studentId)
        if(!previous||isImportedAttendance(previous)||!isImportedAttendance(a))latestByStudent.set(a.studentId,a)
      }

      const roster = (rosterByRoute.get(t.routeId) || [])
        .filter(
          (s) =>
            s.busId === t.busId &&
            studentUsesBus(
              s,
              t.serviceType as "MORNING" | "PM" | "AFTER_SCHOOL",
            ),
        )
        .map((s) => {
          const a = latestByStudent.get(s.id);
          const parentPickup = t.attendanceRequests.find((r) => r.studentId === s.id && r.action === "PICKED_UP");
          const parentDropoff = t.attendanceRequests.find((r) => r.studentId === s.id && r.action === "DROPPED_OFF");
          return {
            studentId: s.id,
            studentCode: s.studentCode,
            name: s.name,
            grade: s.grade,
            status: a?.action || "NOT_MARKED",
            attendanceId: a?.id || null,
            timestamp: a?.timestamp || null,
            source:a?isImportedAttendance(a)?'SCHOOL_IMPORT':'CREW_VERIFIED':'NOT_MARKED',
            parentPickupStatus: parentPickup?.status || "NOT_SUBMITTED",
            parentDropoffStatus: parentDropoff?.status || "NOT_SUBMITTED",
          };
        });

      for (const [studentId, a] of latestByStudent) {
        if (!roster.some((s) => s.studentId === studentId))
          roster.push({
            studentId,
            studentCode: a.student.studentCode,
            name: a.student.name,
            grade: a.student.grade,
            status: a.action,
            attendanceId: a.id,
            timestamp: a.timestamp,
            source:isImportedAttendance(a)?'SCHOOL_IMPORT':'CREW_VERIFIED',
            parentPickupStatus: t.attendanceRequests.find((r) => r.studentId === studentId && r.action === "PICKED_UP")?.status || "NOT_SUBMITTED",
            parentDropoffStatus: t.attendanceRequests.find((r) => r.studentId === studentId && r.action === "DROPPED_OFF")?.status || "NOT_SUBMITTED",
          });
      }

      return {
        tripId: t.id,
        date: t.date,
        serviceType: t.serviceType,
        status: t.status,
        routeId: t.route.id,
        routeName: t.route.name,
        driverName: t.driver.name,
        busPlate: t.bus?.plateNumber || null,
        roster,
      };
    });

    return NextResponse.json({ trips: result, archived, archiveAvailable,archiveError:archiveAvailable?null:ARCHIVE_MIGRATION_ERROR,date: dateParam },{headers:{'Cache-Control':'no-store'}});
  } catch (error) {
    console.error("Attendance GET Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || !["DRIVER", "SUPER_ADMIN", "SCHOOL_ADMIN"].includes(actor.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const data = await request.json().catch(() => ({}));
  if (
    typeof data.tripId !== "string" ||
    typeof data.studentId !== "string" ||
    !["PICKED_UP", "DROPPED_OFF", "ABSENT"].includes(data.action)
  )
    return NextResponse.json(
      { error: "Invalid attendance details" },
      { status: 400 },
    );
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${data.tripId} FOR UPDATE`;
      const trip = await tx.trip.findUnique({
        where: { id: data.tripId },
        include: { route: true },
      });
      const student = await tx.student.findUnique({
        where: { id: data.studentId },
        include: {
          pickupStop: true,
          dropoffStop: true,
          parent: { select: { id: true, locale: true } },
        },
      });
      if (
        !trip ||
        !student ||
        !student.isActive ||
        !studentUsesBus(
          student,
          trip.serviceType as "MORNING" | "PM" | "AFTER_SCHOOL",
        ) ||
        student.routeId !== trip.routeId ||
        student.busId !== trip.busId ||
        student.organizationId !== trip.route.organizationId
      )
        throw new AttendanceError(
          "Invalid trip or student assignment for this transport service",
        );
      if (
        !canAccessOrganization(actor, trip.route.organizationId) ||
        (actor.role === "DRIVER" &&
          actor.id !== trip.driverId &&
          actor.id !== trip.maintainerId)
      )
        return { forbidden: true };
      if (!["DRIVER_STARTED_ROUTE", "BUS_EN_ROUTE"].includes(trip.status))
        throw new AttendanceError("This trip is closed");
      const history = await tx.attendance.findMany({
        where: { tripId: trip.id, studentId: student.id, ...crewAttendanceFilter },
        orderBy: { timestamp: "asc" },
      });
      const previous = history.find((item) => item.action === data.action);
      if (previous) return { attendance: previous, idempotent: true };
      const expected = nextAttendanceAction(history.map((item) => item.action));
      if (
        !expected ||
        (data.action === "ABSENT" && expected !== "PICKED_UP") ||
        (data.action !== "ABSENT" && data.action !== expected)
      )
        throw new AttendanceError("Invalid attendance transition");
      const stop =
        data.action === "DROPPED_OFF"
          ? student.dropoffStop
          : student.pickupStop;
      if (data.action !== "ABSENT" && (!stop || data.stopId !== stop.id))
        throw new AttendanceError("Use the assigned student stop");
      const staff = await tx.user.findUnique({
        where: { id: actor.id },
        select: { name: true },
      });
      // Staff must explicitly confirm the stop. A supplied fresh GPS position is checked too.
      const latitude = typeof data.latitude === "number" ? data.latitude : null;
      const longitude =
        typeof data.longitude === "number" ? data.longitude : null;
      if (data.action !== "ABSENT" && data.confirmStop !== true)
        throw new AttendanceError(
          "Confirm that the bus is at the assigned stop",
        );
      let gpsDistanceM: number | null = null;
      if (
        latitude !== null &&
        longitude !== null &&
        stop &&
        data.action !== "ABSENT"
      ) {
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          Math.abs(latitude) > 90 ||
          Math.abs(longitude) > 180
        )
          throw new AttendanceError("The GPS coordinate is invalid");
        gpsDistanceM = Math.round(
          distanceKm({ latitude, longitude }, stop) * 1000,
        );
        if (gpsDistanceM > 300 && data.gpsOverride !== true)
          throw new AttendanceError(
            "GPS is more than 300 metres from the assigned stop",
            "GPS_MISMATCH",
            { distanceMetres: gpsDistanceM },
          );
        if (
          gpsDistanceM > 300 &&
          data.overrideReason !== "CREW_VISUAL_CONFIRMATION"
        )
          throw new AttendanceError(
            "Visually verify the student before overriding the GPS warning",
          );
      }
      const gpsOverride = Boolean(
        gpsDistanceM !== null &&
        gpsDistanceM > 300 &&
        data.gpsOverride === true,
      );
      const attendance = await tx.attendance.create({
        data: {
          tripId: trip.id,
          studentId: student.id,
          stopId: data.action === "ABSENT" ? null : stop!.id,
          action: data.action,
          latitude,
          longitude,
          gpsOverride,
          gpsDistanceM,
          recordedById: actor.id,
          dedupeKey: `${trip.id}:${student.id}:${data.action}`,
        },
      });
      if (gpsOverride)
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            organizationId: trip.route.organizationId,
            action: "GPS_OVERRIDE",
            entityType: "ATTENDANCE",
            entityId: attendance.id,
            details: JSON.stringify({
              tripId: trip.id,
              studentId: student.id,
              stopId: stop?.id,
              gpsDistanceM,
              reason: data.overrideReason,
            }),
          },
        });
      // Compatibility with older test doubles; deployed Prisma clients always
      // expose this model after the migration below is applied.
      await tx.attendanceRequest?.updateMany({
        where: {
          tripId: trip.id,
          studentId: student.id,
          action: data.action,
          status: "PENDING",
        },
        data: {
          status: "CONFIRMED",
          confirmedAt: attendance.timestamp,
          confirmedById: actor.id,
        },
      });
      await tx.student.update({
        where: { id: student.id },
        data: {
          status:
            data.action === "PICKED_UP"
              ? "CHECKED_OUT"
              : data.action === "DROPPED_OFF"
                ? "DROPPED_OFF"
                : "PENDING",
        },
      });
      const notification = student.parent
        ? await tx.notification.create({
            data: {
              userId: student.parent.id,
              ...transportMessage(
                student.parent.locale,
                data.action,
                student.name,
                stop?.name || "",
                staff?.name || "",
              ),
              type: data.action,
              metadata: JSON.stringify({
                studentName: student.name,
                stopName: stop?.name || "",
                actorName: staff?.name || "",
                studentId: student.id,
                tripId: trip.id,
                stopId: stop?.id,
                timestamp: attendance.timestamp,
              }),
              dedupeKey: `attendance:${attendance.id}`,
            },
          })
        : null;
      return { attendance, notification };
    });
    if ("forbidden" in result)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (result.notification) {
      try {
        await pushNotification(result.notification);
      } catch (notificationError) {
        console.error(
          "Attendance saved but parent push delivery failed",
          notificationError,
        );
      }
    }
    return NextResponse.json({
      attendance: result.attendance,
      idempotent: result.idempotent || false,
    });
  } catch (error) {
    if (error instanceof AttendanceError)
      return NextResponse.json(
        { error: error.message, code: error.code, ...error.details },
        { status: 409 },
      );
    console.error("Attendance error", error);
    return NextResponse.json(
      { error: "Unable to record attendance" },
      { status: 500 },
    );
  }
}
