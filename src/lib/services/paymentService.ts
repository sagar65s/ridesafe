import { bukkuAdapter } from '../adapters/bukku'
import prisma from '../prisma'
import { Resend } from 'resend'

export class PaymentService {
  /**
   * Generates a new invoice via Bukku and logs it into the local RideSafe DB
   */
  async generateBilling(parentId: string, amount: number, dueDate?: Date) {
    const parent = await prisma.user.findUnique({ where: { id: parentId } });
    if (!parent) throw new Error("Parent not found");

    // 1. External Integration: Invoke Bukku
    const bukkuRes = await bukkuAdapter.createInvoice(parent.name, amount, dueDate);
    
    // Always persist a valid local invoice and deliver it to the parent's
    // in-app inbox. When Bukku is unavailable the invoice is queued instead
    // of making the admin button fail or losing the billing request.
    const providerReady = Boolean(bukkuRes.success && bukkuRes.invoiceId);
    const providerInvoiceId = providerReady ? bukkuRes.invoiceId : null;
    const status = providerReady ? (bukkuRes.status || 'PENDING') : 'PENDING_PROVIDER';
    if (!providerReady) console.warn('Bukku unavailable; invoice queued locally for parent', parentId);

    const dueLabel = dueDate ? dueDate.toLocaleDateString('en-MY') : 'the stated due date';
    const result = await prisma.$transaction(async tx => {
      const payment = await tx.payment.create({
        data: { parentId, amount, bukkuInvoiceId: providerInvoiceId, status, dueDate }
      });
      await tx.notification.create({
        data: {
          userId: parentId,
          title: 'RideSafe invoice',
          body: `Invoice ${providerInvoiceId || payment.id} for RM ${amount.toFixed(2)} is due by ${dueLabel}.${bukkuRes.url ? ` Pay/view: ${bukkuRes.url}` : ' Please contact the school office for payment details.'}`,
          type: 'INVOICE',
        }
      });
      return payment;
    });

    let emailStatus: 'NOT_CONFIGURED' | 'SENT' | 'FAILED' = 'NOT_CONFIGURED';
    if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const { error } = await resend.emails.send({
          from: process.env.EMAIL_FROM,
          to: parent.email,
          subject: `RideSafe invoice ${providerInvoiceId || result.id}`,
          text: `Hello ${parent.name},\n\nYour RideSafe invoice for RM ${amount.toFixed(2)} is due by ${dueLabel}.${bukkuRes.url ? `\n\nView or pay: ${bukkuRes.url}` : '\n\nPlease contact the school office for payment details.'}\n\nRideSafe`,
        });
        emailStatus = error ? 'FAILED' : 'SENT';
        if (error) console.error('Invoice email provider rejected the message:', error.message);
      } catch (error) {
        emailStatus = 'FAILED';
        console.error('Invoice email delivery failed:', error instanceof Error ? error.message : 'Unknown error');
      }
    }

    return {
      payment: result,
      invoiceUrl: bukkuRes.url || null,
      delivery: emailStatus === 'SENT' ? 'IN_APP_AND_EMAIL' : 'IN_APP',
      emailStatus,
      providerStatus: providerReady ? 'CREATED' : 'QUEUED',
    };
  }

  /** Reports pending local invoices without pretending that an external sync
   * occurred. A provider-specific status endpoint is required before this can
   * safely update payment state.
   */
  async syncInvoices(organizationId?: string) {
    const pendingCount = await prisma.payment.count({ where: { status: { in: ['PENDING', 'PENDING_PROVIDER'] }, ...(organizationId ? { parent: { organizationId } } : {}) } });
    return {
      syncedCount: 0,
      pendingCount,
      status: 'NOT_IMPLEMENTED',
      message: 'Bukku invoice status sync requires a verified provider status endpoint.',
    };
  }
}

export const paymentService = new PaymentService();
