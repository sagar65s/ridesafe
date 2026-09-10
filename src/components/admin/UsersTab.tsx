'use client'
import { useTranslation as useLocaleText } from '@/i18n/provider'
import { TranslatedText } from '@/i18n/provider'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertTriangle, UserPlus, Bus, AlertCircle, Pencil, Trash2 } from 'lucide-react'

interface User { id: string; name: string; email: string; role: string; phone?: string; buses?: { plateNumber: string }[]; organizationId?: string; isActive:boolean; personnelType?:string; licenseNumber?:string; licenseExpiry?:string; onboardingDate?:string; offboardingDate?:string; offboardingReason?:string; employmentStatus?:string; assignmentHistory?:{id:string;action:string;reason?:string;effectiveAt:string;bus?:{plateNumber:string};route?:{name:string}}[] }
interface Org { id: string; name: string }

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'badge-danger', SUPER_ADMIN: 'badge-danger', SCHOOL_ADMIN: 'badge-warning',
  DRIVER: 'badge-info', PARENT: 'badge-success'
}

const defaultForm = { name: '', email: '', password: '', phone: '', role: 'DRIVER', invoiceAmount: '150', organizationId: '', isActive:true, personnelType:'DRIVER', licenseNumber:'', licenseExpiry:'', onboardingDate:'', offboardingDate:'', offboardingReason:'', employmentStatus:'ACTIVE' }

// Only allow digits, +, spaces, hyphens, parentheses in phone fields
function sanitizePhone(v: string) {
  return v.replace(/[^0-9+\s()\-]/g, '')
}

function validateForm(form: typeof defaultForm, isEdit = false): Record<string, string> {
  const errs: Record<string, string> = {}
  if (!form.name.trim() || form.name.trim().length < 2) errs.name = 'Name must be at least 2 characters'
  if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Enter a valid email address'
  if (isEdit) {
    if (form.password && form.password.length < 12) errs.password = 'Password must be at least 12 characters'
  } else if (!form.password || form.password.length < 12) {
    errs.password = 'Password must be at least 12 characters'
  }
  if (form.phone && !/^[+0-9\s()\-]{7,20}$/.test(form.phone)) errs.phone = 'Enter a valid phone number'
  return errs
}

// Hoisted to module scope — defining this inside UsersTab's render body would give it a new
// function identity every render, making React treat it as a different component type and
// remount (and lose focus on) every wrapped input on each keystroke.
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="input-group" style={{ marginBottom: 0 }}>
      <label className="input-label"><TranslatedText text={label}/></label>
      {children}
      {error && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}><AlertCircle size={12} /><TranslatedText text={error}/></div>}
    </div>
  )
}

