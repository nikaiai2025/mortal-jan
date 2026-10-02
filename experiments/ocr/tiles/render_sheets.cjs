// sheets.json の各シートを、RoboMajangの牌SVG（FluffyStuff、CC0）を並べたPNGにする。
// 使い方: node render_sheets.cjs   → <id>.png をこのフォルダへ出力
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const CHROME = process.env.CHROME_PATH; // unset: Playwright's own Chromium
const TILES = path.resolve(__dirname, '../../../assets/tiles'); // the site's tiles: the same FluffyStuff art RoboMajang draws
const HONORS = { E: 'Ton', S: 'Nan', W: 'Shaa', N: 'Pei', P: 'Haku', F: 'Hatsu', C: 'Chun' };
const SUITS = { m: 'Man', p: 'Pin', s: 'Sou' };
function svgName(pai) {
  if (pai in HONORS) return HONORS[pai];
  const [, n, suit, red] = /^([1-9])([mps])(r?)$/.exec(pai);
  return `${SUITS[suit]}${n}${red ? '-Dora' : ''}`;
}
const url = (name) => pathToFileURL(path.join(TILES, `${name}.svg`)).href;

function html(sheet) {
  const { width: w, rotate } = sheet;
  const h = Math.round((w * 4) / 3);
  const cell = rotate % 180 === 0 ? { w, h } : { w: h, h: w };
  const tile = (pai) =>
    `<div class="cell" style="width:${cell.w}px;height:${cell.h}px"><div class="tile" style="width:${w}px;height:${h}px;transform:rotate(${rotate}deg)"><img src="${url('Front')}"><img src="${url(svgName(pai))}"></div></div>`;
  const rows = sheet.rows.map((row) => `<div class="row">${row.map(tile).join('')}</div>`).join('');
  return `<!doctype html><html><head><style>
    body { margin: 0; background: #1d6b3c; }
    #sheet { display: inline-flex; flex-direction: column; gap: ${Math.round(w / 2)}px; padding: ${w}px; background: #1d6b3c; }
    .row { display: flex; gap: ${Math.round(w / 5)}px; }
    .cell { display: flex; align-items: center; justify-content: center; }
    .tile { position: relative; flex: none; }
    .tile img { position: absolute; inset: 0; width: 100%; height: 100%; }
  </style></head><body><div id="sheet">${rows}</div></body></html>`;
}

(async () => {
  const sheets = JSON.parse(fs.readFileSync(path.join(__dirname, 'sheets.json'), 'utf8'));
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const sheet of sheets) {
    const file = path.join(__dirname, `${sheet.id}.html`);
    fs.writeFileSync(file, html(sheet));
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
    await (await page.$('#sheet')).screenshot({ path: path.join(__dirname, `${sheet.id}.png`) });
    fs.unlinkSync(file);
    console.log(sheet.id);
  }
  await browser.close();
})();
