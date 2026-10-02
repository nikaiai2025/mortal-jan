// mortal-jan の問題（problem.scene）を RoboMajang の3D俯瞰（overhead3d）の卓画像へ描く。
// 使い方: node render.cjs <問題id,カンマ区切り>   → rm-<id>.png と rm-<id>.truth.json をこのフォルダへ出力
// 前提: RoboMajang の Vite 開発サーバーが 127.0.0.1:4179 で動いている（README.md）。
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.ROBOMAJANG_URL || 'http://127.0.0.1:4179';
const PROBLEMS = path.resolve(__dirname, '../../../generated/problems.jsonl');
const CHROME = process.env.CHROME_PATH; // unset: Playwright's own Chromium
const SERVER_HINT = '(in the RoboMajang repository) npm -w @robomajang/web run dev -- --host 127.0.0.1 --port 4179 --strictPort';

// ---- mjai表記 → RoboMajangの牌ID（packages/core/src/tiles.ts） ----
const HONORS = { E: 27, S: 28, W: 29, N: 30, P: 31, F: 32, C: 33 };
function tileId(pai) {
  if (pai in HONORS) return HONORS[pai];
  const m = /^([1-9])([mps])(r?)$/.exec(pai);
  if (!m || (m[3] && m[1] !== '5')) throw new Error(`unknown pai: ${pai}`);
  const suit = 'mps'.indexOf(m[2]);
  return m[3] ? 34 + suit : suit * 9 + Number(m[1]) - 1;
}
const isRed = (pai) => pai.endsWith('r');

// 俯瞰の副露は tiles[0] を横向きにして持ち主の右端へ置き、以降を左へ並べる（暗槓は tiles[0] と tiles[3] が伏せ牌）。
// 鳴いた牌を tiles[0]（横向き）にし、残りは画面上で左から consumed の順に見えるよう逆順で渡す。
function meldView(meld) {
  const consumed = meld.consumed.map(tileId);
  switch (meld.type) {
    case 'chi':
    case 'pon':
    case 'daiminkan':
      return { kind: meld.type, tiles: [tileId(meld.pai), ...consumed.reverse()], fromSeat: meld.target };
    case 'kakan':
      return { kind: 'kakan', tiles: [tileId(meld.pai), tileId(meld.added), ...consumed.reverse()], fromSeat: meld.target };
    case 'ankan': {
      // 表を向くのは中央の2枚（tiles[1], tiles[2]）。赤5があれば表へ出す。
      const order = [...meld.consumed].sort((a, b) => Number(isRed(b)) - Number(isRed(a)));
      const [first, ...rest] = order.map(tileId);
      return { kind: 'ankan', tiles: [rest[0], first, rest[1], rest[2]] };
    }
    default:
      throw new Error(`unknown meld type: ${meld.type}`);
  }
}

const WINDS = ['東', '南', '西', '北'];
const BAKAZE = { E: '東', S: '南', W: '西', N: '北' };

/** scene → SeatedSnapshotInput（wallState・doraIndicatorsはページ内で補う）。 */
function snapshotInput(scene) {
  const view = scene.seat;
  const hands = [0, 1, 2, 3].map((seat) =>
    seat === view
      ? [...scene.hand, ...(scene.drawn ? [scene.drawn] : [])].map(tileId)
      : Array(scene.concealedCounts[seat]).fill(0), // 他家は伏せ牌（中身は描かれない）
  );
  const drawnIndexes = [0, 1, 2, 3].map((seat) => (seat === view && scene.drawn ? scene.hand.length : null));
  // 打牌の順: 親から順に1巡ずつ交互に並べる（各席の河の順は保つ）。
  const decisions = [];
  const called = [];
  const longest = Math.max(...scene.rivers.map((river) => river.length));
  for (let turn = 0; turn < longest; turn++)
    for (let k = 0; k < 4; k++) {
      const seat = (scene.oya + k) % 4;
      const tile = scene.rivers[seat][turn];
      if (!tile) continue;
      if (tile.called) called.push(decisions.length);
      decisions.push({ seat, chosen: tileId(tile.pai), riichiDeclared: Boolean(tile.riichi) });
    }
  return {
    seed: 1,
    viewSeat: view,
    hands,
    drawnIndexes,
    decisions,
    completedDecisionCount: decisions.length,
    calledDecisionIndexes: called, // ページ内で Set にする
    melds: scene.melds.map((melds) => melds.map(meldView)),
    doraIndicators: scene.doraMarkers.map(tileId),
    extraDoraIndicators: [],
    wallRemaining: scene.tilesLeft,
    panelInfo: {
      playerName: '',
      score: scene.scores[view],
      roundLabel: `${BAKAZE[scene.bakaze]}${scene.kyoku}局`,
      wallRemaining: scene.tilesLeft,
      // 画面位置順: 0=手前（自席）, 1=右（下家）, 2=対面, 3=左（上家）
      seats: [0, 1, 2, 3].map((position) => {
        const seat = (view + position) % 4;
        return {
          score: scene.scores[seat],
          wind: WINDS[(seat - scene.oya + 4) % 4],
          dealer: seat === scene.oya,
          riichi: Boolean(scene.riichi[seat]),
        };
      }),
      showScoreGap: false,
    },
    openHands: false,
  };
}

