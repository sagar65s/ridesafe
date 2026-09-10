import prisma from '@/lib/prisma'
import webpush from 'web-push'

export {transportMessage} from '@/lib/transport-copy'
export async function pushNotification(notification: { id: string; userId: string; title: string; body: string; type: string }) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY, subject = process.env.VAPID_SUBJECT
  if (!publicKey || !privateKey || !subject) return
  const user = await prisma.user.findUnique({where:{id:notification.userId},select:{organizationId:true,isActive:true}})
  if (!user?.isActive) return
  const keys = ['notificationsPushEnabled', ...(user.organizationId ? [`notificationsPushEnabled:${user.organizationId}`] : [])]
  const settings = await prisma.systemSetting.findMany({where:{key:{in:keys}}})
  const preference = settings.find(s=>s.key===keys[keys.length-1]) || settings.find(s=>s.key===keys[0])
  if (preference?.value === 'false' && notification.type !== 'EMERGENCY') return
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: notification.userId } })
  await Promise.allSettled(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: notification.title, body: notification.body, tag: notification.id, url: '/parent', type: notification.type }), { TTL: notification.type === 'BUS_ETA_5_MIN' ? 300 : 3600, timeout: 5000, vapidDetails: { subject, publicKey, privateKey } })
    } catch (error) {
      if ([404, 410].includes((error as { statusCode?: number }).statusCode || 0)) await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } })
    }
  }))
}
