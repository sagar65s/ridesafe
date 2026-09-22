'use client'
import {useCallback,useEffect,useState} from 'react'
import {Bell,CheckCheck,Trash2} from 'lucide-react'
import {api,Empty,Notice,NoticeBar} from '@/components/transport/shared'
import {useTranslation} from '@/i18n/provider'
import {formatRideSafeDateTime} from '@/lib/date-format'
import ConfirmDialog from '@/components/ConfirmDialog'

export default function NotificationsPanel(){
  const {tx}=useTranslation(),[items,setItems]=useState<Notice[]>([]),[error,setError]=useState(''),[pendingDeleteId,setPendingDeleteId]=useState<string|null>(null),[deleting,setDeleting]=useState(false)
  const load=useCallback(()=>api('/api/notifications').then(data=>{setItems(data.notifications||[]);setError('')}).catch(error=>setError(error.message)),[])
  useEffect(()=>{void load();const timer=window.setInterval(load,10000);return()=>window.clearInterval(timer)},[load])
  const markAll=async()=>{await api('/api/notifications',{markAll:true},'PATCH');setItems(rows=>rows.map(row=>({...row,read:true})))}
  const remove=async(id:string)=>{setDeleting(true);try{await api('/api/notifications',{id},'DELETE');setItems(rows=>rows.filter(row=>row.id!==id));setPendingDeleteId(null)}catch(cause){setError(cause instanceof Error?cause.message:'Delete failed')}finally{setDeleting(false)}}
  return <section className="journey-card notifications-panel"><div className="section-title"><h2><Bell size={21}/>{tx('Notifications')}</h2>{items.some(item=>!item.read)&&<button className="transport-secondary" onClick={()=>void markAll()}><CheckCheck size={16}/>{tx('Mark all read')}</button>}</div><NoticeBar message={error} retry={()=>void load()}/><div className="notification-list">{items.map(item=><article className={`alert-item ${item.read?'':'unread'}`} key={item.id}><Bell size={18}/><div><strong data-no-translate>{item.title}</strong><p data-no-translate>{item.body}</p><time>{formatRideSafeDateTime(item.createdAt)}</time></div>{!item.read&&<button className="transport-secondary" onClick={()=>void api('/api/notifications',{id:item.id,read:true},'PATCH').then(()=>setItems(rows=>rows.map(row=>row.id===item.id?{...row,read:true}:row)))}>{tx('Mark read')}</button>}<button className="icon-button" aria-label={tx('Delete')} onClick={()=>setPendingDeleteId(item.id)}><Trash2 size={15}/></button></article>)}{!items.length&&<Empty text="No alerts yet"/>}</div><ConfirmDialog open={Boolean(pendingDeleteId)} title="Delete notification?" description="This notification will be permanently removed from your account." confirmLabel="Delete notification" busy={deleting} onCancel={()=>{if(!deleting)setPendingDeleteId(null)}} onConfirm={()=>{if(pendingDeleteId)void remove(pendingDeleteId)}}/></section>
}
