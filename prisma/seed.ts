import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    throw new Error('Destructive seed blocked. Use a non-production database and set ALLOW_DESTRUCTIVE_SEED=true explicitly.')
  }
  console.log('Seeding database...')

  // Clean existing data in foreign-key-safe order. This is intentionally
  // destructive and is protected by the guard above.
  await prisma.auditLog.deleteMany()
  await prisma.transportIssue.deleteMany()
  await prisma.driverAssignmentHistory.deleteMany()
  await prisma.academicCalendarImport.deleteMany()
  await prisma.rideRating.deleteMany()
  await prisma.payment.deleteMany()
  await prisma.trackingSession.deleteMany()
  await prisma.driverShift.deleteMany()
  await prisma.lostFoundItem.deleteMany()
  await prisma.maintenanceLog.deleteMany()
  await prisma.attendance.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.message.deleteMany()
  await prisma.trip.deleteMany()
  await prisma.stop.deleteMany()
  await prisma.emergencyAlert.deleteMany()
  await prisma.student.deleteMany()
  await prisma.bus.deleteMany()
  await prisma.route.deleteMany()
  await prisma.academicEvent.deleteMany()
  await prisma.user.deleteMany()
  await prisma.organization.deleteMany()
  await prisma.pendingRegistration.deleteMany()
  await prisma.announcement.deleteMany()
  await prisma.systemSetting.deleteMany()

  // Seed Settings
  await prisma.systemSetting.create({
    data: {
      key: 'PICKUP_TIMES',
      value: JSON.stringify(['3:00 PM', '4:00 PM', '5:00 PM'])
    }
  })

  const organization = await prisma.organization.create({
    data: {
      name: 'RideSafe Demo School',
      address: 'Kuala Lumpur, Malaysia',
      phone: '+60 3-0000 0000',
    },
  })

  // Seed Users
  const testPassword = process.env.TEST_USER_PASSWORD
  if (!testPassword || testPassword.length < 12) {
    throw new Error('TEST_USER_PASSWORD must contain at least 12 characters.')
  }
  const passwordHash = await bcrypt.hash(testPassword, 12)

  const admin = await prisma.user.create({
    data: {
      name: 'School Admin',
      email: 'admin@ridesafe.com',
      password: passwordHash,
      role: 'SUPER_ADMIN',
      phone: '+1 555-000-0001'
    }
  })

  const driver = await prisma.user.create({
    data: {
      name: 'John Driver',
      email: 'driver@ridesafe.com',
      password: passwordHash,
      role: 'DRIVER',
      phone: '+60 12-000 0002',
      organizationId: organization.id,
    }
  })

  const parent1 = await prisma.user.create({
    data: {
      name: 'Alice Parent',
      email: 'parent1@ridesafe.com',
      password: passwordHash,
      role: 'PARENT',
      phone: '+60 12-111 2222',
      organizationId: organization.id,
    }
  })

  const parent2 = await prisma.user.create({
    data: {
      name: 'Bob Parent',
      email: 'parent2@ridesafe.com',
      password: passwordHash,
      role: 'PARENT',
      phone: '+60 12-333 4444',
      organizationId: organization.id,
    }
  })

  // Seed Route
  const routeA = await prisma.route.create({
    data: {
      name: 'Morning Route A',
      morningTime: '7:30 AM',
      afternoonTime: '3:00 PM',
      organizationId: organization.id,
    }
  })

  // Seed Stops
  const stop1 = await prisma.stop.create({
    data: {
      name: 'Maple Street Corner',
      latitude: 3.1390,
      longitude: 101.6869,
      order: 1,
      routeId: routeA.id
    }
  })

  const stop2 = await prisma.stop.create({
    data: {
      name: 'Oak Avenue Gate',
      latitude: 3.1450,
      longitude: 101.6950,
      order: 2,
      routeId: routeA.id
    }
  })

  // Seed Bus
  const bus1 = await prisma.bus.create({
    data: {
      plateNumber: 'BUS-001',
      capacity: 30,
      status: 'ACTIVE',
      driverId: driver.id,
      routeId: routeA.id,
      organizationId: organization.id,
    }
  })

  // Seed Trip
  const trip1 = await prisma.trip.create({
    data: {
      routeId: routeA.id,
      driverId: driver.id,
      busId: bus1.id,
      status: 'TRIP_CREATED'
    }
  })

  // Seed Students
  await prisma.student.create({
    data: {
      name: 'Timmy Parent',
      grade: 'Grade 3',
      level: 'Primary',
      parentContact1: parent1.phone!,
      parentId: parent1.id,
      organizationId: organization.id,
      pickupTime: '3:00 PM',
      routeId: routeA.id,
      pickupStopId: stop1.id,
      dropoffStopId: stop2.id
    }
  })

  await prisma.student.create({
    data: {
      name: 'Sarah Parent',
      grade: 'Grade 1',
      level: 'Primary',
      parentContact1: parent2.phone!,
      parentId: parent2.id,
      organizationId: organization.id,
      isSelfPickup: true,
      routeId: routeA.id,
      pickupStopId: stop2.id,
      dropoffStopId: stop1.id
    }
  })

  await prisma.student.create({
    data: {
      name: 'Dave Student (No App Parent)',
      grade: 'Grade 5',
      level: 'Middle',
      parentContact1: '+1 555-999-8888',
      organizationId: organization.id,
      pickupTime: '4:00 PM',
      routeId: routeA.id,
      pickupStopId: stop1.id,
      dropoffStopId: stop2.id
    }
  })

  console.log('Database seeded successfully!')
  console.log('---------------------------')
  console.log('Test accounts created with TEST_USER_PASSWORD.')
  console.log('Admin : admin@ridesafe.com')
  console.log('Driver: driver@ridesafe.com')
  console.log('Parent: parent1@ridesafe.com')
  console.log('---------------------------')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
