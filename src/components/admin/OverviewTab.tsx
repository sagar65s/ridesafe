'use client'
import { useTranslation as useLocaleText } from '@/i18n/provider'
import { TranslatedText } from '@/i18n/provider'
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Bus, AlertTriangle, GraduationCap, Settings } from 'lucide-react'
import { useAudio } from '@/hooks/useAudio'

interface StudentRecord { id: string; name: string; grade: string; level: string; parentContact1: string; status: string; isSelfPickup: boolean }
interface TripRecord { id: string; status: string; date?: string; busId?: string | null }
interface EmergencyRecord { id: string; timestamp: string; latitude?: number; longitude?: number; driver?: { name: string; phone?: string } }

export default function OverviewTab({ currentUserRole }: { currentUserRole: string }) {
 const {tx:translateUi}=useLocaleText()

    const [students, setStudents] = useState<StudentRecord[]>([])
    const [trips, setTrips] = useState<TripRecord[]>([])
    const [platformStats, setPlatformStats] = useState({ schools:0, buses:0, drivers:0, runningBuses:0 })
    const [pickupTimes, setPickupTimes] = useState('')
    const [schoolName, setSchoolName] = useState('')
    const [schoolLat, setSchoolLat] = useState('')
    const [schoolLng, setSchoolLng] = useState('')
    const [geofenceRadius, setGeofenceRadius] = useState('')
    const [settingsError, setSettingsError] = useState('')
    const [emergencies, setEmergencies] = useState<EmergencyRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [toast, setToast] = useState('')
    const [toastType, setToastType] = useState<'success' | 'error'>('success')
    const prevEmergenciesLength = useRef(0)
    // Prevents the 5-second poll from overwriting what the user is typing
    const isEditingRef = useRef(false)

    const { play: playAlert } = useAudio('/alert toon.mp3')

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast(msg); setToastType(type)
        setTimeout(() => setToast(''), 3500)
    }

    useEffect(() => {
        const fetchAllData = async () => {
            try {
                const [studentsRes, settingsRes, emergencyRes, tripsRes, adminSettingsRes, orgsRes, busesRes, usersRes] = await Promise.all([
                    fetch('/api/students'),
                    fetch('/api/settings'),
                    fetch('/api/emergency'),
                    fetch('/api/trips'),
                    fetch('/api/admin/settings'),
                    currentUserRole === 'SUPER_ADMIN' ? fetch('/api/admin/organizations') : Promise.resolve(null),
                    currentUserRole === 'SUPER_ADMIN' ? fetch('/api/admin/buses') : Promise.resolve(null),
                    currentUserRole === 'SUPER_ADMIN' ? fetch('/api/admin/users') : Promise.resolve(null),
                ])

                const studentsData = await studentsRes.json()
                const settingsData = await settingsRes.json()
                const emergencyData = await emergencyRes.json()
                const tripsData = await tripsRes.json()
                const adminSettings = await adminSettingsRes.json()
                if (currentUserRole === 'SUPER_ADMIN') {
                    const [orgsRaw, busesRaw, usersRaw] = await Promise.all([
                        orgsRes?.json() || {}, busesRes?.json() || {}, usersRes?.json() || {},
                    ])
                    const orgsData = orgsRaw as { organizations?: {isActive?:boolean}[] }
                    const busesData = busesRaw as { buses?: {id:string}[] }
                    const usersData = usersRaw as { users?: {role:string;isActive?:boolean;employmentStatus?:string}[] }
                    const buses = busesData.buses || []
                    setPlatformStats({
                        schools: (orgsData.organizations || []).filter((org: {isActive?:boolean}) => org.isActive !== false).length,
                        buses: buses.length,
                        drivers: (usersData.users || []).filter((user: {role:string;isActive?:boolean;employmentStatus?:string}) => user.role === 'DRIVER' && user.isActive !== false && user.employmentStatus !== 'OFFBOARDED').length,
                        runningBuses: new Set((tripsData.trips || []).filter((trip: {status:string;busId?:string}) => !['TRIP_COMPLETED','CANCELLED'].includes(trip.status)).map((trip: {busId?:string}) => trip.busId).filter(Boolean)).size,
                    })
                }

                const alertsLength = emergencyData.alerts?.length || 0
                if (alertsLength > prevEmergenciesLength.current && prevEmergenciesLength.current !== 0) {
                    playAlert()
                    showToast('New emergency alert received!', 'error')
                }
                prevEmergenciesLength.current = alertsLength

                setStudents(studentsData.students || [])
                setPickupTimes((settingsData.times || []).join(', '))
                // Only update name from server if user is NOT actively typing in the field
                if (!isEditingRef.current) {
                    setSchoolName(adminSettings.schoolName || 'RideSafe School')
                    setSchoolLat(adminSettings.schoolLat ?? '')
                    setSchoolLng(adminSettings.schoolLng ?? '')
                    setGeofenceRadius(adminSettings.geofenceRadius ?? '')
                }
                setEmergencies(emergencyData.alerts || [])
                setTrips(tripsData.trips || [])
            } catch (error) {
                console.error(error)
            } finally {
                setLoading(false)
            }
        }

        fetchAllData()
        const interval = setInterval(fetchAllData, 5000)
        return () => clearInterval(interval)
    }, [])

    const handleResolveEmergency = async (id: string) => {
        try {
            const res = await fetch(`/api/emergency/${id}`, { method: 'PATCH' })
            if (res.ok) {
                setEmergencies(emergencies.filter(e => e.id !== id))
                showToast('Emergency resolved')
            } else {
                showToast('Failed to resolve', 'error')
            }
        } catch { showToast('Network error', 'error') }
    }

    const handleUpdateSettings = async () => {
        setSettingsError('')
        if (!schoolName.trim() || schoolName.trim().length < 3) {
            setSettingsError('Organisation name must be at least 3 characters'); return
        }
        const timesArray = pickupTimes.split(',').map(t => t.trim()).filter(Boolean)
        if (timesArray.length === 0) {
            setSettingsError('Enter at least one pickup time'); return
        }
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ times: timesArray })
            })
            const schoolRes = await fetch('/api/admin/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    schoolName, pickupTimes: timesArray,
                })
            })
            if (res.ok && schoolRes.ok) {
                isEditingRef.current = false
                showToast('Settings updated successfully!')
            } else {
                showToast('Failed to update settings', 'error')
            }
        } catch {
            showToast('Network error', 'error')
        }
    }

    if (loading) return (
        <div className="glass-panel" style={{ padding: '2rem' }}>
            {[1, 2, 3].map(i => (
                <div key={i} className="skeleton" style={{ height: i === 1 ? 80 : 56, marginBottom: 14, borderRadius: 12 }} />
            ))}
        </div>
    )

    // Computed real stats
    const activeTrips = trips.filter((t: TripRecord) => !['TRIP_COMPLETED', 'CANCELLED'].includes(t.status)).length
    const today = new Date().toDateString()
    const todayTrips = trips.filter(trip => trip.date && new Date(trip.date).toDateString() === today).length
    const presentStudents = students.filter((s: StudentRecord) => s.status === 'CHECKED_OUT').length

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.12 } }
    }
    const cardVariants = {
        hidden: { opacity: 0, y: 24, scale: 0.96 },
        visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, bounce: 0.35, duration: 0.7 } }
    }

    return (
        <div>
            {/* Toast */}
            <AnimatePresence>
                {toast && (
                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                        style={{
                            position: 'fixed', top: 20, right: 20, zIndex: 9999, padding: '0.875rem 1.5rem',
                            background: toastType === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                            border: `1px solid ${toastType === 'success' ? 'var(--success)' : 'var(--danger)'}`,
                            borderRadius: 12, color: 'var(--text-main)', fontWeight: 600, backdropFilter: 'blur(12px)'
                        }}>
                        <TranslatedText text={toast}/>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Emergency alerts */}
            <AnimatePresence>
                {emergencies.length > 0 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        style={{ background: 'rgba(239,68,68,0.08)', border: '2px solid #ef4444', padding: '1.5rem', borderRadius: 12, marginBottom: '2rem', overflow: 'hidden' }}>
                        <h2 style={{ color: '#ef4444', marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ repeat: Infinity, duration: 1 }} style={{ display: 'flex' }}>
                                <AlertTriangle size={24} color="#ef4444" />
                            </motion.span><TranslatedText text={" ACTIVE EMERGENCIES ("}/>{emergencies.length})
                        </h2>
                        <div style={{ display: 'grid', gap: '1rem' }}>
                            {emergencies.map(e => (
                                <motion.div layout key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 8 }}>
                                    <div>
                                        <strong style={{ display: 'block', fontSize: '1.05rem' }}><TranslatedText text={" Driver: "}/>{e.driver?.name || 'Unknown'} {e.driver?.phone ? `(${e.driver.phone})` : ''}
                                        </strong>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: 4 }}><TranslatedText text={" Triggered: "}/>{new Date(e.timestamp).toLocaleString()}<br /><TranslatedText text={" Location: "}/><TranslatedText text={e.latitude && e.longitude ? `${e.latitude.toFixed(5)}, ${e.longitude.toFixed(5)}` : 'Unknown'}/>
                                        </div>
                                    </div>
                                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                        className="btn btn-success" onClick={() => handleResolveEmergency(e.id)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <CheckCircle size={16} /><TranslatedText text={" Resolve "}/></motion.button>
                                </motion.div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Quick Stats - Bento Grid */}
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="bento-grid" style={{ marginBottom: '2.5rem' }}>
                {(currentUserRole === 'SUPER_ADMIN' ? [
                    { icon: <Settings size={24}/>, label: 'Total Schools', val: platformStats.schools, color: 'var(--primary)' },
                    { icon: <GraduationCap size={24}/>, label: 'Total Students', val: students.length, color: 'var(--primary)' },
                    { icon: <Bus size={24}/>, label: 'Total Buses', val: platformStats.buses, color: 'var(--info)' },
                    { icon: <CheckCircle size={24}/>, label: 'Active Drivers / Maintainers', val: platformStats.drivers, color: 'var(--success)' },
                    { icon: <Bus size={24}/>, label: 'Running Buses', val: platformStats.runningBuses, color: 'var(--bus-yellow)' },
                    { icon: <AlertTriangle size={24}/>, label: 'Emergency / SOS', val: emergencies.length, color: 'var(--danger)' },
                    { icon: <CheckCircle size={24}/>, label: "Today's Trips", val: todayTrips, color: 'var(--success)' },
                ] : [
                    { icon: <GraduationCap size={24}/>, label: 'Total Students', val: students.length, color: 'var(--primary)' },
                    { icon: <CheckCircle size={24}/>, label: 'Checked In', val: presentStudents, color: 'var(--success)' },
                    { icon: <Bus size={24}/>, label: 'Active Trips', val: activeTrips, color: 'var(--bus-yellow)' },
                    { icon: <AlertTriangle size={24}/>, label: 'Open Emergencies', val: emergencies.length, color: 'var(--danger)' },
                ]).map(({ icon, label, val, color }) => (
                    <motion.div key={label} variants={cardVariants} className="bento-card"
                        style={{ textAlign: 'center', justifyContent: 'center' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>{icon}</div>
                        <div style={{ fontSize: '2.25rem', fontWeight: 800, color }}>{val}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}><TranslatedText text={label}/></div>
                    </motion.div>
                ))}
            </motion.div>

            <motion.div variants={containerVariants} initial="hidden" animate="visible"
                style={{ display: 'grid', gap: '2rem', gridTemplateColumns: currentUserRole === 'SUPER_ADMIN' ? '1fr 2fr' : '1fr' }}>

                {/* Settings panel — admin/school-admin only (NOT super admin who has org-level view) */}
                {currentUserRole === 'SCHOOL_ADMIN' && (
                    <motion.div variants={cardVariants} className="bento-card" style={{ padding: '2rem', alignSelf: 'start' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 8 }}><Settings size={18} /><TranslatedText text={" Organisation Settings"}/></h3>

                        <div className="input-group">
                            <label className="input-label"><TranslatedText text={"Organisation Name"}/></label>
                            <input type="text" className="input-field" value={schoolName}
                                minLength={3} maxLength={100}
                                onChange={e => { isEditingRef.current = true; setSchoolName(e.target.value) }}
                                onBlur={() => { /* keep isEditingRef true until saved */ }}
                                placeholder={translateUi("e.g. SK Taman Maju")} />
                            <div style={{ fontSize:'0.72rem', color:'var(--text-dim)', marginTop:2 }}><TranslatedText text={"Min. 3 characters"}/></div>
                        </div>

                        <div className="input-group">
                            <label className="input-label"><TranslatedText text={"Available Pickup Times"}/></label>
                            <input type="text" className="input-field" value={pickupTimes}
                                onChange={e => { isEditingRef.current = true; setPickupTimes(e.target.value) }} placeholder={translateUi("e.g. 3:00 PM, 4:00 PM")} />
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}><TranslatedText text={"Comma-separated list of times"}/></div>
                        </div>

                        {settingsError && (
                            <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '0.5rem' }}><TranslatedText text={settingsError}/></div>
                        )}

                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            onClick={handleUpdateSettings} className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}><TranslatedText text={" Save Settings "}/></motion.button>
                    </motion.div>
                )}

                {/* System-wide info panel for Super Admin */}
                {currentUserRole === 'SUPER_ADMIN' && (
                    <motion.div variants={cardVariants} className="bento-card" style={{ padding: '2rem', alignSelf: 'start' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Settings size={18} /><TranslatedText text={" System Overview "}/></h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ padding: '1rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--surface-border)' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}><TranslatedText text={"Total Students (all orgs)"}/></div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)' }}>{students.length}</div>
                            </div>
                            <div style={{ padding: '1rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--surface-border)' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}><TranslatedText text={"Active Trips"}/></div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--bus-yellow)' }}>{activeTrips}</div>
                            </div>
                            <div style={{ padding: '1rem', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--surface-border)' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}><TranslatedText text={"Open Emergencies"}/></div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: emergencies.length > 0 ? 'var(--danger)' : 'var(--success)' }}>{emergencies.length}</div>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}><TranslatedText text={" Manage organisations, users, and settings in the respective tabs. "}/></div>
                        </div>
                    </motion.div>
                )}

                {/* Students overview */}
                <motion.div variants={cardVariants} className="bento-card" style={{ padding: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ margin: 0 }}><TranslatedText text={"Students Overview"}/></h3>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <span className="badge badge-success">{presentStudents}<TranslatedText text={" In"}/></span>
                            <span className="badge badge-pending">{students.length - presentStudents}<TranslatedText text={" Out"}/></span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {students.slice(0, 15).map(student => (
                            <motion.div key={student.id} whileHover={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '0.875rem 1rem', background: 'rgba(255,255,255,0.02)',
                                    borderRadius: 10, border: '1px solid var(--surface-border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 36, height: 36, borderRadius: '50%',
                                        background: 'linear-gradient(135deg,#4f46e5,#6366f1)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 700, color: '#fff', fontSize: '0.9rem', flexShrink: 0 }}>
                                        {student.name.charAt(0)}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 500, fontSize: '0.95rem' }}>{student.name}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {student.grade} · <TranslatedText text={student.parentContact1}/>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    {student.isSelfPickup && <span className="badge badge-warning"><TranslatedText text={"Self-Pickup"}/></span>}
                                    <span className={`badge ${student.status === 'CHECKED_OUT' ? 'badge-success' : 'badge-pending'}`}>
                                        <TranslatedText text={student.status.replace('_', ' ')}/>
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                        {students.length === 0 && (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}><TranslatedText text={" No students registered yet. Go to the Students tab to add some. "}/></div>
                        )}
                        {students.length > 15 && (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}><TranslatedText text={" ... and "}/>{students.length - 15}<TranslatedText text={" more. See the Students tab for the full list. "}/></div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </div>
    )
}
