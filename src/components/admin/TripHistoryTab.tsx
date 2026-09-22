'use client'
import { TranslatedText } from '@/i18n/provider'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { formatRideSafeDate, formatRideSafeDateTime } from '@/lib/date-format'
import { Trash2 } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'

interface TripRecord {
  id: string; date: string; status: string; routeName: string; driverName: string
  attendanceCount: number; pickedUp: number; droppedOff: number; absent: number; importedAttendanceCount?:number; avgRating: string | null
  organization?: {id:string;name:string}
  parentConfirmations: {studentId:string;studentName:string;action:string;status:string;requestedAt:string|null}[]
}

export default function TripHistoryTab({currentRole}:{currentRole:string}) {
  const canSelectSchool=currentRole==='SUPER_ADMIN'||currentRole==='SANDBOX'
  const [trips, setTrips] = useState<TripRecord[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError,setLoadError]=useState('')
  const requestSequence=useRef(0)
  const [organizations,setOrganizations]=useState<{id:string;name:string}[]>([])
  const [organizationId,setOrganizationId]=useState('')
  const [pendingDeleteId,setPendingDeleteId]=useState<string|null>(null)
  const [deleting,setDeleting]=useState(false)

  const load = useCallback((p: number,silent=false) => {
    const requestId=++requestSequence.current
    if(!silent)setLoading(true)
    fetch(`/api/trips/history?page=${p}${organizationId?`&organizationId=${encodeURIComponent(organizationId)}`:''}`).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to load trip history');return data}).then(d => {
      if(requestId!==requestSequence.current)return
      setTrips(d.trips || []);setTotalPages(d.totalPages || 1);setPage(p);setLoadError('');setLoading(false)
    }).catch(error=>{if(requestId!==requestSequence.current)return;setLoadError(error instanceof Error?error.message:'Unable to load trip history');if(!silent)setTrips([]);setLoading(false)})
  }, [organizationId])
  useEffect(()=>{if(canSelectSchool)fetch('/api/admin/organizations').then(r=>r.json()).then(d=>setOrganizations(d.organizations||[])).catch(()=>{})},[canSelectSchool])
  useEffect(() => {
    const timer = window.setTimeout(() => load(1), 0)
    return () => {window.clearTimeout(timer);requestSequence.current++}
  }, [load])
  useEffect(()=>{const timer=window.setInterval(()=>load(page,true),12000);const onFocus=()=>load(page,true);window.addEventListener('focus',onFocus);return()=>{window.clearInterval(timer);window.removeEventListener('focus',onFocus)}},[load,page])

  const statusColor: Record<string, string> = { TRIP_CREATED: '#6B7280', DRIVER_STARTED_ROUTE: '#3B82F6', BUS_EN_ROUTE: '#F59E0B', TRIP_COMPLETED: '#10B981' }
  const remove=async(id:string)=>{setDeleting(true);try{const response=await fetch('/api/trips/history',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});if(!response.ok)throw new Error('Unable to remove trip history');setTrips(items=>items.filter(item=>item.id!==id));setPendingDeleteId(null)}catch(error){setLoadError(error instanceof Error?error.message:'Unable to remove trip history')}finally{setDeleting(false)}}

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="glass-panel" style={{ padding: '2rem' }}>
        {loadError&&<div role="alert" className="import-issues"><TranslatedText text="Trip history could not refresh"/>: <TranslatedText text={loadError}/></div>}
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginBottom:'1.5rem'}}><h3 style={{ margin:0, fontSize: '1.3rem' }}><TranslatedText text={"Trip History"}/></h3>{canSelectSchool&&<select className="select-field" style={{width:220}} value={organizationId} onChange={e=>setOrganizationId(e.target.value)}><option value="">All schools</option>{organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}</select>}</div>

        {loading ? (
          [1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height:60, marginBottom:10, borderRadius:10 }} />)
        ) : (
          <div style={{ display:'grid', gap:'0.75rem' }}>
            {trips.map(trip => (
              <motion.div key={trip.id} initial={{ opacity:0 }} animate={{ opacity:1 }} whileHover={{ scale:1.005 }}
                style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', padding:'1rem 1.25rem', background:'rgba(255,255,255,0.02)', borderRadius:12, border:'1px solid var(--surface-border)' }}>
                <div>
                  <div style={{ fontWeight:600, marginBottom:4 }}>
                    {trip.routeName}
                    <span style={{ fontSize:'0.8rem', color:'var(--text-muted)', fontWeight:400, marginLeft:8 }}>
                      {formatRideSafeDate(trip.date)} · {trip.driverName}{trip.organization?.name ? ` · ${trip.organization.name}` : ''}
                    </span>
                  </div>
                  <details style={{marginTop:10}}><summary><TranslatedText text="Parent confirmations"/></summary>{trip.parentConfirmations.map(item=><div key={`${item.studentId}-${item.action}`} style={{fontSize:12,color:'var(--text-muted)',padding:'4px 0'}}>{item.studentName} · <TranslatedText text={item.action==='PICKED_UP'?'Boarding':'Home arrival'}/> · <strong><TranslatedText text={item.status.replaceAll('_',' ')}/></strong>{item.requestedAt?` · ${formatRideSafeDateTime(item.requestedAt)}`:''}</div>)}</details>
                  <div style={{ display:'flex', gap:'1rem', fontSize:'0.8rem', color:'var(--text-muted)' }}>
                    <span>{trip.pickedUp}<TranslatedText text={" picked"}/></span>
                    <span>{trip.droppedOff}<TranslatedText text={" dropped"}/></span>
                    <span>{trip.absent}<TranslatedText text={" absent"}/></span>
                    {Boolean(trip.importedAttendanceCount)&&<span>{trip.importedAttendanceCount} <TranslatedText text="school-imported records"/></span>}
                    {trip.avgRating && <span>⭐ <TranslatedText text={trip.avgRating}/></span>}
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}><span className="badge" style={{ background:`${statusColor[trip.status] || '#6B7280'}22`, color:statusColor[trip.status] || '#6B7280', fontSize:'0.75rem' }}>
                  <TranslatedText text={trip.status.replace(/_/g,' ')}/>
                </span><button className="icon-button" aria-label="Delete from history" onClick={()=>setPendingDeleteId(trip.id)}><Trash2 size={15}/></button></div>
              </motion.div>
            ))}
            {trips.length === 0 && <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-muted)' }}><TranslatedText text={"No trip history yet."}/></div>}
          </div>
        )}

        {totalPages > 1 && (
          <div style={{ display:'flex', justifyContent:'center', gap:'0.5rem', marginTop:'1.5rem' }}>
            <button className="btn" disabled={page <= 1} onClick={() => load(page - 1)} style={{ background:'rgba(255,255,255,0.06)', color:'var(--text-main)' }}><TranslatedText text={"← Prev"}/></button>
            <span style={{ padding:'0.5rem 1rem', color:'var(--text-muted)', fontSize:'0.85rem' }}><TranslatedText text={"Page "}/>{page}<TranslatedText text={" of "}/>{totalPages}</span>
            <button className="btn" disabled={page >= totalPages} onClick={() => load(page + 1)} style={{ background:'rgba(255,255,255,0.06)', color:'var(--text-main)' }}><TranslatedText text={"Next →"}/></button>
          </div>
        )}
      </div>
      <ConfirmDialog open={Boolean(pendingDeleteId)} title="Remove trip from history?" description="This only hides the trip from your history view. The transport audit record is preserved." confirmLabel="Remove from history" busy={deleting} onCancel={()=>{if(!deleting)setPendingDeleteId(null)}} onConfirm={()=>{if(pendingDeleteId)void remove(pendingDeleteId)}}/>
    </motion.div>
  )
}
