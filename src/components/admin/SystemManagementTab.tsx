'use client'
import { useEffect, useState } from 'react'
import { BellRing, Save, Settings2 } from 'lucide-react'

export default function SystemManagementTab(){
  const [form,setForm]=useState({notificationsEmailEnabled:true,notificationsPushEnabled:true,sosEscalationMinutes:'2'})
  const [notice,setNotice]=useState('')
  useEffect(()=>{fetch('/api/admin/settings').then(r=>r.json()).then(d=>setForm({notificationsEmailEnabled:d.notificationsEmailEnabled!==false,notificationsPushEnabled:d.notificationsPushEnabled!==false,sosEscalationMinutes:String(d.sosEscalationMinutes||'2')}))},[])
  const save=async()=>{const r=await fetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});const d=await r.json().catch(()=>({}));setNotice(r.ok?'System notification settings saved':d.error||'Save failed');setTimeout(()=>setNotice(''),3000)}
  return <div className="glass-panel" style={{padding:'1.5rem',maxWidth:760}}>
    <h2 style={{marginTop:0,display:'flex',alignItems:'center',gap:8}}><Settings2/> System Management</h2>
    <p style={{color:'var(--text-muted)',fontSize:13}}>Global notification and emergency escalation configuration. School transport schedules are managed separately.</p>
    {notice&&<div style={{padding:10,borderRadius:8,background:'var(--surface-2)',margin:'12px 0'}}>{notice}</div>}
    <div style={{display:'grid',gap:14,marginTop:20}}>
      <label className="glass-card" style={{padding:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span><strong><BellRing size={16} style={{verticalAlign:'middle',marginRight:7}}/>Push notifications</strong><div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>Browser/PWA transport alerts</div></span><input type="checkbox" checked={form.notificationsPushEnabled} onChange={e=>setForm({...form,notificationsPushEnabled:e.target.checked})}/></label>
      <label className="glass-card" style={{padding:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}><span><strong>Email notifications</strong><div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>Requires configured Resend credentials</div></span><input type="checkbox" checked={form.notificationsEmailEnabled} onChange={e=>setForm({...form,notificationsEmailEnabled:e.target.checked})}/></label>
      <div className="input-group"><label className="input-label">Unresolved SOS escalation (minutes)</label><input className="input-field" type="number" min="1" max="60" value={form.sosEscalationMinutes} onChange={e=>setForm({...form,sosEscalationMinutes:e.target.value})}/></div>
      <button className="btn btn-primary" onClick={save} style={{justifySelf:'start'}}><Save size={16}/> Save Settings</button>
    </div>
  </div>
}
