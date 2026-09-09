import type { Metadata } from 'next'
import './globals.css'
import Providers from './providers'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = {
  title: 'RideSafe — Transport Management System',
  description: 'Real-time transport management, attendance, and parent notifications — all in one place.',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/ridesafe-mark.svg', type: 'image/svg+xml' }],
    apple: '/ridesafe-mark.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ background: '#08080A' }}>
        <Providers><AppShell>{children}</AppShell></Providers>
      </body>
    </html>
  )
}
