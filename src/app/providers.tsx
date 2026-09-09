'use client'
import { LanguageProvider } from '@/i18n/provider'
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar'

export default function Providers({ children }: { children: React.ReactNode }) {
  return <LanguageProvider><ServiceWorkerRegistrar />{children}</LanguageProvider>
}
