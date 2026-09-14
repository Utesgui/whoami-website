import { test, expect } from '@playwright/test'

test('multi-WAN scan discovers three distinct IPv4 and three IPv6 addresses across providers', async ({ page }, testInfo) => {
  test.setTimeout(45000)
  const calls = new Map<string, number>()
  await page.route(/https:\/\/(api(6|64)?\.ipify\.org|ipv[46]\.icanhazip\.com|v[46]\.ident\.me|ip[46]only\.me)/, async (route) => {
    const url = new URL(route.request().url())
    const host = url.hostname
    calls.set(host, (calls.get(host) ?? 0) + 1)
    const ipv6 = /api6\.|ipv6\.|v6\.|ip6only/.test(host)
    const network = host.includes('ident.me') ? 1 : host.includes('only.me') ? 2 : 0
    const ip = ipv6 ? ['2606:4700:4700::1111', '2001:4860:4860::8888', '2620:fe::fe'][network] : ['8.8.8.8', '1.1.1.1', '9.9.9.9'][network]
    const body = host.includes('ipify') ? JSON.stringify({ ip }) : host.includes('only.me') ? `${ipv6 ? 'IPv6' : 'IPv4'},${ip},1,,,` : ip
    await route.fulfill({ contentType: host.includes('ipify') ? 'application/json' : 'text/plain', body })
  })
  await page.goto('/')
  await expect(page.locator('.scan-state')).toHaveText('Scan complete')
  expect(calls.size).toBe(5)
  await page.locator('#coverage > details > summary').click()
  await page.getByRole('button', { name: 'I expect 3 IPv4 + 3 IPv6', exact: true }).click()
  await expect(page.locator('.coverage-summary')).toContainText('IPv4: 1 / 3')
  await expect(page.locator('.coverage-counts .coverage-missing')).toHaveCount(2)
  await page.getByRole('button', { name: 'Run multi-WAN scan', exact: true }).click()
  await expect(page.locator('.scan-state')).toHaveText('Scan complete', { timeout: 35000 })
  await expect(page.locator('.address-row')).toHaveCount(6)
  await expect(page.locator('.coverage-summary')).toContainText('IPv4: 3 / 3')
  await expect(page.locator('.coverage-summary')).toContainText('IPv6: 3 / 3')
  await expect(page.locator('.coverage-counts .coverage-missing')).toHaveCount(0)
  expect(calls.size).toBe(9)
  expect(calls.get('v4.ident.me')).toBe(3)
  expect(calls.get('v6.ident.me')).toBe(3)
  expect(calls.get('ip4only.me')).toBe(3)
  expect(calls.get('ip6only.me')).toBe(3)
  await page.locator('#diagnostics summary').click()
  await expect(page.locator('tbody tr')).toHaveCount(30)
  await page.locator('.language-switch button').filter({ hasText: 'DE' }).click()
  await expect(page.getByText('Erwartete Anzahl erreicht — kein Nachweis aller Leitungen')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('multi-wan-coverage.png'), fullPage: true })
})

test('WebRTC global device IPv6 is visible but never masquerades as a remote-confirmed connection', async ({ page }) => {
  await page.addInitScript(() => {
    class MockPeer {
      signalingState = 'stable'
      onicecandidate: ((event: { candidate: { type: string; address: string; candidate: string } | null }) => void) | null = null
      createDataChannel() {}
      async createOffer() { return {} }
      async setLocalDescription() {
        this.onicecandidate?.({ candidate: { type: 'host', address: '2606:4700:4700::1111', candidate: '' } })
        this.onicecandidate?.({ candidate: { type: 'host', address: 'fd00::1', candidate: '' } })
        this.onicecandidate?.({ candidate: { type: 'host', address: '192.168.1.1', candidate: '' } })
        this.onicecandidate?.({ candidate: null })
      }
      close() { this.signalingState = 'closed' }
    }
    Object.defineProperty(window, 'RTCPeerConnection', { value: MockPeer })
  })
  await page.route(/https:\/\/.*(ipify\.org|icanhazip\.com)/, (route) => route.abort())
  await page.goto('/')
  await expect(page.locator('.scan-state')).toHaveText('No public IP observed')
  await page.getByRole('button', { name: 'Scan options', exact: true }).click()
  await page.getByRole('checkbox', { name: /Include WebRTC/ }).check()
  await page.getByRole('button', { name: 'Scan again', exact: true }).click()
  await expect(page.locator('.scan-state')).toHaveText('Only device candidates exposed')
  await expect(page.locator('.address-row')).toHaveCount(1)
  await expect(page.locator('.address-label')).toContainText('Device candidate')
  await expect(page.locator('.primary-ip')).not.toContainText('2606:')
  await page.locator('#coverage > details > summary').click()
  await page.getByRole('button', { name: 'I expect 3 IPv4 + 3 IPv6', exact: true }).click()
  await expect(page.locator('.coverage-summary')).toContainText('IPv6: 0 / 3')
  await expect(page.getByText('1 device candidates, not remotely confirmed', { exact: true })).toBeVisible()
  await page.locator('#history > details > summary').click()
  await expect(page.locator('.history-item').first()).toContainText('0 addresses')
  await page.getByRole('button', { name: 'Hide IP addresses', exact: true }).click()
  await expect(page.locator('.address-value')).not.toContainText('2606:')
})
