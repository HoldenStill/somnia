import puppeteer from 'puppeteer-core'
import path from 'path'
import fs from 'fs'

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const ARTIFACT_DIR = 'C:\\Users\\Holden\\.gemini\\antigravity\\brain\\6981ec3b-4732-4710-bbc7-b6abcae38df9'

async function run() {
  console.log('Launching Chrome via puppeteer-core...')
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  console.log('Navigating to http://127.0.0.1:8000...')
  await page.goto('http://127.0.0.1:8000', { waitUntil: 'networkidle0' })
  await page.screenshot({ path: path.join(ARTIFACT_DIR, '01_main_screen.png') })
  console.log('Saved 01_main_screen.png')

  // 1. Click on "Test Poller Batch" to test detail view and auto-read
  const archiveBatch = await page.waitForSelector('text/Test Poller Batch')
  if (archiveBatch) {
    await archiveBatch.click()
    await new Promise(r => setTimeout(r, 1000))
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '02_batch_detail.png') })
    console.log('Saved 02_batch_detail.png')
  }

  // 2. Click "+ New Batch"
  const newBatchBtn = await page.waitForSelector('text/New Batch')
  if (newBatchBtn) {
    await newBatchBtn.click()
    await new Promise(r => setTimeout(r, 600))
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '03_new_batch_modal.png') })
    console.log('Saved 03_new_batch_modal.png')

    // Click "Advanced Controls"
    const advBtn = await page.waitForSelector('text/Advanced Controls')
    if (advBtn) {
      await advBtn.click()
      await new Promise(r => setTimeout(r, 400))
      await page.screenshot({ path: path.join(ARTIFACT_DIR, '04_advanced_controls.png') })
      console.log('Saved 04_advanced_controls.png')
    }

    // Close modal
    const closeBtn = await page.waitForSelector('button svg.lucide-x')
    if (closeBtn) {
      await closeBtn.click()
      await new Promise(r => setTimeout(r, 400))
    }
  }

  // 3. Open Settings Modal
  const settingsBtn = await page.waitForSelector('text/Settings & Auth')
  if (settingsBtn) {
    await settingsBtn.click()
    await new Promise(r => setTimeout(r, 600))
    await page.screenshot({ path: path.join(ARTIFACT_DIR, '05_settings_modal.png') })
    console.log('Saved 05_settings_modal.png')
  }

  await browser.close()
  console.log('Browser testing completed successfully!')
}

run().catch(err => {
  console.error('Browser test error:', err)
  process.exit(1)
})
