import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown,
  CircleHelp, Copy, Eye, EyeOff, Globe2, Info, Laptop, LocateFixed, Network,
  Radio, RefreshCw, ScanLine, Settings2, ShieldCheck, SlidersHorizontal, Square, Tag, Wifi, X,
} from 'lucide-react'
import {
  discover, discoverWebRtc, ENDPOINTS, lookupIp,
  type Address, type IpDetails, type ProbeResult,
} from './discovery'
import { demoData } from './demo'
import { useI18n, type TranslationKey } from './i18n'
import { createSnapshot } from './history'
import { useNotebook } from './useNotebook'
import { useAutoScan, useTheme } from './usePreferences'
import { featureText, type FeatureKey } from './featureMessages'
import { HistoryPanel, NameEditor, SettingsPanel, storageErrorText } from './FeaturePanels'

const masked = (family: string) => family === 'IPv4' ? '•••.•••.•••.•••' : '••••:••••:••••::••••'
type ConnectionInfo = { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean; addEventListener?: (type: string, listener: () => void) => void; removeEventListener?: (type: string, listener: () => void) => void }

function useEnvironment() {
  const read = () => {
    const connection = 'connection' in navigator ? navigator.connection as ConnectionInfo | undefined : undefined
    return {
      online: navigator.onLine,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      secure: window.isSecureContext,
      estimate: connection?.effectiveType?.toUpperCase(),
      saveData: connection?.saveData,
    }
  }
  const [environment, setEnvironment] = useState(read)
  useEffect(() => {
    const update = () => setEnvironment(read())
    const connection = 'connection' in navigator ? navigator.connection as ConnectionInfo | undefined : undefined
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    connection?.addEventListener?.('change', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
      connection?.removeEventListener?.('change', update)
    }
  }, [])
  return environment
}

function RouteDiagram({ addresses, running }: { addresses: Address[]; running: boolean }) {
  const { t } = useI18n()
  const nodes = addresses.slice(0, 3)
  return <div className={`route-diagram ${running ? 'is-scanning' : ''}`} aria-label={t('diagram.label', { count: addresses.length })}>
    <div className="diagram-caption"><span className="tiny-dot" />{t('diagram.paths')}<span>{t('diagram.notPhysical')}</span></div>
    <svg className="route-lines" viewBox="0 0 420 220" aria-hidden="true">
      <path d="M94 110 H145 Q163 110 163 91 V55 Q163 36 186 36 H240" />
      <path d="M94 110 H240" />
      <path d="M94 110 H145 Q163 110 163 129 V165 Q163 184 186 184 H240" />
      <circle cx="163" cy="110" r="5" />
    </svg>
    <div className="browser-node"><div><Laptop size={27} strokeWidth={1.6} /></div><strong>{t('diagram.browser')}</strong><span>{t('diagram.visibility')}</span></div>
    {[0, 1, 2].map((index) => <div className={`path-node path-${index} ${nodes[index] ? 'observed' : ''}`} key={index}>
      <span className="path-dot">{nodes[index] ? <Check size={13} /> : <span />}</span>
      <div><strong>{nodes[index] ? t('diagram.publicFamily', { family: nodes[index].family }) : t(running ? 'diagram.looking' : 'diagram.noOther')}</strong>
        <span>{nodes[index] ? t('diagram.evidence', { count: nodes[index].sources.length, index: index + 1 }) : 'IPv4 / IPv6'}</span>
      </div>
    </div>)}
    {addresses.length > 3 && <span className="more-paths">{t('diagram.more', { count: addresses.length - 3 })}</span>}
  </div>
}

