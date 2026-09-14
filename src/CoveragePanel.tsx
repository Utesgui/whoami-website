import { ChevronDown, Network, ScanLine } from 'lucide-react'
import { getCoverage, type ExpectedCounts } from './coverage'
import type { Address } from './discovery'
import { reliabilityText, type ReliabilityKey } from './reliabilityMessages'

export default function CoveragePanel({ addresses, scanId, expected, setExpected, language, running, demo, scan }: {
  addresses: Address[]; scanId: number; expected: ExpectedCounts; setExpected: (expected: ExpectedCounts) => void;
  language: 'en' | 'de'; running: boolean; demo: boolean; scan: () => void;
}) {
  const r = (key: ReliabilityKey, values: Record<string, number | string> = {}) => reliabilityText(language, key, values)
  const coverage = getCoverage(addresses, scanId, expected)
  return <section className="coverage-section" id="coverage">
    <details><summary><span><Network size={18} /><strong>{r('heading')}</strong></span><span className="coverage-summary">{coverage.map((entry) => <span className={entry.missing ? 'coverage-missing' : ''} key={entry.family}>{entry.family}: {entry.expected ? r('count', { found: entry.current, expected: entry.expected }) : entry.current}</span>)}<ChevronDown size={17} /></span></summary>
      <div className="coverage-content">
        <p>{r(demo ? 'demoCoverage' : 'intro')}</p>
        <div className="coverage-targets">{coverage.map((entry) => <label key={entry.family} htmlFor={`expected-${entry.family}`}>{r('expected', { family: entry.family })}<select id={`expected-${entry.family}`} value={entry.expected} onChange={(event) => setExpected({ ...expected, [entry.family]: Number(event.target.value) })}><option value={0}>{r('unknown')}</option>{Array.from({ length: 10 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>)}<button className="button small secondary" onClick={() => setExpected({ IPv4: 3, IPv6: 3 })}>{r('preset')}</button></div>
        <p className="coverage-small">{r('scopeHint')}</p>
        <div className="coverage-counts">{coverage.map((entry) => <div key={entry.family}>
          <h3>{entry.family}</h3><dl><div><dt>{r('thisScan')}</dt><dd>{entry.expected ? r('count', { found: entry.current, expected: entry.expected }) : r('observed', { count: entry.current })}</dd></div><div><dt>{r('collected')}</dt><dd>{entry.expected ? r('count', { found: entry.collected, expected: entry.expected }) : r('observed', { count: entry.collected })}</dd></div></dl>
          <p className={entry.missing ? 'coverage-missing' : 'coverage-small'}>{entry.missing === null ? r('unknownCoverage') : entry.missing > 0 ? r('missing', { count: entry.missing }) : r('reached')}</p>
          {entry.candidates > 0 && <p className="coverage-small">{r('candidates', { count: entry.candidates })}</p>}
        </div>)}</div>
        <p className="coverage-small">{r('earlier')}</p>
        <div className="coverage-scan"><button className="button primary" disabled={running} onClick={scan}><ScanLine size={16} />{r('deepAction')}</button><p>{r('deepHelp')}</p></div>
        <details className="coverage-guide"><summary>{r('guide')}<ChevronDown size={16} /></summary>{(['router', 'direct', 'ipv6'] as const).map((topic) => <div key={topic}><h3>{r(`${topic}Title`)}</h3><p>{r(`${topic}Help`)}</p></div>)}</details>
      </div>
    </details>
  </section>
}