// ---- ページ内: 俯瞰の描画器を1つ載せ、入力ごとに描いてPNGを返す ----
async function setupPage() {
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const [{ mountSeatedView }, { overhead3dViewSource }, { wallPresentationState }] = await Promise.all([
    import('/src/seated_view.ts'),
    import('/src/overhead3d_view.ts'),
    import('/src/wall_presentation.ts'),
  ]);
  document.body.innerHTML = '';
  document.body.style.margin = '0';
  const pane = document.createElement('div');
  pane.className = 'table-pane';
  pane.style.cssText = 'position:relative;width:1000px;height:1000px;';
  const canvas = document.createElement('canvas');
  canvas.className = 'seated-runtime';
  canvas.style.cssText = 'display:block;width:1000px;height:1000px;';
  pane.append(canvas);
  document.body.append(pane);
  let failure = null;
  const host = mountSeatedView(canvas, { source: overhead3dViewSource, onError: (error) => { failure = error; } });
  const wallState = wallPresentationState({ diceSum: 7 });
  window.__renderScene = async (raw) => {
    const input = { ...raw, wallState, calledDecisionIndexes: new Set(raw.calledDecisionIndexes) };
    host.render(input);
    const deadline = performance.now() + 20000;
    while (!canvas.classList.contains('ready')) {
      if (failure) throw failure;
      if (performance.now() > deadline) throw new Error('overhead canvas did not become ready');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    // 初回描画後の解像度合わせ（requestAnimationFrame）と点数の字体の読み込みを待って描き直す。
    await nextFrame();
    await nextFrame();
    await document.fonts.load("700 40px 'DotGothic16'");
    await document.fonts.ready;
    host.render(input);
    await nextFrame();
    if (failure) throw failure;
    // 卓の奥（画像の上部）は透明なので、黒で塗った上に重ねて不透明にする。
    const flat = document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    const context = flat.getContext('2d');
    context.fillStyle = '#000';
    context.fillRect(0, 0, flat.width, flat.height);
    context.drawImage(canvas, 0, 0);
    return flat.toDataURL('image/png');
  };
}

async function ensureServer() {
  try {
    const response = await fetch(`${BASE}/privacy.html`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error(`RoboMajang dev server is not reachable at ${BASE} (${error.message}).`);
    console.error(`Start it first:\n  ${SERVER_HINT}`);
    process.exit(2);
  }
}

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: node render.cjs <problem ids, comma-separated>');
    process.exit(1);
  }
  const ids = arg.split(',').map((id) => Number(id.trim()));
  const byId = new Map();
  for (const line of fs.readFileSync(PROBLEMS, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const problem = JSON.parse(line);
    if (ids.includes(problem.id)) byId.set(problem.id, problem);
  }
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    console.error(`problem id not found: ${missing.join(',')}`);
    process.exit(1);
  }
  await ensureServer();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 1 });
    page.on('pageerror', (error) => console.error('[page error]', error.message));
    await page.goto(`${BASE}/privacy.html`);
    await page.evaluate(setupPage);
    for (const id of ids) {
      const scene = byId.get(id).scene;
      const dataUrl = await page.evaluate((input) => window.__renderScene(input), snapshotInput(scene));
      const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
      fs.writeFileSync(path.join(__dirname, `rm-${id}.png`), png);
      fs.writeFileSync(path.join(__dirname, `rm-${id}.truth.json`), JSON.stringify(scene, null, 1));
      console.log(`rm-${id}.png (${png.length} bytes)`);
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
