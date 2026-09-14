import { useEffect, useId, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Clock3, Monitor, Moon, Settings2, Sun, Trash2 } from 'lucide-react'
import { comparableScan, compareSnapshots, LABEL_LIMIT, type ScanSnapshot, type StorageFailure } from './history'
import { featureText, type FeatureKey } from './featureMessages'
import type { Theme } from './usePreferences'
import CopyIpButton, { type CopyIp } from './CopyIpButton'

type Language = 'en' | 'de'
const storageMessage: Record<StorageFailure, FeatureKey> = {
  read: 'storageRead', invalid: 'storageInvalid', write: 'storageWrite', remove: 'storageRemove',
}
export function storageErrorText(language: Language, error: StorageFailure) {
  return featureText(language, storageMessage[error])
}

export function NameEditor({ ip, name, language, onSave }: {
  ip: string; name: string; language: Language; onSave: (ip: string, name: string) => boolean;
}) {
  const id = useId()
  const [draft, setDraft] = useState(name)
  const [invalid, setInvalid] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setDraft(name) }, [name])
  const f = (key: FeatureKey) => featureText(language, key)
  return <form className="name-editor" onSubmit={(event) => {
    event.preventDefault()
    const valid = onSave(ip, draft)
    setInvalid(!valid)
    setSaved(valid)
  }}>
    <label htmlFor={id}>{f('label')}</label>
    <div className="name-editor-controls"><input id={id} type="text" autoComplete="off" maxLength={LABEL_LIMIT} placeholder={f('labelPlaceholder')} value={draft} onChange={(event) => { setDraft(event.target.value); setSaved(false); setInvalid(false) }} aria-describedby={`${id}-hint`} aria-invalid={invalid} /><button type="submit" className="button small secondary">{saved ? <Check size={14} /> : null}{f('saveName')}</button></div>
    <p id={`${id}-hint`}>{f('labelHint')}</p>
    {invalid && <p className="name-error" role="alert">{f('labelInvalid')}</p>}
    {saved && <p role="status">{f('nameSaved')}</p>}
  </form>
}

export function SettingsPanel({ language, theme, setTheme, themeError, autoScan, setAutoScan, remember, setRemember, storageError, retrySave, clearData, running, demo }: {
  language: Language; theme: Theme; setTheme: (value: Theme) => void; themeError: boolean;
  autoScan: number; setAutoScan: (value: number) => void;
  remember: boolean; setRemember: (value: boolean) => void;
  storageError: StorageFailure | null; retrySave: () => void; clearData: () => boolean;
  running: boolean; demo: boolean;
}) {
  const [confirm, setConfirm] = useState(false)
  const f = (key: FeatureKey) => featureText(language, key)
  return <details className="advanced-settings" id="preferences">
    <summary><span><Settings2 size={16} />{f('settings')}</span><ChevronDown size={16} /></summary>
    <div className="settings-content">
      <section aria-labelledby="appearance-heading"><h3 id="appearance-heading">{f('appearance')}</h3><div className="theme-switch" role="group" aria-label={f('appearance')}>
        {([{ value: 'light', Icon: Sun }, { value: 'dark', Icon: Moon }, { value: 'system', Icon: Monitor }] as const).map(({ value, Icon }) => <button key={value} aria-pressed={theme === value} onClick={() => setTheme(value)}><Icon size={14} />{f(value)}</button>)}
      </div>{themeError && <p className="settings-error" role="alert">{f('themeError')}</p>}</section>
      <section><h3><label htmlFor="auto-scan">{f('autoScan')}</label></h3><div className="feature-control"><select id="auto-scan" value={autoScan} onChange={(event) => setAutoScan(Number(event.target.value))} disabled={demo}><option value={0}>{f('autoOff')}</option><option value={60}>{f('autoMinute')}</option><option value={300}>{f('autoFive')}</option></select></div><p className="settings-description">{f('autoHelp')}</p></section>
      <section className="settings-storage"><label className="option"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} disabled={demo} /><span><strong>{f('localStorage')}</strong><small>{f('storageHelp')}</small></span></label><p className="settings-description">{f('storageTab')}</p><p className="settings-description">{f('historyLimit')}</p>
        {demo && <p className="settings-description">{f('demoAuto')}</p>}
        {storageError && <p className="settings-error" role="alert">{storageErrorText(language, storageError)}</p>}
        {storageError === 'write' && !demo && <button className="button small secondary" onClick={retrySave}>{f('retrySave')}</button>}
      </section>
      <div className="clear-data">{confirm ? <div className="clear-confirmation"><p>{f('clearQuestion')}</p><button className="button small danger" disabled={running || demo} onClick={() => { if (clearData()) setConfirm(false) }}>{f('clearConfirm')}</button><button className="button small quiet" onClick={() => setConfirm(false)}>{f('cancel')}</button></div> : <button className="button small danger" disabled={running || demo} onClick={() => setConfirm(true)}><Trash2 size={14} />{f('clearData')}</button>}</div>
    </div>
  </details>
}

