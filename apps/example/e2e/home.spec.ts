import { test, expect } from '@optik/playwright'

test('home page', async ({ page, optik }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Optik Example/)
  await optik.snapshot('home/full-page')
})

test('home page — buttons section', async ({ page, optik }) => {
  await page.goto('/')
  const section = page.locator('section').first()
  await section.scrollIntoViewIfNeeded()
  await optik.snapshot('home/buttons')
})

test('home page — cards section', async ({ page, optik }) => {
  await page.goto('/')
  const section = page.locator('section').last()
  await section.scrollIntoViewIfNeeded()
  await optik.snapshot('home/cards')
})