function AddressRow({ address, index, current, hidden, demo, onCopy, name, onName }: {
  address: Address; index: number; current: boolean; hidden: boolean; demo: boolean; onCopy: (text: string) => void;
  name: string; onName: (ip: string, name: string) => boolean;
}) {
  const { language, t, formatTime, formatNumber, formatSource, formatDiagnostic } = useI18n()
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState<IpDetails>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const controller = useRef<AbortController | null>(null)
  const metadata = (value: string) => value === 'Not provided' ? t('common.notProvided') : value
  useEffect(() => () => controller.current?.abort(), [])
  const lookup = async () => {
    if (demo) {
      setDetails({ provider: 'Example Broadband', asn: 'Example ASN', location: 'Example location (demo)', timezone: 'Europe/Berlin (example)' })
      return
    }
    const request = new AbortController()
    controller.current = request
    setLoading(true)
    setError('')
    const timer = setTimeout(() => request.abort(), 8000)
    try { setDetails(await lookupIp(address.ip, request.signal)) }
    catch (cause) { setError(request.signal.aborted ? 'Lookup timed out. Please try again.' : cause instanceof TypeError ? 'Location service unreachable or blocked. Please try again later.' : cause instanceof Error ? cause.message : 'Lookup unavailable. Please try again.') }
    finally { clearTimeout(timer); setLoading(false) }
  }
  return <div className={`address-entry ${open ? 'expanded' : ''}`}>
    <div className="address-row">
      <span className={`address-icon ${address.family === 'IPv6' ? 'ipv6-icon' : ''}`}><Globe2 size={21} /></span>
      <div className="address-main">
        <div className="address-label"><span className={name ? 'custom-name' : ''}>{name || t('address.label', { index: formatNumber(index + 1, { minimumIntegerDigits: 2 }) })}</span><span className={`family-tag ${address.family === 'IPv6' ? 'v6' : ''}`}>{address.family}</span>{!current && <span className="earlier-tag">{t('address.earlier')}</span>}</div>
        <span className="address-value">{hidden ? masked(address.family) : address.ip}</span>
        <span className="address-sources">{address.sources.map(formatSource).join(' · ')}</span>
      </div>
      <div className="address-confirmation"><span><span className={`tiny-dot ${current ? 'green' : 'gray'}`} />{t(current ? 'common.observed' : 'address.previouslySeen')}</span><small>{t('address.observations', { count: address.observations })}</small></div>
      <button className="icon-button" onClick={() => onCopy(address.ip)} aria-label={t('address.copyNumber', { index: index + 1 })} title={t('address.copy')}><Copy size={17} /></button>
      <button className="icon-button expand-button" onClick={() => setOpen(!open)} aria-label={t(open ? 'address.hideDetails' : 'address.showDetails', { index: index + 1 })} aria-expanded={open} aria-controls={`address-details-${index}`}><ChevronDown size={18} /></button>
    </div>
    {open && <div className="address-details" id={`address-details-${index}`}>
      <dl className="observation-details"><div><dt>{t('address.firstSeen')}</dt><dd>{formatTime(address.firstSeen)}</dd></div><div><dt>{t('address.lastSeen')}</dt><dd>{formatTime(address.lastSeen)}</dd></div><div><dt>{t('address.evidence')}</dt><dd>{t('address.distinctSources', { count: address.sources.length })}</dd></div></dl>
      <NameEditor ip={address.ip} name={name} language={language} onSave={onName} />
      {details ? <dl className="location-details"><div><dt>{t('address.networkAsn')}</dt><dd>{demo ? t('demo.provider') : metadata(details.provider)} · {demo ? t('demo.asn') : metadata(details.asn)}</dd></div><div><dt>{t('address.location')}</dt><dd>{demo ? t('demo.location') : metadata(details.location)}</dd></div><div><dt>{t('address.timezone')}</dt><dd>{demo ? t('demo.timezone') : metadata(details.timezone)}</dd></div></dl> : <div className="lookup-prompt"><div><strong>{t('address.moreContext')}</strong><p>{t('address.lookupDescription')}</p></div><button className="button small secondary" onClick={lookup} disabled={loading}><LocateFixed size={15} />{t(loading ? 'address.lookingUp' : 'address.lookup')}</button></div>}
      {error && <p className="inline-error" role="alert">{formatDiagnostic(error)}</p>}
    </div>}
  </div>
}

