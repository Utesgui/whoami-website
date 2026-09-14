import { test, expect, type Page } from '@playwright/test'

const storageKey = 'whoami.connection-data.v1'
async function mockNetwork(page: Page, getIp = () => '8.8.8.8') {
  await page.route(/https:\/\/(api(6|64)?\.ipify\.org|ipv[46]\.icanhazip\.com)/, async (route) => {
    const url = route.request().url()
    const ip = url.includes('api6.') || url.includes('ipv6.') ? '2606:4700:4700::1111' : getIp()
    await route.fulfill({ contentType: url.includes('ipify') ? 'application/json' : 'text/plain', body: url.includes('ipify') ? JSON.stringify({ ip }) : ip })
  })
}
async function ready(page: Page) {
  await expect(page.getByText('Scan complete', { exact: true })).toBeVisible()
}
async function settings(page: Page) {
  const panel = page.locator('#preferences')
  if (!(await panel.getAttribute('open')) && !(await panel.evaluate((node) => node.hasAttribute('open')))) await panel.locator(':scope > summary').click()
  return panel
}
async function nameAddress(page: Page, name: string) {
  const entry = page.locator('.address-entry').filter({ has: page.locator('.address-value', { hasText: '8.8.8.8' }) })
  await entry.getByRole('button', { name: /Show details/ }).click()
  await entry.getByLabel('Your name for this address').fill(name)
  await entry.getByRole('button', { name: 'Save name' }).click()
  return entry
}

test('names and comparisons stay ephemeral by default and copy-all includes each IP once', async ({ page, context }) => {
  let ip = '8.8.8.8'
  await mockNetwork(page, () => ip)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await ready(page)
  await nameAddress(page, 'Home DSL')
  await expect(page.locator('.custom-name')).toHaveText('Home DSL')
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull()
  await page.getByRole('button', { name: 'Copy all IPs', exact: true }).click()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied.split(/\r?\n/).sort()).toEqual(['2606:4700:4700::1111', '8.8.8.8'].sort())
  ip = '1.1.1.1'
  await page.getByRole('button', { name: 'Scan again', exact: true }).click()
  await ready(page)
  await page.locator('#history > details > summary').click()
  await expect(page.locator('.history-item')).toHaveCount(2)
  await page.locator('.history-item').first().locator('summary').click()
  await expect(page.getByText('1 newly observed', { exact: true })).toBeVisible()
  await expect(page.getByText('1 not seen again', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Hide IP addresses', exact: true }).click()
  await expect(page.locator('.history-content')).not.toContainText('8.8.8.8')
  await expect(page.locator('.history-content')).not.toContainText('1.1.1.1')
  await page.reload()
  await ready(page)
  await expect(page.locator('.custom-name')).toHaveCount(0)
  await page.locator('#history > details > summary').click()
  await expect(page.locator('.history-item')).toHaveCount(1)
})

test('explicit storage survives reload, demo is isolated, and clearing removes only connection data', async ({ page }) => {
  await mockNetwork(page)
  await page.goto('/')
  await ready(page)
  await nameAddress(page, 'Work VPN')
  const panel = await settings(page)
  await panel.getByRole('button', { name: 'Dark', exact: true }).click()
  await panel.getByRole('checkbox', { name: /Remember connection data/ }).check()
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey)).not.toBeNull()
  await page.reload()
  await ready(page)
  await expect(page.locator('.custom-name')).toHaveText('Work VPN')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const saved = await page.evaluate((key) => localStorage.getItem(key), storageKey)
  await page.getByRole('button', { name: 'Explore a demo', exact: true }).click()
  await expect(page).toHaveURL(/\?demo=1/)
  await page.reload()
  await expect(page.getByText('You’re exploring a demo.')).toBeVisible()
  await expect(page.locator('.custom-name')).toHaveCount(0)
  await settings(page)
  await expect(page.getByRole('checkbox', { name: /Remember connection data/ })).toBeDisabled()
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe(saved)
  await page.getByRole('button', { name: 'Back to live', exact: true }).click()
  await ready(page)
  await expect(page).not.toHaveURL(/demo=/)
  await expect(page.locator('.custom-name')).toHaveText('Work VPN')
  await expect(page.locator('.address-value').filter({ hasText: '198.51.100' })).toHaveCount(0)
  await settings(page)
  await page.getByRole('button', { name: 'Clear connection data', exact: true }).click()
  await page.getByRole('button', { name: 'Yes, clear data', exact: true }).click()
  await expect(page.locator('.address-row')).toHaveCount(0)
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull()
  expect(await page.evaluate(() => localStorage.getItem('whoami.theme.v1'))).toBe('dark')
  await expect(page.getByRole('checkbox', { name: /Remember connection data/ })).not.toBeChecked()
})

