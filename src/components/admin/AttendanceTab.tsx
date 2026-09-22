'use client'
import {csvCell} from '@/lib/csv'
import { useTranslation as useLocaleText } from '@/i18n/provider'
import { TranslatedText } from '@/i18n/provider'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertTriangle, Bus, Download, Upload, CalendarDays, RotateCcw } from 'lucide-react'
import { formatRideSafeDate, formatRideSafeTime } from '@/lib/date-format'
import ConfirmDialog from '@/components/ConfirmDialog'

interface RosterEntry {
  studentId: string; studentCode?:string|null; name: string; grade: string
  status: 'PICKED_UP' | 'DROPPED_OFF' | 'ABSENT' | 'NOT_MARKED'
  attendanceId: string | null; timestamp: string | null
  parentPickupStatus: string; parentDropoffStatus: string
  source?:'SCHOOL_IMPORT'|'CREW_VERIFIED'|'NOT_MARKED'
}

interface TripAttendance {
  tripId: string; date: string; status: string
  serviceType:string
  routeId: string; routeName: string; driverName: string; busPlate: string | null
  roster: RosterEntry[]
}

interface Route { id: string; name: string }
interface Organization { id:string;name:string }
interface ArchivedAttendance {id:string;date:string;session:string;status:string;studentName:string;studentCode:string|null;matchedStudentId:string|null;routeName:string|null;busLabel:string|null;time:string|null;sourceFile:string}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  PICKED_UP:   { label: 'Picked Up',   color: 'var(--info)',    bg: 'rgba(59,130,246,0.12)' },
  DROPPED_OFF: { label: 'Dropped Off', color: 'var(--success)', bg: 'rgba(16,185,129,0.12)' },
  ABSENT:      { label: 'Absent',      color: 'var(--danger)',  bg: 'rgba(239,68,68,0.12)' },
  NOT_MARKED:  { label: 'Not Marked',  color: 'var(--text-muted)', bg: 'rgba(255,255,255,0.05)' },
}

function todayStr() {
  return new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})
}

