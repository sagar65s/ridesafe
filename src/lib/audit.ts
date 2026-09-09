import prisma from '@/lib/prisma'

type AuditInput = {
  actorId?: string | null
  organizationId?: string | null
  action: string
  entityType: string
  entityId?: string | null
  details?: unknown
  ipAddress?: string | null
}

export async function writeAuditLog(input: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId || null,
        organizationId: input.organizationId || null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId || null,
        details: input.details === undefined ? null : JSON.stringify(input.details),
        ipAddress: input.ipAddress || null,
      },
    })
  } catch (error) {
    // Auditing must not turn a completed transport operation into an HTTP 500.
    console.error('[audit] Failed to write audit log', error)
  }
}
