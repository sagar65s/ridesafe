const secret = process.env.TRACKING_WORKER_SECRET
const origin = process.env.APP_URL
if (!origin || !secret || secret.length < 32) throw new Error('Set APP_URL and TRACKING_WORKER_SECRET (32+ characters)')
let stopped = false
process.on('SIGTERM', () => { stopped = true })
process.on('SIGINT', () => { stopped = true })
while (!stopped) {
  try {
    const response = await fetch(new URL('/api/internal/calendar', origin), {headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(55000)})
    if (!response.ok) console.error('Calendar reminder request failed:', response.status)
  } catch { console.error('Calendar worker could not reach the app') }
  if (!stopped) await new Promise(resolve => setTimeout(resolve, 60000))
}
