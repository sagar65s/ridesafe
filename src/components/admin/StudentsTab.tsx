'use client'
import {csvCell} from '@/lib/csv'
import { useTranslation as useLocaleText } from '@/i18n/provider'
import { TranslatedText } from '@/i18n/provider'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertTriangle, UserPlus, Bus, Check, X, Download, Plus, Pencil, Trash2 } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface Student {
  id: string; name: string; grade: string; level: string;
  parentContact1: string; parentContact2?: string;
  status: string; isSelfPickup: boolean; selfPickupSession?: string;
  busId?: string; bus?: { plateNumber: string }; routeId?: string;
  route?: { id: string; name: string }; parentId?: string;
  parent?: { id?: string; name: string; phone?: string };
  pickupStopId?: string; dropoffStopId?: string;
  pickupStop?: { id:string; name:string }; dropoffStop?: { id:string; name:string }
  studentCode?: string; className?: string; section?: string; pickupAddress?: string; dropoffAddress?: string;
  isActive: boolean; organizationId?: string;
}

interface Route { id: string; name: string; organizationId?: string; isActive?:boolean }
interface Parent { id: string; name: string; email: string; phone?: string; organizationId?: string; isActive?:boolean }
interface Stop { id:string; name:string }
interface FleetBus { id:string; busNumber?:string; plateNumber:string; organizationId?:string; routeId?:string; status?:string }
interface Organization { id:string; name:string }

const SELF_PICKUP_OPTIONS = [
  { value: '',              label: 'Bus Transport (no self-pickup)' },
  { value: 'MORNING',      label: 'Morning Self-Pickup' },
  { value: 'PM',           label: 'PM Self-Pickup' },
  { value: 'AFTER_SCHOOL', label: 'After School Activity' },
]

const defaultForm = {
  name: '', grade: '', level: '',
  parentContact1: '', parentContact2: '',
  selfPickupSession: '', routeId: '', busId:'', parentId: '', pickupStopId:'', dropoffStopId:'',
  studentCode:'', className:'', section:'', pickupAddress:'', dropoffAddress:'', organizationId:'', isActive:true,
}

function sanitizePhone(v: string) {
  return v.replace(/[^0-9+\s()\-]/g, '')
}

function validateStudentForm(form: typeof defaultForm): Record<string, string> {
  const errs: Record<string, string> = {}
  if (!form.name.trim() || form.name.trim().length < 2) errs.name = 'Student name must be at least 2 characters'
  if (!form.grade.trim()) errs.grade = 'Grade is required'
  if (!form.parentContact1.trim()) errs.parentContact1 = 'Primary contact is required'
  else if (!/^[+0-9\s()\-]{7,20}$/.test(form.parentContact1.trim())) errs.parentContact1 = 'Enter a valid phone number'
  if (form.parentContact2 && !/^[+0-9\s()\-]{7,20}$/.test(form.parentContact2.trim())) errs.parentContact2 = 'Enter a valid phone number'
  return errs
}

