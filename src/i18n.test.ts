import { describe, expect, it, vi } from 'vitest'
import {
  catalogs, createI18n, detectLanguage, en, de, LANGUAGE_STORAGE_KEY,
  readLanguagePreference, saveLanguagePreference, type Language, type TranslationKey,
} from './i18n'

describe('bilingual catalog', () => {
  it('covers the same semantic keys, plural forms, and interpolation values', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort())
    const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    for (const key of Object.keys(en) as TranslationKey[]) {
      const english = en[key]
      const german = de[key]
      expect(typeof german, key).toBe(typeof english)
      const englishForms = typeof english === 'string' ? [english] : [english.one, english.other]
      const germanForms = typeof german === 'string' ? [german] : [german.one, german.other]
      englishForms.forEach((form, index) => {
        expect(germanForms[index].trim().length, key).toBeGreaterThan(0)
        expect(placeholders(germanForms[index]), key).toEqual(placeholders(form))
      })
    }
  })

  it('interpolates strings and locale-formatted numbers without interpreting inserted braces', () => {
    expect(createI18n('en').t('scan.httpChecks', { completed: 1200, planned: 2400 })).toBe('1,200 / 2,400 HTTP checks')
    expect(createI18n('de').t('scan.httpChecks', { completed: 1200, planned: 2400 })).toBe('1.200 / 2.400 HTTP-Prüfungen')
    expect(createI18n('de').t('connection.observedPublic', { family: 'IPv6' })).toBe('Deine erkannte öffentliche IPv6-Adresse')
    expect(createI18n('de').t('error.unknown', { detail: 'Failure {count} $&' })).toContain('Failure {count} $&')
  })

  it.each([
    ['en', 0, '0 sources'], ['en', 1, '1 source'], ['en', 2, '2 sources'],
    ['de', 0, '0 Quellen'], ['de', 1, '1 Quelle'], ['de', 2, '2 Quellen'],
    ['de', 1.5, '1,5 Quellen'],
  ] as const)('selects %s plural for %s', (language, count, expected) => {
    expect(createI18n(language).t('common.sources', { count })).toBe(expected)
  })

  it('localizes observation and summary plurals', () => {
    expect(createI18n('de').t('address.observations', { count: 1 })).toBe('1 Beobachtung')
    expect(createI18n('de').t('scan.addressesSummary', { count: 2 })).toBe('öffentliche Adressen in diesem Scan')
    expect(createI18n('en').t('diagnostics.unavailable', { count: 1 })).toBe('1 check unavailable')
  })
})

describe('language preferences', () => {
  it.each([
    [['fr-FR', 'de-AT', 'en-US'], 'de'],
    [['en-GB', 'de-DE'], 'en'],
    [['de-CH', 'en-US'], 'de'],
    [['DE_de'], 'de'],
    [['fr-FR', 'ja-JP'], 'en'],
    [['den', 'english', 'deutsch'], 'en'],
    [[], 'en'],
  ] as [string[], Language][])('detects the first supported language in %j', (languages, expected) => {
    expect(detectLanguage(languages)).toBe(expected)
  })

  it('prefers an explicit saved choice and ignores unsupported saved values', () => {
    expect(readLanguagePreference({ getItem: () => 'en' }, ['de-DE'])).toEqual({ language: 'en', storageWarning: false })
    expect(readLanguagePreference({ getItem: () => 'fr' }, ['de-DE'])).toEqual({ language: 'de', storageWarning: false })
    expect(readLanguagePreference({ getItem: () => null }, ['de-DE'])).toEqual({ language: 'de', storageWarning: false })
  })

  it('surfaces denied or absent storage instead of silently ignoring it', () => {
    const denied = { getItem: () => { throw new Error('Access denied') } }
    expect(readLanguagePreference(denied, ['de-DE'])).toEqual({ language: 'de', storageWarning: true })
    expect(readLanguagePreference(null, ['en-US'])).toEqual({ language: 'en', storageWarning: true })
    expect(saveLanguagePreference({ setItem: () => { throw new Error('Quota exceeded') } }, 'de')).toBe(false)
    expect(saveLanguagePreference(null, 'en')).toBe(false)
    expect(createI18n('de').t('language.storageWarning')).toContain('nicht gelesen oder gespeichert')
  })

  it('reads and writes only the non-sensitive language preference', () => {
    const getItem = vi.fn(() => null)
    const setItem = vi.fn()
    readLanguagePreference({ getItem }, ['en'])
    expect(getItem).toHaveBeenCalledExactlyOnceWith(LANGUAGE_STORAGE_KEY)
    expect(saveLanguagePreference({ setItem }, 'de')).toBe(true)
    expect(setItem).toHaveBeenCalledExactlyOnceWith('whoami.language.v1', 'de')
  })
})

