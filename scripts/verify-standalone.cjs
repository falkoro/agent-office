const { chromium } = require('@playwright/test');

async function main() {
  const url = process.env.PIXEL_AGENTS_URL || 'http://127.0.0.1:4627';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const messages = [];
  page.on('console', (msg) => messages.push(`${msg.type()}: ${msg.text()}`));
  page.on('pageerror', (err) => messages.push(`pageerror: ${err.message}`));

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(4000);

  const stats = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { hasCanvas: false };
    const ctx = canvas.getContext('2d');
    if (!ctx) return { hasCanvas: true, hasContext: false };
    const { width, height } = canvas;
    const image = ctx.getImageData(0, 0, width, height).data;
    let nonBlank = 0;
    const colors = new Set();
    for (let i = 0; i < image.length; i += 16) {
      const r = image[i];
      const g = image[i + 1];
      const b = image[i + 2];
      const a = image[i + 3];
      if (a !== 0 && (r !== 0 || g !== 0 || b !== 0)) nonBlank += 1;
      if (a !== 0) colors.add(`${r},${g},${b},${a}`);
      if (colors.size > 64 && nonBlank > 1000) break;
    }
    return {
      hasCanvas: true,
      width,
      height,
      nonBlank,
      uniqueColors: colors.size,
      title: document.title,
      favicon: document.querySelector('link[rel="icon"]')?.getAttribute('href') || null,
      hasLogo: !!document.querySelector('img[src="/agent-office.svg"]'),
      text: document.body.innerText.slice(0, 300),
    };
  });

  await page.screenshot({
    path: 'artifacts/agent-office-dashboard.png',
    fullPage: true,
  });
  await browser.close();

  console.log(JSON.stringify({ stats, messages: messages.slice(-20) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