export default function StudentsTab({ searchQuery = '' }: { searchQuery?: string }) {
 const {tx:translateUi}=useLocaleText()

  const [students, setStudents] = useState<Student[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [parents, setParents] = useState<Parent[]>([])
  const [routeStops, setRouteStops] = useState<Stop[]>([])
  const [buses, setBuses] = useState<FleetBus[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [currentRole, setCurrentRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success'|'error'>('success')
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadStudents = () => {
    Promise.all([
      fetch('/api/students').then(r => r.json()),
      fetch('/api/admin/routes').then(r => r.json()),
      fetch('/api/admin/users').then(r => r.json()),
      fetch('/api/admin/buses').then(r => r.json()),
      fetch('/api/admin/organizations').then(r => r.ok ? r.json() : { organizations:[] }),
      fetch('/api/auth/me').then(r => r.json()),
    ]).then(([sData, rData, uData, bData, oData, meData]) => {
      setStudents(sData.students || [])
      setRoutes(rData.routes || [])
      setParents((uData.users || []).filter((u: Parent & { role: string }) => u.role === 'PARENT' && u.isActive !== false))
      setBuses(bData.buses || [])
      setOrganizations(oData.organizations || [])
      setCurrentRole(meData.user?.role || '')
      setLoading(false)
    }).catch(console.error)
  }

  useEffect(() => { loadStudents() }, [])

  const showToast = (msg: string, type: 'success'|'error'='success') => {
    setToast(msg)
    setToastType(type)
    setTimeout(() => setToast(''), 3000)
  }

  const openAddModal = () => { setEditingStudent(null); setForm(defaultForm); setRouteStops([]); setFormErrors({}); setShowModal(true) }

  const openEditModal = (s: Student) => {
    setEditingStudent(s)
    setForm({
      name: s.name, grade: s.grade, level: s.level || 'Primary',
      parentContact1: s.parentContact1, parentContact2: s.parentContact2 || '',
      selfPickupSession: s.selfPickupSession || '', routeId: s.routeId || s.route?.id || '', parentId: s.parentId || s.parent?.id || '',
      pickupStopId:s.pickupStopId || s.pickupStop?.id || '', dropoffStopId:s.dropoffStopId || s.dropoffStop?.id || '',
      busId:s.busId || '', studentCode:s.studentCode || '', className:s.className || '', section:s.section || '',
      pickupAddress:s.pickupAddress || '', dropoffAddress:s.dropoffAddress || '', organizationId:s.organizationId || '', isActive:s.isActive !== false,
    })
    const routeId = s.routeId || s.route?.id
    if (routeId) fetch(`/api/stops?routeId=${encodeURIComponent(routeId)}`).then(r => r.json()).then(d => setRouteStops(d.stops || [])).catch(() => setRouteStops([]))
    else setRouteStops([])
    setFormErrors({})
    setShowModal(true)
  }

  const handleSave = async () => {
    const errs = validateStudentForm(form)
    if (currentRole === 'SUPER_ADMIN' && !form.organizationId) errs.organizationId = 'Select a school'
    setFormErrors(errs)
    if (Object.keys(errs).length > 0) return
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        grade: form.grade,
        level: form.level || 'Primary',
        parentContact1: form.parentContact1,
        parentContact2: form.parentContact2 || null,
        isSelfPickup: form.selfPickupSession !== '',
        selfPickupSession: form.selfPickupSession || null,
        routeId: form.routeId || null,
        parentId: form.parentId || null,
        pickupStopId: form.pickupStopId || null,
        dropoffStopId: form.dropoffStopId || null,
        busId: form.busId || null,
        studentCode: form.studentCode || null,
        className: form.className || null,
        section: form.section || null,
        pickupAddress: form.pickupAddress || null,
        dropoffAddress: form.dropoffAddress || null,
        organizationId: form.organizationId || null,
        isActive: form.isActive,
      }
      const res = editingStudent
        ? await fetch(`/api/students/${editingStudent.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
        : await fetch('/api/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
      if (res.ok) {
        showToast(editingStudent ? 'Student updated!' : 'Student added successfully!', 'success')
        setShowModal(false); setForm(defaultForm); setEditingStudent(null); loadStudents()
      } else {
        const e = await res.json(); showToast((e.error || 'Failed'), 'error')
      }
    } catch { showToast('Network error', 'error') } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (s: Student) => {
    if (!confirm(`Deactivate "${s.name}"? Existing attendance and trip history will be preserved.`)) return
    setDeletingId(s.id)
    try {
      const res = await fetch(`/api/students/${s.id}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Student deactivated; history preserved', 'success'); loadStudents()
      } else {
        const e = await res.json(); showToast(e.error || 'Failed to deactivate student', 'error')
      }
    } catch { showToast('Network error', 'error') } finally {
      setDeletingId(null)
    }
  }

  const exportCSV = () => {
    const rows = [
      ['#', 'Name', 'Grade', 'Level', 'Contact1', 'Status', 'Route'],
      ...students.map((s, i) => [i + 1, s.name, s.grade, s.level, s.parentContact1, s.status, s.route?.name || ''])
    ]
    const csv = rows.map(r => r.map(csvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `students_${new Date().toISOString().split('T')[0]}.csv`; a.click()
    showToast('CSV exported!', 'success')
  }

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.setTextColor(40)
    doc.text('Student Roster — RideSafe', 14, 22)
    doc.setFontSize(10)
    doc.setTextColor(120)
    doc.text(`Generated: ${new Date().toLocaleString()}  |  Total: ${students.length} students`, 14, 30)

    autoTable(doc, {
      startY: 38,
      head: [['#', 'Name', 'Grade', 'Level', 'Contact', 'Status', 'Route']],
      body: students.map((s, i) => [
        i + 1, s.name, s.grade, s.level, s.parentContact1,
        s.status.replace('_', ' '), s.route?.name || 'N/A'
      ]),
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 9, cellPadding: 4 },
      alternateRowStyles: { fillColor: [245, 245, 250] },
    })

    doc.save(`students_${new Date().toISOString().split('T')[0]}.pdf`)
    showToast('PDF exported!', 'success')
  }

  const q = searchQuery.trim().toLowerCase()
  const filtered = q
    ? students.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.grade.toLowerCase().includes(q) ||
        s.level?.toLowerCase().includes(q) ||
        s.route?.name.toLowerCase().includes(q) ||
        s.parent?.name.toLowerCase().includes(q) ||
        s.parentContact1?.includes(q)
        || s.studentCode?.toLowerCase().includes(q)
      )
    : students
  const availableRoutes = routes.filter(route => route.isActive !== false && (!form.organizationId || route.organizationId === form.organizationId))
  const availableParents = parents.filter(parent => !form.organizationId || parent.organizationId === form.organizationId)
  const availableBuses = buses.filter(bus => bus.status !== 'INACTIVE' && bus.status !== 'MAINTENANCE' && (!form.organizationId || bus.organizationId === form.organizationId) && (!form.routeId || !bus.routeId || bus.routeId === form.routeId))

  if (loading) return (
    <div className="glass-panel" style={{ padding: '2rem' }}>
      {[1,2,3,4].map(i => (
        <div key={i} className="skeleton" style={{ height: 60, marginBottom: 12, borderRadius: 10 }} />
      ))}
    </div>
  )

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-20 }}
            style={{ position:'fixed', top:20, right:20, zIndex:9999, padding:'0.875rem 1.5rem', display:'flex', alignItems:'center', gap:'0.75rem',
              background: toastType === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
              border: `1px solid ${toastType === 'success' ? 'var(--success)' : 'var(--danger)'}`,
              borderRadius:12, color:'var(--text-main)', fontWeight:500, backdropFilter:'blur(12px)' }}>
            {toastType === 'error' ? <AlertTriangle size={18} color="var(--danger)"/> : <CheckCircle size={18} color="var(--success)"/>}
            <TranslatedText text={toast}/>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header row */}
      <div className="glass-panel" style={{ padding:'2rem' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem', flexWrap:'wrap', gap:'1rem' }}>
          <div>
            <h3 style={{ margin:0, fontSize:'1.3rem' }}><TranslatedText text={"Student Roster"}/></h3>
            <div style={{ fontSize:'0.85rem', color:'var(--text-muted)', marginTop:4 }}>{students.length}<TranslatedText text={" students enrolled"}/></div>
          </div>
          <div style={{ display:'flex', gap:'0.75rem', flexWrap:'wrap' }}>
            <button className="btn" style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--surface-border)', display:'flex', alignItems:'center', gap:6 }}
              onClick={exportCSV}>
              <Download size={16}/><TranslatedText text={" Export CSV "}/></button>
            <button className="btn" style={{ background:'rgba(255,255,255,0.06)', border:'1px solid var(--surface-border)', display:'flex', alignItems:'center', gap:6 }}
              onClick={exportPDF}>
              <Download size={16}/><TranslatedText text={" Export PDF "}/></button>
            <motion.button whileHover={{ scale:1.04 }} whileTap={{ scale:0.96 }}
              className="btn btn-primary" onClick={openAddModal} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Plus size={16}/><TranslatedText text={" Add Student "}/></motion.button>
          </div>
        </div>

        {/* Students list */}
        <div style={{ display:'grid', gap:'0.75rem' }}>
          {filtered.map((s, i) => (
            <motion.div key={s.id} initial={{ opacity:0, x:-10 }} animate={{ opacity:1, x:0 }}
              whileHover={{ scale:1.005, backgroundColor:'rgba(255,255,255,0.04)' }}
              style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'1rem 1.25rem', background:'rgba(255,255,255,0.02)',
                borderRadius:12, border:'1px solid var(--surface-border)', transition:'all 0.2s' }}>
              <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
                <div style={{ width:22, fontSize:'0.78rem', color:'var(--text-muted)', textAlign:'right', flexShrink:0, fontVariantNumeric:'tabular-nums' }}>
                  {i + 1}
                </div>
                <div style={{ width:40, height:40, borderRadius:'50%',
                  background:'linear-gradient(135deg,#FFD100,#F5A623)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontWeight:700, color:'#111', fontSize:'1rem', flexShrink:0 }}>
                  {s.name.charAt(0)}
                </div>
                <div>
                  <div style={{ fontWeight:600 }}>{s.name} {s.studentCode && <span style={{ color:'var(--text-muted)', fontSize:11 }}>({s.studentCode})</span>}</div>
                  <div style={{ fontSize:'0.82rem', color:'var(--text-muted)' }}>
                    {s.grade}{s.className ? ` · ${s.className}` : ''}{s.section ? `-${s.section}` : ''} · <TranslatedText text={s.level}/>
                    {s.parent && <span><TranslatedText text={" · Parent: "}/>{s.parent.name}</span>}
                    {s.parentContact1 && <span> · 📞 <TranslatedText text={s.parentContact1}/></span>}
                  </div>
                </div>
              </div>
              <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
                {s.route && <span className="badge badge-info">🚌 {s.route.name}</span>}
                {s.bus && <span className="badge badge-warning">{s.bus.plateNumber}</span>}
                {s.isSelfPickup ? (
                  <span style={{ color:'var(--info)', display:'flex', alignItems:'center', gap:4 }}>
                    <Check size={14}/>
                    <TranslatedText text={s.selfPickupSession === 'MORNING' ? 'Morning Pickup' : s.selfPickupSession === 'PM' ? 'PM Pickup' : s.selfPickupSession === 'AFTER_SCHOOL' ? 'After School' : 'Self Pickup'}/>
                  </span>
                ) : <span style={{ color:'var(--bus-yellow)', display:'flex', alignItems:'center', gap:4 }}><Bus size={14}/> {s.busId ? s.bus?.plateNumber : 'No Bus'}</span>}
                <span className={`badge ${s.status === 'CHECKED_OUT' ? 'badge-success' : 'badge-pending'}`}>
                  <TranslatedText text={s.isActive ? s.status.replace('_',' ') : 'INACTIVE'}/>
                </span>
                <motion.button whileTap={{ scale:0.92 }} onClick={() => openEditModal(s)}
                  title={translateUi("Edit student")}
                  style={{ background:'none', border:'1px solid var(--surface-border)', borderRadius:8, padding:'4px 7px', cursor:'pointer', color:'var(--text-muted)', display:'flex' }}>
                  <Pencil size={13} />
                </motion.button>
                <motion.button whileTap={{ scale:0.92 }} onClick={() => handleDelete(s)}
                  title={translateUi("Deactivate student")} disabled={deletingId === s.id || !s.isActive}
                  style={{ background:'none', border:'1px solid rgba(255,69,58,0.3)', borderRadius:8, padding:'4px 7px', cursor:'pointer', color:'var(--danger)', display:'flex' }}>
                  <Trash2 size={13} />
                </motion.button>
              </div>
            </motion.div>
          ))}
          {filtered.length === 0 && (
            <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-muted)' }}>
              <TranslatedText text={q ? `No students match "${searchQuery}".` : 'No students registered yet. Click "Add Student" to get started.'}/>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Student Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div className="modal-overlay" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setEditingStudent(null) } }}>
            <motion.div className="modal-box" initial={{ opacity:0, scale:0.9, y:30 }} animate={{ opacity:1, scale:1, y:0 }} exit={{ opacity:0, scale:0.9 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
                <h3 style={{ margin:0, display:'flex', alignItems:'center', gap:8 }}><UserPlus size={20}/> <TranslatedText text={editingStudent ? 'Edit Student' : 'Register Student'}/></h3>
                <button onClick={() => { setShowModal(false); setEditingStudent(null); setFormErrors({}) }} style={{ background:'none', border:'none', color:'var(--text-muted)', fontSize:'1.5rem', cursor:'pointer' }}><X size={20}/></button>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                {currentRole === 'SUPER_ADMIN' && (
                  <div className="input-group" style={{ gridColumn:'1/-1' }}>
                    <label className="input-label"><TranslatedText text={"School *"}/></label>
                    <select className="select-field" value={form.organizationId} onChange={e => setForm(p => ({...p, organizationId:e.target.value, routeId:'', busId:'', parentId:'', pickupStopId:'', dropoffStopId:''}))}>
                      <option value=""><TranslatedText text={"Select school"}/></option>
                      {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                    </select>
                    {formErrors.organizationId && <div style={{color:'var(--danger)',fontSize:'0.75rem',marginTop:3}}><TranslatedText text={formErrors.organizationId}/></div>}
                  </div>
                )}
                <div className="input-group" style={{ gridColumn:'1/-1' }}>
                  <label className="input-label"><TranslatedText text={"Full Name *"}/></label>
                  <input className="input-field" placeholder={translateUi("Student full name")} minLength={2} maxLength={100}
                    value={form.name} onChange={e => setForm(p => ({...p, name:e.target.value}))}
                    style={{ borderColor: formErrors.name ? 'var(--danger)' : undefined }} />
                  {formErrors.name && <div style={{ color:'var(--danger)', fontSize:'0.75rem', marginTop:3 }}>{formErrors.name}</div>}
                </div>
                <div className="input-group">
                  <label className="input-label"><TranslatedText text={"Student ID"}/></label>
                  <input className="input-field" placeholder={translateUi("e.g. STU-2026-001")} maxLength={50} value={form.studentCode} onChange={e => setForm(p => ({...p, studentCode:e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label className="input-label"><TranslatedText text={"Class & Section"}/></label>
                  <div style={{display:'grid',gridTemplateColumns:'1fr .6fr',gap:8}}><input className="input-field" placeholder={translateUi("Class")} maxLength={30} value={form.className} onChange={e=>setForm(p=>({...p,className:e.target.value}))}/><input className="input-field" placeholder={translateUi("Sec")} maxLength={10} value={form.section} onChange={e=>setForm(p=>({...p,section:e.target.value}))}/></div>
                </div>
                <div className="input-group">
                  <label className="input-label"><TranslatedText text={"Grade *"}/></label>
                  <input className="input-field" placeholder={translateUi("e.g. Grade 3")} maxLength={20}
                    value={form.grade} onChange={e => setForm(p => ({...p, grade:e.target.value}))}
                    style={{ borderColor: formErrors.grade ? 'var(--danger)' : undefined }} />
                  {formErrors.grade && <div style={{ color:'var(--danger)', fontSize:'0.75rem', marginTop:3 }}>{formErrors.grade}</div>}
                </div>
                <div className="input-group">
                  <label className="input-label"><TranslatedText text={"Level"}/></label>
                  <select className="select-field" value={form.level} onChange={e => setForm(p => ({...p, level:e.target.value}))}>
                    <option value=""><TranslatedText text={"Select level"}/></option>
                    {['Nursery','KG','Primary','Middle','High'].map(l => <option key={l} value={l}><TranslatedText text={l}/></option>)}
                  </select>
                </div>
                {/* type="tel" enforces numeric keyboard on mobile; sanitizePhone strips letters */}
                <div className="input-group">
                  <label className="input-label"><TranslatedText text={"Primary Contact *"}/></label>
                  <input type="tel" className="input-field" placeholder="+60 12-345 6789" maxLength={20}
                    value={form.parentContact1} onChange={e => setForm(p => ({...p, parentContact1: sanitizePhone(e.target.value)}))}
                    style={{ borderColor: formErrors.parentContact1 ? 'var(--danger)' : undefined }} />
                  {formErrors.parentContact1 && <div style={{ color:'var(--danger)', fontSize:'0.75rem', marginTop:3 }}><TranslatedText text={formErrors.parentContact1}/></div>}
                </div>
                <div className="input-group">
                  <label className="input-label"><TranslatedText text={"Secondary Contact"}/></label>
                  <input type="tel" className="input-field" placeholder="+60 12-345 6789" maxLength={20}
                    value={form.parentContact2} onChange={e => setForm(p => ({...p, parentContact2: sanitizePhone(e.target.value)}))}
                    style={{ borderColor: formErrors.parentContact2 ? 'var(--danger)' : undefined }} />
                  {formErrors.parentContact2 && <div style={{ color:'var(--danger)', fontSize:'0.75rem', marginTop:3 }}><TranslatedText text={formErrors.parentContact2}/></div>}
                </div>
                <div className="input-group" style={{ gridColumn:'1/-1' }}>
                  <label className="input-label"><TranslatedText text={"Parent / Guardian"}/></label>
                  <select className="select-field" value={form.parentId} onChange={e => setForm(p => ({...p, parentId:e.target.value}))}>
                    <option value=""><TranslatedText text={"No parent account linked"}/></option>
                    {availableParents.map(parent => <option key={parent.id} value={parent.id}>{parent.name} — {parent.email}</option>)}
                  </select>
                  <div style={{ color:'var(--text-muted)', fontSize:'0.75rem', marginTop:4 }}><TranslatedText text={" Linking the parent makes this student visible in that parent dashboard. "}/></div>
                </div>
                <div className="input-group" style={{ gridColumn:'1/-1' }}>
                  <label className="input-label"><TranslatedText text={"Assign Route"}/></label>
                  <select className="select-field" value={form.routeId} onChange={async e => {
                    const routeId = e.target.value
                    setForm(p => ({...p, routeId, busId:'', pickupStopId:'', dropoffStopId:''}))
                    if (!routeId) return setRouteStops([])
                    const response = await fetch(`/api/stops?routeId=${encodeURIComponent(routeId)}`)
                    const data = await response.json()
                    setRouteStops(data.stops || [])
                  }}>
                    <option value=""><TranslatedText text={"No route (self-pickup)"}/></option>
                    {availableRoutes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="input-group" style={{ gridColumn:'1/-1' }}>
                  <label className="input-label"><TranslatedText text={"Assign Bus"}/></label>
                  <select className="select-field" value={form.busId} onChange={e=>setForm(p=>({...p,busId:e.target.value}))}>
                    <option value=""><TranslatedText text={"No bus assigned"}/></option>
                    {availableBuses.map(bus=><option key={bus.id} value={bus.id}>{bus.busNumber ? `${bus.busNumber} · ` : ''}{bus.plateNumber}</option>)}
                  </select>
                </div>
                {form.routeId && (
                  <>
                    <div className="input-group">
                      <label className="input-label"><TranslatedText text={"Pickup Stop"}/></label>
                      <select className="select-field" value={form.pickupStopId} onChange={e => setForm(p => ({...p, pickupStopId:e.target.value}))}>
                        <option value=""><TranslatedText text={"Select pickup stop"}/></option>
                        {routeStops.map(stop => <option key={stop.id} value={stop.id}>{stop.name}</option>)}
                      </select>
                    </div>
                    <div className="input-group">
                      <label className="input-label"><TranslatedText text={"Drop-off Stop"}/></label>
                      <select className="select-field" value={form.dropoffStopId} onChange={e => setForm(p => ({...p, dropoffStopId:e.target.value}))}>
                        <option value=""><TranslatedText text={"Select drop-off stop"}/></option>
                        {routeStops.map(stop => <option key={stop.id} value={stop.id}>{stop.name}</option>)}
                      </select>
                    </div>
                  </>
                )}
                <div className="input-group">
                  <label className="input-label"><TranslatedText text={"Pickup Location / Address"}/></label>
                  <textarea className="input-field" rows={2} maxLength={300} value={form.pickupAddress} onChange={e=>setForm(p=>({...p,pickupAddress:e.target.value}))}/>
                </div>
                <div className="input-group">
                  <label className="input-label"><TranslatedText text={"Drop Location / Address"}/></label>
                  <textarea className="input-field" rows={2} maxLength={300} value={form.dropoffAddress} onChange={e=>setForm(p=>({...p,dropoffAddress:e.target.value}))}/>
                </div>
                <label style={{gridColumn:'1/-1',display:'flex',alignItems:'center',gap:9,fontSize:13}}><input type="checkbox" checked={form.isActive} onChange={e=>setForm(p=>({...p,isActive:e.target.checked}))}/><TranslatedText text={" Student active"}/></label>
                <div className="input-group" style={{ gridColumn:'1/-1' }}>
                  <label className="input-label"><TranslatedText text={"Pickup Method"}/></label>
                  <select className="select-field" value={form.selfPickupSession}
                    onChange={e => setForm(p => ({...p, selfPickupSession: e.target.value}))}>
                    {SELF_PICKUP_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}><TranslatedText text={o.label}/></option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display:'flex', gap:'1rem', marginTop:'1.5rem' }}>
                <button className="btn" style={{ flex:1, background:'rgba(255,255,255,0.06)' }} onClick={() => { setShowModal(false); setEditingStudent(null) }}><TranslatedText text={"Cancel"}/></button>
                <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.98 }}
                  className="btn btn-primary" style={{ flex:2 }}
                  onClick={handleSave} disabled={saving}>
                  <TranslatedText text={saving ? 'Saving…' : editingStudent ? '✓  Save Changes' : '✓  Save Student'}/>
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
