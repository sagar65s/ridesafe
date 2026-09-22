import { NextRequest } from "next/server";

jest.mock("@/lib/authorization", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/audit", () => ({ writeAuditLog: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  __esModule: true,
  default: {
    organization: { findUnique: jest.fn() },
    attendanceRequest: { deleteMany: jest.fn() },
    attendance: { deleteMany: jest.fn() },
    attendanceImportRecord: { deleteMany: jest.fn() },
    academicEvent: { deleteMany: jest.fn() },
    academicCalendarImport: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";
import { POST } from "@/app/api/admin/data-reset/route";

const mock = (value: unknown) => value as jest.Mock;
const request = (body: object) => new NextRequest("http://localhost/api/admin/data-reset", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  jest.resetAllMocks();
  mock(getCurrentUser).mockResolvedValue({ id: "super", role: "SUPER_ADMIN" });
  mock(prisma.organization.findUnique).mockResolvedValue({ id: "school-a", name: "School A" });
  mock(prisma.$transaction).mockImplementation(async (work) => work(prisma));
  for (const model of [prisma.attendanceRequest, prisma.attendance, prisma.attendanceImportRecord, prisma.academicEvent, prisma.academicCalendarImport]) {
    mock(model.deleteMany).mockResolvedValue({ count: 2 });
  }
  mock(writeAuditLog).mockResolvedValue(undefined);
});

test("only Super Admin can reset school data", async () => {
  mock(getCurrentUser).mockResolvedValue({ id: "school-admin", role: "SCHOOL_ADMIN", organizationId: "school-a" });
  expect((await POST(request({ scope: "ATTENDANCE", organizationId: "school-a", confirmation: "School A" }))).status).toBe(403);
  expect(prisma.attendance.deleteMany).not.toHaveBeenCalled();
});

test("reset requires the exact selected school name", async () => {
  const response = await POST(request({ scope: "ATTENDANCE", organizationId: "school-a", confirmation: "another school" }));
  expect(response.status).toBe(400);
  expect(prisma.attendance.deleteMany).not.toHaveBeenCalled();
});

test("attendance reset is school scoped and preserves trips", async () => {
  const response = await POST(request({ scope: "ATTENDANCE", organizationId: "school-a", confirmation: "School A" }));
  expect(response.status).toBe(200);
  expect(prisma.attendance.deleteMany).toHaveBeenCalledWith({ where: { trip: { route: { organizationId: "school-a" } } } });
  expect(prisma.attendanceRequest.deleteMany).toHaveBeenCalledWith({ where: { trip: { route: { organizationId: "school-a" } } } });
  expect(prisma.attendanceImportRecord.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "school-a" } });
  expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "RESET", entityType: "ATTENDANCE", organizationId: "school-a" }));
});

test("calendar reset removes only the selected school's events and import log", async () => {
  const response = await POST(request({ scope: "ACADEMIC_CALENDAR", organizationId: "school-a", confirmation: "School A" }));
  expect(response.status).toBe(200);
  expect(prisma.academicEvent.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "school-a" } });
  expect(prisma.academicCalendarImport.deleteMany).toHaveBeenCalledWith({ where: { organizationId: "school-a" } });
  expect(prisma.attendance.deleteMany).not.toHaveBeenCalled();
});
