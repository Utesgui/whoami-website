import { parsePublicIp, type Address, type ProbeResult } from './discovery'

export const HISTORY_LIMIT = 30
export const ADDRESS_LIMIT = 100
export const LABEL_LIMIT = 40
export const CONNECTION_STORAGE_KEY = 'whoami.connection-data.v1'

export type ScanSnapshot = {
  id: string
  startedAt: string
  finishedAt: string
  mode: 'quick' | 'deep' | 'automatic'
  status: 'complete' | 'partial' | 'stopped' | 'failed'
  ips: string[]
  checks: number
  failures: number
  webRtc: boolean
}
export type ConnectionData = { addresses: Address[]; labels: Record<string, string>; history: ScanSnapshot[] }
export type StorageFailure = 'read' | 'invalid' | 'write' | 'remove'
export type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export const emptyConnectionData = (): ConnectionData => ({ addresses: [], labels: {}, history: [] })

export function boundAddresses(addresses: Address[]): Address[] {
  if (addresses.length <= ADDRESS_LIMIT) return addresses
  const retained = new Set([...addresses].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen)).slice(0, ADDRESS_LIMIT).map((a) => a.ip))
  return addresses.filter((address) => retained.has(address.ip))
}

export function createSnapshot(
  results: ProbeResult[],
  options: Pick<ScanSnapshot, 'startedAt' | 'mode' | 'webRtc'> & { stopped: boolean; finishedAt?: string },
): ScanSnapshot {
  const ips = [...new Set(results.filter((r) => r.status === 'success' && r.ip).map((r) => r.ip!))]
  const failures = results.filter((r) => r.status === 'failed').length
  return {
    id: crypto.randomUUID(), startedAt: options.startedAt,
    finishedAt: options.finishedAt ?? new Date().toISOString(),
    mode: options.mode, webRtc: options.webRtc, ips,
    checks: results.length, failures,
    status: options.stopped ? 'stopped' : !ips.length ? 'failed' : failures ? 'partial' : 'complete',
  }
}

export function appendSnapshot(history: ScanSnapshot[], snapshot: ScanSnapshot): ScanSnapshot[] {
  return [snapshot, ...history.filter((entry) => entry.id !== snapshot.id)].slice(0, HISTORY_LIMIT)
}

export function comparableScan(scan: ScanSnapshot) {
  return (scan.status === 'complete' || scan.status === 'partial') && scan.ips.length > 0
}

export function compareSnapshots(previous: ScanSnapshot | undefined, current: ScanSnapshot) {
  if (!previous || !comparableScan(previous) || !comparableScan(current)) {
    return { comparable: false, added: [], notSeen: [] } as { comparable: boolean; added: string[]; notSeen: string[] }
  }
  return {
    comparable: true,
    added: current.ips.filter((ip) => !previous.ips.includes(ip)),
    notSeen: previous.ips.filter((ip) => !current.ips.includes(ip)),
  }
}

export function updateLabel(labels: Record<string, string>, ip: string, label: string): Record<string, string> {
  const cleaned = label.trim()
  if (cleaned.length > LABEL_LIMIT || /[\u0000-\u001f\u007f]/.test(cleaned)) throw new Error('invalid-label')
  const next = { ...labels }
  if (cleaned) next[ip] = cleaned
  else delete next[ip]
  return next
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}
function publicIp(value: unknown): value is string {
  const parsed = parsePublicIp(value)
  return parsed !== null && parsed.ip === value
}
function boundedInteger(value: unknown, maximum: number) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum
}
function readAddress(value: unknown): Address {
  if (!object(value) || !publicIp(value.ip) || parsePublicIp(value.ip)?.family !== value.family
    || !timestamp(value.firstSeen) || !timestamp(value.lastSeen) || value.firstSeen > value.lastSeen
    || !boundedInteger(value.observations, Number.MAX_SAFE_INTEGER)
    || !Array.isArray(value.sources) || value.sources.length > 20
    || !value.sources.every((source) => typeof source === 'string' && source.length > 0 && source.length < 100)) {
    throw new Error('invalid-address')
  }
  return {
    ip: value.ip, family: value.family as Address['family'], firstSeen: value.firstSeen, lastSeen: value.lastSeen,
    observations: value.observations as number, sources: [...new Set(value.sources as string[])], scanId: 0,
  }
}
function readSnapshot(value: unknown): ScanSnapshot {
  if (!object(value) || typeof value.id !== 'string' || value.id.length > 100 || !value.id
    || !timestamp(value.startedAt) || !timestamp(value.finishedAt) || value.startedAt > value.finishedAt
    || !['quick', 'deep', 'automatic'].includes(String(value.mode))
    || !['complete', 'partial', 'stopped', 'failed'].includes(String(value.status))
    || !Array.isArray(value.ips) || value.ips.length > ADDRESS_LIMIT || !value.ips.every(publicIp)
    || !boundedInteger(value.checks, 200) || !boundedInteger(value.failures, 200)
    || Number(value.failures) > Number(value.checks) || typeof value.webRtc !== 'boolean') {
    throw new Error('invalid-scan')
  }
  return {
    id: value.id, startedAt: value.startedAt, finishedAt: value.finishedAt,
    mode: value.mode as ScanSnapshot['mode'], status: value.status as ScanSnapshot['status'],
    ips: [...new Set(value.ips as string[])], checks: value.checks as number,
    failures: value.failures as number, webRtc: value.webRtc,
  }
}

export function decodeConnectionData(raw: string): ConnectionData {
  if (raw.length > 250_000) throw new Error('storage-too-large')
  const value: unknown = JSON.parse(raw)
  if (!object(value) || value.version !== 1 || !object(value.data)) throw new Error('invalid-version')
  const data = value.data
  if (!Array.isArray(data.addresses) || data.addresses.length > ADDRESS_LIMIT
    || !Array.isArray(data.history) || data.history.length > HISTORY_LIMIT
    || !object(data.labels) || Object.keys(data.labels).length > ADDRESS_LIMIT) throw new Error('invalid-data')
  const labels: Record<string, string> = {}
  for (const [ip, label] of Object.entries(data.labels)) {
    if (!publicIp(ip) || typeof label !== 'string' || !label.trim() || label.length > LABEL_LIMIT
      || /[\u0000-\u001f\u007f]/.test(label)) throw new Error('invalid-label')
    labels[ip] = label.trim()
  }
  const addresses = data.addresses.map(readAddress)
  if (new Set(addresses.map((a) => a.ip)).size !== addresses.length) throw new Error('duplicate-address')
  return { addresses, labels, history: data.history.map(readSnapshot) }
}

export function loadConnectionData(storage: () => StoragePort = () => localStorage): {
  data: ConnectionData | null; error: StorageFailure | null;
} {
  let raw: string | null
  try { raw = storage().getItem(CONNECTION_STORAGE_KEY) }
  catch { return { data: null, error: 'read' } }
  if (raw === null) return { data: null, error: null }
  try { return { data: decodeConnectionData(raw), error: null } }
  catch { return { data: null, error: 'invalid' } }
}

export function saveConnectionData(data: ConnectionData, storage: () => StoragePort = () => localStorage): StorageFailure | null {
  try {
    const raw = JSON.stringify({ version: 1, data })
    decodeConnectionData(raw)
    storage().setItem(CONNECTION_STORAGE_KEY, raw)
    return null
  } catch { return 'write' }
}

export function removeConnectionData(storage: () => StoragePort = () => localStorage): StorageFailure | null {
  try { storage().removeItem(CONNECTION_STORAGE_KEY); return null }
  catch { return 'remove' }
}
