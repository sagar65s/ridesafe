import { NextResponse, NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {crewAttendanceFilter} from '@/lib/attendance-import-source'
import { getUserFromSession } from "@/lib/auth";
import { canAccessOrganization, getCurrentUser } from "@/lib/authorization";
import { studentUsesBus } from "@/lib/transport";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUserFromSession();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const data = await request.json();

    if (user.role === "PARENT")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${id} FOR UPDATE`;
      const trip = await tx.trip.findUnique({ where: { id } });
      if (!trip)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      if (
        user.role === "DRIVER" &&
        trip.driverId !== user.id &&
        trip.maintainerId !== user.id
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (["ADMIN", "SCHOOL_ADMIN"].includes(user.role)) {
        const [actor, route] = await Promise.all([
          getCurrentUser(),
          prisma.route.findUnique({
            where: { id: trip.routeId },
            select: { organizationId: true },
          }),
        ]);
        if (
          !actor ||
          !route ||
          !canAccessOrganization(actor, route.organizationId)
        )
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      } else if (!["DRIVER", "SUPER_ADMIN"].includes(user.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      if (["TRIP_COMPLETED", "CANCELLED"].includes(trip.status)) {
        return NextResponse.json(
          { error: "This trip is already closed" },
          { status: 409 },
        );
      }
      if (data.status === "TRIP_CREATED")
        return NextResponse.json(
          { error: "A started trip cannot return to created status" },
          { status: 409 },
        );
      const validStatuses = [
        "TRIP_CREATED",
        "DRIVER_STARTED_ROUTE",
        "BUS_EN_ROUTE",
        "TRIP_COMPLETED",
        "CANCELLED",
      ];
      if (data.status && !validStatuses.includes(data.status))
        return NextResponse.json(
          { error: "Invalid trip status" },
          { status: 400 },
        );
      if (
        data.delayMinutes !== undefined &&
        (!Number.isInteger(Number(data.delayMinutes)) ||
          Number(data.delayMinutes) < 0 ||
          Number(data.delayMinutes) > 600)
      )
        return NextResponse.json(
          { error: "Delay must be between 0 and 600 minutes" },
          { status: 400 },
        );
      if (
        data.delayReason !== undefined &&
        String(data.delayReason || "").length > 500
      )
        return NextResponse.json(
          { error: "Delay reason is too long" },
          { status: 400 },
        );

      let completedStopOrder: number | undefined;
      if (data.completeStopId !== undefined) {
        if (typeof data.completeStopId !== "string")
          return NextResponse.json(
            { error: "Choose a valid route stop" },
            { status: 400 },
          );
        const stops = await tx.stop.findMany({
          where: { routeId: trip.routeId },
          orderBy: { order: "asc" },
          select: { id: true, order: true, name: true },
        });
        const nextStop = stops.find(
          (stop) => stop.order > (trip.currentStopOrder || 0),
        );
        if (!nextStop)
          return NextResponse.json(
            { error: "All route stops are already completed" },
            { status: 409 },
          );
        if (nextStop.id !== data.completeStopId)
          return NextResponse.json(
            { error: `Complete ${nextStop.name} before the next stop` },
            { status: 409 },
          );
        completedStopOrder = nextStop.order;
      }

      if (data.status === "TRIP_COMPLETED") {
        const lastStop =
          trip.currentStopOrder === undefined
            ? null
            : await tx.stop.findFirst({
                where: { routeId: trip.routeId },
                orderBy: { order: "desc" },
                select: { order: true, name: true },
              });
        if (
          lastStop &&
          trip.currentStopOrder !== undefined &&
          trip.currentStopOrder < lastStop.order
        )
          return NextResponse.json(
            {
              error: `Complete the route stops through ${lastStop.name} before ending the trip`,
            },
            { status: 409 },
          );
        const assigned = await tx.student.findMany({
          where: { routeId: trip.routeId, isActive: true, busId: trip.busId },
          select: { id: true, parentId: true, isSelfPickup: true, selfPickupSession: true },
        });
        const students = assigned.filter((student) =>
          studentUsesBus(
            student,
            trip.serviceType as "MORNING" | "PM" | "AFTER_SCHOOL",
          ),
        );
        const attendances = await tx.attendance.findMany({
          where: { tripId: trip.id, ...crewAttendanceFilter },
          select: { studentId: true, action: true },
        });
        const incomplete = students.filter((student) => {
          const actions = attendances
            .filter((item) => item.studentId === student.id)
            .map((item) => item.action);
          return (
            !actions.includes("ABSENT") &&
            !(actions.includes("PICKED_UP") && actions.includes("DROPPED_OFF"))
          );
        });
        if (incomplete.length)
          return NextResponse.json(
            {
              error: `Complete attendance for ${incomplete.length} student(s) before ending the trip`,
            },
            { status: 409 },
          );
        // Freeze the parent's part of the attendance audit when a trip closes.
        // An explicit NOT_SUBMITTED row makes missed parent confirmations a
        // durable history record instead of an inference that can change later.
        await tx.attendanceRequest?.createMany({
          data: students.flatMap((student) =>
            student.parentId
              ? (["PICKED_UP", "DROPPED_OFF"] as const).map((action) => ({
                  tripId: trip.id,
                  studentId: student.id,
                  parentId: student.parentId!,
                  action,
                  status: "NOT_SUBMITTED",
                }))
              : [],
          ),
          skipDuplicates: true,
        });
      }

      const updated = await tx.trip.update({
        where: { id },
        data: {
          ...(data.status && { status: data.status }),
          ...(data.delayMinutes !== undefined && {
            delayMinutes: Number(data.delayMinutes),
          }),
          ...(data.delayReason !== undefined && {
            delayReason: data.delayReason?.trim() || null,
          }),
          ...(completedStopOrder !== undefined && {
            currentStopOrder: completedStopOrder,
            status: "BUS_EN_ROUTE",
          }),
        },
      });
      const route = await tx.route.findUnique({
        where: { id: trip.routeId },
        select: { organizationId: true },
      });
      try {
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            organizationId: route?.organizationId,
            action:
              data.status === "TRIP_COMPLETED"
                ? "COMPLETE"
                : data.delayMinutes
                  ? "DELAY"
                  : "UPDATE",
            entityType: "TRIP",
            entityId: trip.id,
            details: JSON.stringify({
              status: updated.status,
              delayMinutes: updated.delayMinutes,
              delayReason: updated.delayReason,
              completedStopOrder,
            }),
          },
        });
      } catch (auditError) {
        console.error("Trip updated but audit logging failed", auditError);
      }

      return NextResponse.json({ trip: updated });
    });
  } catch (error) {
    console.error("Trip PATCH Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