export default function App() {
  const { language, setLanguage, storageWarning, t, formatTime, formatNumber, formatSource, formatDiagnostic } = useI18n()
  const [demo, setDemo] = useState(() => new URLSearchParams(window.location.search).get('demo') === '1')
  const notebook = useNotebook(demo)
  const { addresses, history, labels } = notebook
  const { theme, setTheme, error: themeError } = useTheme()
  const f = (key: FeatureKey, values: Record<string, string | number> = {}) => featureText(language, key, values)
  const [results, setResults] = useState<ProbeResult[]>([])
  const [running, setRunning] = useState(false)
  const [scanId, setScanId] = useState(-1)
  const [finishedAt, setFinishedAt] = useState('')
  const [stopped, setStopped] = useState(false)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [deepScan, setDeepScan] = useState(false)
  const [webRtc, setWebRtc] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [toast, setToast] = useState<TranslationKey | ''>('')
  const [featureToast, setFeatureToast] = useState<FeatureKey | null>(null)
  const [autoScan, setAutoScan] = useState(0)
  const [filter, setFilter] = useState<'all' | 'IPv4' | 'IPv6'>('all')
  const [plannedChecks, setPlannedChecks] = useState(ENDPOINTS.length)
  const abort = useRef<AbortController | null>(null)
  const sequence = useRef(0)
  const environment = useEnvironment()

  const startScan = async (fromDemo = false, automatic = false) => {
    if (new URLSearchParams(window.location.search).has('demo')) {
      const url = new URL(window.location.href)
      url.searchParams.delete('demo')
      window.history.replaceState(null, '', url)
    }
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    const id = ++sequence.current
    setScanId(id)
    setDemo(false)
    if (fromDemo) setFilter('all')
    setResults([])
    setFinishedAt('')
    setStopped(false)
    setRunning(true)
    const startedAt = new Date().toISOString()
    const rounds = !automatic && deepScan ? 3 : 1
    const includeWebRtc = !automatic && webRtc
    const scanResults: ProbeResult[] = []
    setPlannedChecks(ENDPOINTS.length * rounds)
    const receive = (result: ProbeResult) => {
      if (controller.signal.aborted || sequence.current !== id) return
      scanResults.push(result)
      setResults((previous) => [...previous, result])
      notebook.recordResult(result, id)
    }
    await Promise.all([
      discover(controller.signal, rounds, receive),
      includeWebRtc ? discoverWebRtc(controller.signal, receive) : Promise.resolve(),
    ])
    if (sequence.current === id) {
      setRunning(false)
      const finishedAt = new Date().toISOString()
      setFinishedAt(finishedAt)
      setStopped(controller.signal.aborted)
      notebook.recordScan(createSnapshot(scanResults, {
        startedAt, finishedAt, mode: automatic ? 'automatic' : rounds === 3 ? 'deep' : 'quick',
        webRtc: includeWebRtc, stopped: controller.signal.aborted,
      }))
    }
  }

  const showDemo = () => {
    const url = new URL(window.location.href)
    url.searchParams.set('demo', '1')
    window.history.replaceState(null, '', url)
    abort.current?.abort()
    const id = ++sequence.current
    const data = demoData()
    setScanId(id)
    setDemo(true)
    setAutoScan(0)
    setRunning(false)
    setStopped(false)
    notebook.setExample({
      addresses: data.addresses.map((address) => ({ ...address, scanId: id })), labels: {},
      history: [createSnapshot(data.results, { startedAt: data.addresses[0].firstSeen, mode: 'quick', webRtc: false, stopped: false })],
    })
    setResults(data.results)
    setPlannedChecks(data.results.length)
    setFinishedAt(new Date().toISOString())
  }

  const stopScan = () => {
    abort.current?.abort()
    setAutoScan(0)
    setRunning(false)
    setStopped(true)
    setFinishedAt(new Date().toISOString())
  }

  useEffect(() => {
    if (demo) showDemo()
    else void startScan()
    return () => { abort.current?.abort(); sequence.current++ }
    // A scan starts on entry only; changing options never sends requests by itself.
  }, [])
  useAutoScan(autoScan, !running && !demo && environment.online, () => { void startScan(false, true) })
  useEffect(() => {
    if (!toast && !featureToast) return
    const timer = setTimeout(() => { setToast(''); setFeatureToast(null) }, 4500)
    return () => clearTimeout(timer)
  }, [toast, featureToast])

  const copy = async (text: string, all = false) => {
    setFeatureToast(null)
    try {
      await navigator.clipboard.writeText(text)
      if (all) { setToast(''); setFeatureToast('copiedAll') }
      else setToast('toast.copied')
    }
    catch { setToast('toast.clipboardUnavailable') }
  }
  const clearData = () => {
    if (!notebook.clearData()) return false
    abort.current?.abort()
    setScanId(++sequence.current)
    setAutoScan(0)
    setResults([])
    setFinishedAt('')
    setStopped(false)
    setFilter('all')
    setToast('')
    setFeatureToast('cleared')
    return true
  }
  const exportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(), demo,
      note: 'Observed public addresses, not a count of physical connections. May include earlier scans in this tab.',
      addresses, labels, history, latestScan: { stopped, completedAt: finishedAt || null, results }, environment,
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `whoami-${demo ? 'demo-' : ''}${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setFeatureToast(null)
    setToast('toast.exported')
  }
  const current = addresses.filter((address) => address.scanId === scanId)
  const primary = current.find((address) => address.family === 'IPv4') ?? current[0]
  const v4Count = addresses.filter((address) => address.family === 'IPv4').length
  const v6Count = addresses.filter((address) => address.family === 'IPv6').length
  const successes = results.filter((result) => result.status === 'success')
  const httpResults = results.filter((result) => !result.id.startsWith('webrtc'))
  const unavailable = results.filter((result) => result.status === 'failed').length
  const visibleAddresses = addresses.filter((address) => filter === 'all' || address.family === filter)
  const scanLabel = t(running ? 'scan.running' : stopped ? 'scan.stopped' : demo ? 'scan.example' : successes.length ? 'scan.complete' : 'scan.noPublicIp')

  return <>
    <a className="skip-link" href="#main">{t('nav.skip')}</a>
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="#main" aria-label={t('nav.home')}><span className="brand-mark"><Network size={22} strokeWidth={2.2} /></span>whoami<span className="brand-period">.</span></a>
        <nav aria-label={t('nav.label')}><a className="active" href="#main">{t('nav.overview')}</a><a href="#diagnostics">{t('nav.diagnostics')}</a><a href="#how-it-works">{t('nav.howItWorks')} <ArrowUpRight size={13} /></a></nav>
        <div className="header-end"><div className="language-switch" role="group" aria-label={t('language.label')}><button type="button" lang="de" aria-label={t('language.german')} aria-pressed={language === 'de'} onClick={() => setLanguage('de')}>DE</button><button type="button" lang="en" aria-label={t('language.english')} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button></div><a className="icon-button" href="#preferences" aria-label={f('settings')} title={f('settings')} onClick={() => { const panel = document.querySelector<HTMLDetailsElement>('#preferences'); if (panel) panel.open = true }}><Settings2 size={18} /></a><span className={`online-indicator ${!environment.online ? 'offline' : ''}`}><span className="tiny-dot" />{t(environment.online ? 'nav.browserOnline' : 'nav.browserOffline')}</span><a href="#privacy" className="privacy-link" aria-label={t('nav.privacy')}><ShieldCheck size={19} /></a></div>
      </div>
    </header>

    <main id="main">
      {storageWarning && <div className="offline-banner preference-warning" role="alert"><Info size={17} />{t('language.storageWarning')}</div>}
      {notebook.storageError && <div className="preference-warning" role="alert"><Info size={17} /><span>{storageErrorText(language, notebook.storageError)}</span></div>}
      {demo && <div className="demo-banner"><Info size={17} /><span><strong>{t('demo.title')}</strong> {t('demo.description')}</span><button onClick={() => void startScan(true)}>{t('scan.checkConnection')} <ArrowRight size={15} /></button></div>}
      {!environment.online && <div className="offline-banner" role="status"><Wifi size={17} />{t('page.offline')}</div>}
      <section className="page-heading">
        <div><h1>{t('page.heading')}<span>.</span></h1><p>{t('page.description')}</p></div>
        <button className="button secondary export-button" onClick={exportReport} disabled={!results.length || running}><ArrowDownToLine size={16} />{t('page.export')}</button>
      </section>

      <section className="connection-workbench" aria-labelledby="primary-heading">
        <div className="connection-topline"><span className="section-label"><Radio size={17} />{t('connection.overview')}</span><span className={`scan-state ${running ? 'scanning' : ''}`} role="status"><span className={`tiny-dot ${running ? '' : successes.length ? 'green' : 'gray'}`} />{scanLabel}</span></div>
        <div className="workbench-main">
          <div className="primary-address">
            <div className="primary-label"><h2 id="primary-heading">{primary ? t('connection.observedPublic', { family: primary.family }) : t('connection.publicIp')}</h2><button className="icon-button hide-button" aria-label={t(hidden ? 'connection.showIps' : 'connection.hideIps')} title={t(hidden ? 'connection.showIps' : 'connection.hideIps')} onClick={() => setHidden(!hidden)}>{hidden ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
            <div className={`primary-ip ${primary?.family === 'IPv6' ? 'primary-v6' : ''} ${!primary ? 'ip-placeholder' : ''}`}>{primary ? hidden ? masked(primary.family) : primary.ip : t(running ? 'connection.lookingUp' : 'connection.notYetObserved')}{primary && <button className="icon-button primary-copy" onClick={() => void copy(primary.ip)} aria-label={t('connection.copyPrimary')}><Copy size={21} /></button>}</div>
            <p className="primary-caption">{primary ? <><span className="tiny-dot green" />{t(demo ? 'demo.address' : 'connection.seenThisScan')}<span className="caption-divider" />{t('connection.confirmed', { count: primary.sources.length })}</> : t(running ? 'connection.checkingDestinations' : 'connection.tryAgain')}</p>
            {primary && labels[primary.ip] && <p className="named-primary"><Tag size={13} /><span>{f('assignedName')}: {labels[primary.ip]}</span></p>}
            <div className="scan-actions"><button className="button primary" onClick={() => running ? stopScan() : void startScan(demo)}>{running ? <Square size={15} /> : <ScanLine size={18} />}{t(running ? 'scan.stop' : demo ? 'scan.checkConnection' : 'scan.again')}</button><button className={`button quiet options-button ${optionsOpen ? 'selected' : ''}`} onClick={() => setOptionsOpen(!optionsOpen)} aria-expanded={optionsOpen} aria-controls="scan-options"><SlidersHorizontal size={16} />{t('scan.options')}<ChevronDown size={14} /></button></div>
          </div>
          <RouteDiagram addresses={current} running={running} />
        </div>
        {optionsOpen && <div className="scan-options" id="scan-options">
          <label className="option"><input type="checkbox" checked={deepScan} onChange={(event) => setDeepScan(event.target.checked)} disabled={running} /><span><strong>{t('scan.deeper')}</strong><small>{t('scan.deeperDescription')}</small></span></label>
          <label className="option"><input type="checkbox" checked={webRtc} onChange={(event) => setWebRtc(event.target.checked)} disabled={running} /><span><strong>{t('scan.includeWebRtc')} <span className="optional-tag">{t('scan.optional')}</span></strong><small>{t('scan.webRtcDescription')}</small></span></label>
          <p>{t('scan.optionsHint')}</p>
        </div>}
        <div className="workbench-summary">
          <div><span className="summary-icon"><Globe2 size={17} /></span><strong>{formatNumber(current.length)}</strong><span>{t('scan.addressesSummary', { count: current.length })}</span></div>
          <div><span className="family-mini">4</span><strong>{t(current.some((a) => a.family === 'IPv4') ? 'common.observed' : running ? 'common.checking' : 'common.notObserved')}</strong><span>IPv4</span></div>
          <div><span className="family-mini">6</span><strong>{t(current.some((a) => a.family === 'IPv6') ? 'common.observed' : running ? 'common.checking' : 'common.notObserved')}</strong><span>IPv6</span></div>
          <div className="checked-time"><RefreshCw size={14} className={running ? 'spin' : ''} /><span>{running ? t('scan.httpChecks', { completed: httpResults.length, planned: plannedChecks }) : finishedAt ? t('scan.checked', { time: formatTime(finishedAt) }) : t('scan.ready')}</span>{autoScan > 0 && <span className="auto-indicator"><Radio size={12} />{f('autoActive')}</span>}</div>
        </div>
      </section>

      <div className="content-grid">
        <section className="addresses-section" aria-labelledby="addresses-heading">
          <div className="section-heading"><div><h2 id="addresses-heading">{t('addresses.heading')} <span className="count-badge">{formatNumber(addresses.length)}</span></h2><p>{t('addresses.description')}</p></div><button className="icon-button" aria-label={t('addresses.about')} onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}><CircleHelp size={18} /></button></div>
          <div className="address-panel">
            <div className="list-toolbar"><div className="filter-tabs" role="group" aria-label={t('addresses.filter')}>{(['all', 'IPv4', 'IPv6'] as const).map((item) => <button aria-pressed={filter === item} className={filter === item ? 'selected' : ''} key={item} onClick={() => setFilter(item)}>{item === 'all' ? t('addresses.all') : item}<span>{formatNumber(item === 'all' ? addresses.length : item === 'IPv4' ? v4Count : v6Count)}</span></button>)}</div><button className="copy-all-button" disabled={!addresses.length} onClick={() => void copy(addresses.map((address) => address.ip).join('\n'), true)}><Copy size={13} />{f('copyAll')}</button></div>
            {visibleAddresses.length ? visibleAddresses.map((address, index) => <AddressRow key={`${demo}-${address.ip}`} address={address} index={index} current={address.scanId === scanId} hidden={hidden} demo={demo} name={labels[address.ip] ?? ''} onName={notebook.nameAddress} onCopy={(ip) => void copy(ip)} />) : <div className="empty-state"><Network size={29} /><h3>{running ? t('addresses.finding') : filter === 'all' ? t('addresses.empty') : t('addresses.emptyFamily', { family: filter })}</h3><p>{t(running ? 'addresses.loadingHint' : 'addresses.emptyHint')}</p>{!running && <button className="text-button" onClick={() => void startScan(demo)}>{t('addresses.tryAgain')} <ArrowRight size={15} /></button>}</div>}
            <div className="list-footnote"><ShieldCheck size={14} /><span>{f(demo ? 'demoFootnote' : notebook.remember ? 'savedFootnote' : 'tabFootnote')}</span></div>
          </div>
          <div className="multi-note"><span className="multi-note-icon"><Network size={21} /></span><div><strong>{t('addresses.multiTitle')}</strong><p>{t('addresses.multiDescription')}</p><a href="#how-it-works">{t('addresses.multiLink')} <ArrowRight size={14} /></a></div></div>
        </section>

        <aside className="environment-panel" aria-labelledby="environment-heading">
          <div className="section-heading"><h2 id="environment-heading">{t('environment.heading')}</h2><Laptop size={19} /></div>
          <dl className="environment-list">
            <div><dt><Wifi size={16} />{t('environment.connection')}</dt><dd><span className={`tiny-dot ${environment.online ? 'green' : 'gray'}`} />{t(environment.online ? 'environment.online' : 'environment.offline')}</dd></div>
            <div><dt><ShieldCheck size={16} />{t('environment.secure')}</dt><dd>{environment.secure ? <><Check size={14} />{t('common.yes')}</> : t('common.no')}</dd></div>
            <div><dt><Globe2 size={16} />{t('environment.language')}</dt><dd>{environment.language}</dd></div>
            <div className="timezone-row"><dt><LocateFixed size={16} />{t('environment.timezone')}</dt><dd>{environment.timezone}</dd></div>
            <div><dt><Radio size={16} />{t('environment.estimate')}</dt><dd>{environment.estimate ?? t('common.notExposed')}</dd></div>
          </dl>
          <p className="environment-disclaimer">{t('environment.disclaimer')}</p>
          <div className="privacy-note"><span><ShieldCheck size={18} />{t('privacy.title')}</span><p>{t('privacy.summary')}</p><a href="#privacy">{t('privacy.shared')} <ArrowUpRight size={13} /></a></div>
          <SettingsPanel language={language} theme={theme} setTheme={setTheme} themeError={themeError} autoScan={autoScan} setAutoScan={setAutoScan} remember={notebook.remember && !demo} setRemember={notebook.setRemember} storageError={notebook.storageError} retrySave={notebook.retrySave} clearData={clearData} running={running} demo={demo} />
        </aside>
      </div>

      <HistoryPanel history={history} labels={labels} hidden={hidden} language={language} remember={notebook.remember && !demo} />

      <section className="diagnostics-section" id="diagnostics">
        <details>
          <summary><span className="diagnostics-title"><span className="diagnostics-icon"><CheckCheck size={20} /></span><span><strong>{t('diagnostics.heading')}</strong><small>{results.length ? `${t('diagnostics.successes', { count: successes.length })}${unavailable ? ` · ${t('diagnostics.unavailable', { count: unavailable })}` : ''}` : t('diagnostics.subtitle')}</small></span></span><span className="diagnostics-action">{t('diagnostics.view')} <ChevronDown size={17} /></span></summary>
          <div className="diagnostics-content"><p>{t('diagnostics.explanation')}</p>{results.length ? <div className="table-scroll"><table><thead><tr><th>{t('diagnostics.destination')}</th><th>{t('diagnostics.round')}</th><th>{t('diagnostics.result')}</th><th>{t('diagnostics.time')}</th></tr></thead><tbody>{results.map((result, index) => <tr key={`${result.id}-${index}`}><td>{formatSource(result.source)}</td><td>{formatNumber(result.round)}</td><td><span className={`result-status ${result.status}`}>{result.status === 'success' ? hidden ? masked(result.family ?? 'IPv4') : result.ip : t(result.status === 'skipped' ? 'common.notExposed' : 'common.unavailable')}</span>{result.message && <small>{formatDiagnostic(result.message)}</small>}</td><td>{t('diagnostics.duration', { duration: result.duration })}</td></tr>)}</tbody></table></div> : <p>{t('diagnostics.empty')}</p>}</div>
        </details>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="how-heading"><h2>{t('how.title')}<br /><span>{t('how.subtitle')}</span></h2><p>{t('how.description')}</p></div>
        <div className="how-content">
          <details><summary>{t('faq.discoveryQuestion')}<ChevronDown size={18} /></summary><p>{t('faq.discoveryAnswer')}</p></details>
          <details><summary>{t('faq.linesQuestion')}<ChevronDown size={18} /></summary><p>{t('faq.linesAnswer')}</p><p>{t('faq.linesTip')}</p></details>
          <details><summary>{t('faq.detailsQuestion')}<ChevronDown size={18} /></summary><p>{t('faq.detailsAnswer')}</p></details>
          <details id="privacy"><summary>{t('faq.privacyQuestion')}<ChevronDown size={18} /></summary><p>{t('faq.privacyAnswer')}</p><p>{t('faq.privacyDetails')}</p><p>{f('privacyLocal')}</p></details>
        </div>
      </section>
    </main>
    <footer><a className="brand footer-brand" href="#main">whoami<span className="brand-period">.</span></a><span>{t('footer.tagline')}</span><div><a href="/api/whoami" target="_blank" rel="noreferrer">{t('footer.api')} <ArrowUpRight size={13} /></a><button onClick={() => demo ? void startScan(true) : showDemo()}>{t(demo ? 'demo.backToLive' : 'demo.explore')}<ArrowRight size={13} /></button></div></footer>
    {(toast || featureToast) && <div className="toast" role="status"><Info size={17} /><span>{featureToast ? f(featureToast) : toast ? t(toast) : ''}</span><button className="icon-button" aria-label={t('common.dismiss')} onClick={() => { setToast(''); setFeatureToast(null) }}><X size={16} /></button></div>}
  </>
}
