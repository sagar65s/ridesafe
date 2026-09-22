'use client'

import { useEffect, useState } from 'react'
import { Bell, Save, ShieldCheck } from 'lucide-react'
import { TranslatedText } from '@/i18n/provider'

type PlatformForm={notificationsEmailEnabled:boolean;notificationsPushEnabled:boolean}
const defaults:PlatformForm={notificationsEmailEnabled:true,notificationsPushEnabled:true}

export default function AccountSettingsTab({currentRole}:{currentRole:string}) {
  const [form,setForm]=useState({name:'',email:'',phone:'',password:''})
  const [platform,setPlatform]=useState<PlatformForm>(defaults)
  const [status,setStatus]=useState('')
  const [busy,setBusy]=useState(false)
  useEffect(()=>{
    Promise.all([
      fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.json()),
      fetch('/api/admin/settings',{cache:'no-store'}).then(r=>r.ok?r.json():defaults),
    ]).then(([account,settings])=>{
      setForm(v=>({...v,name:account.user?.name||'',email:account.user?.email||'',phone:account.user?.phone||''}))
      setPlatform({notificationsEmailEnabled:settings.notificationsEmailEnabled!==false,notificationsPushEnabled:settings.notificationsPushEnabled!==false})
    }).catch(()=>setStatus('Unable to load settings'))
  },[])
  const save=async()=>{
    setBusy(true);setStatus('')
    try{
      const account=await fetch('/api/account/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:form.name,phone:form.phone,password:form.password||undefined})})
      const accountData=await account.json().catch(()=>({}))
      if(!account.ok)throw new Error(accountData.error||'Unable to save account settings')
      if(currentRole==='SUPER_ADMIN'){
        const response=await fetch('/api/admin/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(platform)})
        const data=await response.json().catch(()=>({}))
        if(!response.ok)throw new Error(data.error||'Unable to save platform controls')
      }
      setForm(v=>({...v,password:''}));setStatus('Account and platform controls updated successfully')
    }catch(error){setStatus(error instanceof Error?error.message:'Unable to save settings')}
    finally{setBusy(false)}
  }
  return <div style={{display:'grid',gap:18,maxWidth:980}}>
    <section className="glass-panel" style={{padding:'2rem'}}>
      <h3 style={{display:'flex',gap:10,alignItems:'center',marginTop:0}}><ShieldCheck size={22}/><TranslatedText text="Super Admin account"/></h3>
      <p style={{color:'var(--text-muted)'}}><TranslatedText text="Update your name, phone number and sign-in password."/></p>
      {status&&<div className="notice-bar" style={{marginBottom:16}}><TranslatedText text={status}/></div>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:16}}>
        <Field label="Full name"><input className="input-field" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></Field>
        <Field label="Email"><input className="input-field" value={form.email} disabled/></Field>
        <Field label="Phone number"><input className="input-field" value={form.phone} onChange={e=>setForm(v=>({...v,phone:e.target.value}))}/></Field>
        <Field label="New password (optional)"><input type="password" minLength={8} maxLength={72} className="input-field" value={form.password} onChange={e=>setForm(v=>({...v,password:e.target.value}))}/></Field>
      </div>
    </section>
    {currentRole==='SUPER_ADMIN'&&<>
      <section className="glass-panel" style={{padding:'2rem'}}>
        <h3 style={{display:'flex',gap:10,alignItems:'center',marginTop:0}}><Bell size={22}/><TranslatedText text="Global notification controls"/></h3>
        <div style={{display:'grid',gap:12}}>
          <Toggle label="Allow email notifications by default" checked={platform.notificationsEmailEnabled} onChange={value=>setPlatform(v=>({...v,notificationsEmailEnabled:value}))}/>
          <Toggle label="Allow browser push notifications by default" checked={platform.notificationsPushEnabled} onChange={value=>setPlatform(v=>({...v,notificationsPushEnabled:value}))}/>
        </div>
      </section>
    </>}
    <button className="btn btn-primary" disabled={busy} onClick={()=>void save()} style={{justifySelf:'start'}}><Save size={16}/><TranslatedText text={busy?'Saving…':'Save all settings'}/></button>
  </div>
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="input-group"><span className="input-label"><TranslatedText text={label}/></span>{children}</label>}
function Toggle({label,checked,onChange}:{label:string;checked:boolean;onChange:(value:boolean)=>void}){return <label style={{display:'flex',alignItems:'center',gap:10,padding:12,border:'1px solid var(--surface-border)',borderRadius:10,cursor:'pointer'}}><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/><TranslatedText text={label}/></label>}
