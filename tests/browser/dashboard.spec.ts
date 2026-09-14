import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

async function mockChecks(page: Page, getIpv4 = () => '8.8.8.8') {
  await page.route(/https:\/\/(api(6|64)?\.ipify\.org|ipv[46]\.icanhazip\.com|v[46]\.ident\.me|ip[46]only\.me)/, async (route) => {
    const url = route.request().url()
    const ip = url.includes('api6.') || url.includes('ipv6.') || url.includes('v6.ident') || url.includes('ip6only') ? '2606:4700:4700::1111'
      : url.includes('api64.') ? '1.1.1.1' : getIpv4()
    await route.fulfill({ contentType: url.includes('ipify') ? 'application/json' : 'text/plain', body: url.includes('ipify') ? JSON.stringify({ ip }) : url.includes('only.me') ? `${ip.includes(':') ? 'IPv6' : 'IPv4'},${ip},1,,,` : `${ip}\n` })
  })
}

test('discovers distinct public addresses, filters families, and keeps earlier observations', async ({ page }) => {
  let ip = '8.8.8.8'
  await mockChecks(page, () => ip)
  await page.goto('/')
  await expect(page.getByText('Scan complete', { exact: true })).toBeVisible()
  await expect(page.locator('.address-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'IPv6 1', exact: true }).click()
  await expect(page.locator('.address-row')).toHaveCount(1)
  await expect(page.locator('.address-value')).toHaveText('2606:4700:4700::1111')
  await page.getByRole('button', { name: 'All 3', exact: true }).click()
  ip = '9.9.9.9'
  await page.getByRole('button', { name: 'Scan again', exact: true }).click()
  await expect(page.getByText('Scan complete', { exact: true })).toBeVisible()
  await expect(page.locator('.address-row')).toHaveCount(4)
  await expect(page.getByText('Earlier scan', { exact: true })).toBeVisible()
  await expect(page.locator('.primary-ip')).not.toContainText('8.8.8.8')
  await page.getByRole('button', { name: 'Hide IP addresses', exact: true }).click()
  await expect(page.getByText('9.9.9.9', { exact: true })).toHaveCount(0)
  await expect(page.locator('.address-value').first()).toContainText('•••')
})

test('deeper scanning sends thirty diversified HTTP checks and metadata is opt-in', async ({ page }) => {
  await mockChecks(page)
  let lookups = 0
  await page.route('https://ipapi.co/**', async (route) => {
    lookups++
    await route.fulfill({ json: { ip: '8.8.8.8', org: 'Test network', asn: 'AS15169', city: 'Test City', country_name: 'Test Country', timezone: 'UTC' } })
  })
  await page.goto('/')
  await expect(page.getByText('Scan complete', { exact: true })).toBeVisible()
  expect(lookups).toBe(0)
  await page.getByRole('button', { name: 'Scan options' }).click()
  await expect(page.getByRole('checkbox', { name: /Include WebRTC/ })).not.toBeChecked()
  await page.getByRole('checkbox', { name: /Deeper discovery/ }).check()
  await page.getByRole('button', { name: 'Scan again', exact: true }).click()
  await expect(page.getByText('Scan complete', { exact: true })).toBeVisible({ timeout: 35000 })
  await page.locator('#diagnostics summary').click()
  await expect(page.locator('tbody tr')).toHaveCount(30)
  const firstIp = page.locator('.address-entry').filter({ has: page.locator('.address-value', { hasText: '8.8.8.8' }) })
  await firstIp.getByRole('button', { name: /Show details/ }).click()
  await firstIp.getByRole('button', { name: 'Look up details' }).click()
  await expect(page.getByText('Test network · AS15169')).toBeVisible()
  expect(lookups).toBe(1)
})

test('failed checks are visible, not fake IPs or a claim that IPv6 is unsupported', async ({ page }) => {
  await page.route(/https:\/\/.*(ipify\.org|icanhazip\.com)/, (route) => route.abort('internetdisconnected'))
  await page.goto('/')
  await expect(page.locator('.scan-state')).toHaveText('No public IP observed')
  await expect(page.locator('.address-row')).toHaveCount(0)
  await page.locator('#diagnostics summary').click()
  await expect(page.getByText('Could not reach the service.', { exact: false })).toHaveCount(5)
  await expect(page.getByText('Server sees a local/private address.', { exact: false })).toBeVisible()
})

test('IPv6-only addresses fit a narrow screen and blocked lookup errors are actionable', async ({ page }) => {
  await page.route(/https:\/\/.*(ipify\.org|icanhazip\.com)/, async (route) => {
    const url = route.request().url()
    if (url.includes('api6.') || url.includes('ipv6.')) {
      const ip = '2606:4700:1234:abcd:5678:efab:1234:abcd'
      await route.fulfill({ contentType: url.includes('ipify') ? 'application/json' : 'text/plain', body: url.includes('ipify') ? JSON.stringify({ ip }) : ip })
    } else await route.abort()
  })
  await page.route('https://ipapi.co/**', (route) => route.fulfill({ status: 429 }))
  await page.setViewportSize({ width: 320, height: 780 })
  await page.goto('/')
  await expect(page.getByText('Scan complete', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your observed public IPv6' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Show details for address 1' }).click()
  await page.getByRole('button', { name: 'Look up details', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Location lookup unavailable (HTTP 429)')
  await expect(page.getByRole('button', { name: 'Look up details', exact: true })).toBeEnabled()
})

test('demo makes no remote checks, supports copy and export, and looks good at this viewport', async ({ page, context }, testInfo) => {
  let remote = 0
  page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4179')) remote++ })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/?demo=1')
  await expect(page.getByText('You’re exploring a demo.')).toBeVisible()
  await expect(page.locator('.address-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'Copy primary IP address' }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('198.51.100.42')
  await page.getByRole('button', { name: 'Dismiss notification' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export report' }).click()
  const file = await download
  const path = await file.path()
  const report = JSON.parse(await readFile(path!, 'utf8'))
  expect(report.demo).toBe(true)
  expect(report.addresses).toHaveLength(3)
  await page.getByRole('button', { name: 'Dismiss notification' }).click()
  expect(remote).toBe(0)
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true })
})

test('stopping a scan cancels pending results and returning from demo never mixes example IPs', async ({ page }) => {
  // Hold requests until the browser cancels them, independent of worker speed.
  await page.route(/https:\/\/.*(ipify\.org|icanhazip\.com)/, () => {})
  await page.goto('/')
  await page.getByRole('button', { name: 'Stop scan', exact: true }).click()
  await expect(page.getByText('Scan stopped', { exact: true })).toBeVisible()
  await expect(page.locator('.address-row')).toHaveCount(0)
  await page.getByRole('button', { name: 'Explore a demo', exact: true }).click()
  await expect(page.locator('.address-row')).toHaveCount(3)
  await page.getByRole('button', { name: 'Back to live', exact: true }).click()
  await expect(page.locator('.address-value').filter({ hasText: '198.51.100.42' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Stop scan', exact: true }).click()
})