export default function AttendanceTab({currentRole}:{currentRole:string}) {
 const {tx:translateUi}=useLocaleText()
  const canSelectSchool = currentRole === 'SUPER_ADMIN' || currentRole === 'SANDBOX'

  const [date, setDate] = useState(todayStr())
  const [routeId, setRouteId] = useState('')
  const [routes, setRoutes] = useState<Route[]>([])
  const [organizations,setOrganizations]=useState<Organization[]>([])
  const [organizationId,setOrganizationId]=useState('')
  const [trips, setTrips] = useState<TripAttendance[]>([])
  const [archived,setArchived]=useState<ArchivedAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError,setLoadError]=useState('')
  const [archiveError,setArchiveError]=useState('')
  const loadSequence=useRef(0)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [sort, setSort] = useState('RECENT')
  const [importFile,setImportFile]=useState<File|null>(null)
  const [importing,setImporting]=useState(false)
  const [importIssues,setImportIssues]=useState<{row:number;error:string}[]>([])
  const [importWarnings,setImportWarnings]=useState<{row:number;error:string}[]>([])
  const [visibleArchiveRows,setVisibleArchiveRows]=useState(100)
  const [preferencesReady,setPreferencesReady]=useState(false)
  const [resetOpen,setResetOpen]=useState(false)
  const [resetText,setResetText]=useState('')
  const [resetting,setResetting]=useState(false)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast(msg); setToastType(type); setTimeout(() => setToast(''), 3000)
  }

  useEffect(() => {
    const savedDate=window.localStorage.getItem('ridesafe.attendance.date')
    if(savedDate&&/^\d{4}-\d{2}-\d{2}$/.test(savedDate))setDate(savedDate)
    if(canSelectSchool)setOrganizationId(window.localStorage.getItem('ridesafe.global.organizationId')||window.localStorage.getItem('ridesafe.superAdmin.organizationId')||'')
    setPreferencesReady(true)
  }, [canSelectSchool])
  useEffect(()=>{if(preferencesReady)window.localStorage.setItem('ridesafe.attendance.date',date)},[date,preferencesReady])
  useEffect(()=>{if(preferencesReady&&canSelectSchool){if(organizationId)window.localStorage.setItem('ridesafe.global.organizationId',organizationId);else window.localStorage.removeItem('ridesafe.global.organizationId')}},[organizationId,canSelectSchool,preferencesReady])
  useEffect(() => {
    if(canSelectSchool)fetch('/api/admin/organizations').then(r=>r.json()).then(d=>{
      const list=d.organizations||[];setOrganizations(list)
      setOrganizationId(value=>value&&list.some((org:Organization)=>org.id===value)?value:'')
    }).catch(()=>{})
  }, [canSelectSchool])
  useEffect(()=>{if(canSelectSchool&&!organizationId){Promise.resolve().then(()=>setRoutes([]));return}const query=canSelectSchool?`?organizationId=${encodeURIComponent(organizationId)}`:'';fetch(`/api/admin/routes${query}`).then(r => r.json()).then(d => setRoutes(d.routes || [])).catch(() => setRoutes([]))},[canSelectSchool,organizationId])

  const load = useCallback((silent=false) => {
    const requestId=++loadSequence.current
    if(!silent)setLoading(true)
    const qs = new URLSearchParams({ date, ...(routeId ? { routeId } : {}),...(canSelectSchool&&organizationId?{organizationId}:{}) })
    fetch(`/api/attendance?${qs}`)
      .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load school attendance');return data})
      .then(d => {if(requestId!==loadSequence.current)return;setTrips(d.trips || []);setArchived(d.archived || []);setArchiveError(d.archiveError || '');setLoadError('');setLoading(false)})
      .catch(error=>{if(requestId!==loadSequence.current)return;setLoadError(error instanceof Error?error.message:'Unable to load school attendance');if(!silent){setTrips([]);setArchived([])}setLoading(false)})
  }, [date, routeId,canSelectSchool,organizationId])

  useEffect(() => {if(!preferencesReady)return;const timer = setTimeout(()=>load(), 0);const refresh=window.setInterval(()=>load(true),15000);const onFocus=()=>load(true);window.addEventListener('focus',onFocus);return () => {clearTimeout(timer);window.clearInterval(refresh);window.removeEventListener('focus',onFocus);loadSequence.current++} }, [load,preferencesReady])
  useEffect(()=>{const timer=setTimeout(()=>setVisibleArchiveRows(100),0);return()=>clearTimeout(timer)},[date,organizationId,routeId])

  const exportCSV = () => {
    const rows = [['Date','Session','Route','Bus','Driver','Student','Student ID','Grade','Status','Time','Parent boarding confirmation','Parent drop-off confirmation','Source']]
    trips.forEach(t => t.roster.forEach(s => rows.push([
      formatRideSafeDate(t.date),t.serviceType,t.routeName,t.busPlate||'',t.driverName,s.name,s.studentCode||'',s.grade,STATUS_META[s.status].label,
      s.timestamp ? formatRideSafeTime(s.timestamp) : '',s.parentPickupStatus,s.parentDropoffStatus,s.source==='SCHOOL_IMPORT'?'SCHOOL_IMPORT':'RIDESAFE'
    ])))
    archived.forEach(item=>rows.push([formatRideSafeDate(item.date),item.session,item.routeName||'',item.busLabel||'', '',item.studentName,item.studentCode||'','',item.status,item.time||'','','','UPLOADED_HISTORY']))
    const csv = rows.map(r => r.map(csvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `attendance_${date}.csv`; a.click()
    showToast('CSV exported!')
  }
  const importAttendance=async()=>{
    if(!importFile)return showToast('Choose an Excel or CSV attendance file','error')
    if(canSelectSchool&&!organizationId)return showToast('Select a school before importing attendance','error')
    const body=new FormData();body.append('file',importFile);body.append('organizationId',organizationId);setImporting(true);setImportIssues([]);setImportWarnings([])
    try{const response=await fetch('/api/attendance/import',{method:'POST',body}),result=await response.json();if(!response.ok)throw new Error(result.error||'Attendance import failed');setImportIssues(result.errors||[]);setImportWarnings(result.warnings||[]);showToast(`${result.created} trip records added; ${result.updated||0} updated; ${result.archived||0} historical added; ${result.archivedUpdated||0} historical updated; ${result.skipped} skipped; ${result.duplicates||0} unchanged`,result.skipped?'error':'success');setImportFile(null);if(result.viewDate){setRouteId('');setDate(result.viewDate);if(result.viewDate===date&&!routeId)load()}else load()}
    catch(error){showToast(error instanceof Error?error.message:'Attendance import failed','error')}finally{setImporting(false)}
  }

  const selectedOrganization=organizations.find(org=>org.id===organizationId)
  const resetAttendance=async()=>{
    if(!selectedOrganization)return
    setResetting(true)
    try{
      const response=await fetch('/api/admin/data-reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({scope:'ATTENDANCE',organizationId,confirmation:resetText})})
      const result=await response.json().catch(()=>({}))
      if(!response.ok)throw new Error(result.error||'Attendance reset failed')
      setResetOpen(false);setResetText('');setImportIssues([]);setImportWarnings([]);showToast('Selected school attendance reset successfully');load()
    }catch(error){showToast(error instanceof Error?error.message:'Attendance reset failed','error')}
    finally{setResetting(false)}
  }

  const allRoster = trips.flatMap(t => t.roster)
  const summary = {
    total: allRoster.length+archived.length,
    pickedUp: allRoster.filter(s => s.status === 'PICKED_UP').length+archived.filter(s=>s.status==='PICKED_UP').length,
    droppedOff: allRoster.filter(s => s.status === 'DROPPED_OFF').length+archived.filter(s=>s.status==='DROPPED_OFF').length,
    absent: allRoster.filter(s => s.status === 'ABSENT').length+archived.filter(s=>s.status==='ABSENT').length,
    notMarked: allRoster.filter(s => s.status === 'NOT_MARKED').length+archived.filter(s=>s.status==='NOT_MARKED').length,
  }

  const routesWithTrip = new Set(trips.map(t => t.routeId))
  const routesMissing = routeId ? [] : routes.filter(r => !routesWithTrip.has(r.id))
  const sortedTrips = [...trips].sort((a,b) => sort === 'OLDEST' ? +new Date(a.date)-+new Date(b.date) : +new Date(b.date)-+new Date(a.date))
  const sortedRoster = (items: RosterEntry[]) => [...items].sort((a,b) => sort === 'NAME' ? a.name.localeCompare(b.name) : sort === 'STATUS' ? a.status.localeCompare(b.status) : 0)

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
              {allRoster.length}<TranslatedText text=" trip students"/> · {archived.length}<TranslatedText text=" uploaded historical rows"/> · {trips.length}<TranslatedText text={" trip"}/><TranslatedText text={trips.length !== 1 ? 's' : ''}/><TranslatedText text={" on "}/>{formatRideSafeDate(`${date}T00:00:00+08:00`)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {canSelectSchool&&<select className="select-field" aria-label={translateUi('Select school')} style={{width:'auto',minWidth:190}} value={organizationId} onChange={e=>{setOrganizationId(e.target.value);setRouteId('')}}><option value=""><TranslatedText text="Select school"/></option>{organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}</select>}
            <input type="date" className="input-field" style={{ marginBottom: 0, padding: '0.5rem 0.75rem', width: 'auto' }}
              value={date} onChange={e => setDate(e.target.value)} max={todayStr()} />
            <select className="select-field" style={{ width: 'auto', minWidth: 160 }} value={routeId} onChange={e => setRouteId(e.target.value)}>
              <option value=""><TranslatedText text={"All Routes"}/></option>
              {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select className="select-field" aria-label={translateUi('Sort attendance')} style={{width:'auto',minWidth:150}} value={sort} onChange={e=>setSort(e.target.value)}><option value="RECENT"><TranslatedText text="Recent first"/></option><option value="OLDEST"><TranslatedText text="Oldest first"/></option><option value="NAME"><TranslatedText text="Student name"/></option><option value="STATUS"><TranslatedText text="Attendance status"/></option></select>
            <button className="btn" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--surface-border)', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={exportCSV} disabled={trips.length === 0 && archived.length === 0}>
              <Download size={16} /><TranslatedText text={" Export CSV "}/></button>
            {canSelectSchool&&<button className="btn btn-danger" disabled={!selectedOrganization} onClick={()=>{setResetText('');setResetOpen(true)}}><RotateCcw size={16}/><TranslatedText text="Reset school attendance"/></button>}
            {['SUPER_ADMIN','SANDBOX','SCHOOL_ADMIN'].includes(currentRole)&&<><a className="btn" href="/templates/attendance-period.xlsx" download><Download size={16}/><TranslatedText text=" Excel Template "/></a><a className="btn" href="/templates/attendance-period.csv" download><Download size={16}/><TranslatedText text=" CSV Template "/></a><label className="btn bulk-file"><Upload size={16}/><span><TranslatedText text={importFile?.name||'Choose import file'}/></span><input type="file" accept=".xlsx,.csv" onChange={e=>setImportFile(e.target.files?.[0]||null)}/></label><button className="btn btn-primary" disabled={importing||!importFile||(canSelectSchool&&!organizationId)} onClick={()=>void importAttendance()}><Upload size={16}/><TranslatedText text={importing?'Importing…':'Import'}/></button></>}
          </div>
        </div>

        {loadError&&<div className="import-issues" role="alert"><strong>{translateUi('Attendance could not refresh')}</strong><p>{translateUi(loadError)}</p></div>}
        {archiveError&&<div className="import-issues" role="status"><strong>{translateUi('Historical uploads unavailable until the database update')}</strong><p>{translateUi(archiveError)}</p></div>}
        {importIssues.length>0&&<div className="import-issues" role="status"><strong>{translateUi('Rows needing attention')}</strong><ul>{importIssues.map(item=><li key={item.row}>{translateUi('Row')} {item.row}: {translateUi(item.error)}</li>)}</ul></div>}
        {importWarnings.length>0&&<div className="import-issues" role="status"><strong>{translateUi('Historical rows kept separate from trip attendance')}</strong><ul>{importWarnings.map(item=><li key={item.row}>{translateUi('Row')} {item.row}: {translateUi(item.error)}</li>)}</ul></div>}

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
        {archived.length>0&&<p style={{fontSize:'0.8rem',color:'var(--text-muted)',marginTop:12}}><TranslatedText text="Totals include uploaded school history; imported rows are not driver-confirmed boarding or drop-off."/></p>}

        {routesMissing.length > 0 && (
          <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--surface-2)', borderRadius: 8, padding: '0.6rem 0.9rem' }}><TranslatedText text={" No trip recorded on "}/>{formatRideSafeDate(`${date}T00:00:00+08:00`)}<TranslatedText text={" for: "}/>{routesMissing.map(r => r.name).join(', ')}
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
          <div style={{ fontSize: '0.85rem' }}><TranslatedText text={archived.length?'Uploaded school history for this date appears below.':'Pick another date, or a route with a completed run.'}/></div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1.25rem' }}>
          {sortedTrips.map(trip => (
            <motion.div key={trip.tripId} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="glass-panel" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Bus size={15} /> {trip.routeName}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}><TranslatedText text={" Driver: "}/>{trip.driverName}<TranslatedText text={trip.busPlate && ` · ${trip.busPlate}`}/> · {formatRideSafeTime(trip.date)}
                  </div>
                </div>
                <span className="badge badge-info"><TranslatedText text={trip.status.replace(/_/g, ' ')}/></span>
              </div>

              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {sortedRoster(trip.roster).map(entry => {
                  const meta = STATUS_META[entry.status] || STATUS_META.NOT_MARKED
                  return (
                    <div key={entry.studentId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
                      padding: '0.6rem 0.9rem', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--surface-border)' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{entry.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {entry.grade}{entry.timestamp && ` · ${formatRideSafeTime(entry.timestamp)}`}
                          <div><TranslatedText text="Parent boarding"/>: <TranslatedText text={entry.parentPickupStatus.replaceAll('_',' ')}/> · <TranslatedText text="Parent arrival"/>: <TranslatedText text={entry.parentDropoffStatus.replaceAll('_',' ')}/></div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600, color: meta.color, background: meta.bg }}>
                          <TranslatedText text={meta.label}/>
                        </span>
                        {entry.source==='SCHOOL_IMPORT'&&<small><TranslatedText text="School import (not crew confirmed)"/></small>}

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
      {!loading&&archived.length>0&&<section className="glass-panel historical-attendance" style={{padding:'1.5rem',marginTop:'1.25rem'}}>
        <h3><Upload size={19}/>{translateUi('Uploaded historical attendance')}</h3>
        <p>{translateUi('These rows have no verified live trip or bus assignment. They are kept for the school history, not treated as crew-confirmed boarding.')}</p>
        <div className="historical-attendance-rows">{archived.slice(0,visibleArchiveRows).map(item=><article key={item.id}>
          <strong data-no-translate>{item.studentName}</strong>
          <span style={{color:STATUS_META[item.status]?.color||'var(--text-main)',fontWeight:700}}>{translateUi(item.status.replaceAll('_',' '))} · {formatRideSafeDate(item.date)}{item.time?` · ${item.time}`:''}</span>
          <small data-no-translate>{item.session} · {item.routeName||'—'} · {item.busLabel||'—'}</small>
          <small>{item.matchedStudentId?translateUi('Student ID matched during import'):translateUi('Student assignment not verified')} · <span data-no-translate>{item.sourceFile}</span></small>
        </article>)}</div>
        {archived.length>visibleArchiveRows&&<button className="btn" onClick={()=>setVisibleArchiveRows(value=>value+100)}><TranslatedText text="Show more uploaded records"/> ({archived.length-visibleArchiveRows})</button>}
      </section>}
      <ConfirmDialog open={resetOpen} title="Reset school attendance?" description="This permanently removes the selected school's crew attendance, parent confirmations, and uploaded attendance history. Trips and students are preserved." confirmLabel="Reset attendance" busy={resetting} expectedText={selectedOrganization?.name} typedText={resetText} onTypedTextChange={setResetText} onCancel={()=>{if(!resetting){setResetOpen(false);setResetText('')}}} onConfirm={()=>void resetAttendance()}/>
    </motion.div>
  )
}
