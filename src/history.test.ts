import { describe, expect, it } from 'vitest'
import {
  appendSnapshot, boundAddresses, compareSnapshots, CONNECTION_STORAGE_KEY, createSnapshot, decodeConnectionData,
  emptyConnectionData, HISTORY_LIMIT, loadConnectionData, removeConnectionData, saveConnectionData,
  updateLabel, type StoragePort,
} from './history'
import { DEVICE_CANDIDATE_SOURCE, mergeObservation, type ProbeResult } from './discovery'

const result: ProbeResult = {
  id: 'source-1', source: 'ipify · IPv4', round: 1, status: 'success', ip: '8.8.8.8',
  family: 'IPv4', duration: 10, at: '2026-09-14T14:00:00.000Z',
}
const options = { startedAt: result.at, finishedAt: result.at, mode: 'quick' as const, webRtc: false, stopped: false }
const first = () => createSnapshot([result], options)
const data = () => ({ addresses: mergeObservation([], result, 12), labels: { '8.8.8.8': 'DSL' }, history: [first()] })
function memoryStorage() {
  const values = new Map<string, string>()
  const storage: StoragePort = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
  }
  return { values, storage: () => storage }
}

describe('bounded scan history', () => {
  it('deduplicates addresses, tracks partial failure and preserves scan options', () => {
    const scan = createSnapshot([result, result, { ...result, status: 'failed' }], { ...options, mode: 'automatic' })
    expect(scan).toMatchObject({ ips: ['8.8.8.8'], status: 'partial', checks: 3, failures: 1, mode: 'automatic', webRtc: false })
    expect(createSnapshot([], options).status).toBe('failed')
    expect(createSnapshot([result], { ...options, stopped: true }).status).toBe('stopped')
  })
  it('excludes device-only ICE candidates from remote-observed snapshot comparisons', () => {
    const candidate = { ...result, source: DEVICE_CANDIDATE_SOURCE }
    expect(createSnapshot([candidate], options)).toMatchObject({ status: 'failed', ips: [], checks: 1 })
    expect(createSnapshot([candidate, result], options).ips).toEqual(['8.8.8.8'])
  })
  it('keeps newest thirty scans and replaces duplicate IDs', () => {
    const snapshot = first()
    expect(appendSnapshot([snapshot], snapshot)).toHaveLength(1)
    const many = Array.from({ length: 35 }, () => first())
    const updated = appendSnapshot(many, snapshot)
    expect(updated).toHaveLength(HISTORY_LIMIT)
    expect(updated[0].id).toBe(snapshot.id)
  })
  it('bounds addresses to 100 while retaining recently reobserved entries', () => {
    const addresses = Array.from({ length: 101 }, (_, index) => ({
      ...data().addresses[0], ip: `8.8.8.${index}`, lastSeen: new Date(Date.parse(result.at) + index * 1000).toISOString(),
    }))
    addresses[0].lastSeen = new Date(Date.parse(result.at) + 200_000).toISOString()
    const retained = boundAddresses(addresses)
    expect(retained).toHaveLength(100)
    expect(retained[0].ip).toBe('8.8.8.0')
    expect(retained.some((entry) => entry.ip === '8.8.8.1')).toBe(false)
  })
  it('compares observations, but never calls a stopped or failed scan a connection loss', () => {
    const newer = createSnapshot([{ ...result, ip: '1.1.1.1' }], options)
    expect(compareSnapshots(first(), newer)).toEqual({ comparable: true, added: ['1.1.1.1'], notSeen: ['8.8.8.8'] })
    expect(compareSnapshots(first(), { ...newer, status: 'failed', ips: [] }).comparable).toBe(false)
    expect(compareSnapshots(first(), { ...newer, status: 'stopped' }).notSeen).toEqual([])
    expect(compareSnapshots(undefined, newer).comparable).toBe(false)
    expect(compareSnapshots(first(), first())).toEqual({ comparable: true, added: [], notSeen: [] })
  })
})

describe('manual names', () => {
  it('trims names, removes empty labels, and never mutates existing data', () => {
    const original = { '8.8.8.8': 'DSL' }
    expect(updateLabel(original, '1.1.1.1', '  5G  ')).toEqual({ ...original, '1.1.1.1': '5G' })
    expect(updateLabel(original, '8.8.8.8', '')).toEqual({})
    expect(original['8.8.8.8']).toBe('DSL')
  })
  it('rejects oversized and control-character labels', () => {
    expect(() => updateLabel({}, '8.8.8.8', 'a'.repeat(41))).toThrow('invalid-label')
    expect(() => updateLabel({}, '8.8.8.8', 'DSL\n5G')).toThrow('invalid-label')
  })
})

describe('explicit local storage', () => {
  it('does not write anything when loading an unconfigured store', () => {
    const store = memoryStorage()
    expect(loadConnectionData(store.storage)).toEqual({ data: null, error: null })
    expect(store.values.size).toBe(0)
  })
  it('round-trips data and restores observations as earlier scans, not current proof', () => {
    const store = memoryStorage()
    expect(saveConnectionData(data(), store.storage)).toBeNull()
    const loaded = loadConnectionData(store.storage)
    expect(loaded.error).toBeNull()
    expect(loaded.data?.addresses[0].scanId).toBe(0)
    expect(loaded.data?.labels['8.8.8.8']).toBe('DSL')
    expect(loaded.data?.history).toHaveLength(1)
    expect(removeConnectionData(store.storage)).toBeNull()
    expect(store.values.has(CONNECTION_STORAGE_KEY)).toBe(false)
  })
  it.each(['not-json', '{}', '{"version":2,"data":{}}', JSON.stringify({ version: 1, data: { ...data(), addresses: [{ ...data().addresses[0], ip: '192.168.1.1' }] } })])('rejects invalid data without trusting or overwriting it', (raw) => {
    const store = memoryStorage()
    store.values.set(CONNECTION_STORAGE_KEY, raw)
    expect(loadConnectionData(store.storage)).toEqual({ data: null, error: 'invalid' })
    expect(store.values.get(CONNECTION_STORAGE_KEY)).toBe(raw)
  })
  it('refuses demo documentation IPs and overlarge data', () => {
    const store = memoryStorage()
    expect(saveConnectionData({ ...data(), addresses: [{ ...data().addresses[0], ip: '198.51.100.42' }] }, store.storage)).toBe('write')
    expect(store.values.size).toBe(0)
    expect(() => decodeConnectionData(' '.repeat(250_001))).toThrow('storage-too-large')
    expect(() => decodeConnectionData(JSON.stringify({ version: 1, data: { ...emptyConnectionData(), history: Array.from({ length: 31 }, first) } }))).toThrow('invalid-data')
  })
  it('reports all storage failures explicitly', () => {
    const denied = () => { throw new DOMException('Access denied', 'SecurityError') }
    expect(loadConnectionData(denied).error).toBe('read')
    expect(saveConnectionData(data(), denied)).toBe('write')
    expect(removeConnectionData(denied)).toBe('remove')
  })
})
