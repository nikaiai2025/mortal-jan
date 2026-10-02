// Board images of given problems (question state, page overlays hidden) and their ground truth.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const all = fs.readFileSync(path.join(__dirname, '../../generated/problems.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const ids = process.argv[2].split(',').map(Number);
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  for (const id of ids) {
    const p = all.find(q => q.id === id);
    const question = { id: p.id, kind: p.kind, scene: p.scene, choices: p.choices };
    const page = await browser.newPage({ viewport: { width: 1920, height: 950 }, deviceScaleFactor: 2 });
    await page.route('**/api/**', route => new URL(route.request().url()).pathname === '/api/players' ? route.fulfill({ json: { token: 'o', publicId: 'o' } }) : route.fulfill({ json: { state: 'question', question } }));
    await page.goto('http://localhost:5174/');
    await page.waitForSelector('.board__canvas');
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: '.board__controls, .board__overlay { display: none !important; }' });
    await page.waitForTimeout(300);
    await page.locator('.board__canvas').screenshot({ path: path.join(__dirname, `scene-${id}.png`) });
    fs.writeFileSync(path.join(__dirname, `scene-${id}.truth.json`), JSON.stringify(p.scene, null, 1));
    await page.close();
  }
  await browser.close();
})();
