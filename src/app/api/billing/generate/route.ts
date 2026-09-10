import { NextResponse } from 'next/server';
import { paymentService } from '@/lib/services/paymentService';
import { billingGenerateSchema, validateBody } from '@/lib/validation';
import { getUserFromSession } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
  const permissionSession = await getUserFromSession()
  if (permissionSession?.role === 'ADMIN') return NextResponse.json({ error: 'School Admin access required' }, { status: 403 })
  try {
    const session = await getUserFromSession();
    if (!session || !['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await req.json();
    const validation = validateBody(billingGenerateSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { parentId, amount } = validation.data;

    const targetParent = await prisma.user.findUnique({ where: { id: parentId }, select: { role: true, isActive: true, organizationId: true } });
    if (!targetParent || targetParent.role !== 'PARENT' || !targetParent.isActive) {
      return NextResponse.json({ error: 'Select an active parent account' }, { status: 400 });
    }

    if (session.role !== 'SUPER_ADMIN') {
      const [actor, parent] = await Promise.all([
        prisma.user.findUnique({ where: { id: session.id }, select: { organizationId: true } }),
        Promise.resolve(targetParent),
      ]);
      if (!parent || parent.role !== 'PARENT' || !actor?.organizationId || parent.organizationId !== actor.organizationId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }


    // Default due date to 30 days from now
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const result = await paymentService.generateBilling(parentId, Number(amount), dueDate);
    
    return NextResponse.json(result);
  } catch (e: unknown) {
    console.error("Billing Generation Error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
