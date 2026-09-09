import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_TEST_USERS !== 'true') {
    throw new Error('Test-user creation is disabled. Use a non-production database and set ALLOW_TEST_USERS=true explicitly.');
  }
  console.log('Creating/Updating test development accounts...');
  const testPassword = process.env.TEST_USER_PASSWORD;
  if (!testPassword || testPassword.length < 12) {
    throw new Error('TEST_USER_PASSWORD must contain at least 12 characters.');
  }
  const passwordHash = await bcrypt.hash(testPassword, 12);
  const organization = await prisma.organization.upsert({
    where: { id: 'ridesafe-development-organization' },
    update: { name: 'RideSafe Development School', isActive: true },
    create: { id: 'ridesafe-development-organization', name: 'RideSafe Development School' },
  });

  const testAccounts = [
    { name: 'School Admin Test Account', email: 'schooladmin@ridesafe.com', password: passwordHash, role: 'SCHOOL_ADMIN', phone: '+1 555-000-0098', organizationId: organization.id },
    {
      name: 'Super Admin Test Account',
      email: 'superadmin@ridesafe.com',
      password: passwordHash,
      role: 'SUPER_ADMIN',
      phone: '+1 555-000-0099',
      organizationId: null,
    },
    {
      name: 'Admin Test Account',
      email: 'admin@ridesafe.com',
      password: passwordHash,
      role: 'ADMIN',
      phone: '+1 555-000-0001',
      organizationId: organization.id,
    },
    {
      name: 'Driver Test Account',
      email: 'driver@ridesafe.com',
      password: passwordHash,
      role: 'DRIVER',
      phone: '+1 555-000-0002',
      organizationId: organization.id,
    },
    {
      name: 'Parent Test Account',
      email: 'parent@ridesafe.com',
      password: passwordHash,
      role: 'PARENT',
      phone: '+1 555-111-2222',
      organizationId: organization.id,
    },
  ];

  for (const account of testAccounts) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: {
        name: account.name,
        password: account.password,
        role: account.role,
        phone: account.phone,
        organizationId: account.role === 'SUPER_ADMIN' ? null : account.organizationId,
      },
      create: account,
    });
    console.log(`✅ [${user.role}] Created/Updated: ${user.email}`);
  }

  console.log('\n--- Development Test Accounts Ready ---');
  console.log('Test accounts use TEST_USER_PASSWORD.');
}

main()
  .catch((e) => {
    console.error('Error creating test accounts:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
