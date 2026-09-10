'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LanguageSwitcher, useTranslation } from '@/i18n/provider'
import RideSafeLogo from '@/components/RideSafeLogo'
import { LogOut, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'
export type Person = { id: string; name: string; phone?: string; email?: string; role: string; organization?: { name: string }; personnelType?: string }
export type Stop = { id: string; name: string; latitude: number; longitude: number; order: number }
export type Child = { id: string; name: string; grade: string; studentCode?: string; parentId?: string; routeId?: string; busId?: string; pickupStopId?: string; dropoffStopId?: string; pickupStop?: Stop; dropoffStop?: Stop; route?: { id: string; name: string; stops: Stop[] }; bus?: { plateNumber: string; busNumber?: string; driver?: Person; maintainer?: Person } }
export type Notice = { id: string; title: string; body: string; type: string; read: boolean; createdAt: string; metadata?: string }
export type Tracking = { id: string; name: string; tripId: string; busId: string; fresh: boolean; routeName: string; lastLatitude: number | null; lastLongitude: number | null; lastLocationUpdate?: string; currentSpeedKmH: number; driver: Person; maintainer?: Person; targets: { studentId: string; studentName: string; stopName?: string; action?: string; etaMins: number | null }[] }
export async function api(path: string, body?: object, method = 'POST') {
  const response = await fetch(path, body === undefined ? { cache: 'no-store' } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(response.status === 401 ? 'Please sign in again' : data.error || 'Unable to load data')
  return data
}
export function useAccount(role: string) {
  const [me, setMe] = useState<Person | null>(null), router = useRouter()
  useEffect(() => { api('/api/auth/me').then(data => { if (data.user.role !== role) router.replace('/'); else setMe(data.user) }).catch(() => router.replace('/')) }, [role, router])
  return me
}
export function Workspace({ me, title, children }: { me: Person | null; title: string; children: ReactNode }) {
  const { tx, locale } = useTranslation(), router = useRouter()
  const logout = async () => {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager?.getSubscription()
      if (subscription) { await api('/api/notifications/subscribe', { endpoint: subscription.endpoint }, 'DELETE').catch(() => {}); await subscription.unsubscribe() }
    }
    await api('/api/auth/me', {})
    router.replace('/')
  }
  return <div className="transport-shell"><header className="transport-header"><RideSafeLogo tone="dark"/><div className="transport-school" data-no-translate>{me?.organization?.name || 'RideSafe'}</div><LanguageSwitcher/><button className="icon-button logout-button" onClick={logout} aria-label={tx('Log out')}><LogOut size={20}/></button></header><main className="transport-main"><div className="transport-heading"><div><p className="eyebrow">{tx(title)}</p><h1 data-no-translate>{me?.name || 'RideSafe'}</h1></div><span className="date-label">{new Date().toLocaleDateString(locale === 'ms' ? 'ms-MY' : locale === 'zh' ? 'zh-CN' : 'en-MY', { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>{children}</main></div>
}
export function Empty({ text }: { text: string }) { const { tx } = useTranslation(); return <div className="transport-empty">{tx(text)}</div> }
export function NoticeBar({ message, retry }: { message: string; retry?: () => void }) { const { tx } = useTranslation(); return message ? <div className="notice-bar" role="status">{tx(message)}{retry && <button onClick={retry}><RefreshCw size={16}/>{tx('Retry')}</button>}</div> : null }
export function useHorn() {
  const context = useRef<AudioContext | null>(null), buffer = useRef<AudioBuffer | null>(null)
  const [enabled, setEnabled] = useState(false)
  const enable = useCallback(async () => {
    if (!context.current) context.current = new AudioContext()
    await context.current.resume()
    if (!buffer.current) buffer.current = await context.current.decodeAudioData(await (await fetch('/bus-horn.mp3')).arrayBuffer())
    setEnabled(true)
  }, [])
  const play = useCallback(() => {
    if (!context.current || !buffer.current || context.current.state !== 'running') return false
    const duration = Math.min(buffer.current.duration, 2.5)
    for (let i = 0; i < 3; i++) {
      const source = context.current.createBufferSource(); source.buffer = buffer.current; source.connect(context.current.destination)
      source.start(context.current.currentTime + i * (duration + .4), 0, duration)
    }
    return true
  }, [])
  useEffect(() => () => { void context.current?.close() }, [])
  return { enabled, enable, play }
}
export function formatDate(value: string, locale: string) { return new Date(value).toLocaleString(locale === 'ms' ? 'ms-MY' : locale === 'zh' ? 'zh-CN' : 'en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'medium', timeStyle: 'short' }) }
