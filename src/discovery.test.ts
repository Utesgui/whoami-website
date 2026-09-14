import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEEP_ENDPOINTS, DEVICE_CANDIDATE_SOURCE, discover, discoverWebRtc, ENDPOINTS, hasRemoteEvidence, lookupIp, mergeObservation,
  parseIceCandidate, parsePublicIp, pause, probeEndpoint, STUN_TARGETS, type ProbeResult,
} from './discovery'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('public IP parsing', () => {
  it.each([
    ['8.8.8.8', { ip: '8.8.8.8', family: 'IPv4' }],
    [' 1.1.1.1\n', { ip: '1.1.1.1', family: 'IPv4' }],
    ['2606:4700:4700:0:0:0:0:1111', { ip: '2606:4700:4700::1111', family: 'IPv6' }],
    ['::ffff:8.8.8.8', { ip: '8.8.8.8', family: 'IPv4' }],
  ])('normalizes %s', (value, expected) => expect(parsePublicIp(value)).toEqual(expected))
  it.each([
    '192.168.1.1', '10.0.0.1', '172.16.0.1', '127.0.0.1', '169.254.1.1', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '255.255.255.255', '198.51.100.42', '203.0.113.1',
    '::1', '::', 'fe80::1', 'fc00::1', '2001:db8::1', 'ff02::1', '::ffff:192.168.1.1',
    'fe80::1%eth0', '1.2.3.999', '127.1', '0x08080808', '010.010.010.010', '', '<html>error</html>', undefined, {},
  ])('rejects non-public or invalid input %s', (value) => expect(parsePublicIp(value)).toBeNull())
})

const result: ProbeResult = {
  id: 'test', source: 'first', round: 1, status: 'success', ip: '8.8.8.8', family: 'IPv4',
  duration: 20, at: '2026-09-14T14:00:00.000Z',
}

describe('observation history', () => {
  it('deduplicates an address and sources without losing first-seen time', () => {
    const original = mergeObservation([], result, 1)
    const again = mergeObservation(original, { ...result, at: '2026-09-14T14:01:00.000Z' }, 2)
    const otherSource = mergeObservation(again, { ...result, source: 'second', at: '2026-09-14T14:02:00.000Z' }, 2)
    expect(otherSource).toHaveLength(1)
    expect(otherSource[0]).toMatchObject({ observations: 3, sources: ['first', 'second'], firstSeen: result.at, scanId: 2 })
    expect(original[0].observations).toBe(1)
  })
  it('retains earlier addresses and ignores failures', () => {
    const original = mergeObservation([], result, 1)
    expect(mergeObservation(original, { ...result, status: 'failed' }, 2)).toBe(original)
    const later = mergeObservation(original, { ...result, ip: '1.1.1.1' }, 2)
    expect(later.map((a) => a.scanId)).toEqual([1, 2])
  })
  it('does not turn a device candidate into a new remote observation', () => {
    const candidate = { ...result, source: DEVICE_CANDIDATE_SOURCE, ip: '2606:4700:4700::1111', family: 'IPv6' as const }
    let addresses = mergeObservation([], candidate, 1)
    expect(hasRemoteEvidence(addresses[0])).toBe(false)
    expect(addresses[0].scanId).toBe(-1)
    addresses = mergeObservation(addresses, { ...candidate, source: 'ipify · IPv6' }, 2)
    expect(hasRemoteEvidence(addresses[0])).toBe(true)
    expect(addresses[0].scanId).toBe(2)
    addresses = mergeObservation(addresses, candidate, 3)
    expect(addresses[0].scanId).toBe(2)
  })
})

