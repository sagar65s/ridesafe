'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import RideSafeLogo from '@/components/RideSafeLogo'
import { LanguageSwitcher, TranslatedText } from '@/i18n/provider'
import { prepareProfilePhoto } from '@/lib/client-profile-photo'

export default function ParentOnboardingPage(){
  const router=useRouter()
  const [form,setForm]=useState({name:'',email:'',phone:'',address:'',emergencyContactName:'',emergencyContactPhone:'',relationship:'',photoUrl:''})
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(true)
  useEffect(()=>{fetch('/api/auth/me',{cache:'no-store'}).then(async r=>{if(!r.ok)throw new Error();const d=await r.json();if(d.user.role!=='PARENT'){router.replace('/');return}if(d.user.profileCompleted){router.replace('/parent');return}setForm(v=>({...v,name:d.user.name||'',email:d.user.email||'',phone:d.user.phone||'',address:d.user.address||'',emergencyContactName:d.user.emergencyContactName||'',emergencyContactPhone:d.user.emergencyContactPhone||'',relationship:d.user.relationship||'',photoUrl:d.user.photoUrl||''}));setBusy(false)}).catch(()=>router.replace('/'))},[router])
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError('');const r=await fetch('/api/account/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)}).catch(()=>null);const d=await r?.json().catch(()=>({}));if(!r?.ok){setError(d?.error||'Unable to save your details');setBusy(false);return}router.replace('/parent')}
  if(busy&&!form.email)return <div style={{minHeight:'70vh',display:'grid',placeItems:'center',color:'#fff'}}><TranslatedText text="Loading your account…"/></div>
  const field=(key:keyof typeof form,label:string,type='text')=><label className="input-group"><span className="input-label"><TranslatedText text={label}/></span><input className="input-field" type={type} required value={form[key]} disabled={key==='email'} maxLength={key==='address'?500:100} onChange={e=>setForm(v=>({...v,[key]:e.target.value}))}/></label>
  return <main style={{minHeight:'calc(100vh - 70px)',display:'grid',placeItems:'center',padding:24,background:'#08080A'}}>
    <form onSubmit={submit} className="glass-panel" style={{width:'min(780px,100%)',padding:'clamp(22px,4vw,40px)'}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',marginBottom:24}}><RideSafeLogo height={38}/><LanguageSwitcher/></div>
      <h1 style={{margin:'0 0 8px',fontSize:28,color:'#fff'}}><TranslatedText text="Complete your parent profile"/></h1>
      <p style={{color:'var(--text-muted)',margin:'0 0 24px'}}><TranslatedText text="For student safety, complete these details before entering the Parent dashboard."/></p>
      {error&&<div style={{padding:12,borderRadius:10,background:'var(--danger-bg)',color:'var(--danger)',marginBottom:16}}><TranslatedText text={error}/></div>}
      <div style={{display:'flex',alignItems:'center',gap:18,padding:16,marginBottom:20,border:'1px solid var(--surface-border)',borderRadius:14,background:'rgba(255,255,255,.025)'}}>
        <div role="img" aria-label="Parent profile preview" style={{width:88,height:88,borderRadius:'50%',overflow:'hidden',display:'grid',placeItems:'center',backgroundColor:'var(--surface-2)',backgroundImage:form.photoUrl?`url(${form.photoUrl})`:undefined,backgroundSize:'cover',backgroundPosition:'center',border:'2px solid #FFD60A',fontSize:28,fontWeight:800,color:'#FFD60A'}}>{form.photoUrl?'':(form.name.trim()[0]||'P').toUpperCase()}</div>
        <div style={{flex:1}}><strong style={{display:'block',color:'#fff',marginBottom:6}}><TranslatedText text="Parent profile photo"/></strong><p style={{margin:'0 0 10px',color:'var(--text-muted)',fontSize:13}}><TranslatedText text="Optional. This photo appears only on your RideSafe parent account."/></p><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><label className="btn" style={{cursor:'pointer'}}><TranslatedText text="Choose photo"/><input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setError('');try{const photoUrl=await prepareProfilePhoto(file);setForm(v=>({...v,photoUrl}))}catch(cause){setError(cause instanceof Error?cause.message:'Unable to prepare photo')}}}/></label>{form.photoUrl&&<button type="button" className="btn" onClick={()=>setForm(v=>({...v,photoUrl:''}))}><TranslatedText text="Remove photo"/></button>}</div></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(250px,1fr))',gap:16}}>
        {field('name','Parent full name')}{field('email','Login email','email')}{field('phone','Parent phone number','tel')}
        <label className="input-group" style={{gridColumn:'1/-1'}}><span className="input-label"><TranslatedText text="Home address"/></span><textarea className="input-field" required rows={3} minLength={5} maxLength={500} value={form.address} onChange={e=>setForm(v=>({...v,address:e.target.value}))}/></label>
        {field('emergencyContactName','Emergency contact name')}{field('emergencyContactPhone','Emergency contact phone','tel')}{field('relationship','Relationship')}
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy} style={{marginTop:24,width:'100%',justifyContent:'center'}}><TranslatedText text={busy?'Saving…':'Save details and continue'}/></button>
    </form>
  </main>
}
