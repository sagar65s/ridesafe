'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { Bus, ScanFace, Navigation, Timer, GraduationCap, MapPin, AlertTriangle, Info, ShieldAlert, CheckCircle, Camera, Megaphone, UserRound } from 'lucide-react'

import { useAudio } from '@/hooks/useAudio'
import CameraCapture from '@/components/CameraCapture'
import { LanguageSwitcher, useTranslation } from '@/i18n/provider'
import RideSafeLogo from '@/components/RideSafeLogo'

// ── Shared types ─────────────────────────────────────────────────────────────
interface ShiftRecord { id: string; date: string; startTime: string; endTime: string; status: string; lateReason?: string }
interface TripRecord { id: string; routeName: string; date: string; pickedUp: number; droppedOff: number; absent: number; avgRating?: string | null }
interface StopStudent { id: string; name: string; grade: string; type: 'PICKUP' | 'DROPOFF' }
interface AttendanceRecord { studentId: string; action: string; temp?: boolean }
interface Stop { id: string; name: string; pickupStudents: StopStudent[]; dropoffStudents: StopStudent[]; attendances: AttendanceRecord[] }

function useTripTimer(startedAt: Date | null) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startedAt) return
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])
  const m = Math.floor(elapsed / 60), s = elapsed % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

function DriverScheduleWidget() {
  const { t } = useTranslation()
  const [shifts, setShifts] = useState<ShiftRecord[]>([])
  const [reportingId, setReportingId] = useState<string | null>(null)
  useEffect(() => { fetch('/api/shifts').then(r => r.json()).then(d => setShifts((d.shifts || []).slice(0, 5))) }, [])
  const reportLate = async (shift: ShiftRecord) => {
    const reason = window.prompt('Why will you be late? This will notify the school administrator.')
    if (!reason?.trim()) return
    setReportingId(shift.id)
    const res = await fetch(`/api/shifts/${shift.id}`, { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ lateReason:reason.trim() }) })
    const data = await res.json().catch(() => ({}))
    if (res.ok) setShifts(current => current.map(item => item.id === shift.id ? data.shift : item))
    else window.alert(data.error || 'Unable to report delay')
    setReportingId(null)
  }
  if (shifts.length === 0) return <div style={{ color:'var(--text-muted)', fontSize:'0.85rem', textAlign:'center', padding:'1rem' }}>{t('driver.noShifts')}</div>
  return (
    <div style={{ display:'grid', gap:'0.5rem' }}>
      {shifts.map((s: ShiftRecord) => (
        <div key={s.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.6rem 0.8rem', background:'rgba(255,255,255,0.02)', borderRadius:8, border:'1px solid var(--surface-border)' }}>
          <div>
            <div style={{ fontWeight:600, fontSize:'0.85rem' }}>{new Date(s.date).toLocaleDateString()}</div>
            <div style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>{s.startTime} → {s.endTime}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            {s.status === 'SCHEDULED' && <button disabled={reportingId === s.id} onClick={() => reportLate(s)} className="btn" style={{ padding:'5px 8px', color:'var(--warning)', border:'1px solid rgba(245,158,11,.3)', background:'var(--warning-bg)', fontSize:'0.7rem' }}>{reportingId === s.id ? 'Saving…' : 'Report late'}</button>}
            <span className="badge" title={s.lateReason || ''} style={{ fontSize:'0.7rem', background: s.status === 'SCHEDULED' ? 'rgba(59,130,246,0.15)' : s.status === 'LATE' ? 'rgba(245,158,11,.15)' : 'rgba(16,185,129,0.15)', color: s.status === 'SCHEDULED' ? '#3B82F6' : s.status === 'LATE' ? '#F59E0B' : '#10B981' }}>{s.status}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function DriverTripHistoryWidget() {
  const [trips, setTrips] = useState<TripRecord[]>([])
  useEffect(() => { fetch('/api/trips/history?page=1').then(r => r.json()).then(d => setTrips((d.trips || []).slice(0, 5))) }, [])
  if (trips.length === 0) return <div style={{ color:'var(--text-muted)', fontSize:'0.85rem', textAlign:'center', padding:'1rem' }}>No trips yet</div>
  return (
    <div style={{ display:'grid', gap:'0.5rem' }}>
      {trips.map((t: TripRecord) => (
        <div key={t.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.6rem 0.8rem', background:'rgba(255,255,255,0.02)', borderRadius:8, border:'1px solid var(--surface-border)' }}>
          <div>
            <div style={{ fontWeight:600, fontSize:'0.85rem' }}>{t.routeName}</div>
            <div style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>{new Date(t.date).toLocaleDateString()} · {t.pickedUp}↑ {t.droppedOff}↓ {t.absent}</div>
          </div>
          {t.avgRating && <span style={{ color:'#FFD100', fontWeight:700, fontSize:'0.85rem' }}>⭐ {t.avgRating}</span>}
        </div>
      ))}
    </div>
  )
}

export default function DriverDashboard() {
  const { t } = useTranslation()
  const [data, setData] = useState<{ activeTrip?: { id: string; date: string; route: { id?:string; name?:string; stops: Stop[] } }; assignedRoute?: { id: string; name: string; stops?: Stop[]; students?: StopStudent[] }; busId?: string; busPlate?: string; busQrToken?: string; driverId?: string } | null>(null)
  const [profile, setProfile] = useState<{name:string;phone?:string;personnelType?:string;licenseNumber?:string;licenseExpiry?:string;onboardingDate?:string;employmentStatus?:string;organization?:{name:string}}|null>(null)
  const [broadcastType,setBroadcastType]=useState('BUS_STARTED')
  const [broadcastMessage,setBroadcastMessage]=useState('')
  const [broadcasting,setBroadcasting]=useState(false)
  const [loading, setLoading] = useState(true)
  const [currentStopIndex, setCurrentStopIndex] = useState(0)
  const [offlineQueue, setOfflineQueue] = useState(0)
  const [tripStartedAt, setTripStartedAt] = useState<Date | null>(null)
  const [qrScanned, setQrScanned] = useState(false)
  const [xp, setXp] = useState(0)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraTarget, setCameraTarget] = useState<string>('')
  const [capturedPhotos, setCapturedPhotos] = useState<Record<string, string>>({})
  const router = useRouter()
  const prevTripId = useRef<string | null>(null)
  const tripTimer = useTripTimer(tripStartedAt)

  // Audio Hooks & Pre-Unlock State
  const [appUnlocked, setAppUnlocked] = useState(false)
  const { play: playAlert } = useAudio('/alert toon.mp3')
  const { play: playHorn } = useAudio('/bus-horn.mp3')

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { 
    setToast(msg)
    setToastType(type)
    setTimeout(() => setToast(''), 3000) 
  }

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/driver/status')
      if (res.status === 401) return router.push('/')
      const json = await res.json()
      setData(json)
      // Set trip timer
      if (json.activeTrip && !tripStartedAt) {
        setTripStartedAt(new Date(json.activeTrip.date))
      } else if (!json.activeTrip) {
        setTripStartedAt(null)
      }
      // Detect trip start → play bus horn
      if (json.activeTrip && prevTripId.current !== json.activeTrip.id) {
        if (prevTripId.current !== null) playHorn()
        prevTripId.current = json.activeTrip.id
      }
    } catch (error) { console.error(error) } finally { setLoading(false) }
  }, [router, tripStartedAt, playHorn])

  useEffect(() => {
    fetch('/api/auth/me').then(r=>r.ok?r.json():null).then(d=>d?.user&&setProfile(d.user)).catch(()=>{})
    fetchStatus()
    // GPS tracking (5 sec interval)
    if ('geolocation' in navigator) {
      const id = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              await fetch('/api/location', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
              })
            } catch {}
          },
          (err) => console.warn('Geolocation warning:', err.message),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        )
      }, 5000)
      return () => clearInterval(id)
    }
  }, [fetchStatus])

  useEffect(() => {
    const queue = JSON.parse(localStorage.getItem('offline_attendance_queue') || '[]')
    setOfflineQueue(queue.length)
    const flushQueue = async () => {
      const q = JSON.parse(localStorage.getItem('offline_attendance_queue') || '[]')
      if (q.length === 0) return
      const failed: AttendanceRecord[] = []
      for (const payload of q) {
        try {
          const res = await fetch('/api/attendance', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })
          if (!res.ok) failed.push(payload)
        } catch { failed.push(payload) }
      }
      localStorage.setItem('offline_attendance_queue', JSON.stringify(failed))
      setOfflineQueue(failed.length)
      if (failed.length === 0) fetchStatus()
    }
    window.addEventListener('online', flushQueue)
    return () => window.removeEventListener('online', flushQueue)
  }, [fetchStatus])

  const handleHandshake = async () => {
    if (!data?.assignedRoute || !data?.busId || !data?.driverId || !data?.busQrToken) {
      showToast('Bus not fully configured. Contact administrator.', 'error')
      return
    }
    try {
      const payload = {
        driverId: data.driverId,
        busId: data.busId,
        qrToken: data.busQrToken,
        deviceId: 'device_' + Math.random().toString(36).substring(2, 11)
      }
      const res = await fetch('/api/tracking/handshake', {
        method: 'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        showToast('Verification Success: Bus Unlocked', 'success');
        setQrScanned(true);
      } else {
        const err = await res.json()
        showToast(`Verification Failed: ${err.error || 'Unknown error'}`, 'error');
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleStartTrip = async () => {
    if (!data?.assignedRoute) return
    try {
      const res = await fetch('/api/trips', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ routeId: data.assignedRoute.id, busId: data.busId })
      })
      if (res.ok) { playHorn(); showToast('Trip started!', 'success'); fetchStatus() }
      else showToast((await res.json().catch(() => ({}))).error || 'Unable to start trip', 'error')
    } catch (e) { console.error(e) }
  }

  const handleCompleteTrip = async () => {
    if (!data?.activeTrip) return
    try {
      const res = await fetch(`/api/trips/${data.activeTrip.id}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ status:'TRIP_COMPLETED' })
      })
      if (res.ok) {
        setXp(p => p + 50)
        showToast('Trip completed! +50 XP', 'success')
        setTimeout(fetchStatus, 800)
      }
      else showToast((await res.json().catch(() => ({}))).error || 'Unable to complete trip', 'error')
    } catch (e) { console.error(e) }
  }

  const markDelay = async () => {
    if (!data?.activeTrip) return
    const minutesRaw = window.prompt('Estimated delay in minutes:')
    if (!minutesRaw) return
    const minutes = Number(minutesRaw)
    const reason = window.prompt('Reason for delay:')
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600 || !reason?.trim()) return showToast('Enter a valid delay and reason', 'error')
    const response = await fetch(`/api/trips/${data.activeTrip.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ status:'BUS_EN_ROUTE', delayMinutes:minutes, delayReason:reason.trim() }) })
    if (!response.ok) return showToast((await response.json().catch(()=>({}))).error || 'Unable to mark delay', 'error')
    setBroadcastType('BUS_DELAYED'); setBroadcastMessage(`Bus delayed by approximately ${minutes} minutes: ${reason.trim()}`)
    showToast('Delay recorded. Send the prepared broadcast to parents.')
  }

  const sendBroadcast = async () => {
    if (!data?.activeTrip || !broadcastMessage.trim()) return
    setBroadcasting(true)
    const response = await fetch('/api/driver/broadcast',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tripId:data.activeTrip.id,type:broadcastType,message:broadcastMessage})})
    const result=await response.json().catch(()=>({}))
    if(response.ok){showToast(`Broadcast sent to ${result.sent} relevant user(s)`);setBroadcastMessage('')}
    else showToast(result.error||'Broadcast failed','error')
    setBroadcasting(false)
  }

  const recordAttendance = async (studentId: string, action: string) => {
    if (!data?.activeTrip) return
    const stop = data.activeTrip.route.stops[currentStopIndex]
    const payload = { tripId: data.activeTrip.id, studentId, stopId: stop.id, action }

    // Optimistic
    const newData = JSON.parse(JSON.stringify(data))
    newData.activeTrip.route.stops[currentStopIndex].attendances.push({ studentId, action, temp: true })
    setData(newData)
    setXp(p => p + (action === 'ABSENT' ? 5 : 20))
    showToast(action === 'ABSENT' ? 'Marked absent' : action === 'PICKED_UP' ? 'Picked up!' : 'Dropped off!')

    const sync = async () => {
      const res = await fetch('/api/attendance', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) })
      if (res.ok) fetchStatus(); else throw new Error()
    }

    if (navigator.onLine) {
      try { await sync() } catch {
        const q = JSON.parse(localStorage.getItem('offline_attendance_queue')||'[]')
        q.push(payload); localStorage.setItem('offline_attendance_queue', JSON.stringify(q))
        setOfflineQueue(q.length)
      }
    } else {
      const q = JSON.parse(localStorage.getItem('offline_attendance_queue')||'[]')
      q.push(payload); localStorage.setItem('offline_attendance_queue', JSON.stringify(q))
      setOfflineQueue(q.length)
    }
  }

  if (loading) return (
    <div>
      {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height:60, marginBottom:12, borderRadius:12 }} />)}
    </div>
  )

  const { activeTrip, assignedRoute } = data || {}

  // Count students on board
  const onBoard = activeTrip ? activeTrip.route.stops.flatMap((s: Stop) =>
    s.attendances.filter((a: AttendanceRecord) => a.action === 'PICKED_UP')
  ).length : 0

  return (
    <div style={{ paddingBottom:'3rem' }}>
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-20 }}
            style={{ position:'fixed', top:20, right:20, zIndex:9999, padding:'0.875rem 1.5rem',
              display:'flex', alignItems:'center', gap:'0.75rem',
              background: toastType === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
              border:`1px solid ${toastType === 'error' ? 'var(--danger)' : 'var(--success)'}`,
              borderRadius:12, color:'var(--text-main)', fontWeight:600, backdropFilter:'blur(12px)' }}>
            {toastType === 'error' ? <AlertTriangle size={18} color="var(--danger)"/> : <CheckCircle size={18} color="var(--success)"/>}
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <RideSafeLogo compact height={34} />
          <div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <h1 style={{ marginBottom:'0.25rem', fontSize:'1.8rem' }}>{t('driver.title')}</h1>
            {xp > 0 && (
              <motion.span initial={{ scale:0 }} animate={{ scale:1 }} className="badge badge-xp" style={{ fontSize:'0.7rem' }}>
                +{xp} XP
              </motion.span>
            )}
          </div>
          <p style={{ color:'var(--text-muted)', margin:0 }}>{assignedRoute?.name || t('driver.noRoute')}</p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
          {offlineQueue > 0 && (
            <div style={{ color:'var(--warning)', fontWeight:'bold', fontSize:'0.85rem', padding:'0.4rem 0.75rem', background:'var(--warning-bg)', borderRadius:8, border:'1px solid rgba(245,158,11,0.3)' }}>
              {offlineQueue} pending
            </div>
          )}
          <LanguageSwitcher />
          <button className="btn" style={{ background:'rgba(255,69,58,0.12)', color:'var(--danger)', border:'1px solid rgba(255,69,58,0.3)' }}
            onClick={() => { fetch('/api/auth/me', { method:'POST' }).then(() => router.push('/')) }}>
            {t('common.logout')}
          </button>
        </div>
      </div>

      {profile && <div className="glass-panel" style={{padding:'1rem 1.25rem',marginBottom:'1rem',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10}}>
        <div><div style={{fontSize:11,color:'var(--text-muted)'}}>PROFILE</div><strong><UserRound size={15} style={{verticalAlign:'middle',marginRight:5}}/>{profile.name}</strong></div>
        <div><div style={{fontSize:11,color:'var(--text-muted)'}}>TYPE / STATUS</div><strong>{profile.personnelType||'DRIVER'} · {profile.employmentStatus||'ACTIVE'}</strong></div>
        <div><div style={{fontSize:11,color:'var(--text-muted)'}}>CONTACT</div><strong>{profile.phone||'Not provided'}</strong></div>
        <div><div style={{fontSize:11,color:'var(--text-muted)'}}>LICENSE</div><strong>{profile.licenseNumber||'Not provided'}{profile.licenseExpiry?` · ${new Date(profile.licenseExpiry).toLocaleDateString()}`:''}</strong></div>
        <div><div style={{fontSize:11,color:'var(--text-muted)'}}>SCHOOL</div><strong>{profile.organization?.name||'Not assigned'}</strong></div>
      </div>}

      {/* No Route */}
      {!assignedRoute && (
        <motion.div initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} className="glass-panel" style={{ padding:'3rem', textAlign:'center' }}>
          <div style={{ marginBottom:'1rem', display:'flex', justifyContent:'center' }}><Bus size={64} color="var(--bus-yellow)"/></div>
          <h2>{t('driver.noRoute')}</h2>
          <p style={{ color:'var(--text-muted)' }}>Please contact the Administrator to assign you to a Bus and Route.</p>
        </motion.div>
      )}

      {/* Pre-Trip Screen */}
      {assignedRoute && !activeTrip && !qrScanned && (
        <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} className="glass-panel" style={{ padding:'2.5rem', textAlign:'center' }}>
          <div style={{ marginBottom:'1rem', display:'flex', justifyContent:'center' }}><ScanFace size={56} color="var(--primary)"/></div>
          <h2 style={{ fontSize:'1.8rem', marginBottom:'0.5rem' }}>Scan Bus QR</h2>
          <p style={{ color:'var(--text-muted)', marginBottom:'1.5rem' }}>
            To unlock tracking capabilities and verify identity, please scan the QR code located on the dashboard of Bus #{data?.busPlate || data?.busId}.
          </p>

          <motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.95 }}
            onClick={handleHandshake} className="btn "
            style={{ fontSize:'1.1rem', padding:'1rem 2rem', borderRadius:'50px', background:'var(--primary)', color:'#fff', fontWeight:600 }}>
            Simulate QR Scan 
          </motion.button>
        </motion.div>
      )}

      {assignedRoute && !activeTrip && qrScanned && (
        <motion.div initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} className="glass-panel" style={{ padding:'2.5rem', textAlign:'center' }}>
          <div style={{ marginBottom:'1rem', display:'flex', justifyContent:'center' }}><Navigation size={56} color="var(--success)"/></div>
          <h2 style={{ fontSize:'1.8rem', marginBottom:'0.5rem' }}>Ready to Roll?</h2>
          <p style={{ color:'var(--text-muted)', marginBottom:'1.5rem' }}>
            {assignedRoute.students?.length || 0} students · {assignedRoute.stops?.length || 0} stops
          </p>

          {/* Route preview */}
          {(assignedRoute.stops?.length ?? 0) > 0 && (
            <div style={{ textAlign:'left', marginBottom:'2rem', display:'flex', flexDirection:'column', gap:8 }}>
              {(assignedRoute.stops ?? []).map((stop: Stop, i: number) => (
                 <div key={stop.id} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(255,255,255,0.06)', border:'1px solid var(--surface-border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.75rem', fontWeight:700, color:'var(--text-muted)', flexShrink:0 }}>{i+1}</div>
                  <div style={{ fontSize:'0.9rem', color:'var(--text-muted)' }}>{stop.name}</div>
                  {i < (assignedRoute.stops?.length ?? 0) - 1 && <div style={{ flex:1, height:1, background:'var(--surface-border)' }} />}
                </div>
              ))}
             </div>
          )}

          <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.95 }}
            onClick={handleStartTrip} className="btn"
            style={{ width: '100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.15rem', padding:'1.15rem 0', borderRadius:'50px', background:'var(--bus-yellow)', color:'#111', fontWeight:800, boxShadow:'0 8px 30px -10px var(--bus-yellow-glow)' }}>
            <Bus size={22} style={{marginRight:8}}/> Swipe to Start Route
          </motion.button>
        </motion.div>
      )}

      {/* Active Trip */}
      {activeTrip && (() => {
        const stops = activeTrip.route.stops
        const stop = stops[currentStopIndex]
        if (!stop) return null
        const isLastStop = currentStopIndex === stops.length - 1

        const getStatus = (studentId: string) => {
          const att = stop.attendances.find((a: AttendanceRecord) => a.studentId === studentId)
          return att ? att.action : null
        }
        const stopStudents = [...stop.pickupStudents, ...stop.dropoffStudents]
        const unmarkedCount = new Set(stopStudents.filter(student => !getStatus(student.id)).map(student => student.id)).size
        const requireCompletedStop = (next: () => void) => {
          if (unmarkedCount > 0) {
            showToast(`Mark pickup, drop-off, or absence for ${unmarkedCount} student${unmarkedCount === 1 ? '' : 's'} before continuing.`, 'error')
            return
          }
          next()
        }

        return (
          <div>
            {/* Trip Summary Header */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'0.75rem', marginBottom:'1.5rem' }}>
              {[
                { icon:<Timer size={24}/>, label:'Trip Time', value: tripTimer, color:'var(--primary)' },
                { icon:<GraduationCap size={24}/>, label:'On Board', value: onBoard, color:'var(--success)' },
                { icon:<MapPin size={24}/>, label:'Stop', value: `${currentStopIndex + 1}/${stops.length}`, color:'var(--bus-yellow)' },
              ].map(({ icon, label, value, color }, idx) => (
                <div key={idx} className="stat-card" style={{ padding:'1rem', textAlign:'center', background:'var(--surface-2)', borderRadius:'var(--radius-sm)' }}>
                  <div style={{ display:'flex', justifyContent:'center', color }}>{icon}</div>
                  <motion.div key={String(value)} initial={{ scale:0.7, opacity:0 }} animate={{ scale:1, opacity:1 }}
                    style={{ fontSize:'1rem', fontWeight:800, color, marginTop:4 }}>{value}</motion.div>
                  <div style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Stop Progress Stepper */}
            <div className="glass-panel" style={{ padding:'1rem 1.5rem', marginBottom:'1.25rem', overflowX:'auto' }}>
              <div style={{ display:'flex', alignItems:'center', minWidth: stops.length * 70 }}>
                {stops.map((s: Stop, i: number) => (
                  <div key={s.id} style={{ display:'flex', alignItems:'center', flex: i < stops.length - 1 ? 1 : 'auto' }}>
                    <div className="stepper-step" style={{ flexDirection:'column', gap:4, minWidth:60, cursor: i <= currentStopIndex ? 'pointer' : 'default' }}
                      onClick={() => i <= currentStopIndex && setCurrentStopIndex(i)}>
                      <div className={`stepper-dot ${i < currentStopIndex ? 'done' : i === currentStopIndex ? 'active' : 'upcoming'}`}>
                        {i < currentStopIndex ? '' : i + 1}
                      </div>
                      <div style={{ fontSize:'0.65rem', color: i === currentStopIndex ? 'var(--bus-yellow)' : 'var(--text-muted)', textAlign:'center', maxWidth:60, lineClamp:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {s.name}
                      </div>
                    </div>
                    {i < stops.length - 1 && (
                      <div style={{ flex:1, height:2, margin:'0 4px', marginBottom:16, background: i < currentStopIndex ? 'var(--success)' : 'var(--surface-border)', borderRadius:999, transition:'background 0.4s' }} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Current Stop */}
            <AnimatePresence mode="wait">
              <motion.div key={stop.id}
                initial={{ opacity:0, x:30 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-30 }}
                className="glass-panel" style={{ padding:'1.5rem', marginBottom:'1rem' }}>

                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
                  <div>
                    <div style={{ color:'var(--bus-yellow)', fontWeight:700, fontSize:'0.8rem', textTransform:'uppercase', letterSpacing:1, marginBottom:'0.25rem' }}>
                      Stop {currentStopIndex + 1} of {stops.length}
                    </div>
                    <h2 style={{ margin:0, fontSize:'1.5rem' }}>{stop.name}</h2>
                  </div>
                  {isLastStop ? (
                    <motion.button whileHover={{ scale:1.05 }} whileTap={{ scale:0.95 }}
                      onClick={() => requireCompletedStop(handleCompleteTrip)} className="btn"
                      style={{ background:'var(--bus-yellow)', color:'#111', fontWeight:700 }}>
                      {t('driver.endTrip')}
                    </motion.button>
                  ) : (
                    <motion.button whileHover={{ scale:1.04 }} whileTap={{ scale:0.95 }}
                      onClick={() => requireCompletedStop(() => setCurrentStopIndex(c => c + 1))} className="btn"
                      style={{ background:'rgba(255,255,255,0.08)' }}>
                      {t('driver.nextStop')} →
                    </motion.button>
                  )}
                  <button className="btn" onClick={markDelay} style={{background:'var(--warning-bg)',color:'var(--warning)',fontSize:12}}>Mark Delay</button>
                </div>

                {stop.pickupStudents.length === 0 && stop.dropoffStudents.length === 0 && (
                  <p style={{ color:'var(--text-muted)', textAlign:'center', padding:'1rem' }}>No students at this stop.</p>
                )}

                <div style={{ display:'grid', gap:'0.75rem', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))' }}>
                  {[
                    ...stop.pickupStudents.map((s: StopStudent) => ({ ...s, type: 'PICKUP' as const })),
                    ...stop.dropoffStudents.map((s: StopStudent) => ({ ...s, type: 'DROPOFF' as const }))
                  ].map(student => {
                    const status = getStatus(student.id)
                    return (
                      <motion.div key={student.id + student.type}
                        initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                        className="glass-card" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1rem' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          {capturedPhotos[student.id] ? (
                            <Image src={capturedPhotos[student.id]} alt="" width={38} height={38} style={{ borderRadius:'50%', objectFit:'cover', border:'2px solid var(--success)', flexShrink:0 }} />
                          ) : (
                            <div style={{ width:38, height:38, borderRadius:'50%',
                              background: student.type==='PICKUP' ? 'var(--success-bg)' : 'var(--info-bg)',
                              display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:'1rem',
                              color: student.type==='PICKUP' ? 'var(--success)' : 'var(--info)' }}>
                              {student.name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight:600, fontSize:'1rem' }}>{student.name}</div>
                            <div style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>{student.grade} · {student.type}</div>
                          </div>
                          <motion.button whileTap={{ scale:0.85 }}
                            onClick={() => { setCameraTarget(student.id); setCameraOpen(true); }}
                            style={{ width:30, height:30, borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.08)', color:'#94A3B8', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.9rem', flexShrink: 0 }}
                            title="Take verification photo">
                            <Camera size={15}/>
                          </motion.button>
                        </div>

                        {status ? (
                          <span className={`badge ${status === 'ABSENT' ? 'badge-danger' : 'badge-success'}`}>
                            {status === 'ABSENT' ? 'Absent' : status === 'PICKED_UP' ? 'Picked Up' : 'Dropped'}
                          </span>
                        ) : (
                          <div style={{ display:'flex', gap:'0.5rem' }}>
                            <motion.button whileTap={{ scale:0.9 }}
                              onClick={() => recordAttendance(student.id, 'ABSENT')} className="btn"
                              style={{ background:'rgba(239,68,68,0.1)', color:'var(--danger)', padding:'0.5rem 0.75rem', fontSize:'0.82rem' }}>
                              {t('driver.absent')}
                            </motion.button>
                            <motion.button whileHover={{ scale:1.04 }} whileTap={{ scale:0.95 }}
                              onClick={() => recordAttendance(student.id, student.type==='PICKUP' ? 'PICKED_UP' : 'DROPPED_OFF')} className="btn"
                              style={{ background:'var(--bus-yellow)', color:'#111', fontWeight:700, padding:'0.5rem 0.9rem', fontSize:'0.82rem' }}>
                              {student.type === 'PICKUP' ? `↑ ${t('driver.pickup')}` : `↓ ${t('driver.dropoff')}`}
                            </motion.button>
                          </div>
                        )}
                      </motion.div>
                    )
                  })}
                </div>
              </motion.div>
            </AnimatePresence>

            <motion.div initial={{opacity:0}} animate={{opacity:1}} className="glass-panel" style={{padding:'1.25rem',marginTop:'1rem'}}>
              <h3 style={{margin:'0 0 10px',display:'flex',alignItems:'center',gap:7}}><Megaphone size={18}/> Trip Broadcast</h3>
              <div style={{display:'grid',gridTemplateColumns:'minmax(150px,.6fr) 1.5fr auto',gap:8}}>
                <select className="select-field" value={broadcastType} onChange={e=>setBroadcastType(e.target.value)}>{['BUS_STARTED','BUS_DELAYED','ROUTE_DELAY','TRAFFIC','BREAKDOWN','EMERGENCY','OTHER'].map(type=><option key={type} value={type}>{type.replaceAll('_',' ')}</option>)}</select>
                <input className="input-field" maxLength={500} placeholder="Important update for this trip" value={broadcastMessage} onChange={e=>setBroadcastMessage(e.target.value)}/>
                <button className="btn btn-primary" disabled={broadcasting||!broadcastMessage.trim()} onClick={sendBroadcast}>{broadcasting?'Sending…':'Send'}</button>
              </div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:7}}>Sent only to parents and staff connected to this bus/route/trip.</div>
            </motion.div>

            {/* ── My Schedule ── */}
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="glass-panel" style={{ padding:'1.25rem', marginTop:'1.5rem' }}>
              <h3 style={{ margin:'0 0 0.75rem 0', fontSize:'1.1rem' }}>{t('driver.shift')}</h3>
              <DriverScheduleWidget />
            </motion.div>

            {/* ── Recent Trip History ── */}
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} className="glass-panel" style={{ padding:'1.25rem', marginTop:'1rem' }}>
              <h3 style={{ margin:'0 0 0.75rem 0', fontSize:'1.1rem' }}>{t('driver.tripHistory')}</h3>
              <DriverTripHistoryWidget />
            </motion.div>

            {/* Panic Button */}
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.3 }}
              style={{ marginTop:'1.5rem' }}>
              <div style={{ background:'rgba(239,68,68,0.06)', border:'2px solid rgba(239,68,68,0.3)', borderRadius:16, overflow:'hidden' }}>
                <div style={{ background:'repeating-linear-gradient(45deg,rgba(239,68,68,0.08),rgba(239,68,68,0.08) 10px,transparent 10px,transparent 20px)', padding:'0.5rem', textAlign:'center', fontSize:'0.7rem', color:'var(--danger)', fontWeight:700, letterSpacing:2 }}>
                  EMERGENCY ONLY
                </div>
                <button
                  onClick={async () => {
                    if (confirm('EMERGENCY ALERT: This will immediately notify all parents and admin. Confirm?')) {
                      playAlert()
                      navigator.geolocation.getCurrentPosition(
                        async (pos) => { await fetch('/api/emergency', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ latitude:pos.coords.latitude, longitude:pos.coords.longitude }) }); showToast('Emergency signal sent!', 'error') },
                        async () => { await fetch('/api/emergency', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({}) }); showToast('Emergency signal sent!', 'error') }
                      )
                    }
                  }}
                  className="btn"
                  style={{ display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#ef4444,#dc2626)', color:'#fff', fontWeight:800, width:'100%', padding:'1.25rem', borderRadius:0, fontSize:'1.2rem', letterSpacing:1 }}>
                  <ShieldAlert size={24} style={{marginRight:8}}/> PANIC BUTTON
                </button>
              </div>
            </motion.div>
          </div>
        )
      })()}

      <AnimatePresence>
        {!appUnlocked && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" style={{ zIndex: 10000 }}>
            <div className="modal-box" style={{ textAlign: 'center' }}>
               <div style={{ marginBottom:'1rem', display:'flex', justifyContent:'center' }}><Info size={48} color="var(--primary)"/></div>
               <h2>Driver Workspace Setup</h2>
               <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                 Please verify audio alerts to initiate live bus mode tracking mapping.
               </p>
               <button onClick={() => { playHorn(); setAppUnlocked(true); }} className="btn btn-primary" style={{ width: '100%' }}>
                 Initialize Audio Context
               </button>
               <button onClick={() => setAppUnlocked(true)} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:'0.85rem', marginTop:'1rem', cursor:'pointer', textDecoration:'underline' }}>
                 Skip — I&apos;ll turn on audio alerts later
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera Capture Overlay */}
      <CameraCapture
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        title={`Verify Student`}
        onCapture={(dataUrl) => {
          setCapturedPhotos(prev => ({ ...prev, [cameraTarget]: dataUrl }))
          showToast('Photo captured!')
        }}
      />
    </div>
  )
}
