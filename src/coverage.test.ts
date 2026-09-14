import { expect, it } from 'vitest'
import { getCoverage } from './coverage'
import { DEVICE_CANDIDATE_SOURCE, type Address } from './discovery'

it('counts expected IPv4 and IPv6 separately without crediting device-only candidates', () => {
  const base = { firstSeen: '', lastSeen: '', observations: 1, sources: ['ipify'], scanId: 2 }
  const addresses: Address[] = [
    { ...base, ip: '8.8.8.8', family: 'IPv4' },
    { ...base, ip: '1.1.1.1', family: 'IPv4' },
    { ...base, ip: '9.9.9.9', family: 'IPv4', scanId: 1 },
    { ...base, ip: '2606:4700:4700::1111', family: 'IPv6' },
    { ...base, ip: '2001:4860:4860::8888', family: 'IPv6', sources: [DEVICE_CANDIDATE_SOURCE] },
  ]
  const [ipv4, ipv6] = getCoverage(addresses, 2, { IPv4: 3, IPv6: 3 })
  expect(ipv4).toMatchObject({ current: 2, collected: 3, missing: 1, accumulatedMissing: 0, candidates: 0 })
  expect(ipv6).toMatchObject({ current: 1, collected: 1, missing: 2, candidates: 1 })
  expect(getCoverage(addresses, 2, { IPv4: 0, IPv6: 0 })[0].missing).toBeNull()
})
