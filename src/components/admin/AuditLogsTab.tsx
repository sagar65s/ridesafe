'use client'
import { useEffect, useState } from 'react'
import { RefreshCw, ShieldCheck } from 'lucide-react'

interface AuditLog {
  id: string; action: string; entityType: string; entityId?: string | null; details?: string | null; createdAt: string
  actor?: { name: string; email: string; role: string } | null
  organization?: { name: string } | null
}

export default function AuditLogsTab() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const load = () => {
    setLoading(true)
    fetch('/api/audit?limit=200').then(r => r.json()).then(data => setLogs(data.logs || [])).finally(() => setLoading(false))
  }
  useEffect(() => {
    fetch('/api/audit?limit=200')
      .then(r => r.json())
      .then(data => setLogs(data.logs || []))
      .finally(() => setLoading(false))
  }, [])
  return <div className="glass-panel" style={{ padding:'1.5rem' }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:18 }}>
      <div><h2 style={{ margin:0, display:'flex', alignItems:'center', gap:8 }}><ShieldCheck size={22}/> Audit Logs</h2><div style={{ color:'var(--text-muted)', fontSize:13, marginTop:4 }}>System-wide security and management activity</div></div>
      <button className="btn" onClick={load}><RefreshCw size={15}/> Refresh</button>
    </div>
    <div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse', minWidth:760 }}>
      <thead><tr>{['Time','Actor','School','Action','Entity','Details'].map(h => <th key={h} style={{ textAlign:'left', padding:'10px', borderBottom:'1px solid var(--surface-border)', fontSize:12, color:'var(--text-muted)' }}>{h}</th>)}</tr></thead>
      <tbody>{logs.map(log => <tr key={log.id}>
        <td style={{ padding:10, borderBottom:'1px solid var(--surface-border)', whiteSpace:'nowrap', fontSize:12 }}>{new Date(log.createdAt).toLocaleString()}</td>
        <td style={{ padding:10, borderBottom:'1px solid var(--surface-border)', fontSize:12 }}>{log.actor?.name || 'System'}<div style={{ color:'var(--text-muted)' }}>{log.actor?.role || ''}</div></td>
        <td style={{ padding:10, borderBottom:'1px solid var(--surface-border)', fontSize:12 }}>{log.organization?.name || 'Global'}</td>
        <td style={{ padding:10, borderBottom:'1px solid var(--surface-border)' }}><span className="badge badge-info">{log.action}</span></td>
        <td style={{ padding:10, borderBottom:'1px solid var(--surface-border)', fontSize:12 }}>{log.entityType}{log.entityId ? ` · ${log.entityId.slice(-8)}` : ''}</td>
        <td style={{ padding:10, borderBottom:'1px solid var(--surface-border)', fontSize:11, color:'var(--text-muted)', maxWidth:300, wordBreak:'break-word' }}>{log.details || '—'}</td>
      </tr>)}</tbody>
    </table></div>
    {!loading && logs.length === 0 && <div style={{ textAlign:'center', color:'var(--text-muted)', padding:30 }}>No audit activity yet.</div>}
    {loading && <div style={{ textAlign:'center', color:'var(--text-muted)', padding:30 }}>Loading audit logs…</div>}
  </div>
}
