const origin = process.env.APP_URL
const secret = process.env.TRACKING_WORKER_SECRET
if (!origin || !secret || secret.length < 32) throw new Error('Configure APP_URL and TRACKING_WORKER_SECRET')
let stopped = false
process.on('SIGTERM', () => { stopped = true })
process.on('SIGINT', () => { stopped = true })
while (!stopped) {
  try {
    const response = await fetch(new URL('/api/internal/tracking', origin), { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(20000) })
    if (!response.ok) console.error('Tracking worker request failed:', response.status)
  } catch { console.error('Tracking worker could not reach the app') }
  if (!stopped) await new Promise(resolve => setTimeout(resolve, 15000))
}
