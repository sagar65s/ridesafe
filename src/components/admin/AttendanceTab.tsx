'use client'
import {csvCell} from '@/lib/csv'
import { useTranslation as useLocaleText } from '@/i18n/provider'
import { TranslatedText } from '@/i18n/provider'
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertTriangle, Check, UserX, Bus, Download, Trash2, CalendarDays } from 'lucide-react'

interface RosterEntry {
  studentId: string; name: string; grade: string
  status: 'PICKED_UP' | 'DROPPED_OFF' | 'ABSENT' | 'NOT_MARKED'
  attendanceId: string | null; timestamp: string | null
}

interface TripAttendance {
  tripId: string; date: string; status: string
  routeId: string; routeName: string; driverName: string; busPlate: string | null
  roster: RosterEntry[]
}

interface Route { id: string; name: string }

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  PICKED_UP:   { label: 'Picked Up',   color: 'var(--info)',    bg: 'rgba(59,130,246,0.12)' },
  DROPPED_OFF: { label: 'Dropped Off', color: 'var(--success)', bg: 'rgba(16,185,129,0.12)' },
  ABSENT:      { label: 'Absent',      color: 'var(--danger)',  bg: 'rgba(239,68,68,0.12)' },
  NOT_MARKED:  { label: 'Not Marked',  color: 'var(--text-muted)', bg: 'rgba(255,255,255,0.05)' },
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})
}

export default function AttendanceTab() {
 const {tx:translateUi}=useLocaleText()

  const [date, setDate] = useState(todayStr())
  const [routeId, setRouteId] = useState('')
  const [routes, setRoutes] = useState<Route[]>([])
  const [trips, setTrips] = useState<TripAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast(msg); setToastType(type); setTimeout(() => setToast(''), 3000)
  }

  useEffect(() => {
    fetch('/api/admin/routes').then(r => r.json()).then(d => setRoutes(d.routes || [])).catch(() => {})
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    const qs = new URLSearchParams({ date, ...(routeId ? { routeId } : {}) })
    fetch(`/api/attendance?${qs}`)
      .then(r => r.json())
      .then(d => { setTrips(d.trips || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [date, routeId])

  useEffect(() => { const timer = setTimeout(load, 0); return () => clearTimeout(timer) }, [load])

  const exportCSV = () => {
    const rows = [['Route', 'Driver', 'Student', 'Grade', 'Status', 'Time']]
    trips.forEach(t => t.roster.forEach(s => rows.push([
      t.routeName, t.driverName, s.name, s.grade, STATUS_META[s.status].label,
      s.timestamp ? new Date(s.timestamp).toLocaleTimeString() : ''
    ])))
    const csv = rows.map(r => r.map(csvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `attendance_${date}.csv`; a.click()
    showToast('CSV exported!')
  }

  const allRoster = trips.flatMap(t => t.roster)
  const summary = {
    total: allRoster.length,
    pickedUp: allRoster.filter(s => s.status === 'PICKED_UP').length,
    droppedOff: allRoster.filter(s => s.status === 'DROPPED_OFF').length,
    absent: allRoster.filter(s => s.status === 'ABSENT').length,
    notMarked: allRoster.filter(s => s.status === 'NOT_MARKED').length,
  }

  const routesWithTrip = new Set(trips.map(t => t.routeId))
  const routesMissing = routeId ? [] : routes.filter(r => !routesWithTrip.has(r.id))

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
              background: toastType === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
              border: `1px solid ${toastType === 'success' ? 'var(--success)' : 'var(--danger)'}`,
              borderRadius: 12, color: 'var(--text-main)', fontWeight: 500, backdropFilter: 'blur(12px)' }}>
            {toastType === 'error' ? <AlertTriangle size={18} color="var(--danger)" /> : <CheckCircle size={18} color="var(--success)" />}
            <TranslatedText text={toast}/>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header / filters */}
      <div className="glass-panel" style={{ padding: '1.5rem 2rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarDays size={20} color="var(--primary)" /><TranslatedText text={" Attendance "}/></h3>
            <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginTop: 4 }}>
              {summary.total}<TranslatedText text={" students across "}/>{trips.length}<TranslatedText text={" trip"}/><TranslatedText text={trips.length !== 1 ? 's' : ''}/><TranslatedText text={" on "}/><TranslatedText text={date}/>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="date" className="input-field" style={{ marginBottom: 0, padding: '0.5rem 0.75rem', width: 'auto' }}
              value={date} onChange={e => setDate(e.target.value)} max={todayStr()} />
            <select className="select-field" style={{ width: 'auto', minWidth: 160 }} value={routeId} onChange={e => setRouteId(e.target.value)}>
              <option value=""><TranslatedText text={"All Routes"}/></option>
              {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button className="btn" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={exportCSV} disabled={trips.length === 0}>
              <Download size={16} /><TranslatedText text={" Export CSV "}/></button>
          </div>
        </div>

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: '0.75rem', marginTop: '1.5rem' }}>
          {[
            ['Total', summary.total, 'var(--text-main)'],
            ['Picked Up', summary.pickedUp, STATUS_META.PICKED_UP.color],
            ['Dropped Off', summary.droppedOff, STATUS_META.DROPPED_OFF.color],
            ['Absent', summary.absent, STATUS_META.ABSENT.color],
            ['Not Marked', summary.notMarked, STATUS_META.NOT_MARKED.color],
          ].map(([label, val, color]) => (
            <div key={label as string} className="glass-panel" style={{ padding: '0.75rem 1rem', textAlign: 'center', borderLeft: `3px solid ${color}` }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: color as string }}>{val}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase' }}>{label}</div>
            </div>
          ))}
        </div>

        {routesMissing.length > 0 && (
          <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--surface-2)', borderRadius: 8, padding: '0.6rem 0.9rem' }}><TranslatedText text={" No trip recorded on "}/><TranslatedText text={date}/><TranslatedText text={" for: "}/>{routesMissing.map(r => r.name).join(', ')}
          </div>
        )}
      </div>

      {/* Trip roster cards */}
      {loading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 120, borderRadius: 12 }} />)}
        </div>
      ) : trips.length === 0 ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <CalendarDays size={40} style={{ opacity: 0.25, marginBottom: '1rem' }} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}><TranslatedText text={"No trips on this date"}/></div>
          <div style={{ fontSize: '0.85rem' }}><TranslatedText text={"Pick another date, or a route with a completed run."}/></div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          {trips.map(trip => (
            <motion.div key={trip.tripId} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="glass-panel" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Bus size={15} /> {trip.routeName}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}><TranslatedText text={" Driver: "}/>{trip.driverName}<TranslatedText text={trip.busPlate && ` · ${trip.busPlate}`}/> · {new Date(trip.date).toLocaleTimeString()}
                  </div>
                </div>
                <span className="badge badge-info"><TranslatedText text={trip.status.replace(/_/g, ' ')}/></span>
              </div>

              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {trip.roster.map(entry => {
                  const meta = STATUS_META[entry.status] || STATUS_META.NOT_MARKED
                  return (
                    <div key={entry.studentId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                      padding: '0.6rem 0.9rem', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--surface-border)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{entry.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {entry.grade}{entry.timestamp && ` · ${new Date(entry.timestamp).toLocaleTimeString()}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, color: meta.color, background: meta.bg }}>
                          <TranslatedText text={meta.label}/>
                        </span>

                      </div>
                    </div>
                  )
                })}
                {trip.roster.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}><TranslatedText text={" No students assigned to this route. "}/></div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