describe('locale-bound time and number formatting', () => {
  const iso = '2026-09-14T15:04:05.000Z'
  it.each(['en', 'de'] as const)('formats %s times and dates with the active locale', (language) => {
    const formatters = createI18n(language)
    const locale = language === 'en' ? 'en-US' : 'de-DE'
    expect(formatters.formatTime(iso, { timeZone: 'UTC' })).toBe(new Intl.DateTimeFormat(locale, {
      hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC',
    }).format(new Date(iso)))
    expect(formatters.formatDateTime(iso, { timeZone: 'UTC' })).toBe(new Intl.DateTimeFormat(locale, {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC',
    }).format(new Date(iso)))
    expect(formatters.formatTime(new Date(iso), { timeZone: 'UTC' })).toBe(formatters.formatTime(Date.parse(iso), { timeZone: 'UTC' }))
  })

  it('changes locale formatting without changing the underlying timestamp', () => {
    expect(createI18n('en').formatDateTime(iso, { timeZone: 'UTC' })).not.toBe(createI18n('de').formatDateTime(iso, { timeZone: 'UTC' }))
    expect(createI18n('en').formatNumber(1234.5)).toBe('1,234.5')
    expect(createI18n('de').formatNumber(1234.5)).toBe('1.234,5')
    expect(createI18n('de').formatNumber(1, { minimumIntegerDigits: 2 })).toBe('01')
  })

  it.each(['', 'not-a-date', NaN, Infinity, new Date(NaN)])('handles invalid dates (%s) without throwing', (value) => {
    expect(createI18n('en').formatTime(value)).toBe('Not available')
    expect(createI18n('de').formatDateTime(value)).toBe('Nicht verfügbar')
  })

  it('handles invalid numeric values', () => {
    expect(createI18n('de').formatNumber(NaN)).toBe('Nicht verfügbar')
    expect(createI18n('en').formatNumber(Infinity)).toBe('Not available')
  })
})

describe('canonical sources and diagnostics', () => {
  it('translates source descriptors without changing real provider names or protocols', () => {
    expect(createI18n('en').formatSource('This server')).toBe('This server')
    expect(createI18n('de').formatSource('This server')).toBe('Dieser Server')
    expect(createI18n('de').formatSource('ipify · Dual stack')).toBe('ipify · Dual-Stack')
    expect(createI18n('de').formatSource('Dual stack')).toBe('Dual-Stack')
    for (const source of ['ipify · IPv4', 'icanhazip · IPv6', 'WebRTC · STUN', 'Actual Provider', 'This server hosting']) {
      expect(createI18n('de').formatSource(source)).toBe(source)
    }
  })

  it('translates all canonical discovery and lookup messages', () => {
    for (const key of Object.keys(en).filter((key) => key.startsWith('error.')) as TranslationKey[]) {
      const message = en[key]
      if (typeof message !== 'string' || message.includes('{')) continue
      expect(createI18n('en').formatDiagnostic(message)).toBe(message)
      expect(createI18n('de').formatDiagnostic(message)).toBe(catalogs.de[key])
    }
  })

  it('handles parameterized HTTP, family, and provider lookup errors', () => {
    expect(createI18n('de').formatDiagnostic('HTTP 429')).toBe('HTTP 429')
    expect(createI18n('de').formatDiagnostic('Expected an IPv6 address.')).toBe('Eine IPv6-Adresse wurde erwartet.')
    expect(createI18n('de').formatDiagnostic('Location lookup unavailable (HTTP 503). Try again later.')).toBe('Standortabfrage nicht verfügbar (HTTP 503). Versuche es später erneut.')
    expect(createI18n('en').formatDiagnostic('Location lookup unavailable (HTTP 503). Try again later.')).toBe('Location lookup unavailable (HTTP 503). Try again later.')
  })

  it('preserves unknown technical detail behind a localized fallback', () => {
    const diagnostic = 'OperationError: ICE transport refused'
    expect(createI18n('de').formatDiagnostic(diagnostic)).toBe(`Die Prüfung konnte nicht abgeschlossen werden. Versuche es erneut. Technische Details: ${diagnostic}`)
    expect(createI18n('en').formatDiagnostic(diagnostic)).toContain('Technical details: OperationError')
    expect(createI18n('de').formatDiagnostic(undefined)).toBe('')
    expect(createI18n('en').formatDiagnostic('')).toBe('')
  })
})
