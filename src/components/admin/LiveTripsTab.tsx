'use client'
import { TranslatedText } from '@/i18n/provider'
import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Navigation, RefreshCw, Bus } from 'lucide-react'
import { useTranslation } from '@/i18n/provider'
import { api, Tracking, formatDate } from '@/components/transport/shared'
const BusMap = dynamic(() => import('@/components/BusMap'), { ssr: false })
export default function LiveTripsTab() {
  const { tx, locale } = useTranslation()
  const [buses, setBuses] = useState<Tracking[]>([]), [selected, setSelected] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const refresh = useCallback(async () => { try { const data = await api('/api/location'); setBuses(data.drivers || []); setError('') } catch(e) {setError((e as Error).message)} finally { setLoading(false) } }, [])
  useEffect(() => { void refresh(); const timer = setInterval(refresh, 10000); return () => clearInterval(timer) }, [refresh])
  const displayed = selected ? buses.filter(bus => bus.id === selected) : buses
  return <div style={{display:'grid',gap:20}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h2><Navigation size={23}/> {tx('Live Tracking')}</h2><button className="btn btn-primary" onClick={refresh}><RefreshCw size={17}/>{tx('Refresh')}</button></div>
    {error && <div role="alert" className="glass-panel" style={{padding:16}}>{tx(error)}</div>}
    <div className="glass-panel" style={{padding:20}}><label className="input-label" htmlFor="tracking-bus">{tx('Bus')}</label><select id="tracking-bus" className="input-field" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">{tx('All buses')}</option>{buses.map(bus=><option key={bus.id} value={bus.id}>{bus.name} · {bus.routeName}</option>)}</select><div style={{marginTop:16}}><BusMap drivers={displayed.filter(bus=>bus.fresh)}/></div></div>
    {loading ? <p>{tx('Loading...')}</p> : !buses.length ? <div className="glass-panel" style={{padding:32,textAlign:'center'}}><Bus/><p>{tx('No active journey')}</p></div> : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:16}}>{displayed.map(bus=><article key={bus.id} className="glass-panel" style={{padding:22}}><h3 data-no-translate>{bus.name}</h3><p data-no-translate>{bus.routeName}</p><p>{tx('Driver')}: <span data-no-translate>{bus.driver.name}</span></p><p>{tx('Maintainer')}: <span data-no-translate>{bus.maintainer?.name || '—'}</span></p><span className={`badge ${bus.fresh ? 'badge-success':'badge-warning'}`}>{tx(bus.fresh ? 'Live GPS':'Waiting for GPS')}</span><p>{tx('Last update')}: {bus.lastLocationUpdate ? formatDate(bus.lastLocationUpdate,locale):'—'}</p><p>{Math.round(bus.currentSpeedKmH || 0)}<TranslatedText text={" km/h"}/></p>{bus.targets.map(target=><div key={target.studentId} style={{borderTop:'1px solid var(--surface-border)',padding:'10px 0'}}><strong data-no-translate>{target.studentName}</strong><div><span data-no-translate>{target.stopName}</span> · {tx(target.action === 'DROPPED_OFF' ? 'Drop-off':'Boarding')} · <TranslatedText text={target.etaMins == null ? tx('ETA unavailable'):`~${target.etaMins} ${tx('min')}`}/></div></div>)}</article>)}</div>}
    <p style={{color:'var(--text-muted)'}}>{tx('Arrival times are estimates based on fresh GPS and route stops.')}</p>
  </div>
}
