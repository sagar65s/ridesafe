'use client'
import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react'

import en from '@/i18n/en.json'
import ms from '@/i18n/ms.json'
import zh from '@/i18n/zh.json'
import { translateLiteral } from '@/i18n/literal'

type Locale = 'en' | 'ms' | 'zh'
type Translations = typeof en

const translationMap: Record<Locale, Translations> = { en, ms, zh }
const labels: Record<string, string> = { en: 'EN', ms: 'BM', zh: 'ZH' }

interface I18nContextType {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string) => string
  tx: (text: string) => string
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en', setLocale: () => {}, t: (k) => k, tx: (text) => text
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Pre-login default: a local cache with no account tied to it yet, so the
  // login page itself isn't stuck on English. Once a session exists, the
  // account's own saved locale (below) is the source of truth — this
  // prevents one shared browser-wide key from leaking a language change
  // from one logged-in role into a completely different account/session.
  const [locale, setLocaleState] = useState<Locale>('en')
  const userChanged = useRef(false)
  useEffect(() => {
    const saved = localStorage.getItem('ridesafe-locale')
    if (saved === 'en' || saved === 'ms' || saved === 'zh') queueMicrotask(() => { if (!userChanged.current) setLocaleState(saved) })
  }, [])

  useEffect(() => {
    fetch('/api/auth/me').then(r => (r.ok ? r.json() : null)).then(d => {
      if (!userChanged.current && d?.user?.locale && translationMap[d.user.locale as Locale]) {
        setLocaleState(d.user.locale as Locale)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale === 'ms' ? 'ms' : locale === 'zh' ? 'zh-Hans' : 'en'

  }, [locale])

  const setLocale = useCallback((l: Locale) => {
    if (!['en','ms','zh'].includes(l)) return
    userChanged.current = true
    setLocaleState(l)
    if (typeof window !== 'undefined') localStorage.setItem('ridesafe-locale', l)
    // Persist to the logged-in account so it doesn't ride along with the
    // browser into a different role/session. No-ops (401) when logged out.
    fetch('/api/auth/me', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: l }),
    }).catch(() => {})
  }, [])

  const t = useCallback((key: string): string => {
    const parts = key.split('.')
    let result: unknown = translationMap[locale]
    for (const part of parts) {
      result = (result as Record<string, unknown>)?.[part]
      if (result === undefined) {
        // Fallback to English
        let fallback: unknown = translationMap.en
        for (const p of parts) { fallback = (fallback as Record<string, unknown>)?.[p] }
        return (fallback as string) || key
      }
    }
    return result as string
  }, [locale])

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, tx: text => translateLiteral(text, locale) }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useTranslation() {
  return useContext(I18nContext)
}

export function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation()
  return (
    <div style={{ display:'flex', gap:4, background:'var(--surface)', padding:'4px', borderRadius:'10px', border:'1px solid var(--surface-border)' }}>
      {(['en', 'ms', 'zh'] as Locale[]).map(lang => (
        <button key={lang} onClick={() => setLocale(lang)}
          style={{ padding:'5px 10px', fontSize:'0.875rem', fontWeight:700, border:'none', background: locale === lang ? '#FFD60A' : 'transparent', color: locale === lang ? '#08080A' : 'var(--text-muted)', borderRadius:'7px', cursor:'pointer', transition:'all 0.15s ease', letterSpacing:'0.04em' }}>
          {labels[lang]}
        </button>
      ))}
    </div>
  )
}

// Context-driven text stays in React's ownership, including newly mounted dialogs.
export function TranslatedText({text}:{text:string | null | undefined}) {
  const {tx}=useTranslation()
  return text == null ? null : tx(text)
}
