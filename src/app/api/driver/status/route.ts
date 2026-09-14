import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/authorization";
import {
  crewWhere,
  ACTIVE_TRIP_STATUSES,
  isServiceType,
  studentUsesBus,
} from "@/lib/transport";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const actor = await getCurrentUser();
    if (!actor || actor.role !== "DRIVER")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const bus = await prisma.bus.findFirst({
      where: {
        ...crewWhere(actor.id),
        organizationId: actor.organizationId || "__none__",
        status: "ACTIVE",
      },
      include: {
        organization: {
          select: { id: true, name: true, address: true, phone: true },
        },
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            licenseNumber: true,
            employmentStatus: true,
          },
        },
        maintainer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            employmentStatus: true,
          },
        },
        route: { include: { stops: { orderBy: { order: "asc" } } } },
      },
    });
    const activeTrip = bus
      ? await prisma.trip.findFirst({
          where: {
            busId: bus.id,
            ...crewWhere(actor.id),
            status: { in: ACTIVE_TRIP_STATUSES },
          },
          include: {
            attendances: { orderBy: { timestamp: "asc" } },
            attendanceRequests: {
              where: { status: "PENDING" },
              select: {
                id: true,
                studentId: true,
                action: true,
                requestedAt: true,
                parent: { select: { name: true } },
              },
            },
          },
        })
      : null;
    const requestedService = new URL(request.url).searchParams.get(
      "serviceType",
    );
    const serviceType = isServiceType(activeTrip?.serviceType)
      ? activeTrip.serviceType
      : isServiceType(requestedService)
        ? requestedService
        : "MORNING";
    const assignedStudents = bus
      ? await prisma.student.findMany({
          where: {
            busId: bus.id,
            organizationId: bus.organizationId,
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            grade: true,
            studentCode: true,
            parentContact1: true,
            parentId: true,
            routeId: true,
            pickupStopId: true,
            dropoffStopId: true,
            pickupStop: true,
            dropoffStop: true,
            isSelfPickup: true,
            selfPickupSession: true,
          },
          orderBy: { name: "asc" },
        })
      : [];
    const routeStudents = assignedStudents.filter(
      (student) => student.routeId === bus?.routeId,
    );
    const students = routeStudents.filter((student) =>
      studentUsesBus(student, serviceType),
    );
    const setupIssues: string[] = [];
    if (!bus)
      setupIssues.push("No active bus is assigned to this crew account.");
    else {
      if (!bus.routeId || !bus.route)
        setupIssues.push("Assign an active route to this bus.");
      if (!bus.driverId && !bus.maintainerId)
        setupIssues.push("Assign an active driver or maintainer to this bus.");
      const mismatched = assignedStudents.length - routeStudents.length;
      if (mismatched)
        setupIssues.push(
          `${mismatched} student(s) are assigned to this bus with a different route.`,
        );
      const incomplete = students.filter(
        (student) =>
          !student.parentId || !student.pickupStopId || !student.dropoffStopId,
      ).length;
      if (incomplete)
        setupIssues.push(
          `Complete parent, pickup and drop-off stops for ${incomplete} student(s).`,
        );
      if (!students.length)
        setupIssues.push("Assign active students to this bus and route.");
    }
    return NextResponse.json({
      bus,
      activeTrip,
      serviceType,
      students,
      setupIssues,
      readyToStart: Boolean(
        bus?.route &&
        (bus.driverId || bus.maintainerId) &&
        students.length &&
        !setupIssues.length,
      ),
    });
  } catch (error) {
    console.error("Driver status error", error);
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    return NextResponse.json(
      {
        error: ["P2021", "P2022", "42703", "42P01"].includes(code)
          ? "Database update is pending. Run npx prisma migrate deploy and restart the app."
          : "Unable to load the crew workspace",
      },
      { status: 503 },
    );
  }
}
