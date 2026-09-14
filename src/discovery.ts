import ipaddr from 'ipaddr.js'

export type Family = 'IPv4' | 'IPv6'
export type Endpoint = { id: string; name: string; url: string; format: 'json' | 'text'; family?: Family }
export type ProbeResult = {
  id: string
  source: string
  round: number
  status: 'success' | 'failed' | 'skipped' | 'cancelled'
  ip?: string
  family?: Family
  duration: number
  at: string
  message?: string
}
export type Address = {
  ip: string
  family: Family
  sources: string[]
  firstSeen: string
  lastSeen: string
  observations: number
  scanId: number
}

export const ENDPOINTS: Endpoint[] = [
  { id: 'origin', name: 'This server', url: '/api/whoami', format: 'json' },
  { id: 'ipify4', name: 'ipify · IPv4', url: 'https://api.ipify.org?format=json', format: 'json', family: 'IPv4' },
  { id: 'ipify6', name: 'ipify · IPv6', url: 'https://api6.ipify.org?format=json', format: 'json', family: 'IPv6' },
  { id: 'ipify64', name: 'ipify · Dual stack', url: 'https://api64.ipify.org?format=json', format: 'json' },
  { id: 'icanhaz4', name: 'icanhazip · IPv4', url: 'https://ipv4.icanhazip.com', format: 'text', family: 'IPv4' },
  { id: 'icanhaz6', name: 'icanhazip · IPv6', url: 'https://ipv6.icanhazip.com', format: 'text', family: 'IPv6' },
]

export function parsePublicIp(value: unknown): { ip: string; family: Family } | null {
  if (typeof value !== 'string') return null
  const input = value.trim()
  // Reject legacy IPv4 spellings and zone identifiers rather than reinterpret them.
  if (!input.includes(':') && !/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(input)) return null
  if (input.includes('%') || !ipaddr.isValid(input)) return null
  let address = ipaddr.parse(input)
  if (address.kind() === 'ipv6' && address instanceof ipaddr.IPv6 && address.isIPv4MappedAddress()) {
    address = address.toIPv4Address()
  }
  if (address.range() !== 'unicast') return null
  return { ip: address.toString(), family: address.kind() === 'ipv4' ? 'IPv4' : 'IPv6' }
}

export function mergeObservation(addresses: Address[], result: ProbeResult, scanId: number): Address[] {
  if (result.status !== 'success' || !result.ip || !result.family) return addresses
  const previous = addresses.find((address) => address.ip === result.ip)
  if (!previous) {
    return [...addresses, {
      ip: result.ip, family: result.family, sources: [result.source],
      firstSeen: result.at, lastSeen: result.at, observations: 1, scanId,
    }]
  }
  return addresses.map((address) => address.ip !== result.ip ? address : {
    ...address,
    sources: [...new Set([...address.sources, result.source])],
    lastSeen: result.at,
    observations: address.observations + 1,
    scanId,
  })
}

export async function probeEndpoint(
  endpoint: Endpoint,
  round: number,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeout = 6500,
): Promise<ProbeResult> {
  const started = performance.now()
  const controller = new AbortController()
  const cancel = () => controller.abort()
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) controller.abort()
  const timer = setTimeout(cancel, timeout)
  const base = () => ({
    id: `${endpoint.id}-${round}`, source: endpoint.name, round,
    duration: Math.round(performance.now() - started), at: new Date().toISOString(),
  })
  try {
    const separator = endpoint.url.includes('?') ? '&' : '?'
    const response = await fetcher(`${endpoint.url}${separator}check=${crypto.randomUUID()}`, {
      signal: controller.signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data: unknown = endpoint.format === 'json' ? await response.json() : await response.text()
    const value = endpoint.format === 'json' && data && typeof data === 'object' && 'ip' in data ? data.ip : data
    const parsed = parsePublicIp(value)
    if (!parsed) {
      if (endpoint.id === 'origin' && data && typeof data === 'object' && 'public' in data && data.public === false) {
        return { ...base(), status: 'skipped', message: 'Server sees a local/private address. Public services are checked separately.' }
      }
      throw new Error('The service did not return a valid public IP.')
    }
    if (endpoint.family && parsed.family !== endpoint.family) throw new Error(`Expected an ${endpoint.family} address.`)
    return { ...base(), status: 'success', ...parsed }
  } catch (error) {
    return {
      ...base(), status: signal.aborted ? 'cancelled' : 'failed',
      message: signal.aborted ? 'Check stopped.' : controller.signal.aborted
        ? 'Timed out. This route or IP family may be unavailable.'
        : error instanceof TypeError ? 'Could not reach the service. Network, CORS, or a blocker may be responsible.'
          : error instanceof Error ? error.message : 'Check failed. Try scanning again.',
    }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}

export function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return }
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve() }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
  })
}

