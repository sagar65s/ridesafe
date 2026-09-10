import { NextResponse } from 'next/server';
import { paymentService } from '@/lib/services/paymentService';
import { getUserFromSession } from '@/lib/auth';
import { getCurrentUser } from '@/lib/authorization';

export async function POST() {
  const permissionSession = await getUserFromSession()
  if (permissionSession?.role === 'ADMIN') return NextResponse.json({ error: 'School Admin access required' }, { status: 403 })
  try {
    const session = await getUserFromSession();
    if (!session || !['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const actor = await getCurrentUser();
    if (!actor || (actor.role !== 'SUPER_ADMIN' && !actor.organizationId)) return NextResponse.json({ error: 'School assignment required' }, { status: 403 });
    const result = await paymentService.syncInvoices(actor.role === 'SUPER_ADMIN' ? undefined : actor.organizationId!);
    return NextResponse.json(result);
  } catch (e: unknown) {
    console.error("Billing Sync Error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
