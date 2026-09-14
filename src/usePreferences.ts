import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export const THEME_STORAGE_KEY = 'whoami.theme.v1'

function readTheme(): { theme: Theme; error: boolean } {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY)
    if (value === null || value === 'system') return { theme: 'system', error: false }
    if (value === 'light' || value === 'dark') return { theme: value, error: false }
    return { theme: 'system', error: true }
  } catch { return { theme: 'system', error: true } }
}

export function useTheme() {
  const [initial] = useState(readTheme)
  const [theme, setThemeState] = useState(initial.theme)
  const [error, setError] = useState(initial.error)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const resolvedTheme = theme === 'system' ? systemDark ? 'dark' : 'light' : theme
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const change = () => setSystemDark(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#101724' : '#f7f9fc')
  }, [resolvedTheme])
  const setTheme = (value: Theme) => {
    setThemeState(value)
    try { localStorage.setItem(THEME_STORAGE_KEY, value); setError(false) }
    catch { setError(true) }
  }
  return { theme, setTheme, error }
}

export function useAutoScan(intervalSeconds: number, active: boolean, scan: () => void) {
  const callback = useRef(scan)
  callback.current = scan
  useEffect(() => {
    if (!active || intervalSeconds <= 0) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const available = () => document.visibilityState === 'visible' && navigator.onLine
    const schedule = () => {
      clearTimeout(timer)
      if (available()) timer = setTimeout(() => { if (available()) callback.current() }, intervalSeconds * 1000)
    }
    schedule()
    document.addEventListener('visibilitychange', schedule)
    window.addEventListener('online', schedule)
    window.addEventListener('offline', schedule)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', schedule)
      window.removeEventListener('online', schedule)
      window.removeEventListener('offline', schedule)
    }
  }, [intervalSeconds, active])
}