export async function discover(
  signal: AbortSignal,
  rounds: number,
  onResult: (result: ProbeResult) => void,
  fetcher: typeof fetch = fetch,
) {
  for (let round = 1; round <= rounds && !signal.aborted; round++) {
    await Promise.all(ENDPOINTS.map(async (endpoint) => {
      const result = await probeEndpoint(endpoint, round, signal, fetcher)
      if (!signal.aborted) onResult(result)
    }))
    if (round < rounds) await pause(700, signal)
  }
}

export async function discoverWebRtc(signal: AbortSignal, onResult: (result: ProbeResult) => void) {
  const started = performance.now()
  const base = () => ({
    id: 'webrtc', source: 'WebRTC · STUN', round: 1,
    at: new Date().toISOString(), duration: Math.round(performance.now() - started),
  })
  if (signal.aborted) return
  if (typeof RTCPeerConnection === 'undefined') {
    onResult({ ...base(), status: 'failed', message: 'WebRTC is not supported in this browser.' })
    return
  }
  let peer: RTCPeerConnection | undefined
  let found = false
  try {
    peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }],
    })
    const connection = peer
    connection.createDataChannel('address-check')
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', finish)
        connection.onicecandidate = null
      }
      const finish = () => { cleanup(); resolve() }
      const timer = setTimeout(finish, 7000)
      signal.addEventListener('abort', finish, { once: true })
      connection.onicecandidate = (event) => {
        if (!event.candidate) { finish(); return }
        if (event.candidate.type !== 'srflx') return
        const parsed = parsePublicIp(event.candidate.address)
        if (parsed && !signal.aborted) {
          found = true
          onResult({ ...base(), id: `webrtc-${parsed.ip}`, status: 'success', ...parsed })
        }
      }
      Promise.resolve().then(() => connection.createOffer()).then((offer) => {
        if (!signal.aborted && connection.signalingState !== 'closed') return connection.setLocalDescription(offer)
      }).catch((error: unknown) => { cleanup(); reject(error) })
    })
    if (!found && !signal.aborted) onResult({
      ...base(), status: 'skipped',
      message: 'No public STUN candidate was exposed. Browser privacy settings, UDP filtering, or routing may limit this check.',
    })
  } catch (error) {
    if (!signal.aborted) onResult({ ...base(), status: 'failed', message: error instanceof Error ? error.message : 'WebRTC check failed.' })
  } finally {
    peer?.close()
  }
}

export type IpDetails = { provider: string; location: string; asn: string; timezone: string }

export async function lookupIp(ip: string, signal: AbortSignal): Promise<IpDetails> {
  if (!parsePublicIp(ip)) throw new Error('Only public IP addresses can be looked up.')
  const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
    signal, credentials: 'omit', referrerPolicy: 'no-referrer',
  })
  if (!response.ok) throw new Error(`Location lookup unavailable (HTTP ${response.status}). Try again later.`)
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object') throw new Error('Location service returned an invalid response.')
  if ('error' in data && data.error) throw new Error('Location service could not look up this address. Try again later.')
  const text = (key: string) => key in data && typeof data[key as keyof typeof data] === 'string' ? String(data[key as keyof typeof data]) : ''
  if (parsePublicIp(text('ip'))?.ip !== ip) throw new Error('Location service returned a different address.')
  return {
    provider: text('org') || 'Not provided', asn: text('asn') || 'Not provided',
    location: [text('city'), text('region'), text('country_name')].filter(Boolean).join(', ') || 'Not provided',
    timezone: text('timezone') || 'Not provided',
  }
}
