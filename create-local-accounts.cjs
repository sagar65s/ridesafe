const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const db = new PrismaClient();

async function main() {
  const database = new URL(process.env.DATABASE_URL);
  const app = new URL(process.env.APP_URL);

  if (
    !['postgres', 'ridesafe-db', 'localhost', '127.0.0.1'].includes(database.hostname) ||
    !['localhost', '127.0.0.1'].includes(app.hostname)
  ) {
    throw Error('Local Docker only. Hosted database/account changes blocked.');
  }

  const accounts = [
    ['Super Admin', 'superadmin@ridesafe.com', 'SUPER_ADMIN'],
    ['Admin', 'admin@ridesafe.com', 'ADMIN'],
    ['Driver', 'driver@ridesafe.com', 'DRIVER'],
    ['Parent', 'parent@ridesafe.com', 'PARENT'],
  ];

  const password = await bcrypt.hash('password123', 12);

  await db.$transaction(async tx => {
    const existing = await tx.user.findMany({
      where: { email: { in: accounts.map(a => a[1]) } },
      include: { organization: true },
    });

    for (const user of existing) {
      const expected = accounts.find(a => a[1] === user.email);
      if (user.role !== expected[2]) {
        throw Error(`Role mismatch for ${user.email}; no changes saved.`);
      }
      if (!user.isActive || user.organization?.isActive === false) {
        throw Error(`Inactive account/school: ${user.email}; no changes saved.`);
      }
    }

    const schools = [...new Set(
      existing
        .filter(u => u.role !== 'SUPER_ADMIN' && u.organizationId)
        .map(u => u.organizationId)
    )];

    if (schools.length > 1) {
      throw Error('These accounts belong to different schools; no changes saved.');
    }

    const school = schools.length
      ? await tx.organization.findUniqueOrThrow({
          where: { id: schools[0] },
        })
      : await tx.organization.upsert({
          where: { id: 'ridesafe-local-demo' },
          update: {},
          create: {
            id: 'ridesafe-local-demo',
            name: 'RideSafe Local Demo School',
          },
        });

    if (!school.isActive) throw Error('Demo school is inactive.');

    for (const [name, email, role] of accounts) {
      const user = existing.find(u => u.email === email);

      if (user) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            password,
            ...(role !== 'SUPER_ADMIN' && !user.organizationId
              ? { organizationId: school.id }
              : {}),
          },
        });
      } else {
        await tx.user.create({
          data: {
            name, email, role, password,
            isActive: true,
            organizationId: role === 'SUPER_ADMIN' ? null : school.id,
            personnelType: role === 'DRIVER' ? 'DRIVER' : null,
          },
        });
      }
    }
  });

  console.table(accounts.map(([role, email]) => ({ role, email })));
  console.log('Local accounts ready. Password: password123');
}

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());