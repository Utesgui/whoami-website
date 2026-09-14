import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  discover, discoverWebRtc, ENDPOINTS, lookupIp, mergeObservation,
  parsePublicIp, pause, probeEndpoint, type ProbeResult,
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
})

describe('HTTP probes', () => {
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
    await pending
    expect(fetcher).toHaveBeenCalledTimes(ENDPOINTS.length)
    const unused = vi.fn<typeof fetch>()
    await discover(controller.signal, 3, () => {}, unused)
    expect(unused).not.toHaveBeenCalled()
    await pause(10000, controller.signal)
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
    expect(close).toHaveBeenCalledOnce()
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
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', ip: '8.8.8.8' }))
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', family: 'IPv6' }))
    expect(close).toHaveBeenCalledOnce()
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
    expect(close).toHaveBeenCalledOnce()
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
