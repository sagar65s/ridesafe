'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { MessageSquare, Search, Send, Trash2 } from 'lucide-react'
import { useTranslation } from '@/i18n/provider'
import { api, Empty, Person } from '@/components/transport/shared'
import { formatRideSafeDateTime } from '@/lib/date-format'
import ConfirmDialog from '@/components/ConfirmDialog'

type ChatMessage = {
  id:string
  content:string
  createdAt:string
  read:boolean
  sender:Person
  recipient:Person
  threadUser?:Person|null
  organization?:{id:string;name:string}|null
}
function belongsToThread(item:ChatMessage,userId:string){return item.threadUser?.id===userId||(!item.threadUser&&(item.sender.id===userId||item.recipient.id===userId))}

export default function MessagesTab() {
  const {tx}=useTranslation()
  const [me,setMe]=useState<Person|null>(null)
  const [messages,setMessages]=useState<ChatMessage[]>([])
  const [users,setUsers]=useState<Person[]>([])
  const [selected,setSelected]=useState('')
  const [text,setText]=useState('')
  const [query,setQuery]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [pendingDeleteId,setPendingDeleteId]=useState<string|null>(null)
  const [deleting,setDeleting]=useState(false)

  const load=useCallback(async()=>{
    try {
      const [account,inbox,directory]=await Promise.all([api('/api/auth/me'),api('/api/messages'),api('/api/messages/contacts')])
      setMe(account.user)
      setMessages(inbox.messages||[])
      setUsers((directory.contacts||[]).filter((item:Person)=>item.id!==account.user.id))
      setSelected(value=>value && (directory.contacts||[]).some((item:Person)=>item.id===value)?value:'')
      setError('')
    } catch(cause) { setError(cause instanceof Error?cause.message:'Unable to load messages') }
  },[])
  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),5000);return()=>window.clearInterval(timer)},[load])

  const contacts=useMemo(()=>users.map(user=>{
    const thread=messages.filter(item=>belongsToThread(item,user.id))
    return {...user,last:thread.at(-1),unread:thread.filter(item=>item.sender.id!==me?.id&&!item.read).length}
  }).filter(item=>`${item.name} ${item.role} ${item.email||''}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>+(new Date(b.last?.createdAt||0))-+(new Date(a.last?.createdAt||0))),[users,messages,me,query])
  const thread=messages.filter(item=>belongsToThread(item,selected))
  const active=contacts.find(item=>item.id===selected)

  useEffect(()=>{
    if(!me||!selected)return
    const unread=messages.filter(item=>belongsToThread(item,selected)&&item.sender.id!==me.id&&!item.read)
    if(!unread.length)return
    void Promise.all(unread.map(item=>api('/api/messages',{id:item.id},'PATCH'))).then(()=>setMessages(items=>items.map(item=>unread.some(row=>row.id===item.id)?{...item,read:true}:item))).catch(()=>{})
  },[selected,me,messages])

  const send=async(event:React.FormEvent)=>{
    event.preventDefault();if(!selected||!text.trim()||busy)return
    setBusy(true);setError('')
    try {await api('/api/messages',{recipientId:selected,content:text.trim()});setText('');await load()}
    catch(cause){setError(cause instanceof Error?cause.message:'Unable to send message')}
    finally{setBusy(false)}
  }
  const remove=async(id:string)=>{
    setDeleting(true)
    try{await api('/api/messages',{id},'DELETE');setMessages(items=>items.filter(item=>item.id!==id));setPendingDeleteId(null)}catch(cause){setError(cause instanceof Error?cause.message:'Delete failed')}finally{setDeleting(false)}
  }
  const roleLabel=(role?:string)=>role==='SCHOOL_ADMIN'?'School Admin':role==='ADMIN'?'Admin':role==='PARENT'?'Parent':role==='DRIVER'?'Driver / Maintainer':'Super Admin'

  return <div className="glass-panel" style={{padding:20}}>
    <div className="section-title"><h2><MessageSquare size={22}/>{tx('Messages')}</h2></div>
    {error&&<div className="notice-bar">{tx(error)}</div>}
    <div className="chat-layout">
      <aside className="chat-contacts">
        <div style={{padding:14,fontWeight:800}}>{tx('Chats')}</div>
        <label className="chat-search"><Search size={15}/><input aria-label={tx('Filter chats')} placeholder={tx('Filter parents or drivers')} value={query} onChange={event=>setQuery(event.target.value)}/></label>
        {contacts.map(contact=><button key={contact.id} onClick={()=>setSelected(contact.id)} className={`${selected===contact.id?'selected':''} ${contact.unread?'chat-contact-unread':''}`}><strong data-no-translate>{contact.name}{contact.unread>0&&<i className="chat-unread-dot" aria-label={tx('New activity')}/>}</strong><span>{tx(roleLabel(contact.role))}{contact.unread?` · ${contact.unread} ${tx('unread')}`:''}</span><small>{contact.last?<span data-no-translate>{contact.last.content}</span>:tx('Start a conversation')}</small></button>)}
        {!contacts.length&&<Empty text="No parent or driver chats found"/>}
      </aside>
      <section className="chat-thread">
        <header><strong>{active?<span data-no-translate>{active.name}</span>:tx('Choose a chat')}</strong>{active&&<span>{tx(roleLabel(active.role))}</span>}</header>
        <div className="message-list">{thread.map(item=><div key={item.id} className={`message-bubble ${item.sender.id===me?.id?'mine':''}`}><strong>{item.sender.id===me?.id?tx('You'):tx(`${roleLabel(item.sender.role)} reply`)}</strong><p data-no-translate>{item.content}</p><time>{formatRideSafeDateTime(item.createdAt)}</time><button className="icon-button" aria-label={tx('Delete')} onClick={()=>setPendingDeleteId(item.id)}><Trash2 size={14}/></button></div>)}{active&&!thread.length&&<Empty text="No messages yet"/>}</div>
        <form className="message-compose" onSubmit={send}><input value={text} onChange={event=>setText(event.target.value)} maxLength={2000} required placeholder={tx('Type a message')}/><button className="transport-primary" disabled={busy||!selected}><Send size={17}/>{tx('Send')}</button></form>
      </section>
    </div>
    <ConfirmDialog open={Boolean(pendingDeleteId)} title="Delete message?" description="This message will be removed from your chat view." confirmLabel="Delete message" busy={deleting} onCancel={()=>{if(!deleting)setPendingDeleteId(null)}} onConfirm={()=>{if(pendingDeleteId)void remove(pendingDeleteId)}}/>
  </div>
}
