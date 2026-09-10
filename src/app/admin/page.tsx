'use client'

import { useTranslation as useLocaleText } from '@/i18n/provider'
import { TranslatedText } from '@/i18n/provider'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import RideSafeLogo from '@/components/RideSafeLogo'
import OverviewTab from '@/components/admin/OverviewTab'
import AttendanceTab from '@/components/admin/AttendanceTab'
import UsersTab from '@/components/admin/UsersTab'
import StudentsTab from '@/components/admin/StudentsTab'
import FleetTab from '@/components/admin/FleetTab'
import LiveTripsTab from '@/components/admin/LiveTripsTab'
import MessagesTab from '@/components/admin/MessagesTab'
import AnalyticsTab from '@/components/admin/AnalyticsTab'
import MaintenanceTab from '@/components/admin/MaintenanceTab'
import LostFoundTab from '@/components/admin/LostFoundTab'
import AnnouncementsTab from '@/components/admin/AnnouncementsTab'
import TripHistoryTab from '@/components/admin/TripHistoryTab'
import AcademicCalendarTab from '@/components/admin/AcademicCalendarTab'
import OrganizationsTab from '@/components/admin/OrganizationsTab'
import AuditLogsTab from '@/components/admin/AuditLogsTab'
import TransportIssuesTab from '@/components/admin/TransportIssuesTab'
import SystemManagementTab from '@/components/admin/SystemManagementTab'
import { LanguageSwitcher, useTranslation } from '@/i18n/provider'
import { canAccessAdminTab } from '@/lib/roles'
import {
  LogOut, Menu, X,
  LayoutDashboard, Bus, GraduationCap, MapPin, CalendarDays, History,
  Users2, Wrench, Package, Megaphone, TrendingUp, MessageSquare, Bell,
  Building2, ShieldCheck, ClipboardCheck, MessageSquareWarning, ScrollText, Settings2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const HC = {
  bg:         '#102033',
  bgSoft:     '#13283c',
  surface:    '#173147',
  surface2:   '#203d52',
  line:       '#26262C',
  lineStrong: '#3A3A43',
  text:       '#FFFFFF',
  text2:      '#A6A6B2',
  text3:      '#6E6E7A',
  yellow:     '#f9c846',
  onYellow:   '#102033',
  danger:     '#FF453A',
  dangerBg:   'rgba(255,69,58,0.12)',
  r:          '12px',
  pill:       '9999px',
}

type SidebarGroup = { label: string; items: { id: string; icon: LucideIcon; label: string }[] }
type SearchEntry = { id: string; label: string; detail: string; tab: string }

function buildSidebarGroups(t: (k: string) => string): SidebarGroup[] {
  return [
    {
      label: t('admin.operations'),
      items: [
        { id: 'OVERVIEW',    icon: LayoutDashboard, label: t('nav.overview') },
        { id: 'FLEET',       icon: Bus,             label: t('nav.fleet') },
        { id: 'STUDENTS',    icon: GraduationCap,   label: t('nav.students') },
        { id: 'ATTENDANCE',  icon: ClipboardCheck,  label: t('nav.attendance') },
        { id: 'LIVETRIPS',   icon: MapPin,          label: t('nav.liveTrips') },
        { id: 'HISTORY',     icon: History,         label: t('nav.history') },
      ],
    },
    {
      label: t('admin.management'),
      items: [
        { id: 'USERS',         icon: Users2,    label: t('nav.users') },
        { id: 'MAINTENANCE',   icon: Wrench,    label: t('nav.maintenance') },
        { id: 'LOSTFOUND',     icon: Package,   label: t('nav.lostFound') },
        { id: 'ANNOUNCEMENTS', icon: Megaphone, label: t('nav.announcements') },
        { id: 'CALENDAR', icon: CalendarDays, label: t('admin.calendar') },
        { id: 'SETTINGS', icon: Settings2, label: 'School Settings' },
        { id: 'AUDIT', icon: ScrollText, label: 'Audit Logs' },
        { id: 'ISSUES',        icon: MessageSquareWarning, label: 'Transport Issues' },
      ],
    },
    {
      label: t('admin.intelligence'),
      items: [
        { id: 'ANALYTICS', icon: TrendingUp,    label: t('nav.analytics') },
        { id: 'MESSAGES',  icon: MessageSquare, label: t('nav.messages') },
      ],
    },
  ]
}

function SidebarItem({ icon: Icon, label, active, onClick }: {
  icon: LucideIcon; label: string; active: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: HC.r,
        cursor: 'pointer', width: '100%', textAlign: 'left',
        fontWeight: 600, fontSize: 13.5, border: 'none',
        color: active ? HC.onYellow : HC.text2,
        background: active ? HC.yellow : 'transparent',
        transition: 'background 0.15s ease, color 0.15s ease',
        fontFamily: 'inherit',
      }}
    >
      <Icon size={16} style={{ flexShrink: 0 }} />
      <TranslatedText text={label}/>
    </button>
  )
}