describe('HTTP probes', () => {
  it('parses only the authoritative CSV field, not forwarded-header addresses', async () => {
    const endpoint = DEEP_ENDPOINTS.find((entry) => entry.id === 'ip4me')!
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('IPv4,8.8.8.8,1,1.1.1.1,9.9.9.9,message'))
    expect(await probeEndpoint(endpoint, 1, new AbortController().signal, fetcher)).toMatchObject({ ip: '8.8.8.8', family: 'IPv4' })
    fetcher.mockResolvedValue(new Response('IPv6,8.8.8.8,1,,,'))
    expect(await probeEndpoint(endpoint, 1, new AbortController().signal, fetcher)).toMatchObject({ status: 'failed' })
  })
  it('uses fresh requests without credentials and validates the IP family', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"ip":"8.8.8.8"}'))
    const response = await probeEndpoint(ENDPOINTS[1], 1, new AbortController().signal, fetcher)
    expect(response).toMatchObject({ status: 'success', family: 'IPv4', ip: '8.8.8.8' })
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('&check='), expect.objectContaining({
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    }))
  })
  it('rejects wrong-family responses rather than showing misleading support', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"ip":"8.8.8.8"}'))
    expect(await probeEndpoint(ENDPOINTS[2], 1, new AbortController().signal, fetcher)).toMatchObject({
      status: 'failed', message: 'Expected an IPv6 address.',
    })
  })
  it.each([
    [() => Promise.resolve(new Response('denied', { status: 429 })), 'HTTP 429'],
    [() => Promise.resolve(new Response('{"ip":"127.0.0.1"}')), 'valid public IP'],
    [() => Promise.reject(new TypeError('Failed to fetch')), 'Could not reach'],
  ])('surfaces endpoint failures', async (fetcher, message) => {
    const response = await probeEndpoint(ENDPOINTS[1], 1, new AbortController().signal, fetcher)
    expect(response.status).toBe('failed')
    expect(response.message).toContain(message)
  })
  it('explains local-origin results without adding a private IP', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"ip":"127.0.0.1","public":false}'))
    const response = await probeEndpoint(ENDPOINTS[0], 1, new AbortController().signal, fetcher)
    expect(response).toMatchObject({ status: 'skipped' })
    expect(response.ip).toBeUndefined()
  })
  it('distinguishes timeouts from explicit cancellation', async () => {
    vi.useFakeTimers()
    const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    })
    const controller = new AbortController()
    const timed = probeEndpoint(ENDPOINTS[0], 1, controller.signal, fetcher, 10)
    await vi.advanceTimersByTimeAsync(11)
    expect(await timed).toMatchObject({ status: 'failed', message: expect.stringContaining('Timed out') })
    const cancelled = probeEndpoint(ENDPOINTS[0], 1, controller.signal, fetcher)
    controller.abort()
    expect(await cancelled).toMatchObject({ status: 'cancelled' })
  })
  it('performs all rounds and deduplicates observations independently', async () => {
    vi.useFakeTimers()
    const received: ProbeResult[] = []
    const fetcher: typeof fetch = async (input) => {
      const url = String(input)
      const ip = url.includes('api6.') || url.includes('ipv6.') ? '2606:4700:4700::1111' : '8.8.8.8'
      return new Response(url.includes('icanhazip') ? `${ip}\n` : JSON.stringify({ ip }))
    }
    const pending = discover(new AbortController().signal, 3, (r) => received.push(r), fetcher)
    await vi.runAllTimersAsync()
    await pending
    expect(received).toHaveLength(18)
    expect(received.every((r) => r.status === 'success')).toBe(true)
    expect(received.reduce((addresses, r) => mergeObservation(addresses, r, 1), [] as ReturnType<typeof mergeObservation>)).toHaveLength(2)
  })
  it('does not make requests after cancellation, including between rounds', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response('8.8.8.8'))
    const pending = discover(controller.signal, 3, () => controller.abort(), fetcher)
    await vi.runAllTimersAsync()
    await pending
    expect(fetcher).toHaveBeenCalledTimes(1)
    const unused = vi.fn<typeof fetch>()
    await discover(controller.signal, 3, () => {}, unused)
    expect(unused).not.toHaveBeenCalled()
    await pause(10000, controller.signal)
  })
  it('stops retrying rate-limited destinations but continues the rest', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) => String(input).includes('api.ipify.org')
      ? new Response('', { status: 429 }) : new Response('8.8.8.8'))
    const results: ProbeResult[] = []
    const pending = discover(new AbortController().signal, 3, (r) => results.push(r), fetcher, [ENDPOINTS[1], ENDPOINTS[4]])
    await vi.runAllTimersAsync()
    await pending
    expect(fetcher).toHaveBeenCalledTimes(4)
    expect(results.filter((r) => r.status === 'skipped')).toHaveLength(2)
    expect(results.filter((r) => r.status === 'success')).toHaveLength(3)
    expect(results[0].httpStatus).toBe(429)
  })
})

describe('ICE public address evidence', () => {
  it.each([
    [{ type: 'host', address: '2606:4700:4700::1111', candidate: '' }, 'host'],
    [{ type: 'srflx', address: '8.8.8.8', candidate: '' }, 'srflx'],
    [{ type: null, address: null, candidate: 'candidate:1 1 udp 1 2606:4700:4700::1111 1234 typ host' }, 'host'],
  ] as const)('accepts public candidates with explicit provenance', (candidate, kind) => {
    expect(parseIceCandidate(candidate)?.kind).toBe(kind)
  })
  it.each(['192.168.1.1', '10.0.0.1', 'fe80::1', 'fd00::1', 'computer.local', '2001:db8::1'])('rejects private or obfuscated candidate %s', (address) => {
    expect(parseIceCandidate({ type: 'host', address, candidate: '' })).toBeNull()
  })
  it('does not report a TURN relay address as a user connection', () => {
    expect(parseIceCandidate({ type: 'relay', address: '8.8.8.8', candidate: '' })).toBeNull()
  })
})