export function HistoryPanel({ history, labels, hidden, language, remember, onCopy }: {
  history: ScanSnapshot[]; labels: Record<string, string>; hidden: boolean; language: Language; remember: boolean;
  onCopy: CopyIp;
}) {
  const f = (key: FeatureKey, values: Record<string, string | number> = {}) => featureText(language, key, values)
  const addressList = (ips: string[]) => <ul className="history-addresses">{ips.map((ip) => <li key={ip}><span className="ip-copy-line"><code>{hidden ? '••••••••' : ip}</code><CopyIpButton ip={ip} onCopy={onCopy} /></span>{labels[ip] && <span className="history-name">{labels[ip]}</span>}</li>)}</ul>
  return <section className="history-section" id="history">
    <details><summary><span className="history-summary"><Clock3 size={20} /><span><strong>{f('history')}<span className="count-badge">{history.length}</span></strong><small>{f(remember ? 'historySummaryLocal' : 'historySummary', { count: history.length })}</small></span></span><ChevronDown size={17} /></summary>
      <div className="history-content"><p className="history-description">{f('historyDescription')}</p>{!history.length ? <p className="history-empty">{f('historyEmpty')}</p> : <ol className="history-list">{history.map((entry, index) => {
        const previous = history.slice(index + 1).find(comparableScan)
        const changes = compareSnapshots(previous, entry)
        const elapsed = Math.max(0, Math.round((Date.parse(entry.finishedAt) - Date.parse(entry.startedAt)) / 1000))
        return <li className="history-item" key={entry.id}><details><summary><span><span className="history-date">{new Date(entry.finishedAt).toLocaleString(language === 'de' ? 'de-DE' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span><span className="history-mode">{f(entry.mode)}{entry.webRtc ? ' + WebRTC' : ''}</span></span><span className="history-item-summary"><span>{f(entry.ips.length === 1 ? 'snapshotAddress' : 'snapshotAddresses', { count: entry.ips.length })}</span><span className={`history-status ${entry.status}`}>{f(entry.status)}</span><ChevronDown size={15} /></span></summary>
          <div className="history-detail"><dl><div><dt>{f('duration')}</dt><dd>{f('seconds', { count: elapsed })}</dd></div><div><dt>{f('checks')}</dt><dd>{entry.checks}</dd></div><div><dt>{f('failures')}</dt><dd>{entry.failures}</dd></div></dl>
            {entry.ips.length > 0 && <><p className="settings-description">{f('snapshotIps')}</p>{addressList(entry.ips)}</>}
            {changes.comparable ? <>{changes.added.length > 0 && <p className="history-change new"><ArrowUpRight size={14} />{f('newAddresses', { count: changes.added.length })}</p>}{changes.notSeen.length > 0 && <><p className="history-change unseen"><ArrowDownLeft size={14} />{f('unseenAddresses', { count: changes.notSeen.length })}</p><p className="settings-description">{f('previousNotSeen')}</p>{addressList(changes.notSeen)}</>}{!changes.added.length && !changes.notSeen.length && <p className="history-comparison-note">{f('noChanges')}</p>}<p className="history-comparison-note">{f('comparisonCaution')}</p></> : <p className="history-comparison-note">{f(!previous && comparableScan(entry) ? 'firstComparison' : 'noComparison')}</p>}
          </div>
        </details></li>
      })}</ol>}</div>
    </details>
  </section>
}
