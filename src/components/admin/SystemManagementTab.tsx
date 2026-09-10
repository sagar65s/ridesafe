'use client'
import { useEffect, useState } from 'react'
import { BellRing, Save } from 'lucide-react'
import { useTranslation } from '@/i18n/provider'
import { api } from '@/components/transport/shared'
export default function SystemManagementTab({ schoolScoped = false }: {schoolScoped?:boolean}) {
  const {tx}=useTranslation(), [enabled,setEnabled]=useState(true), [notice,setNotice]=useState(''), [busy,setBusy]=useState(false)
  useEffect(()=>{api('/api/admin/settings').then(d=>setEnabled(d.notificationsPushEnabled!==false)).catch(e=>setNotice(e.message))},[])
  const save=async()=>{setBusy(true);try{await api('/api/admin/settings',{notificationsPushEnabled:enabled});setNotice('Settings saved')}catch(e){setNotice((e as Error).message)}finally{setBusy(false)}}
  return <section className="glass-panel" style={{padding:28,maxWidth:760}}><h2><BellRing size={22}/> {tx(schoolScoped?'School notifications':'System notifications')}</h2><p style={{lineHeight:1.7,color:'var(--text-muted)'}}>{tx('Notifications tell parents when their child boards, gets off, or the bus approaches their stop. They also deliver school broadcasts and emergency alerts.')}</p><p>{tx(schoolScoped?'These settings apply only to your school.':'These are the default settings. Each school can set its own preference.')}</p>{notice&&<p role="status">{tx(notice)}</p>}<label style={{display:'flex',gap:12,alignItems:'center',margin:'24px 0'}}><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>{tx('Background push notifications')}</label><p style={{color:'var(--text-muted)'}}>{tx('In-app attendance and emergency records remain available.')}</p><button className="btn btn-primary" disabled={busy} onClick={save}><Save size={17}/>{tx('Save Settings')}</button></section>
}