test('storage removal failure is explicit and never falsely reports data as erased', async ({ page }) => {
  await mockNetwork(page)
  await page.goto('/')
  await ready(page)
  await settings(page)
  await page.getByRole('checkbox', { name: /Remember connection data/ }).check()
  await page.evaluate((key) => {
    const remove = Storage.prototype.removeItem
    Storage.prototype.removeItem = function (name) {
      if (name === key) throw new DOMException('Blocked', 'SecurityError')
      return remove.call(this, name)
    }
  }, storageKey)
  await page.getByRole('checkbox', { name: /Remember connection data/ }).click()
  await expect(page.getByRole('checkbox', { name: /Remember connection data/ })).toBeChecked()
  await expect(page.getByText('Saved data could not be erased.', { exact: false }).first()).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).not.toBeNull()
})

test('storage write failures keep opt-in off and corrupt saved data is not trusted', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, '{broken')
    const write = Storage.prototype.setItem
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Quota exceeded', 'QuotaExceededError')
      return write.call(this, name, value)
    }
  }, storageKey)
  await mockNetwork(page)
  await page.goto('/')
  await ready(page)
  await expect(page.getByText('Saved connection data is invalid or from another version.', { exact: false }).first()).toBeVisible()
  await settings(page)
  await page.getByRole('checkbox', { name: /Remember connection data/ }).click()
  await expect(page.getByRole('checkbox', { name: /Remember connection data/ })).not.toBeChecked()
  await expect(page.getByText('Connection data could not be saved.', { exact: false }).first()).toBeVisible()
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe('{broken')
})

test('another tab can revoke local saving without the active tab recreating its store', async ({ page, context }) => {
  await mockNetwork(page)
  await page.goto('/')
  await ready(page)
  await settings(page)
  await page.getByRole('checkbox', { name: /Remember connection data/ }).check()
  const other = await context.newPage()
  await other.goto('/?demo=1')
  await other.evaluate((key) => localStorage.removeItem(key), storageKey)
  await expect(page.getByRole('checkbox', { name: /Remember connection data/ })).not.toBeChecked()
  await page.getByRole('button', { name: 'Scan again', exact: true }).click()
  await ready(page)
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBeNull()
  await other.close()
})

test('language changes all live content and system appearance follows OS changes', async ({ page }) => {
  await page.goto('/?demo=1')
  await page.locator('.language-switch button').filter({ hasText: 'DE' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await expect(page.getByRole('heading', { level: 1 })).not.toContainText('Your connection')
  await settings(page)
  await expect(page.getByText('Einstellungen & Verlauf', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Dunkel', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'System', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await page.locator('.language-switch button').filter({ hasText: 'EN' }).click()
  await expect(page.getByRole('heading', { name: 'Your connection, clearly.' })).toBeVisible()
})

test('automatic scanning pauses while hidden or offline and excludes WebRTC and deep rounds', async ({ page, context }) => {
  await page.clock.install()
  let requests = 0
  page.on('request', (request) => { if (request.url().includes('check=')) requests++ })
  await mockNetwork(page)
  await page.goto('/')
  await ready(page)
  await page.getByRole('button', { name: 'Scan options' }).click()
  await page.getByRole('checkbox', { name: /Deeper discovery/ }).check()
  await page.getByRole('checkbox', { name: /Include WebRTC/ }).check()
  await settings(page)
  await page.getByLabel('Automatic scans', { exact: true }).selectOption('60')
  const initial = requests
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.clock.fastForward(90_000)
  expect(requests).toBe(initial)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.clock.fastForward(60_001)
  await expect.poll(() => requests).toBe(initial + 6)
  await ready(page)
  await page.locator('#history > details > summary').click()
  await expect(page.locator('.history-item').first()).toContainText('Automatic scan')
  await expect(page.locator('.history-item').first()).not.toContainText('WebRTC')
  await context.setOffline(true)
  await page.clock.fastForward(90_000)
  expect(requests).toBe(initial + 6)
  await context.setOffline(false)
  await page.getByLabel('Automatic scans', { exact: true }).selectOption('0')
  await page.clock.fastForward(90_000)
  expect(requests).toBe(initial + 6)
})

test('German dark layout remains readable without overflow', async ({ page }, testInfo) => {
  await page.goto('/?demo=1')
  await page.locator('.language-switch button').filter({ hasText: 'DE' }).click()
  await settings(page)
  await page.getByRole('button', { name: 'Dunkel', exact: true }).click()
  await page.locator('#history > details > summary').click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('german-dark.png'), fullPage: true })
})
