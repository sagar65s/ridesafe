import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromSession } from '@/lib/auth';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ parentId: string }> }
) {
  try {
    const session = await getUserFromSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const actor = await prisma.user.findUnique({ where: { id: session.id }, select: { organizationId: true } });
    const parentId = (await params).parentId;
    
    // Allow users to pass 'all' roughly for admin to query all 
    if (parentId === 'all') {
      if (!['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(session.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const allPayments = await prisma.payment.findMany({
        where: session.role === 'SUPER_ADMIN' ? {} : { parent: { organizationId: actor?.organizationId || '__none__' } },
        include: { parent: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' }
      });
      return NextResponse.json({ payments: allPayments });
    }

    if (session.role === 'PARENT' && session.id !== parentId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!['PARENT', 'ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (session.role !== 'PARENT' && session.role !== 'SUPER_ADMIN') {
      const parent = await prisma.user.findUnique({ where: { id: parentId }, select: { organizationId: true } });
      if (!parent || parent.organizationId !== actor?.organizationId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payments = await prisma.payment.findMany({
      where: { parentId },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({ payments });
  } catch (e: unknown) {
    console.error("Billing Fetch Error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
