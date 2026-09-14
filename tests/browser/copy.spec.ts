import { test, expect } from '@playwright/test'

test('each IP in overview, address list, diagnostics and history copies the exact address', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/?demo=1')
  const primary = page.getByRole('button', { name: 'Copy primary IP address', exact: true })
  await primary.focus()
  await page.keyboard.press('Enter')
  await expect(primary).toHaveClass(/is-copied/)
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('198.51.100.42')

  for (const row of await page.locator('.address-row').all()) {
    const ip = await row.locator('.address-value').innerText()
    const button = row.locator('.copy-ip-button')
    await expect(button).toHaveCount(1)
    await button.click()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(ip)
    await expect(button).toHaveClass(/is-copied/)
  }
  await page.locator('#diagnostics summary').click()
  for (const row of await page.locator('tbody tr').all()) {
    const ip = await row.locator('.result-status').innerText()
    const button = row.locator('.copy-ip-button')
    await button.click()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(ip)
    await expect(button).toHaveClass(/is-copied/)
  }
  await page.locator('#history > details > summary').click()
  await page.locator('.history-item').first().locator('summary').click()
  for (const item of await page.locator('.history-addresses li').all()) {
    const ip = await item.locator('code').innerText()
    const button = item.locator('.copy-ip-button')
    await button.click()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(ip)
    await expect(button).toHaveClass(/is-copied/)
  }
  await page.getByRole('button', { name: 'Hide IP addresses', exact: true }).click()
  const historyButton = page.locator('.history-addresses .copy-ip-button').first()
  await historyButton.click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('198.51.100.42')
  await expect(historyButton).toHaveClass(/is-copied/)
  await expect(historyButton).not.toHaveClass(/is-copied/, { timeout: 3000 })
  await expect(page.locator('.history-addresses code').first()).toHaveText('••••••••')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('copy-controls.png'), fullPage: true })
})

test('blocked clipboard reports failure without showing success and controls remain usable', async ({ page }) => {
  await page.goto('/?demo=1')
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true, value: async () => { throw new DOMException('Not allowed', 'NotAllowedError') },
    })
  })
  await page.locator('#diagnostics summary').click()
  const button = page.locator('tbody .copy-ip-button').first()
  await button.click()
  await expect(page.getByText('Clipboard unavailable. Select the address and copy it manually.')).toBeVisible()
  await expect(button).not.toHaveClass(/is-copied/)
  await expect(button).toBeEnabled()
  await page.locator('.language-switch button').filter({ hasText: 'DE' }).click()
  await expect(button).toHaveAttribute('aria-label', 'Adresse kopieren')
  await expect(page.getByText('Zwischenablage nicht verfügbar. Markiere die Adresse und kopiere sie manuell.')).toBeVisible()
})