export default function UsersTab({ superAdminView = false, searchQuery = '' }: { superAdminView?: boolean; searchQuery?: string }) {
 const {tx:translateUi}=useLocaleText()

  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [filterRole, setFilterRole] = useState('ALL')
  const [filterOrg, setFilterOrg] = useState('ALL')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')
  const [invoicingId, setInvoicingId] = useState<string | null>(null)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [invoiceUser, setInvoiceUser] = useState<User | null>(null)
  const [invoiceAmount, setInvoiceAmount] = useState('150')
  const [invoiceAmountErr, setInvoiceAmountErr] = useState('')
  const [orgs, setOrgs] = useState<Org[]>([])
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadUsers = () => {
    Promise.all([
      fetch('/api/admin/users').then(r => r.json()),
      fetch('/api/admin/organizations').then(r => r.json()).catch(() => ({ organizations: [] })),
    ]).then(([data, orgData]) => {
      setUsers(data.users || [])
      setOrgs(orgData.organizations || [])
      setLoading(false)
    }).catch(console.error)
  }

  useEffect(() => { loadUsers() }, [])

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast(msg); setToastType(type); setTimeout(() => setToast(''), 3500)
  }

  const openAddModal = () => { setEditingUser(null); setForm(defaultForm); setFormErrors({}); setShowModal(true) }

  const openEditModal = (u: User) => {
    setEditingUser(u)
    setForm({ name: u.name, email: u.email, password: '', phone: u.phone || '', role: u.role, invoiceAmount: '150', organizationId: u.organizationId || '', isActive:u.isActive !== false, personnelType:u.personnelType || 'DRIVER', licenseNumber:u.licenseNumber || '', licenseExpiry:u.licenseExpiry ? u.licenseExpiry.slice(0,10) : '', onboardingDate:u.onboardingDate ? u.onboardingDate.slice(0,10) : '', offboardingDate:u.offboardingDate ? u.offboardingDate.slice(0,10) : '', offboardingReason:u.offboardingReason || '', employmentStatus:u.employmentStatus || 'ACTIVE' })
    setFormErrors({})
    setShowModal(true)
  }

  const handleSave = async () => {
    const errs = validateForm(form, !!editingUser)
    setFormErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSaving(true)
    try {
      const res = editingUser
        ? await fetch(`/api/admin/users/${editingUser.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: form.name, email: form.email, phone: form.phone || null,
              role: form.role, organizationId: form.organizationId || null,
              isActive:form.isActive, personnelType:form.personnelType, licenseNumber:form.licenseNumber || null,
              licenseExpiry:form.licenseExpiry || null, onboardingDate:form.onboardingDate || null,
              offboardingDate:form.offboardingDate || null, offboardingReason:form.offboardingReason || null,
              employmentStatus:form.employmentStatus,
              ...(form.password ? { password: form.password } : {}),
            }),
          })
        : await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(form),
          })
      if (res.ok) {
        showToast(editingUser ? 'User updated!' : 'User created successfully!')
        setShowModal(false); setForm(defaultForm); setFormErrors({}); setEditingUser(null); loadUsers()
      } else {
        const err = await res.json()
        showToast(err.error || (editingUser ? 'Failed to update user' : 'Failed to create user'), 'error')
      }
    } catch { showToast('Network error', 'error') } finally { setSaving(false) }
  }

  const handleDelete = async (u: User) => {
    if (!confirm(`Deactivate "${u.name}"? Historical transport records will be preserved.`)) return
    setDeletingId(u.id)
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('User deactivated; history preserved')
        loadUsers()
      } else {
        const err = await res.json()
        showToast(err.error || 'Failed to delete user', 'error')
      }
    } catch { showToast('Network error', 'error') } finally { setDeletingId(null) }
  }

  const openInvoiceModal = (user: User) => {
    setInvoiceUser(user)
    setInvoiceAmount('150')
    setInvoiceAmountErr('')
    setShowInvoiceModal(true)
  }

  const handleGenerateInvoice = async () => {
    const amount = parseFloat(invoiceAmount)
    if (!invoiceAmount || isNaN(amount) || amount <= 0 || amount > 99999) {
      setInvoiceAmountErr('Enter a valid amount between RM 1 and RM 99,999')
      return
    }
    if (!invoiceUser) return
    setInvoicingId(invoiceUser.id)
    showToast('⏳ Generating invoice…')
    try {
      const res = await fetch('/api/billing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: invoiceUser.id, amount }),
      })
      if (res.ok) {
        const data = await res.json()
        const invoiceId = data.payment?.bukkuInvoiceId || data.payment?.id
        showToast(data.providerStatus === 'QUEUED'
          ? `✅ Invoice ${invoiceId} sent in-app; provider sync queued`
          : data.emailStatus === 'SENT'
            ? `✅ Invoice ${invoiceId} sent in-app and by email`
            : `✅ Invoice ${invoiceId} sent to the parent inbox`)
        setShowInvoiceModal(false)
      } else {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to generate invoice')
      }
    } catch (error) { showToast(`❌ ${error instanceof Error ? error.message : 'Failed to generate invoice'}`, 'error') }
    finally { setInvoicingId(null) }
  }

  const q = searchQuery.trim().toLowerCase()
  const filtered = users.filter(u =>
    (filterRole === 'ALL' || u.role === filterRole) &&
    (filterOrg === 'ALL' || u.organizationId === filterOrg) &&
    (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.phone?.toLowerCase().includes(q))
  )

  if (loading) return (
    <div className="glass-panel" style={{ padding: '2rem' }}>
      {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 60, marginBottom: 12, borderRadius: 10 }} />)}
    </div>
  )

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: toastType === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)', border: `1px solid ${toastType === 'success' ? 'var(--success)' : 'var(--danger)'}`, borderRadius: 12, color: 'var(--text-main)', fontWeight: 500 }}>
            {toastType === 'error' ? <AlertTriangle size={18} color="var(--danger)" /> : <CheckCircle size={18} color="var(--success)" />}
            <TranslatedText text={toast}/>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="glass-panel" style={{ padding: '2rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0 }}><TranslatedText text={superAdminView ? 'All System Users (Global)' : 'System Users'}/></h3>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4 }}>{users.length}<TranslatedText text={" users registered"}/></div>
          </div>
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
            className="btn btn-primary" onClick={openAddModal}>
            <UserPlus size={16} /><TranslatedText text={" Add User "}/></motion.button>
        </div>

        {/* Role / organisation filters */}
        <div style={{ marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <select className="select-field" value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ width: 'auto', minWidth: 160 }}>
            <option value="ALL"><TranslatedText text={"All Roles"}/></option>
            {['ADMIN', 'DRIVER', 'PARENT', 'SCHOOL_ADMIN'].map(r => <option key={r} value={r}><TranslatedText text={r}/></option>)}
          </select>
          {superAdminView && orgs.length > 0 && (
            <select className="select-field" value={filterOrg} onChange={e => setFilterOrg(e.target.value)} style={{ width: 'auto', minWidth: 180 }}>
              <option value="ALL"><TranslatedText text={"All Organisations"}/></option>
              <option value=""><TranslatedText text={"No organisation (global)"}/></option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
        </div>

        {/* Role stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(100px,1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[['Admins', 'ADMIN', 'var(--danger)'], ['Drivers', 'DRIVER', 'var(--info)'], ['Parents', 'PARENT', 'var(--success)']].map(([label, role, color]) => (
            <div key={label} className="glass-panel" style={{ padding: '0.75rem 1rem', textAlign: 'center', borderLeft: `3px solid ${color}` }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: color as string }}>{users.filter(u => u.role.includes(role as string)).length}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2, textTransform: 'uppercase' }}><TranslatedText text={label}/></div>
            </div>
          ))}
        </div>

        {/* Users list */}
        <div style={{ display: 'grid', gap: '0.65rem' }}>
          {filtered.map(u => (
            <motion.div key={u.id} whileHover={{ backgroundColor: 'var(--surface-2)' }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 1.25rem', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--surface-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: u.role === 'DRIVER' ? 'var(--info-bg)' : u.role.includes('ADMIN') ? 'var(--danger-bg)' : 'var(--success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: u.role === 'DRIVER' ? 'var(--info)' : u.role.includes('ADMIN') ? 'var(--danger)' : 'var(--success)', flexShrink: 0 }}>
                  {u.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>{u.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {u.email}{u.phone && ` · 📞 ${u.phone}`}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {u.role === 'PARENT' && (
                  <motion.button whileTap={{ scale: 0.95 }}
                    onClick={() => openInvoiceModal(u)}
                    className="btn"
                    style={{ padding: '0.35rem 0.8rem', fontSize: '0.75rem', background: 'var(--primary)', color: 'white', border: 'none' }}
                    disabled={invoicingId === u.id}
                  ><TranslatedText text={" 💰 Invoice "}/></motion.button>
                )}
                {u.buses && u.buses.length > 0 && (
                  <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Bus size={11} /> {u.buses.map(b => b.plateNumber).join(', ')}
                  </span>
                )}
                {u.role === 'DRIVER' && <span className="badge badge-info"><TranslatedText text={u.personnelType || 'DRIVER'}/> · <TranslatedText text={u.employmentStatus || 'ACTIVE'}/></span>}
                {u.role === 'DRIVER' && u.assignmentHistory?.[0] && <span className="badge badge-pending" title={u.assignmentHistory[0].reason || ''}><TranslatedText text={"Last: "}/><TranslatedText text={u.assignmentHistory[0].action}/> · {new Date(u.assignmentHistory[0].effectiveAt).toLocaleDateString()}</span>}
                <span className={`badge ${u.isActive ? (ROLE_COLORS[u.role] || 'badge-pending') : 'badge-pending'}`}><TranslatedText text={u.role.replaceAll('_', ' ')}/> · <TranslatedText text={u.isActive ? 'ACTIVE' : 'INACTIVE'}/></span>
                <motion.button whileTap={{ scale: 0.92 }} onClick={() => openEditModal(u)}
                  title={translateUi("Edit user")}
                  style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 8, padding: '4px 7px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                  <Pencil size={13} />
                </motion.button>
                <motion.button whileTap={{ scale: 0.92 }} onClick={() => handleDelete(u)}
                  title={translateUi("Deactivate user")} disabled={deletingId === u.id || !u.isActive}
                  style={{ background: 'none', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 8, padding: '4px 7px', cursor: 'pointer', color: 'var(--danger)', display: 'flex' }}>
                  <Trash2 size={13} />
                </motion.button>
              </div>
            </motion.div>
          ))}
          {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}><TranslatedText text={q ? `No users match "${searchQuery}".` : 'No users found.'}/></div>}
        </div>
      </div>

      {/* Add / Edit User Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setFormErrors({}); setEditingUser(null) } }}>
            <motion.div className="modal-box" initial={{ opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}><UserPlus size={20} /> <TranslatedText text={editingUser ? 'Edit User' : 'Add New User'}/></h3>
                <button onClick={() => { setShowModal(false); setFormErrors({}); setEditingUser(null) }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1 }}>✕</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Field label="Full Name *" error={formErrors.name}>
                  <input className="input-field" placeholder={translateUi("e.g. Ahmad Bin Ali")} value={form.name}
                    minLength={2} maxLength={100}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    style={{ borderColor: formErrors.name ? 'var(--danger)' : undefined }}
                  />
                </Field>

                <Field label="Role *">
                  <select className="select-field" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                    <option value="DRIVER"><TranslatedText text={"Driver / Maintainer"}/></option>
                    <option value="PARENT"><TranslatedText text={"Parent"}/></option>
                    <option value="ADMIN"><TranslatedText text={"Admin"}/></option>
                    {superAdminView && <option value="SCHOOL_ADMIN"><TranslatedText text={"School Admin"}/></option>}
                    {superAdminView && <option value="SUPER_ADMIN"><TranslatedText text={"Super Admin"}/></option>}
                  </select>
                </Field>
                <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13}}><input type="checkbox" checked={form.isActive} onChange={e=>setForm(p=>({...p,isActive:e.target.checked}))}/><TranslatedText text={" Account active"}/></label>

                {form.role === 'DRIVER' && <>
                  <Field label="Personnel Type"><select className="select-field" value={form.personnelType} onChange={e=>setForm(p=>({...p,personnelType:e.target.value}))}><option value="DRIVER"><TranslatedText text={"Driver"}/></option><option value="MAINTAINER"><TranslatedText text={"Maintainer"}/></option></select></Field>
                  <Field label="Employment Status"><select className="select-field" value={form.employmentStatus} onChange={e=>setForm(p=>({...p,employmentStatus:e.target.value}))}>{['ONBOARDING','ACTIVE','INACTIVE','OFFBOARDING','OFFBOARDED'].map(s=><option key={s} value={s}><TranslatedText text={s}/></option>)}</select></Field>
                  <Field label="License Number"><input className="input-field" value={form.licenseNumber} onChange={e=>setForm(p=>({...p,licenseNumber:e.target.value}))}/></Field>
                  <Field label="License Expiry"><input type="date" className="input-field" value={form.licenseExpiry} onChange={e=>setForm(p=>({...p,licenseExpiry:e.target.value}))}/></Field>
                  <Field label="Onboarding Date"><input type="date" className="input-field" value={form.onboardingDate} onChange={e=>setForm(p=>({...p,onboardingDate:e.target.value}))}/></Field>
                  <Field label="Offboarding Date"><input type="date" className="input-field" value={form.offboardingDate} onChange={e=>setForm(p=>({...p,offboardingDate:e.target.value}))}/></Field>
                  <div style={{gridColumn:'1/-1'}}><Field label="Offboarding Reason"><textarea className="input-field" rows={2} maxLength={500} value={form.offboardingReason} onChange={e=>setForm(p=>({...p,offboardingReason:e.target.value}))}/></Field></div>
                </>}

                {superAdminView && <Field label="Organisation">
                  <select className="select-field" value={form.organizationId} onChange={e => setForm(p => ({ ...p, organizationId: e.target.value }))}>
                    <option value=""><TranslatedText text={form.role === 'SUPER_ADMIN' ? 'Global platform access' : 'Select a school'}/></option>
                    {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </Field>}

                <Field label="Email Address *" error={formErrors.email}>
                  <input type="email" className="input-field" placeholder={translateUi("user@school.com")} value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    style={{ borderColor: formErrors.email ? 'var(--danger)' : undefined }}
                  />
                </Field>

                {/* Phone: type="tel" + sanitize non-phone chars */}
                <Field label="Phone Number" error={formErrors.phone}>
                  <input
                    type="tel"
                    className="input-field"
                    placeholder="+60 12-345 6789"
                    value={form.phone}
                    maxLength={20}
                    onChange={e => setForm(p => ({ ...p, phone: sanitizePhone(e.target.value) }))}
                    style={{ borderColor: formErrors.phone ? 'var(--danger)' : undefined }}
                  />
                </Field>

                <Field label={editingUser ? 'New Password' : 'Password *'} error={formErrors.password}>
                  <input type="password" className="input-field" placeholder={editingUser ? 'Leave blank to keep current' : translateUi('Min. 12 characters')} value={form.password}
                    minLength={editingUser ? undefined : 12} maxLength={128}
                    onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                    style={{ borderColor: formErrors.password ? 'var(--danger)' : undefined }}
                  />
                </Field>
              </div>

              <div style={{ background: 'var(--info-bg)', border: '1px solid rgba(29,78,216,0.15)', borderRadius: 8, padding: '0.75rem 1rem', marginTop: '0.75rem', fontSize: '0.82rem', color: 'var(--info)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <AlertCircle size={15} /><TranslatedText text={" For drivers, assign them to a bus in Fleet & Routes after creation. "}/></div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button className="btn" style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--surface-border)', color: 'var(--text-main)' }} onClick={() => { setShowModal(false); setFormErrors({}); setEditingUser(null) }}><TranslatedText text={"Cancel"}/></button>
                <motion.button whileTap={{ scale: 0.97 }} className="btn btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={saving}>
                  <TranslatedText text={saving ? (editingUser ? 'Saving…' : 'Creating…') : (editingUser ? '✓  Save Changes' : '✓  Create User')}/>
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invoice Modal */}
      <AnimatePresence>
        {showInvoiceModal && invoiceUser && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={e => { if (e.target === e.currentTarget) setShowInvoiceModal(false) }}>
            <motion.div className="modal-box" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.92 }} style={{ maxWidth: 400 }}>
              <h3 style={{ marginBottom: '0.5rem' }}><TranslatedText text={"💰 Generate Invoice"}/></h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}><TranslatedText text={" Create a Bukku invoice for "}/><strong>{invoiceUser.name}</strong>
              </p>
              <div className="input-group">
                <label className="input-label"><TranslatedText text={"Amount (RM) *"}/></label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="150"
                  value={invoiceAmount}
                  min={1} max={99999} step="0.01"
                  onChange={e => { setInvoiceAmount(e.target.value); setInvoiceAmountErr('') }}
                  style={{ borderColor: invoiceAmountErr ? 'var(--danger)' : undefined }}
                />
                {invoiceAmountErr && <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 3 }}><TranslatedText text={invoiceAmountErr}/></div>}
              </div>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button className="btn" style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--surface-border)' }} onClick={() => setShowInvoiceModal(false)}><TranslatedText text={"Cancel"}/></button>
                <motion.button whileTap={{ scale: 0.97 }} className="btn btn-primary" style={{ flex: 2 }} onClick={handleGenerateInvoice}><TranslatedText text={"Send Invoice"}/></motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
