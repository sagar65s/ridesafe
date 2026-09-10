'use client'
import { TranslatedText } from '@/i18n/provider'
import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, MessageSquareWarning } from 'lucide-react'

interface Issue {
  id:string; category:string; subject:string; description:string; priority:string; status:string; resolution?:string|null; createdAt:string
  reporter:{name:string;email:string;phone?:string|null}; student?:{name:string;studentCode?:string|null}|null; organization?:{name:string}|null
}

export default function TransportIssuesTab() {
  const [issues,setIssues]=useState<Issue[]>([])
  const [saving,setSaving]=useState<string|null>(null)
  const [notice,setNotice]=useState('')
  const load=()=>fetch('/api/issues').then(r=>r.json()).then(d=>setIssues(d.issues||[]))
  useEffect(() => { void load() }, [])
  const update=async(issue:Issue,status:string)=>{
    const resolution=status==='RESOLVED'||status==='CLOSED' ? prompt('Resolution / action taken:') : ''
    if ((status==='RESOLVED'||status==='CLOSED') && !resolution?.trim()) return
    setSaving(issue.id)
    const response=await fetch('/api/issues',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:issue.id,status,resolution})})
    const body=await response.json().catch(()=>({}))
    setNotice(response.ok?'Issue updated':body.error||'Update failed'); setTimeout(()=>setNotice(''),3000)
    setSaving(null); if(response.ok) load()
  }
  return <div>
    {notice&&<div className="glass-panel" style={{ padding:12,marginBottom:12,color:'var(--bus-yellow)' }}><TranslatedText text={notice}/></div>}
    <div className="glass-panel" style={{ padding:'1.5rem',marginBottom:16 }}><h2 style={{margin:0,display:'flex',gap:8,alignItems:'center'}}><MessageSquareWarning/><TranslatedText text={" Transport Issues"}/></h2><div style={{color:'var(--text-muted)',fontSize:13,marginTop:5}}><TranslatedText text={"Parent complaints and school resolution workflow"}/></div></div>
    <div style={{display:'grid',gap:12}}>{issues.map(issue=><div key={issue.id} className="glass-panel" style={{padding:'1.25rem',borderLeft:`4px solid ${issue.priority==='URGENT'?'var(--danger)':issue.priority==='HIGH'?'var(--warning)':'var(--primary)'}`}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><div style={{fontWeight:800}}><TranslatedText text={issue.subject}/></div><div style={{fontSize:12,color:'var(--text-muted)',marginTop:3}}>{issue.reporter.name} · {issue.student?.name||'General'} · {issue.organization?.name||'School'} · {new Date(issue.createdAt).toLocaleString()}</div></div><div style={{display:'flex',gap:6}}><span className="badge badge-warning"><TranslatedText text={issue.category}/></span><span className="badge badge-info"><TranslatedText text={issue.status.replaceAll('_',' ')}/></span></div></div>
      <p style={{fontSize:13,lineHeight:1.6,color:'var(--text-muted)'}}>{issue.description}</p>
      {issue.resolution&&<div style={{fontSize:13,padding:10,borderRadius:8,background:'var(--success-bg)',color:'var(--success)'}}><CheckCircle2 size={14} style={{verticalAlign:'middle',marginRight:6}}/> <TranslatedText text={issue.resolution}/></div>}
      <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
        {issue.status==='OPEN'&&<button className="btn" disabled={saving===issue.id} onClick={()=>update(issue,'IN_PROGRESS')}><AlertTriangle size={14}/><TranslatedText text={" Start handling"}/></button>}
        {!['RESOLVED','CLOSED'].includes(issue.status)&&<button className="btn btn-success" disabled={saving===issue.id} onClick={()=>update(issue,'RESOLVED')}><CheckCircle2 size={14}/><TranslatedText text={" Resolve"}/></button>}
      </div>
    </div>)}</div>
    {issues.length===0&&<div className="glass-panel" style={{padding:40,textAlign:'center',color:'var(--text-muted)'}}><TranslatedText text={"No transport issues."}/></div>}
  </div>
}
