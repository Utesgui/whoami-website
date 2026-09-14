import type { Address, ProbeResult } from './discovery'

export function demoData() {
  const at = new Date().toISOString()
  const addresses: Address[] = [
    { ip: '198.51.100.42', family: 'IPv4', sources: ['ipify · IPv4', 'icanhazip · IPv4'], observations: 6, firstSeen: at, lastSeen: at, scanId: 1 },
    { ip: '203.0.113.18', family: 'IPv4', sources: ['ipify · Dual stack'], observations: 3, firstSeen: at, lastSeen: at, scanId: 1 },
    { ip: '2001:db8:85a3::8a2e:370:7334', family: 'IPv6', sources: ['ipify · IPv6', 'icanhazip · IPv6'], observations: 6, firstSeen: at, lastSeen: at, scanId: 1 },
  ]
  const results: ProbeResult[] = addresses.flatMap((address, i) => address.sources.map((source, j) => ({
    id: `demo-${i}-${j}`, source, round: 1, status: 'success',
    ip: address.ip, family: address.family, at, duration: 42 + i * 19 + j * 8,
  })))
  return { addresses, results }
}
