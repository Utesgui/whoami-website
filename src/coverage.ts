import { hasRemoteEvidence, type Address } from './discovery'

export type ExpectedCounts = { IPv4: number; IPv6: number }

export function getCoverage(addresses: Address[], scanId: number, expected: ExpectedCounts) {
  return (['IPv4', 'IPv6'] as const).map((family) => {
    const observed = addresses.filter((address) => address.family === family && hasRemoteEvidence(address))
    const current = observed.filter((address) => address.scanId === scanId).length
    const wanted = expected[family]
    return {
      family, current, collected: observed.length, expected: wanted,
      candidates: addresses.filter((address) => address.family === family && !hasRemoteEvidence(address)).length,
      missing: wanted > 0 ? Math.max(0, wanted - current) : null,
      accumulatedMissing: wanted > 0 ? Math.max(0, wanted - observed.length) : null,
    }
  })
}
