import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.RESET_EMAIL?.trim().toLowerCase();
  const password = process.env.RESET_PASSWORD;
  if (!email || !password) throw new Error('Set RESET_EMAIL and RESET_PASSWORD explicitly.');
  if (password.length < 12) throw new Error('RESET_PASSWORD must contain at least 12 characters.');
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PASSWORD_RESET !== 'true') {
    throw new Error('Production password reset blocked. Set ALLOW_PASSWORD_RESET=true only for an approved operation.');
  }

  const result = await prisma.user.updateMany({
    where: { email },
    data: { password: await bcrypt.hash(password, 12) },
  });
  if (result.count !== 1) throw new Error(`Expected exactly one matching user; found ${result.count}.`);
  console.log(`Password updated for ${email}.`);
}

main()
  .catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