export default function AdminDashboard() {
 const {tx:translateUi}=useLocaleText()

  const [activeTab, setActiveTab]             = useState('OVERVIEW')
  const [searchQuery, setSearchQuery]         = useState('')
  const [currentUserRole, setCurrentUserRole] = useState<string>('')
  const [userName, setUserName]               = useState<string>('')
  const [loading, setLoading]                 = useState(true)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [loggingOut, setLoggingOut]           = useState(false)
  const [sidebarOpen, setSidebarOpen]         = useState(false)
  const [isMobile, setIsMobile]               = useState(false)
  const [entitySearchEntries, setEntitySearchEntries] = useState<SearchEntry[]>([])
  const router = useRouter()
  const { t } = useTranslation()

  const SIDEBAR_GROUPS = buildSidebarGroups(t)
    .map(group => ({ ...group, items: group.items.filter(item => canAccessAdminTab(currentUserRole, item.id)) }))
    .filter(group => group.items.length > 0)
  const TAB_LABELS: Record<string, string> = {
    OVERVIEW: t('nav.overview'), FLEET: t('nav.fleet'), STUDENTS: t('nav.students'),
    ATTENDANCE: t('nav.attendance'),
    LIVETRIPS: t('nav.liveTrips'), HISTORY: t('nav.history'),
    USERS: t('nav.users'), MAINTENANCE: t('nav.maintenance'), LOSTFOUND: t('nav.lostFound'),
    ANNOUNCEMENTS: t('nav.announcements'), ANALYTICS: t('nav.analytics'),
    MESSAGES: t('nav.messages'), CALENDAR: t('admin.calendar'),
    ORGANIZATIONS: t('admin.organizations'), ISSUES: 'Transport Issues', AUDIT: 'Audit Logs', SETTINGS: 'System Management',
  }
  const SUPER_ADMIN_ITEMS: { id: string; icon: LucideIcon; label: string }[] = [
    { id: 'ORGANIZATIONS', icon: Building2,   label: t('admin.organizations') },
    { id: 'SUPERUSERS',    icon: ShieldCheck, label: t('admin.allUsers') },
  ]

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => { if (!res.ok) throw new Error('Unauthorized'); return res.json() })
      .then(data => {
        const role = data.user?.role || ''
        if (!['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'].includes(role)) {
          router.replace(role === 'DRIVER' ? '/driver' : role === 'PARENT' ? '/parent' : '/')
          return
        }
        setCurrentUserRole(role)
        setUserName(data.user?.name || 'Admin')
        setLoading(false)
        Promise.all([
          fetch('/api/students').then(r => r.ok ? r.json() : { students: [] }),
          fetch('/api/admin/users').then(r => r.ok ? r.json() : { users: [] }),
          fetch('/api/admin/buses').then(r => r.ok ? r.json() : { buses: [] }),
          fetch('/api/admin/routes').then(r => r.ok ? r.json() : { routes: [] }),
        ]).then(([studentData, userData, busData, routeData]) => {
          setEntitySearchEntries([
            ...(studentData.students || []).map((s: { id:string; name:string; grade?:string; route?:{name:string} }) => ({ id:s.id, label:s.name, detail:`Student · ${s.grade || ''} ${s.route?.name || ''}`.trim(), tab:'STUDENTS' })),
            ...(userData.users || []).map((u: { id:string; name:string; email:string; role:string }) => ({ id:u.id, label:u.name, detail:`${u.role.replaceAll('_',' ')} · ${u.email}`, tab:'USERS' })),
            ...(busData.buses || []).map((b: { id:string; plateNumber:string; driver?:{name:string} }) => ({ id:b.id, label:b.plateNumber, detail:`Bus · ${b.driver?.name || 'Unassigned'}`, tab:'FLEET' })),
            ...(routeData.routes || []).map((r: { id:string; name:string }) => ({ id:r.id, label:r.name, detail:'Route', tab:'FLEET' })),
          ])
        }).catch(() => setEntitySearchEntries([]))
      })
      .catch(() => router.push('/'))
  }, [router])

  const handleLogout = async () => {
    setLoggingOut(true)
    await fetch('/api/auth/me', { method: 'POST' })
    router.push('/')
  }

  const handleNavClick = (id: string) => {
    if (!canAccessAdminTab(currentUserRole, id)) return
    setActiveTab(id)
    setSearchQuery('')
    if (isMobile) setSidebarOpen(false)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1rem' }}>
      <div style={{ width: 28, height: 28, border: `3px solid ${HC.yellow}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <span style={{ color: HC.text2, fontSize: '0.95rem' }}>{t('admin.loadingDashboard')}</span>
    </div>
  )

  const now = new Date()
  const dateLabel = now.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })
  const initials = userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const navigationSearchEntries: SearchEntry[] = [
    ...SIDEBAR_GROUPS.flatMap(group => group.items),
    ...(currentUserRole === 'SUPER_ADMIN' ? SUPER_ADMIN_ITEMS : []),
  ].map(item => ({ id:`nav-${item.id}`, label:item.label, detail:'Page', tab:item.id }))
  const searchResults = normalizedSearch
    ? [...navigationSearchEntries, ...entitySearchEntries].filter(entry => `${entry.label} ${entry.detail}`.toLowerCase().includes(normalizedSearch)).slice(0, 10)
    : []

  const sidebarContent = (
    <>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 14px 20px', borderBottom: `1px solid ${HC.line}`, marginBottom: 8 }}>
        <RideSafeLogo height={28} />
        {isMobile && (
          <button onClick={() => setSidebarOpen(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: HC.text3, cursor: 'pointer', display: 'flex', padding: 4 }}>
            <X size={18} />
          </button>
        )}
      </div>

      {/* SUPER_ADMIN section */}
      {currentUserRole === 'SUPER_ADMIN' && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', color: HC.yellow, padding: '8px 14px 6px', textTransform: 'uppercase', opacity: 0.85 }}><TranslatedText text={" Super Admin "}/></div>
          {SUPER_ADMIN_ITEMS.map(item => (
            <SidebarItem key={item.id} icon={item.icon} label={item.label} active={activeTab === item.id} onClick={() => handleNavClick(item.id)} />
          ))}
          <div style={{ height: 1, background: HC.line, margin: '8px 14px' }} />
        </div>
      )}

      {/* Nav groups */}
      {SIDEBAR_GROUPS.map(group => (
        <div key={group.label} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.14em', color: HC.text3, padding: '8px 14px 6px', textTransform: 'uppercase' }}>
            <TranslatedText text={group.label}/>
          </div>
          {group.items.map(item => (
            <SidebarItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activeTab === item.id}
              onClick={() => handleNavClick(item.id)}
            />
          ))}
        </div>
      ))}

      {/* User card */}
      <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: `1px solid ${HC.line}` }}>
        {isMobile && <div style={{ marginBottom:12 }}><LanguageSwitcher /></div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: HC.r, background: HC.surface }}>
          <span style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #FFD60A, #F5A623)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, color: HC.onYellow, fontSize: 13,
          }}><TranslatedText text={initials}/></span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: HC.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><TranslatedText text={userName}/></div>
            <div style={{ fontSize: 11, color: HC.text3 }}><TranslatedText text={currentUserRole.replace(/_/g, ' ')}/></div>
          </div>
        </div>
      </div>
    </>
  )

  return (
    <div style={{ margin: '-2rem -2rem -2rem', height: '100vh', display: 'flex', background: HC.bg, overflow: 'hidden' }}>

      {/* Mobile overlay */}
      <AnimatePresence>
        {isMobile && sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 998, backdropFilter: 'blur(2px)' }}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar ── */}
      <div style={{
        width: 240, flexShrink: 0,
        borderRight: `1px solid ${HC.line}`,
        background: HC.bgSoft,
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
        padding: '20px 14px',
        height: '100%',
        // Mobile: fixed slide-out drawer
        ...(isMobile ? {
          position: 'fixed' as const,
          top: 0, left: 0, bottom: 0, zIndex: 999,
          height: '100vh',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)',
          boxShadow: sidebarOpen ? '4px 0 24px rgba(0,0,0,0.5)' : 'none',
        } : {}),
      }}>
        {sidebarContent}
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Top header bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16,
          padding: isMobile ? '14px 16px' : '18px 28px',
          borderBottom: `1px solid ${HC.line}`,
          background: HC.bgSoft,
          flexShrink: 0,
        }}>
          {/* Hamburger on mobile */}
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(true)}
              style={{ background: 'none', border: 'none', color: HC.text2, cursor: 'pointer', display: 'flex', padding: 6, borderRadius: 8, flexShrink: 0 }}
              aria-label={translateUi("Open menu")}
            >
              <Menu size={22} />
            </button>
          )}

          {/* Title */}
          <div style={{ minWidth: 0 }}>
            {!isMobile && (
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: HC.yellow }}><TranslatedText text={" Live · "}/><TranslatedText text={dateLabel}/>
              </div>
            )}
            <h2 style={{
              fontFamily: 'var(--font-sora, Sora, system-ui)',
              fontSize: isMobile ? 17 : 21, fontWeight: 700, color: HC.text,
              letterSpacing: '-0.025em', marginTop: isMobile ? 0 : 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              <TranslatedText text={TAB_LABELS[activeTab] || activeTab}/>
            </h2>
          </div>

          {/* Global search: pages and tenant-scoped users/students/buses/routes. */}
          <div style={{ position:'relative', marginLeft: 'auto', width:isMobile ? 'min(42vw, 180px)' : 260 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 14px',
                background: HC.surface, border: `1px solid ${HC.line}`,
                borderRadius: HC.pill, width:'100%',
              }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={HC.text3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                </svg>
                <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={t('common.search')}
                    aria-label={t('common.search')}
                    style={{ minWidth:0, flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: HC.text, fontFamily: 'inherit' }}
                  />
              </div>
              {normalizedSearch && (
                <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, zIndex:1200, width:isMobile ? 280 : 360, maxWidth:'calc(100vw - 32px)', maxHeight:360, overflowY:'auto', padding:8, background:HC.surface, border:`1px solid ${HC.lineStrong}`, borderRadius:14, boxShadow:'0 18px 50px rgba(0,0,0,.55)' }}>
                  {searchResults.map(result => (
                    <button key={`${result.tab}-${result.id}`} onClick={() => { setActiveTab(result.tab); if (isMobile) setSidebarOpen(false) }}
                      style={{ width:'100%', border:0, background:'transparent', color:HC.text, padding:'10px 12px', borderRadius:9, cursor:'pointer', textAlign:'left', fontFamily:'inherit' }}>
                      <div style={{ fontWeight:700, fontSize:13 }}><TranslatedText text={result.label}/></div>
                      <div style={{ color:HC.text3, fontSize:11.5, marginTop:2 }}><TranslatedText text={result.detail}/> · <TranslatedText text={TAB_LABELS[result.tab] || result.tab}/></div>
                    </button>
                  ))}
                  {searchResults.length === 0 && <div style={{ padding:'14px 12px', color:HC.text3, fontSize:13 }}>{t('common.noData')}</div>}
                </div>
              )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: isMobile ? 'auto' : 0 }}>
            {!isMobile && <LanguageSwitcher />}
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
              onClick={() => setShowLogoutConfirm(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: isMobile ? 0 : 7,
                padding: isMobile ? '8px' : '9px 16px',
                borderRadius: isMobile ? '50%' : HC.pill,
                background: HC.dangerBg, color: HC.danger,
                border: `1px solid rgba(255,69,58,0.22)`,
                fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit',
                width: isMobile ? 36 : 'auto', height: isMobile ? 36 : 'auto',
                justifyContent: 'center',
              }}
              title={translateUi("Logout")}
            >
              <LogOut size={isMobile ? 16 : 15} />
              {!isMobile && t('common.logout')}
            </motion.button>
          </div>
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobile ? '16px' : '24px 28px' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
            >
              {activeTab === 'OVERVIEW'      && <OverviewTab currentUserRole={currentUserRole} />}
              {activeTab === 'ANALYTICS'     && <AnalyticsTab />}
              {activeTab === 'USERS'         && <UsersTab searchQuery={searchQuery} />}
              {activeTab === 'STUDENTS'      && <StudentsTab searchQuery={searchQuery} />}
              {activeTab === 'ATTENDANCE'    && <AttendanceTab />}
              {activeTab === 'FLEET'         && <FleetTab searchQuery={searchQuery} />}
              {activeTab === 'LIVETRIPS'     && <LiveTripsTab />}
              {activeTab === 'HISTORY'       && <TripHistoryTab />}
              {activeTab === 'MAINTENANCE'   && <MaintenanceTab />}
              {activeTab === 'LOSTFOUND'     && <LostFoundTab />}
              {activeTab === 'ANNOUNCEMENTS' && <AnnouncementsTab />}
              {activeTab === 'MESSAGES'       && <MessagesTab />}
              {activeTab === 'CALENDAR'       && <AcademicCalendarTab currentRole={currentUserRole} />}
              {activeTab === 'ORGANIZATIONS'  && <OrganizationsTab />}
              {activeTab === 'SUPERUSERS'     && <UsersTab superAdminView searchQuery={searchQuery} />}
              {activeTab === 'ISSUES'         && <TransportIssuesTab />}
              {activeTab === 'AUDIT'          && <AuditLogsTab />}
              {activeTab === 'SETTINGS'       && <SystemManagementTab schoolScoped={currentUserRole === 'SCHOOL_ADMIN'} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Logout confirmation modal ── */}
      <AnimatePresence>
        {showLogoutConfirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
            onClick={e => { if (e.target === e.currentTarget) setShowLogoutConfirm(false) }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0 }}
              style={{ background: HC.surface, border: `1px solid ${HC.line}`, borderRadius: '20px', padding: '2rem', maxWidth: 380, width: '100%', textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}
            >
              <div style={{ width: 54, height: 54, borderRadius: '50%', background: HC.dangerBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
                <LogOut size={24} color={HC.danger} />
              </div>
              <h3 style={{ fontFamily: 'var(--font-sora, Sora, system-ui)', fontSize: 20, marginBottom: '0.5rem', color: HC.text }}>{t('common.confirm')} {t('common.logout')}</h3>
              <p style={{ color: HC.text2, fontSize: 14, marginBottom: '1.75rem', lineHeight: 1.55 }}>
                {t('admin.logoutQuestion')}
              </p>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  style={{ flex: 1, padding: '11px', borderRadius: HC.pill, background: HC.surface2, border: `1px solid ${HC.line}`, color: HC.text, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
                  onClick={() => setShowLogoutConfirm(false)}
                  disabled={loggingOut}
                >
                  {t('common.cancel')}
                </button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  style={{ flex: 1, padding: '11px', borderRadius: HC.pill, background: HC.danger, color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  <TranslatedText text={loggingOut ? t('common.loading') : t('common.logout')}/>
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
