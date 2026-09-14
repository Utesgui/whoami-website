import { test, expect } from '@playwright/test'

test('Pages subpath serves all assets and discovers IPs without a backend', async ({ page }) => {
  const errors: string[] = []
  const localFailures: string[] = []
  let apiRequests = 0
  let publicChecks = 0
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin === 'http://127.0.0.1:4180' && url.pathname.includes('/api/')) apiRequests++
  })
  page.on('response', (response) => {
    if (response.url().startsWith('http://127.0.0.1:4180') && response.status() >= 400) localFailures.push(response.url())
  })
  await page.route(/https:\/\/(api(6|64)?\.ipify\.org|ipv[46]\.icanhazip\.com|v[46]\.ident\.me|ip[46]only\.me)/, async (route) => {
    publicChecks++
    const url = route.request().url()
    const ip = url.includes('api6.') || url.includes('ipv6.') || url.includes('v6.ident') || url.includes('ip6only') ? '2606:4700:4700::1111' : '8.8.8.8'
    await route.fulfill({ contentType: url.includes('ipify') ? 'application/json' : 'text/plain', body: url.includes('ipify') ? JSON.stringify({ ip }) : url.includes('only.me') ? `${ip.includes(':') ? 'IPv6' : 'IPv4'},${ip},1,,,` : ip })
  })
  await page.goto('./')
  await expect(page.locator('.scan-state')).toHaveText('Scan complete')
  await expect(page.locator('.address-row')).toHaveCount(2)
  expect(publicChecks).toBe(5)
  expect(apiRequests).toBe(0)
  await expect(page.getByRole('link', { name: 'JSON API', exact: true })).toHaveCount(0)
  await expect(page.locator('.connection-workbench')).toHaveCSS('border-radius', '13px')
  await page.getByRole('button', { name: 'Scan options', exact: true }).click()
  await expect(page.getByText('Three spaced rounds across 9 destinations', { exact: false })).toBeVisible()
  await page.getByRole('checkbox', { name: /Deeper discovery/ }).check()
  await page.getByRole('button', { name: 'Scan again', exact: true }).click()
  await expect(page.locator('.scan-state')).toHaveText('Scan complete', { timeout: 35000 })
  expect(publicChecks).toBe(32)
  await page.locator('#diagnostics summary').click()
  await expect(page.locator('tbody tr')).toHaveCount(27)
  expect(apiRequests).toBe(0)
  expect(localFailures).toEqual([])
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('demo and language switching survive reload under the Pages subpath', async ({ page }) => {
  await page.goto('./?demo=1')
  await expect(page.getByText('You’re exploring a demo.')).toBeVisible()
  await page.locator('.language-switch button').filter({ hasText: 'DE' }).click()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await expect(page).toHaveURL(/\/whoami-website\/\?demo=1/)
  await expect(page.locator('.address-row')).toHaveCount(3)
  await expect(page.locator('footer a[href="/api/whoami"]')).toHaveCount(0)
})
