import { useTranslation as useLocaleText } from '@/i18n/provider'
import { TranslatedText } from '@/i18n/provider'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pencil, Trash2, X } from 'lucide-react'

const defaultBusForm = { busNumber:'', plateNumber: '', registrationNumber:'', capacity: '30', status:'ACTIVE', gpsStatus:'NOT_CONFIGURED', driverId: '', maintainerId: '', routeId: '', wialonUnitId: '', katsanaVehicleId: '', organizationId:'' }
const defaultRouteForm = { name: '', morningTime: '7:30 AM', afternoonTime: '3:00 PM', organizationId:'', isActive:true }

export default function FleetTab({ searchQuery = '' }: { searchQuery?: string }) {
 const {tx:translateUi}=useLocaleText()

    const [buses, setBuses] = useState<any[]>([])
    const [routes, setRoutes] = useState<any[]>([])
    const [drivers, setDrivers] = useState<any[]>([])
    const [organizations, setOrganizations] = useState<any[]>([])
    const [currentRole, setCurrentRole] = useState('')
    const [loading, setLoading] = useState(true)
    const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
    const [routeStops, setRouteStops] = useState<any[]>([])
    const [newStop, setNewStop] = useState({ name: '', latitude: '', longitude: '' })

    const [showBusModal, setShowBusModal] = useState(false)
    const [showRouteModal, setShowRouteModal] = useState(false)
    const [editingBusId, setEditingBusId] = useState<string | null>(null)
    const [editingRouteId, setEditingRouteId] = useState<string | null>(null)
    const [deletingBusId, setDeletingBusId] = useState<string | null>(null)
    const [deletingRouteId, setDeletingRouteId] = useState<string | null>(null)

    const [busForm, setBusForm] = useState(defaultBusForm)
    const [routeForm, setRouteForm] = useState(defaultRouteForm)

    const loadData = () => {
        Promise.all([
            fetch('/api/admin/buses').then(res => res.json()),
            fetch('/api/admin/routes').then(res => res.json()),
            fetch('/api/admin/users').then(res => res.json()),
            fetch('/api/admin/organizations').then(res => res.ok ? res.json() : { organizations:[] }),
            fetch('/api/auth/me').then(res => res.json()),
        ]).then(([busData, routeData, userData, organizationData, meData]) => {
            setBuses(busData.buses || [])
            setRoutes(routeData.routes || [])
            setDrivers((userData.users || []).filter((u: any) => u.role === 'DRIVER' && u.isActive !== false && u.employmentStatus !== 'OFFBOARDED'))
            setOrganizations(organizationData.organizations || [])
            setCurrentRole(meData.user?.role || '')
            setLoading(false)
        }).catch(console.error)
    }

    useEffect(() => {
        loadData()
    }, [])

    const loadStops = async (routeId: string) => {
        const res = await fetch(`/api/stops?routeId=${routeId}`)
        const data = await res.json()
        setRouteStops(data.stops || [])
        setSelectedRouteId(routeId)
    }

    const handleAddStop = async () => {
        if (!newStop.name.trim() || !selectedRouteId) return
        try {
            const res = await fetch('/api/stops', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    routeId: selectedRouteId,
                    name: newStop.name,
                    latitude: parseFloat(newStop.latitude) || 0,
                    longitude: parseFloat(newStop.longitude) || 0,
                    order: routeStops.length + 1
                })
            })
            if (res.ok) {
                setNewStop({ name: '', latitude: '', longitude: '' })
                loadStops(selectedRouteId)
            }
        } catch (e) { console.error(e) }
    }

    const handleDeleteStop = async (stopId: string) => {
        if (!selectedRouteId) return
        if (!confirm('Remove this stop?')) return
        try {
            const res = await fetch(`/api/stops/${stopId}`, { method: 'DELETE' })
            if (res.ok) loadStops(selectedRouteId)
            else { const err = await res.json(); alert(err.error || 'Failed to remove stop') }
        } catch (e) { console.error(e) }
    }

    const openAddBusModal = () => { setEditingBusId(null); setBusForm(defaultBusForm); setShowBusModal(true) }

    const openEditBusModal = (b: any) => {
        setEditingBusId(b.id)
        setBusForm({
            busNumber:b.busNumber || '', plateNumber: b.plateNumber, registrationNumber:b.registrationNumber || '', capacity: String(b.capacity), status:b.status || 'ACTIVE', gpsStatus:b.gpsStatus || 'NOT_CONFIGURED',
            driverId: b.driverId || b.driver?.id || '', maintainerId: b.maintainerId || '', routeId: b.routeId || b.route?.id || '',
            wialonUnitId: b.wialonUnitId || '', katsanaVehicleId: b.katsanaVehicleId || '', organizationId:b.organizationId || b.organization?.id || ''
        })
        setShowBusModal(true)
    }

    const handleAddBus = async (e: React.FormEvent) => {
        e.preventDefault()
        const cap = parseInt(busForm.capacity)
        if (!busForm.plateNumber.trim() || busForm.plateNumber.trim().length < 2) {
            alert('Please enter a valid plate number (min. 2 characters)'); return
        }
        if (isNaN(cap) || cap < 1 || cap > 200) {
            alert('Capacity must be a number between 1 and 200'); return
        }
        if (currentRole === 'SUPER_ADMIN' && !busForm.organizationId) { alert('Select a school for this bus'); return }
        try {
            const payload = {
                plateNumber: busForm.plateNumber.toUpperCase().trim(),
                busNumber: busForm.busNumber.trim() || null,
                registrationNumber: busForm.registrationNumber.trim() || null,
                capacity: cap,
                status: busForm.status,
                gpsStatus: busForm.gpsStatus,
                driverId: busForm.driverId || null, maintainerId: busForm.maintainerId || null,
                routeId: busForm.routeId || null,
                wialonUnitId: busForm.wialonUnitId.trim() || null,
                katsanaVehicleId: busForm.katsanaVehicleId.trim() || null,
                organizationId: busForm.organizationId || null,
            }
            const res = editingBusId
                ? await fetch(`/api/admin/buses/${editingBusId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                : await fetch('/api/admin/buses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            if (res.ok) {
                setBusForm(defaultBusForm)
                setEditingBusId(null)
                setShowBusModal(false)
                loadData()
            } else {
                const err = await res.json()
                alert(err.error || (editingBusId ? 'Failed to update bus' : 'Failed to add bus'))
            }
        } catch (e) { console.error(e) }
    }

    const handleDeleteBus = async (b: any) => {
        if (!confirm(`Deactivate bus "${b.plateNumber}"? Trip and maintenance history will be preserved.`)) return
        setDeletingBusId(b.id)
        try {
            const res = await fetch(`/api/admin/buses/${b.id}`, { method: 'DELETE' })
            if (res.ok) loadData()
            else { const err = await res.json(); alert(err.error || 'Failed to deactivate bus') }
        } catch (e) { console.error(e) } finally { setDeletingBusId(null) }
    }

    const openAddRouteModal = () => { setEditingRouteId(null); setRouteForm(defaultRouteForm); setShowRouteModal(true) }

    const openEditRouteModal = (r: any) => {
        setEditingRouteId(r.id)
        setRouteForm({ name: r.name, morningTime: r.morningTime || '', afternoonTime: r.afternoonTime || '', organizationId:r.organizationId || '', isActive:r.isActive !== false })
        setShowRouteModal(true)
    }

    const handleAddRoute = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!routeForm.name.trim() || routeForm.name.trim().length < 2) {
            alert('Route name must be at least 2 characters'); return
        }
        if (currentRole === 'SUPER_ADMIN' && !routeForm.organizationId) { alert('Select a school for this route'); return }
        try {
            const payload = { name: routeForm.name, morningTime: routeForm.morningTime, afternoonTime: routeForm.afternoonTime, organizationId:routeForm.organizationId || null, isActive:routeForm.isActive }
            const res = editingRouteId
                ? await fetch(`/api/admin/routes/${editingRouteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                : await fetch('/api/admin/routes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            if (res.ok) {
                setRouteForm(defaultRouteForm)
                setEditingRouteId(null)
                setShowRouteModal(false)
                loadData()
            } else {
                const err = await res.json()
                alert(err.error || (editingRouteId ? 'Failed to update route' : 'Failed to add route'))
            }
        } catch (e) { console.error(e) }
    }

    const handleDeleteRoute = async (r: any) => {
        if (!confirm(`Deactivate route "${r.name}"? Existing trip history will be preserved.`)) return
        setDeletingRouteId(r.id)
        try {
            const res = await fetch(`/api/admin/routes/${r.id}`, { method: 'DELETE' })
            if (res.ok) {
                if (selectedRouteId === r.id) setSelectedRouteId(null)
                loadData()
            } else { const err = await res.json(); alert(err.error || 'Failed to deactivate route') }
        } catch (e) { console.error(e) } finally { setDeletingRouteId(null) }
    }

    const q = searchQuery.trim().toLowerCase()
    const filteredBuses = q ? buses.filter(b => b.plateNumber?.toLowerCase().includes(q) || b.driver?.name?.toLowerCase().includes(q)) : buses
    const filteredRoutes = q ? routes.filter(r => r.name?.toLowerCase().includes(q)) : routes

    if (loading) return <div><TranslatedText text={"Loading fleet..."}/></div>

    return (
        <div className="fleet-grid" style={{ display: 'grid', gap: '2rem' }}>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel" style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0 }}><TranslatedText text={"Fleet (Buses)"}/></h3>
                    <button className="btn btn-primary" onClick={openAddBusModal}><TranslatedText text={"+ Add Bus"}/></button>
                </div>

                <div style={{ display: 'grid', gap: '1rem' }}>
                    {filteredBuses.map((b, i) => (
                        <div key={b.id} style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong><span style={{ color: 'var(--text-muted)', fontWeight: 400, marginRight: 8, fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>{b.busNumber ? `${b.busNumber} · ` : ''}{b.plateNumber}</strong>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <span className="badge" style={{ background: 'rgba(255,255,255,0.1)' }}>{b.status}</span>
                                    <button onClick={() => openEditBusModal(b)} title={translateUi("Edit bus")}
                                        style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 8, padding: '4px 7px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                                        <Pencil size={13} />
                                    </button>
                                    <button onClick={() => handleDeleteBus(b)} title={translateUi("Deactivate bus")} disabled={deletingBusId === b.id || b.status === 'INACTIVE'}
                                        style={{ background: 'none', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 8, padding: '4px 7px', cursor: 'pointer', color: 'var(--danger)', display: 'flex' }}>
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}><TranslatedText text={" Capacity: "}/>{b.capacity}<TranslatedText text={" | Driver: "}/>{b.driver?.name || 'Unassigned'}<TranslatedText text={" | Maintainer: "}/>{b.maintainer?.name || 'Unassigned'}<TranslatedText text={" | Route: "}/>{b.route?.name || 'Unassigned'}<TranslatedText text={" | GPS: "}/>{b.gpsStatus}
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel" style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0 }}><TranslatedText text={"Routes"}/></h3>
                    <button className="btn btn-primary" onClick={openAddRouteModal}><TranslatedText text={"+ Add Route"}/></button>
                </div>

                <div style={{ display: 'grid', gap: '1rem' }}>
                    {filteredRoutes.map((r, i) => (
                        <div key={r.id} style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong><span style={{ color: 'var(--text-muted)', fontWeight: 400, marginRight: 8, fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>{r.name} <span className={`badge ${r.isActive === false ? 'badge-pending' : 'badge-success'}`}><TranslatedText text={r.isActive === false ? 'INACTIVE' : 'ACTIVE'}/></span></strong>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <button onClick={() => openEditRouteModal(r)} title={translateUi("Edit route")}
                                        style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 8, padding: '4px 7px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                                        <Pencil size={13} />
                                    </button>
                                    <button onClick={() => handleDeleteRoute(r)} title={translateUi("Deactivate route")} disabled={deletingRouteId === r.id || r.isActive === false}
                                        style={{ background: 'none', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 8, padding: '4px 7px', cursor: 'pointer', color: 'var(--danger)', display: 'flex' }}>
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span><TranslatedText text={"Morning: "}/>{r.morningTime || 'N/A'}<TranslatedText text={" | Afternoon: "}/>{r.afternoonTime || 'N/A'}</span>
                                <button className="btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)' }} onClick={() => selectedRouteId === r.id ? setSelectedRouteId(null) : loadStops(r.id)}>
                                    {selectedRouteId === r.id ? 'Hide Stops' : 'Manage Stops'}
                                </button>
                            </div>

                            <AnimatePresence>
                                {selectedRouteId === r.id && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginTop: '1rem', borderTop: '1px solid var(--surface-border)', paddingTop: '1rem' }}>
                                        <h4 style={{ margin: '0 0 1rem 0' }}><TranslatedText text={"Route Stops"}/></h4>
                                        {routeStops.map((s, idx) => (
                                            <div key={s.id} style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>{idx + 1}</div>
                                                <div style={{ flex: 1 }}>{s.name}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>[{s.latitude}, {s.longitude}]</div>
                                                <button onClick={() => handleDeleteStop(s.id)} title={translateUi("Remove stop")}
                                                    style={{ background: 'none', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 8, padding: '3px 6px', cursor: 'pointer', color: 'var(--danger)', display: 'flex' }}>
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}

                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                            <input type="text" placeholder={translateUi("Stop Name")} className="input-field" style={{ marginBottom: 0, padding: '0.5rem', flex: 1 }} value={newStop.name} onChange={e => setNewStop({ ...newStop, name: e.target.value })} />
                                            <button className="btn btn-success" style={{ padding: '0.5rem 1rem' }} onClick={handleAddStop}><TranslatedText text={"Add Stop"}/></button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Add Bus Modal */}
            <AnimatePresence>
                {showBusModal && (
                    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowBusModal(false); setEditingBusId(null) } }}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="modal-box" style={{ maxWidth: '500px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ margin: 0, color: 'var(--bus-yellow)' }}><TranslatedText text={editingBusId ? 'Edit Bus' : 'Add New Bus'}/></h3>
                                <button type="button" onClick={() => { setShowBusModal(false); setEditingBusId(null) }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
                                    <X size={20} />
                                </button>
                            </div>
                            <form onSubmit={handleAddBus} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {currentRole === 'SUPER_ADMIN' && <div className="input-group" style={{ marginBottom:0 }}><label className="input-label"><TranslatedText text={"School *"}/></label><select className="select-field" value={busForm.organizationId} onChange={e=>setBusForm({...busForm,organizationId:e.target.value,driverId:'',maintainerId:'',routeId:''})}><option value=""><TranslatedText text={"Select school"}/></option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></div>}
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label"><TranslatedText text={"Bus Number"}/></label>
                                    <input type="text" className="input-field" placeholder={translateUi("e.g. BUS-12")} value={busForm.busNumber} onChange={e => setBusForm({...busForm, busNumber:e.target.value})} />
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label"><TranslatedText text={"Plate Number"}/></label>
                                    <input type="text" required className="input-field" placeholder={translateUi("e.g. BUS-123")} value={busForm.plateNumber} onChange={e => setBusForm({...busForm, plateNumber: e.target.value})} />
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label"><TranslatedText text={"Registration Number"}/></label>
                                    <input type="text" className="input-field" value={busForm.registrationNumber} onChange={e => setBusForm({...busForm, registrationNumber:e.target.value})} />
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label"><TranslatedText text={"Capacity (seats)"}/></label>
                                    <input type="number" required min={1} max={200} step={1} className="input-field" placeholder="e.g. 30" value={busForm.capacity} onChange={e => setBusForm({...busForm, capacity: e.target.value.replace(/[^0-9]/g,'')})} />
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label"><TranslatedText text={"Bus Maintainer"}/></label>
                                    <select className="input-field" value={busForm.maintainerId} onChange={e=>setBusForm({...busForm,maintainerId:e.target.value})}><option value=""><TranslatedText text={"Select maintainer"}/></option>{drivers.filter(d=>d.personnelType==='MAINTAINER'&&(!busForm.organizationId||d.organizationId===busForm.organizationId)).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select>
                                    <label className="input-label"><TranslatedText text={"Driver (Optional)"}/></label>
                                    <select className="input-field" style={{ background: 'var(--surface-bg)' }} value={busForm.driverId} onChange={e => setBusForm({...busForm, driverId: e.target.value})}>
                                        <option value=""><TranslatedText text={"-- Select Driver --"}/></option>
                                        {drivers.filter(d => d.personnelType !== 'MAINTAINER' && (!busForm.organizationId || d.organizationId === busForm.organizationId)).map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label"><TranslatedText text={"Route (Optional)"}/></label>
                                    <select className="input-field" style={{ background: 'var(--surface-bg)' }} value={busForm.routeId} onChange={e => setBusForm({...busForm, routeId: e.target.value})}>
                                        <option value=""><TranslatedText text={"-- Select Route --"}/></option>
                                        {routes.filter(r => r.isActive !== false && (!busForm.organizationId || r.organizationId === busForm.organizationId)).map(r => (
                                            <option key={r.id} value={r.id}>{r.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                                  <div className="input-group" style={{marginBottom:0}}><label className="input-label"><TranslatedText text={"Bus Status"}/></label><select className="select-field" value={busForm.status} onChange={e=>setBusForm({...busForm,status:e.target.value})}><option value="ACTIVE"><TranslatedText text={"Active"}/></option><option value="INACTIVE"><TranslatedText text={"Inactive"}/></option><option value="MAINTENANCE"><TranslatedText text={"Maintenance"}/></option></select></div>
                                  <div className="input-group" style={{marginBottom:0}}><label className="input-label"><TranslatedText text={"GPS Status"}/></label><select className="select-field" value={busForm.gpsStatus} onChange={e=>setBusForm({...busForm,gpsStatus:e.target.value})}><option value="NOT_CONFIGURED"><TranslatedText text={"Not configured"}/></option><option value="CONFIGURED"><TranslatedText text={"Configured"}/></option><option value="ONLINE"><TranslatedText text={"Online"}/></option><option value="OFFLINE"><TranslatedText text={"Offline"}/></option></select></div>
                                </div>

                                {/* GPS Tracker IDs */}
                                <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}><TranslatedText text={" GPS Tracker IDs (optional — leave blank if not using) "}/></div>
                                    <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                                        <label className="input-label"><TranslatedText text={"🛰️ Wialon Unit ID"}/></label>
                                        <input type="text" className="input-field" placeholder="e.g. 123456789"
                                            value={busForm.wialonUnitId}
                                            onChange={e => setBusForm({...busForm, wialonUnitId: e.target.value})} />
                                    </div>
                                    <div className="input-group" style={{ marginBottom: 0 }}>
                                        <label className="input-label"><TranslatedText text={"📡 Katsana Vehicle ID"}/></label>
                                        <input type="text" className="input-field" placeholder="e.g. 78901"
                                            value={busForm.katsanaVehicleId}
                                            onChange={e => setBusForm({...busForm, katsanaVehicleId: e.target.value})} />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                                    <button type="button" className="btn" style={{ background: 'rgba(255,255,255,0.1)' }} onClick={() => { setShowBusModal(false); setEditingBusId(null) }}><TranslatedText text={"Cancel"}/></button>
                                    <button type="submit" className="btn btn-primary"><TranslatedText text={editingBusId ? 'Save Changes' : 'Save Bus'}/></button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Add Route Modal */}
            <AnimatePresence>
                {showRouteModal && (
                    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowRouteModal(false); setEditingRouteId(null) } }}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="modal-box" style={{ maxWidth: '500px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ margin: 0, color: 'var(--bus-yellow)' }}><TranslatedText text={editingRouteId ? 'Edit Route' : 'Add New Route'}/></h3>
                                <button type="button" onClick={() => { setShowRouteModal(false); setEditingRouteId(null) }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
                                    <X size={20} />
                                </button>
                            </div>
                            <form onSubmit={handleAddRoute} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {currentRole === 'SUPER_ADMIN' && <div className="input-group" style={{marginBottom:0}}><label className="input-label"><TranslatedText text={"School *"}/></label><select className="select-field" value={routeForm.organizationId} onChange={e=>setRouteForm({...routeForm,organizationId:e.target.value})}><option value=""><TranslatedText text={"Select school"}/></option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></div>}
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label"><TranslatedText text={"Route Name"}/></label>
                                    <input type="text" required className="input-field" placeholder={translateUi("e.g. Route C")} value={routeForm.name} onChange={e => setRouteForm({...routeForm, name: e.target.value})} />
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label"><TranslatedText text={"Morning Pickup Time"}/></label>
                                    <input type="text" className="input-field" placeholder={translateUi("e.g. 7:30 AM")} value={routeForm.morningTime} onChange={e => setRouteForm({...routeForm, morningTime: e.target.value})} />
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label"><TranslatedText text={"Afternoon Dropoff Time"}/></label>
                                    <input type="text" className="input-field" placeholder={translateUi("e.g. 3:00 PM")} value={routeForm.afternoonTime} onChange={e => setRouteForm({...routeForm, afternoonTime: e.target.value})} />
                                </div>
                                <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13}}><input type="checkbox" checked={routeForm.isActive} onChange={e=>setRouteForm({...routeForm,isActive:e.target.checked})}/><TranslatedText text={" Route active"}/></label>
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                                    <button type="button" className="btn" style={{ background: 'rgba(255,255,255,0.1)' }} onClick={() => { setShowRouteModal(false); setEditingRouteId(null) }}><TranslatedText text={"Cancel"}/></button>
                                    <button type="submit" className="btn btn-primary"><TranslatedText text={editingRouteId ? 'Save Changes' : 'Save Route'}/></button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}

