'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Camera, Save, UserRound } from 'lucide-react'
import { TranslatedText } from '@/i18n/provider'
import type { Person } from '@/components/transport/shared'
import { prepareProfilePhoto } from '@/lib/client-profile-photo'

type ParentProfileForm = {
  name: string
  email: string
  phone: string
  address: string
  emergencyContactName: string
  emergencyContactPhone: string
  relationship: string
  photoUrl: string
}

const emptyForm: ParentProfileForm = { name: '', email: '', phone: '', address: '', emergencyContactName: '', emergencyContactPhone: '', relationship: '', photoUrl: '' }

export default function ParentProfile({ account, onSaved }: { account: Person; onSaved: (person: Person) => void }) {
  const [form, setForm] = useState<ParentProfileForm>(emptyForm)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [isError, setIsError] = useState(false)

  useEffect(() => {
    setForm({
      name: account.name || '', email: account.email || '', phone: account.phone || '', address: account.address || '',
      emergencyContactName: account.emergencyContactName || '', emergencyContactPhone: account.emergencyContactPhone || '',
      relationship: account.relationship || '', photoUrl: account.photoUrl || '',
    })
  }, [account])

  const set = (key: keyof ParentProfileForm, value: string) => setForm(current => ({ ...current, [key]: value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(''); setIsError(false)
    try {
      const response = await fetch('/api/account/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to save parent profile')
      onSaved({ ...account, ...result.user })
      setMessage('Parent profile updated successfully')
    } catch (error) {
      setIsError(true); setMessage(error instanceof Error ? error.message : 'Unable to save parent profile')
    } finally { setBusy(false) }
  }

  const field = (key: keyof ParentProfileForm, label: string, type = 'text') => <label className="input-group"><span className="input-label"><TranslatedText text={label}/></span><input className="input-field" type={type} required value={form[key]} disabled={key === 'email'} maxLength={100} onChange={event => set(key, event.target.value)}/></label>

  return <form onSubmit={submit} className="journey-card" style={{ maxWidth: 900, padding: 'clamp(20px,4vw,36px)' }}>
    <div className="section-title"><h2><UserRound size={22}/><TranslatedText text="Parent profile"/></h2></div>
    <p className="subtle"><TranslatedText text="Keep your contact and emergency details current for safe school transport."/></p>
    {message && <div className="notice-bar" role="status" style={isError ? { borderColor: 'var(--danger)', color: 'var(--danger)' } : undefined}><TranslatedText text={message}/></div>}
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: 16, margin: '18px 0', border: '1px solid var(--surface-border)', borderRadius: 14, flexWrap: 'wrap' }}>
      <div role="img" aria-label="Parent profile preview" style={{ width: 96, height: 96, borderRadius: '50%', display: 'grid', placeItems: 'center', backgroundColor: 'var(--surface-2)', backgroundImage: form.photoUrl ? `url(${form.photoUrl})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', border: '2px solid #FFD60A', fontSize: 30, fontWeight: 800, color: '#FFD60A' }}>{form.photoUrl ? '' : (form.name.trim()[0] || 'P').toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 220 }}><strong><TranslatedText text="Profile photo"/></strong><p className="subtle"><TranslatedText text="JPEG, PNG or WebP. The image is resized before upload."/></p><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><label className="btn" style={{ cursor: 'pointer' }}><Camera size={16}/><TranslatedText text="Choose photo"/><input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; setMessage(''); try { set('photoUrl', await prepareProfilePhoto(file)) } catch (error) { setIsError(true); setMessage(error instanceof Error ? error.message : 'Unable to prepare photo') } }}/></label>{form.photoUrl && <button className="btn" type="button" onClick={() => set('photoUrl', '')}><TranslatedText text="Remove photo"/></button>}</div></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 }}>
      {field('name', 'Parent full name')}{field('email', 'Login email', 'email')}{field('phone', 'Parent phone number', 'tel')}
      <label className="input-group" style={{ gridColumn: '1/-1' }}><span className="input-label"><TranslatedText text="Home address"/></span><textarea className="input-field" required minLength={5} maxLength={500} rows={3} value={form.address} onChange={event => set('address', event.target.value)}/></label>
      {field('emergencyContactName', 'Emergency contact name')}{field('emergencyContactPhone', 'Emergency contact phone', 'tel')}{field('relationship', 'Relationship')}
    </div>
    <button className="transport-primary" disabled={busy} style={{ marginTop: 20 }}><Save size={16}/><TranslatedText text={busy ? 'Saving…' : 'Save profile'}/></button>
  </form>
}
