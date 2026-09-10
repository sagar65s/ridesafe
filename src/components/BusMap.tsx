'use client'
import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { useTranslation } from '@/i18n/provider'
const icon = L.divIcon({ className: 'bus-map-pin', html: '<span style="display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:#facc15;border:3px solid #142c47;color:#142c47;font-size:20px;box-shadow:0 4px 12px #0003">🚌</span>', iconSize:[36,36],iconAnchor:[18,18] })
type Driver = { id:string; name:string; lastLatitude:number|null; lastLongitude:number|null; etaMins?:number|null }
function Follow({ points }: { points: [number,number][] }) {
  const map=useMap(), key=JSON.stringify(points)
  useEffect(()=>{const next=JSON.parse(key) as [number,number][];if(next.length===1)map.setView(next[0],map.getZoom(),{animate:true});else if(next.length>1)map.fitBounds(next,{padding:[35,35],maxZoom:15,animate:true})},[map,key])
  return null
}
export default function BusMap({ drivers }: { drivers:Driver[] }) {
  const {tx}=useTranslation()
  const active=drivers.filter(d=>d.lastLatitude!==null&&d.lastLongitude!==null)
  if(!active.length)return <div style={{height:300,display:'grid',placeItems:'center',background:'#edf2f7',borderRadius:14,color:'#43566b',padding:24,textAlign:'center'}}>{tx('No active buses currently sharing location')}</div>
  const points=active.map(d=>[d.lastLatitude!,d.lastLongitude!] as [number,number])
  return <div style={{height:350,width:'100%',borderRadius:14,overflow:'hidden'}}><MapContainer center={points[0]} zoom={14} style={{height:'100%',width:'100%'}}><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><Follow points={points}/>{active.map(d=><Marker key={d.id} position={[d.lastLatitude!,d.lastLongitude!]} icon={icon}><Popup><strong data-no-translate>{d.name}</strong>{d.etaMins!=null&&<p>{tx('Next stop')}: ~{d.etaMins} {tx('min')}</p>}</Popup></Marker>)}</MapContainer></div>
}