describe('optional lookups', () => {
  it('handles unsupported WebRTC explicitly', async () => {
    vi.stubGlobal('RTCPeerConnection', undefined)
    const callback = vi.fn()
    await discoverWebRtc(new AbortController().signal, callback)
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', message: expect.stringContaining('not supported') }))
  })
  it('surfaces offer failures and always closes the peer connection', async () => {
    const close = vi.fn()
    vi.stubGlobal('RTCPeerConnection', class {
      createDataChannel() {}
      createOffer() { return Promise.reject(new Error('Permission blocked')) }
      close = close
    })
    const callback = vi.fn()
    await discoverWebRtc(new AbortController().signal, callback)
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', message: 'Permission blocked' }))
    expect(close).toHaveBeenCalledTimes(STUN_TARGETS.length)
  })
  it('keeps only public server-reflexive STUN candidates and closes after gathering', async () => {
    const close = vi.fn()
    vi.stubGlobal('RTCPeerConnection', class {
      signalingState = 'stable'
      onicecandidate: ((event: { candidate: { type: string; address: string } | null }) => void) | null = null
      createDataChannel() {}
      async createOffer() { return {} }
      async setLocalDescription() {
        this.onicecandidate?.({ candidate: { type: 'host', address: '192.168.0.1' } })
        this.onicecandidate?.({ candidate: { type: 'srflx', address: '8.8.8.8' } })
        this.onicecandidate?.({ candidate: { type: 'srflx', address: '2606:4700:4700::1111' } })
        this.onicecandidate?.({ candidate: null })
      }
      close = close
    })
    const callback = vi.fn()
    await discoverWebRtc(new AbortController().signal, callback)
    expect(callback).toHaveBeenCalledTimes(2 * STUN_TARGETS.length)
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', ip: '8.8.8.8' }))
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', family: 'IPv6' }))
    expect(close).toHaveBeenCalledTimes(STUN_TARGETS.length)
  })
  it('cancels STUN gathering without emitting a failure or leaving a timer', async () => {
    vi.useFakeTimers()
    const close = vi.fn()
    vi.stubGlobal('RTCPeerConnection', class {
      signalingState = 'stable'
      createDataChannel() {}
      async createOffer() { return {} }
      async setLocalDescription() {}
      close = close
    })
    const controller = new AbortController()
    const callback = vi.fn()
    const pending = discoverWebRtc(controller.signal, callback)
    controller.abort()
    await pending
    expect(callback).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(STUN_TARGETS.length)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('uses fresh independent sessions across rounds and finds three IPv4 and three IPv6 candidates', async () => {
    vi.useFakeTimers()
    let instances = 0
    const close = vi.fn()
    const targets: string[] = []
    vi.stubGlobal('RTCPeerConnection', class {
      index = instances++
      signalingState = 'stable'
      onicecandidate: ((event: { candidate: { type: string; address: string; candidate: string } | null }) => void) | null = null
      constructor(config: RTCConfiguration) {
        expect(config.iceServers).toHaveLength(1)
        targets.push(String(config.iceServers![0].urls))
      }
      createDataChannel() {}
      async createOffer() { return {} }
      async setLocalDescription() {
        const line = Math.floor(this.index / STUN_TARGETS.length)
        const ipv4 = ['8.8.8.8', '1.1.1.1', '9.9.9.9'][line]
        const ipv6 = ['2606:4700:4700::1111', '2001:4860:4860::8888', '2620:fe::fe'][line]
        this.onicecandidate?.({ candidate: { type: 'srflx', address: ipv4, candidate: '' } })
        this.onicecandidate?.({ candidate: { type: 'host', address: ipv6, candidate: '' } })
        this.onicecandidate?.({ candidate: { type: 'host', address: ipv6, candidate: '' } })
        this.onicecandidate?.({ candidate: null })
      }
      close = close
    })
    const results: ProbeResult[] = []
    const pending = discoverWebRtc(new AbortController().signal, (r) => results.push(r), 3)
    await vi.runAllTimersAsync()
    await pending
    expect(new Set(targets).size).toBe(2)
    expect(close).toHaveBeenCalledTimes(6)
    const addresses = results.reduce((all, r) => mergeObservation(all, r, 1), [] as ReturnType<typeof mergeObservation>)
    expect(addresses.filter((a) => a.family === 'IPv4')).toHaveLength(3)
    expect(addresses.filter((a) => a.family === 'IPv6')).toHaveLength(3)
    expect(addresses.filter(hasRemoteEvidence)).toHaveLength(3)
    expect(results).toHaveLength(12)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('rejects private lookups before sending anything and validates the returned IP', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"ip":"1.1.1.1","org":"wrong network"}'))
    vi.stubGlobal('fetch', fetcher)
    await expect(lookupIp('192.168.1.1', new AbortController().signal)).rejects.toThrow('Only public')
    expect(fetcher).not.toHaveBeenCalled()
    await expect(lookupIp('8.8.8.8', new AbortController().signal)).rejects.toThrow('different address')
  })
})
