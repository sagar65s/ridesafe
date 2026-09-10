'use client'

import { usePathname } from 'next/navigation'
import RideSafeLogo from '@/components/RideSafeLogo'
import { useTranslation } from '@/i18n/provider'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { t } = useTranslation()
  const showPublicHeader = pathname === '/'

  if (pathname === '/parent' || pathname === '/driver') return <>{children}</>
  return (
    <div className="container">
      {showPublicHeader && (
        <nav style={{
          padding:'0.75rem 0', display:'flex', justifyContent:'space-between', alignItems:'center',
          borderBottom:'1px solid #26262C', gap:'0.75rem',
        }}>
          <RideSafeLogo height={38} />
          <div style={{ fontSize:'0.75rem', color:'#6E6E7A', textAlign:'right' }}>
            <div style={{ fontWeight:700, color:'#FFD60A', fontSize:'0.72rem', letterSpacing:'0.1em', textTransform:'uppercase' }}>
              {t('shell.transportManagement')}
            </div>
            <div style={{ marginTop:2, color:'#A6A6B2' }}>{t('shell.trackingSafety')}</div>
          </div>
        </nav>
      )}
      <main>{children}</main>
    </div>
  )
}
