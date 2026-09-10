'use client'
import { useTranslation as useLocaleText } from '@/i18n/provider'
import { TranslatedText } from '@/i18n/provider'
import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Bell, Bus, MapPin, Users, MessageSquare, History, Volume2, ShieldCheck, Send, Trash2, Phone, AlertTriangle } from 'lucide-react'
import { useTranslation } from '@/i18n/provider'
import { api, Child, Notice, Tracking, useAccount, useHorn, Workspace, Empty, NoticeBar, formatDate } from '@/components/transport/shared'
import {transportMessage} from '@/lib/transport-copy'
import CalendarCard from '@/components/CalendarCard'
const BusMap = dynamic(() => import('@/components/BusMap'), { ssr: false })
const tabs = [{ id: 'tracking', label: 'Live Tracking', icon: MapPin }, { id: 'children', label: 'Children', icon: Users }, { id: 'alerts', label: 'Alerts', icon: Bell }, { id: 'messages', label: 'Messages', icon: MessageSquare }, { id: 'history', label: 'History', icon: History }]
type Message = { id: string; content: string; createdAt: string; sender: { id: string; name: string } }
type Payment = { id: string; amount: number; status: string; createdAt: string }
type HistoryItem = { id: string; routeName: string; date: string; attendance: { studentName: string; action: string; timestamp: string }[] }
export default function ParentDashboard() {
 const {tx:translateUi}=useLocaleText()

  const me = useAccount('PARENT'), { tx, locale } = useTranslation(), horn = useHorn()
  const [tab, setTab] = useState('tracking'), [children, setChildren] = useState<Child[]>([]), [tracking, setTracking] = useState<Tracking[]>([]), [notices, setNotices] = useState<Notice[]>([])
  const displayNotice=(n:Notice)=>{try{const m=JSON.parse(n.metadata || '{}');return m.studentName ? {...n,...transportMessage(locale,n.type,m.studentName,m.stopName || '',m.actorName || '')}:n}catch{return n}}
  const [messages, setMessages] = useState<Message[]>([]), [history, setHistory] = useState<HistoryItem[]>([]), [payments, setPayments] = useState<Payment[]>([])
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [text, setText] = useState(''), [contact, setContact] = useState(''), [pushEnabled, setPushEnabled] = useState(false)
  const [issue, setIssue] = useState({ subject: '', description: '' }), [arrival, setArrival] = useState('')
  const loading = useRef(false)
  const load = useCallback(async () => {
    if (!me || loading.current) return
    loading.current = true
    try {
      const [students, live, alerts] = await Promise.all([api('/api/students'), api('/api/location'), api('/api/notifications')])
      setChildren(students.students || []); setTracking(live.drivers || []); setNotices(alerts.notifications || []); setError('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load data') }
    finally { loading.current = false }
  }, [me])
  useEffect(() => { if (!me) return; void load(); const timer = setInterval(load, 10000); return () => clearInterval(timer) }, [load, me])
  useEffect(() => {
    if (!me) return
    if (tab === 'messages') { api('/api/messages').then(d => setMessages(d.messages || [])).catch(e => setError(e.message)); api('/api/messages/school-contact').then(d => setContact(d.admin.id)).catch(e => setError(e.message)) }
    if (tab === 'history') { api('/api/trips/history').then(d => setHistory(d.trips)).catch(e => setError(e.message)); api(`/api/billing/${me.id}`).then(d => setPayments(d.payments)).catch(e => setError(e.message)) }
  }, [tab, me])
  useEffect(() => {
    if (!me || !horn.enabled) return
    const candidates = notices.filter(n => n.type === 'BUS_ETA_5_MIN' && Date.now() - new Date(n.createdAt).getTime() < 300000)
    let played = false
    for (const notice of candidates) {
      const key = `ridesafe-horn:${me.id}:${notice.id}`
      if (localStorage.getItem(key)) continue
      if (!played && !horn.play()) continue
      played = true; localStorage.setItem(key, '1'); setArrival(notice.body)
    }
  }, [notices, me, horn.enabled, horn.play])
  const run = async (work: () => Promise<void>) => { setBusy(true); setError(''); try { await work() } catch (e) { setError(e instanceof Error ? e.message : 'Network error') } finally { setBusy(false) } }
  const subscribe = () => run(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Background alerts unavailable')
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!key) throw new Error('Background alerts unavailable')
    if (await Notification.requestPermission() !== 'granted') throw new Error('Background alerts unavailable')
    const registration = await navigator.serviceWorker.register('/ridesafe-sw.js')
    await navigator.serviceWorker.ready
    const decoded = atob(key.replace(/-/g, '+').replace(/_/g, '/'))
    const applicationServerKey = Uint8Array.from(decoded, char => char.charCodeAt(0))
    const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
    await api('/api/notifications/subscribe', subscription.toJSON()); setPushEnabled(true)
  })
  return <Workspace me={me} title={translateUi("Parent workspace")}><NoticeBar message={error} retry={load}/>
    <nav className="transport-tabs">{tabs.map(item => <button key={item.id} className={tab === item.id ? 'selected' : ''} onClick={() => setTab(item.id)}><item.icon size={20}/><span>{tx(item.label)}</span>{item.id === 'alerts' && notices.some(n => !n.read) && <i/>}</button>)}</nav>
    {arrival && <div className="arrival-banner" role="alert"><Volume2/><div><strong>{tx('Bus arriving soon')}</strong><p data-no-translate>{arrival}</p></div><button onClick={() => setArrival('')}>{tx('Close')}</button></div>}
    {tab === 'tracking' && <div className="journey-grid"><section><div className="section-title"><h2>{tx("Your child's journey")}</h2><span className="live-label">{tx('Live')}</span></div>
      <div className="map-card"><BusMap drivers={tracking.filter(bus => bus.fresh)}/></div>
      {!tracking.length && <Empty text="Your assigned bus will appear when its trip starts."/>}
      {tracking.map(bus => <article className="journey-card" key={bus.id}><div className="bus-title"><div className="bus-icon"><Bus/></div><div><h3 data-no-translate>{bus.name}</h3><p data-no-translate>{bus.routeName}</p></div><span className={`status-pill ${bus.fresh ? 'green' : 'amber'}`}>{tx(bus.fresh ? 'Live' : 'No recent GPS signal')}</span></div>
        {bus.targets.map(target => <div className="arrival-row" key={target.studentId}><div><strong data-no-translate>{target.studentName}</strong><p><MapPin size={14}/><span data-no-translate>{target.stopName || tx('School assignment pending')}</span></p></div><div className="eta-number">{bus.fresh && target.etaMins !== null ? <>{target.etaMins}<small>{tx('min')}</small></> : <small>{tx('Waiting for movement')}</small>}</div></div>)}
        <div className="crew-details"><span>{tx('Driver')}: <b data-no-translate>{bus.driver.name}</b></span>{bus.maintainer && <span>{tx('Maintainer')}: <b data-no-translate>{bus.maintainer.name}</b></span>}</div>
        {bus.lastLocationUpdate && <p className="subtle">{tx('Updated')}: {formatDate(bus.lastLocationUpdate, locale)}</p>}</article>)}
      </section><aside><div className="horn-card"><div className="horn-symbol"><Volume2 size={28}/></div><h2>{tx('Enable arrival horn')}</h2><p>{tx('Plays three times when the bus is about five minutes from your stop.')}</p><button className="transport-primary" onClick={() => run(async () => { await horn.enable(); horn.play() })}>{tx(horn.enabled ? 'Test horn' : 'Enable arrival horn')}</button>{horn.enabled && <span className="sound-status"><ShieldCheck size={16}/>{tx('Horn enabled')}</span>}<p className="subtle">{tx('Keep this page open for the horn. Background notifications depend on device support.')}</p><button className="transport-secondary" disabled={busy || pushEnabled} onClick={subscribe}>{tx(pushEnabled ? 'Background alerts enabled' : 'Enable background alerts')}</button></div><CalendarCard/><button className="emergency-button" disabled={busy} onClick={() => { if (window.confirm(tx('Send an emergency alert to the school?'))) void run(async () => { await api('/api/emergency', {}); setError('Emergency alert sent') }) }}><AlertTriangle/>{tx('Emergency SOS')}</button></aside></div>}
    {tab === 'children' && <><div className="section-title"><h2>{tx('Children')}</h2></div><div className="child-grid">{children.map(child => <ChildCard key={`${child.id}:${child.pickupStopId}:${child.dropoffStopId}`} child={child} busy={busy} save={(body) => run(async () => { await api(`/api/students/${child.id}`, body, 'PATCH'); await load() })}/>)}{!children.length && <Empty text="No students assigned"/>}</div><section className="journey-card"><h2>{tx('Report an issue')}</h2><form onSubmit={e => { e.preventDefault(); void run(async () => { await api('/api/issues', { ...issue, category: 'OTHER', priority: 'NORMAL' }); setIssue({ subject: '', description: '' }); setError('Issue submitted') }) }}><label>{tx('Subject')}<input required value={issue.subject} maxLength={120} onChange={e => setIssue({ ...issue, subject: e.target.value })}/></label><label>{tx('Details')}<textarea required minLength={10} maxLength={2000} value={issue.description} onChange={e => setIssue({ ...issue, description: e.target.value })}/></label><button className="transport-primary" disabled={busy}>{tx('Submit issue')}</button></form></section></>}
    {tab === 'alerts' && <section className="journey-card"><h2>{tx('Notifications')}</h2>{!notices.length && <Empty text="No alerts yet"/>}{notices.map(displayNotice).map(n => <article className={`alert-item ${n.read ? '' : 'unread'}`} key={n.id}><Bell size={20}/><div><strong data-no-translate>{n.title}</strong><p data-no-translate>{n.body}</p><time>{formatDate(n.createdAt, locale)}</time></div>{!n.read && <button className="transport-secondary" onClick={() => run(async () => { await api('/api/notifications', { id: n.id, read: true }, 'PATCH'); await load() })}>{tx('Mark read')}</button>}</article>)}</section>}
    {tab === 'messages' && <section className="journey-card"><h2>{tx('School contact')}</h2><div className="message-list">{messages.map(m => <div className={`message-bubble ${m.sender.id === me?.id ? 'mine' : ''}`} key={m.id}><strong data-no-translate>{m.sender.name}</strong><p data-no-translate>{m.content}</p><time>{formatDate(m.createdAt, locale)}</time><button className="icon-button" aria-label={tx('Delete')} onClick={() => { if (confirm(tx('Delete this item?'))) void run(async () => { await api('/api/messages', { id: m.id }, 'DELETE'); setMessages(messages.filter(x => x.id !== m.id)) }) }}><Trash2 size={15}/></button></div>)}{!messages.length && <Empty text="No messages yet"/>}</div><form className="message-compose" onSubmit={e => { e.preventDefault(); void run(async () => { await api('/api/messages', { recipientId: contact, content: text }); setText(''); setMessages((await api('/api/messages')).messages) }) }}><input value={text} onChange={e => setText(e.target.value)} placeholder={tx('Type a message')} maxLength={2000} required/><button className="transport-primary" disabled={busy || !contact}><Send size={18}/>{tx('Send')}</button></form></section>}
    {tab === 'history' && <div className="journey-grid"><section className="journey-card"><h2>{tx('Student attendance')}</h2>{!history.length && <Empty text="No attendance records"/>}{history.map(trip => <article className="history-entry" key={trip.id}><h3 data-no-translate>{trip.routeName}</h3>{trip.attendance.map((a, index) => <div className="attendance-history" key={index}><strong data-no-translate>{a.studentName}</strong><span>{tx(a.action === 'PICKED_UP' ? 'Boarded' : a.action === 'DROPPED_OFF' ? 'Dropped off' : 'Absent')}</span><time>{formatDate(a.timestamp, locale)}</time></div>)}</article>)}</section><section className="journey-card"><h2>{tx('Invoices')}</h2>{!payments.length && <Empty text="No invoices"/>}{payments.map(payment => <div className="arrival-row" key={payment.id}><div><strong><TranslatedText text={"RM "}/><TranslatedText text={payment.amount.toFixed(2)}/></strong><p>{formatDate(payment.createdAt, locale)}</p></div><span className="status-pill">{tx(payment.status === 'PAID' ? 'Paid' : 'Pending')}</span></div>)}</section></div>}
  </Workspace>
}
function ChildCard({ child, busy, save }: { child: Child; busy: boolean; save: (body: object) => void }) {
  const { tx } = useTranslation(), [pickup, setPickup] = useState(child.pickupStopId || ''), [dropoff, setDropoff] = useState(child.dropoffStopId || '')
  return <article className="journey-card"><div className="bus-title"><div className="child-avatar" data-no-translate>{child.name.slice(0, 1)}</div><div><h2 data-no-translate>{child.name}</h2><p data-no-translate>{child.grade} · {child.studentCode}</p></div></div>{child.bus && <p data-no-translate>{child.bus.busNumber || child.bus.plateNumber} · {child.route?.name}</p>}{child.route?.stops.length ? <form onSubmit={e => { e.preventDefault(); save({ pickupStopId: pickup, dropoffStopId: dropoff }) }}><p>{tx("Choose your child's assigned stops")}</p>{[['Pickup stop', pickup, setPickup], ['Drop-off stop', dropoff, setDropoff]].map(([label, value, setter]) => <label key={label as string}>{tx(label as string)}<select required value={value as string} onChange={e => (setter as (s: string) => void)(e.target.value)}><option value="">{tx('Choose a stop')}</option>{child.route!.stops.map(stop => <option key={stop.id} value={stop.id} data-no-translate>{stop.name}</option>)}</select></label>)}<button className="transport-primary" disabled={busy}>{tx('Save stops')}</button></form> : <Empty text="Contact the school to assign a bus and route."/>}{child.bus?.maintainer?.phone && <a className="contact-link" href={`tel:${child.bus.maintainer.phone}`}><Phone size={16}/>{tx('Maintainer')}: <span data-no-translate>{child.bus.maintainer.name}</span></a>}</article>
}
