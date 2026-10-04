// 図の形式 and グラフ要素 and 校閲 in a real browser: 背景の削除 and 透明色を指定 (the new picture's pixels are checked),
// 図の圧縮 (a 3000-pixel picture comes back 1280 wide), グラフ要素を追加 (data labels, legend) and 行/列の切り替え,
// 比較 with a deck in the library (a changed slide taken back), and インクの非表示.
// Usage: node qa/studio-format.mjs [--base=http://127.0.0.1:8787]   (with `npm start` running)
import { mkdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK = "1";
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/opt/node22/lib/node_modules/playwright");
const root = fileURLToPath(new URL("..", import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")));
const base = args.base || "http://127.0.0.1:8787";
const outDir = join(root, "qa", "out");
await mkdir(outDir, { recursive: true });
// Test pictures: a navy square on a white background (and a large one for compression).
const logo = join(outDir, "format-logo.png");
const big = join(outDir, "format-big.png");
execFileSync("python3", ["-c", `
from PIL import Image, ImageDraw
im = Image.new("RGB", (400, 300), (255, 255, 255)); d = ImageDraw.Draw(im); d.rectangle([100, 75, 300, 225], fill=(31, 56, 100)); im.save("${logo}")
im = Image.new("RGB", (3000, 2000), (220, 228, 242)); d = ImageDraw.Draw(im)
for i in range(0, 3000, 50): d.line([(i, 0), (3000 - i, 2000)], fill=(31, 56, 100), width=3)
im.save("${big}")
`]);

const browserArgs = process.env.PROXY_CA_SPKI ? [`--ignore-certificate-errors-spki-list=${process.env.PROXY_CA_SPKI}`] : [];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" } : undefined, args: browserArgs });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => { if (message.type() === "error" && !/ERR_TUNNEL|ytimg|ERR_CERT|fonts\.g/.test(message.text())) errors.push(`console: ${message.text()}`); });
page.on("dialog", (dialog) => dialog.accept());
const shot = async (name) => { const file = join(outDir, `format-${name}.png`); await page.screenshot({ path: file }); console.log("saved", file); };
const step = async (label, fn) => {
  try { await page.waitForTimeout(150); await fn(); console.log("ok  ", label); } catch (error) { errors.push(`${label}: ${error.message}`); console.log("FAIL", label, error.message); await shot(`fail-${errors.length}`); }
  if (await page.isVisible("dialog[open]")) await page.keyboard.press("Escape");
  if (await page.isVisible(".rb-pop")) await page.keyboard.press("Escape");
};
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const deck = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__hsej.deck())));
const slide = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__hsej.slide())));
const tab = (label) => page.click(`.rb-tabs [role=tab]:text-is("${label}")`);
const ribbonBtn = async (label) => {
  const sel = `.rb-btn:not(.rb-folded):has-text("${label}")`;
  const direct = page.locator(`.rb-body ${sel}`).first();
  if ((await direct.count()) && (await direct.isVisible())) return direct.click();
  for (const folded of await page.locator(".rb-body .rb-folded").all()) {
    await folded.click();
    const inside = page.locator(`.rb-pop .rb-fold ${sel}`).first();
    if (await inside.count()) return inside.click();
    await page.keyboard.press("Escape");
  }
  throw new Error(`no ribbon button "${label}"`);
};
const menuItem = (label) => page.locator(`.rb-pop .rb-menu button:has-text("${label}")`).first().click();
const undo = async () => { await page.keyboard.press("Control+z"); await page.waitForTimeout(300); };
const withFiles = async (paths, open) => { const [chooser] = await Promise.all([page.waitForEvent("filechooser"), open()]); await chooser.setFiles(paths); };
/** The alpha at (fx, fy) of a picture object's image (fractions of the image), and its natural size. */
const pixel = (id, fx, fy) => page.evaluate(async ([id, fx, fy]) => {
  const img = document.querySelector(`#stageBody .hs-obj[data-el="${id}"] img`);
  await img.decode?.().catch(() => {});
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const d = g.getImageData(Math.floor(fx * c.width), Math.floor(fy * c.height), 1, 1).data;
  return { a: d[3], w: c.width, h: c.height };
}, [id, fx, fy]);
const insertPicture = async (file) => {
  const count = (await slide()).elements?.filter((o) => o.kind === "image").length || 0;
  await tab("挿入");
  await ribbonBtn("画像");
  await withFiles([file], () => menuItem("このデバイス"));
  await page.waitForFunction((n) => (window.__hsej.slide().elements || []).filter((o) => o.kind === "image").length > n, count, { timeout: 8000 });
  await page.waitForTimeout(500);
  return (await slide()).elements.at(-1);
};

await page.goto(base);
await page.evaluate(() => localStorage.clear());
await page.goto(base);
await page.click("#sampleDeckBtn");
await page.waitForSelector(".film-item");
await page.waitForSelector("#ribbon:not([hidden]) .rb-tabs");
await tab("挿入");
await ribbonBtn("新しいスライド");
await menuItem("白紙");
await page.waitForTimeout(400);

await step("背景の削除: the white around the square goes, the square stays (one ⌘Z)", async () => {
  const o = await insertPicture(logo);
  assert(o.kind === "image", "a picture");
  await page.waitForSelector('.rb-tabs [role=tab]:text-is("図の形式")');
  await tab("図の形式");
  await ribbonBtn("背景の");
  await page.waitForFunction((src) => window.__hsej.slide().elements.at(-1).src !== src, o.src, { timeout: 8000 });
  await page.waitForTimeout(400);
  const n = (await slide()).elements.at(-1);
  assert(/^idb:/.test(n.src) && n.id === o.id, `a new picture: ${n.src}`);
  assert((await pixel(n.id, 0.02, 0.02)).a === 0, "the corner is transparent");
  assert((await pixel(n.id, 0.5, 0.5)).a === 255, "the square stays");
  await shot("background");
  await undo();
  assert((await slide()).elements.at(-1).src === o.src, "⌘Z brings the old picture back");
});

await step("透明色を指定: a click on the white makes the white transparent", async () => {
  const o = (await slide()).elements.at(-1);
  await tab("図の形式");
  await ribbonBtn("透明色を指定");
  await page.waitForSelector(".ed-pick-color");
  const r = await page.locator(`#stageBody .hs-obj[data-el="${o.id}"]`).boundingBox();
  await page.mouse.click(r.x + r.width * 0.05, r.y + r.height * 0.05);
  await page.waitForFunction((src) => window.__hsej.slide().elements.at(-1).src !== src, o.src, { timeout: 8000 });
  await page.waitForTimeout(400);
  const n = (await slide()).elements.at(-1);
  assert((await pixel(n.id, 0.9, 0.9)).a === 0 && (await pixel(n.id, 0.5, 0.5)).a === 255, "white gone, navy kept");
});

await step("図の圧縮: a 3000-pixel picture becomes 1280 pixels wide", async () => {
  const o = await insertPicture(big);
  const before = await pixel(o.id, 0.5, 0.5);
  assert(before.w >= 2000, `a large picture first: ${before.w}`);
  await tab("図の形式");
  await ribbonBtn("図の圧縮");
  await page.waitForSelector(".compress-dialog[open]");
  await page.selectOption(".compress-dialog select", "1280");
  await page.click(".compress-dialog .cp-ok");
  await page.waitForFunction((src) => window.__hsej.slide().elements.find((x) => x.kind === "image" && x.src !== src && x.fileName?.includes("big")), o.src, { timeout: 10000 });
  await page.waitForTimeout(500);
  const n = (await slide()).elements.find((x) => x.id === o.id);
  const after = await pixel(n.id, 0.5, 0.5);
  assert(after.w === 1280, `1280 wide: ${after.w}`);
});

await step("グラフ要素を追加 and 行/列の切り替え", async () => {
  await tab("挿入");
  await ribbonBtn("グラフ");
  await page.click('.tb-chart-grid button[data-chart="clustered-bar"]');
  await page.waitForTimeout(400);
  if (await page.isVisible("dialog[open]")) await page.keyboard.press("Escape");
  let o = (await slide()).elements.at(-1);
  const node = () => page.locator(`#stageBody .hs-obj[data-el="${o.id}"]`);
  assert((await node().locator(".hs-val").count()) > 0, "values shown");
  await tab("グラフのデザイン");
  await ribbonBtn("グラフ要素");
  await page.locator('.rb-pop .rb-menu button:has-text("なし")').first().click();
  await page.waitForTimeout(300);
  assert((await node().locator(".hs-val").count()) === 0, "data labels off");
  await ribbonBtn("グラフ要素");
  await page.locator('.rb-pop .rb-menu button:text-is("下")').click().catch(async () => menuItem("下"));
  await page.waitForTimeout(300);
  assert(await node().locator(".hs-legend.at-bottom").count(), "the legend below");
  const before = (await slide()).elements.at(-1).chart;
  await ribbonBtn("行/列の切り替え");
  await page.waitForTimeout(300);
  o = (await slide()).elements.at(-1);
  assert(JSON.stringify(o.chart.labels) === JSON.stringify(before.series.map((s) => s.name)) && o.chart.series.length === before.labels.length, `transposed: ${JSON.stringify(o.chart.labels)}`);
  await shot("chart-elements");
});

await step("比較: with the deck saved in the library, a changed title is found and taken back", async () => {
  await page.click("#saveDeckBtn");
  await page.waitForTimeout(800);
  const original = (await deck()).slides[3].title;
  await page.locator('.film-item[data-index="3"]').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__hsej.slide().title = "書き換えたタイトル"; });
  await page.locator('.film-item[data-index="2"]').click();
  await page.locator('.film-item[data-index="3"]').click();
  await page.waitForTimeout(300);
  await tab("校閲");
  await ribbonBtn("比較");
  await page.waitForSelector(".compare-dialog[open] .st-source");
  await page.locator(`.compare-dialog .st-source:has-text("${(await deck()).title.slice(0, 6)}")`).first().click();
  await page.waitForSelector(".compare-dialog .cmp-item");
  const items = await page.$$eval(".compare-dialog .cmp-item", (els) => els.map((el) => [el.dataset.kind, el.querySelector(".cmp-what").textContent]));
  assert(items.some(([kind, what]) => kind === "changed" && what.includes("タイトル")), `found: ${JSON.stringify(items)}`);
  await shot("compare");
  await page.locator('.compare-dialog .cmp-item[data-kind="changed"] .cmp-take').first().click();
  await page.waitForTimeout(400);
  assert((await deck()).slides[3].title === original, `taken back: ${(await deck()).slides[3].title}`);
  await page.keyboard.press("Escape");
});

await step("インクの非表示: ink on the slide is hidden while editing, and shown again", async () => {
  await page.evaluate(() => { const s = window.__hsej.slide(); s.elements = [...(s.elements || []), { id: "ink1", kind: "ink", x: 200, y: 300, w: 400, h: 120, strokes: [{ pts: [[0, 0], [1, 1]], color: "#1f3864", width: 6 }] }]; });
  await page.locator('.film-item[data-index="2"]').click();
  await page.locator('.film-item[data-index="3"]').click();
  await page.waitForTimeout(300);
  assert(await page.isVisible('#stageBody .hs-obj[data-el="ink1"]'), "ink shown");
  await tab("校閲");
  await ribbonBtn("インクの");
  assert(await page.locator("#stageBody.hide-ink").count(), "hidden class");
  assert(!(await page.isVisible('#stageBody .hs-obj[data-el="ink1"]')), "ink hidden");
  await ribbonBtn("インクの");
  assert(await page.isVisible('#stageBody .hs-obj[data-el="ink1"]'), "ink back");
});

/** The colour at (fx, fy) of a picture object's image. */
const rgb = (id, fx, fy) => page.evaluate(async ([id, fx, fy]) => {
  const img = document.querySelector(`#stageBody .hs-obj[data-el="${id}"] img`);
  await img.decode?.().catch(() => {});
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  return Array.from(g.getImageData(Math.floor(fx * c.width), Math.floor(fy * c.height), 1, 1).data.slice(0, 3));
}, [id, fx, fy]);

await step("アート効果「線画」: the square's edge drawn dark on white (one ⌘Z back); 色の変更「濃紺」 tones the picture", async () => {
  const o = await insertPicture(logo);
  await tab("図の形式");
  await ribbonBtn("アート");
  await menuItem("線画");
  await page.waitForFunction((src) => window.__hsej.slide().elements.at(-1).src !== src, o.src, { timeout: 15000 });
  await page.waitForTimeout(400);
  const n = (await slide()).elements.at(-1);
  const inside = await rgb(n.id, 0.5, 0.5);
  const edge = await rgb(n.id, 0.25, 0.5);
  assert(inside[0] > 200 && edge[0] < 150, `line drawing: inside ${inside}, edge ${edge}`);
  await shot("art-lines");
  await undo();
  assert((await slide()).elements.at(-1).src === o.src, "⌘Z brings the picture back");
  await tab("図の形式");
  await page.locator('.rb-body .rb-btn[title^="色の変更"]').first().click();
  await menuItem("濃紺");
  await page.waitForFunction((src) => window.__hsej.slide().elements.at(-1).src !== src, o.src, { timeout: 15000 });
  await page.waitForTimeout(400);
  const toned = await rgb((await slide()).elements.at(-1).id, 0.5, 0.5);
  assert(toned[2] >= toned[1] && toned[1] >= toned[0] && toned[2] < 160, `navy tone: ${toned}`);
});

/** A ribbon button found by the start of its tooltip (the ▾ halves of split buttons have no words), folded groups too. */
const byTitle = async (start) => {
  const sel = `.rb-btn:not(.rb-folded)[title^="${start}"]`;
  const direct = page.locator(`.rb-body ${sel}`).first();
  if ((await direct.count()) && (await direct.isVisible())) return direct.click();
  for (const folded of await page.locator(".rb-body .rb-folded").all()) {
    await folded.click();
    const inside = page.locator(`.rb-pop .rb-fold ${sel}`).first();
    if (await inside.count()) return inside.click();
    await page.keyboard.press("Escape");
  }
  throw new Error(`no ribbon button titled "${start}…"`);
};

await step("箇条書き ▾ ◆ and 段落番号 ▾ ①; 文字列の方向 270 度; リンクのスクリーンヒント", async () => {
  await tab("挿入");
  await ribbonBtn("テキスト ボックス");
  await menuItem("横書きテキスト ボックス");
  const r = await page.locator(".slide-wrap .hs-slide").first().boundingBox();
  await page.mouse.click(r.x + r.width * 0.2, r.y + r.height * 0.75);
  await page.waitForTimeout(200);
  await page.keyboard.type("一行目");
  await page.keyboard.press("Enter");
  await page.keyboard.type("二行目");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const id = (await slide()).elements.at(-1).id;
  const text = async () => (await slide()).elements.find((o) => o.id === id).text;
  await tab("ホーム");
  await byTitle("箇条書きの種類");
  await page.click('.rb-pop .rb-list-sw[data-list-style="diamond"]');
  await page.waitForTimeout(200);
  assert((await text()).startsWith('<ul data-style="diamond">'), `bullets: ${await text()}`);
  const marker = await page.evaluate((id) => getComputedStyle(document.querySelector(`#stageBody .hs-obj[data-el="${id}"] ul`)).listStyleType, id);
  assert(marker.includes("◆"), `drawn with ◆: ${marker}`);
  await byTitle("段落番号の種類");
  await page.click('.rb-pop .rb-list-sw[data-list-style="circled"]');
  await page.waitForTimeout(200);
  assert((await text()).startsWith('<ol data-style="circled">'), `numbers: ${await text()}`);
  await byTitle("文字列の方向");
  await menuItem("270 度");
  await page.waitForTimeout(200);
  assert((await slide()).elements.find((o) => o.id === id).textRot === 270, "turned 270°");
  assert(await page.locator(`#stageBody .hs-obj[data-el="${id}"] .hs-obj-text.is-rot270`).count(), "drawn turned");
  await shot("bullets-direction");
  await byTitle("文字列の方向");
  await menuItem("横書き");
  await page.waitForTimeout(200);
  assert(!(await slide()).elements.find((o) => o.id === id).textRot, "横書き again");
  // ヒント設定: the words shown when the pointer is on it (with a click that moves on).
  await tab("挿入");
  await ribbonBtn("リンク");
  await page.waitForSelector(".rb-pop .rb-form");
  await page.selectOption('.rb-pop .rb-form select[aria-label="クリックしたときの動作"]', "next");
  await page.fill(".rb-pop .rb-link-tip", "次のページへ進みます");
  await page.click('.rb-pop .rb-form button:has-text("設定する")');
  await page.waitForTimeout(200);
  const o = (await slide()).elements.find((x) => x.id === id);
  assert(o.action?.type === "next" && o.tip === "次のページへ進みます", `the link and its ScreenTip: ${JSON.stringify({ action: o.action, tip: o.tip })}`);
});

await step("トリミング ▾: 縦横比 16:9 crops the middle of a 4:3 picture; 枠に合わせる shows it whole again", async () => {
  const pic = await insertPicture(logo);
  await tab("図の形式");
  await byTitle("トリミングのオプション");
  await menuItem("16:9");
  await page.waitForTimeout(300);
  let o = (await slide()).elements.find((x) => x.id === pic.id);
  assert(Math.abs(o.w / o.h - 16 / 9) < 0.02 && o.crop && o.crop.t > 0.1 && !o.crop.l, `16:9: ${o.w}×${o.h} ${JSON.stringify(o.crop)}`);
  await byTitle("トリミングのオプション");
  await menuItem("枠に合わせる");
  await page.waitForTimeout(300);
  o = (await slide()).elements.find((x) => x.id === pic.id);
  assert(!o.crop && Math.abs(o.w / o.h - 4 / 3) < 0.02, `fit: ${o.w}×${o.h} ${JSON.stringify(o.crop)}`);
});

await step("デザイン → 背景の書式設定: an SEJ light colour, a picture at 50%, すべてに適用, 背景のリセット", async () => {
  await page.locator(".film-item").nth(2).click();
  await tab("デザイン");
  await byTitle("このスライドの背景");
  await page.waitForSelector(".bg-dialog[open]");
  await page.click('.bg-dialog .bg-sw[data-color="#dce4f2"]');
  await page.waitForTimeout(250);
  assert((await slide()).background?.color === "#dce4f2", `the colour: ${JSON.stringify((await slide()).background)}`);
  const painted = await page.evaluate(() => getComputedStyle(document.querySelector("#stageBody .slide-wrap .hs-bg")).backgroundColor);
  assert(/220, 228, 242/.test(painted), `drawn under the slide: ${painted}`);
  await withFiles([logo], () => page.click(".bg-dialog .bg-file"));
  await page.waitForFunction(() => window.__hsej.slide().background?.image, null, { timeout: 8000 });
  await page.locator(".bg-dialog .bg-transparency").fill("50");
  await page.waitForTimeout(250);
  let bg = (await slide()).background;
  assert(bg.image?.startsWith("idb:") && bg.transparency === 0.5 && !bg.color, `the picture at 50%: ${JSON.stringify(bg)}`);
  assert(await page.evaluate(() => getComputedStyle(document.querySelector("#stageBody .slide-wrap .hs-bg-img")).opacity) === "0.5", "drawn at half");
  assert(await page.locator("#stageBody .slide-wrap .hs-sej").count(), "the SEJ master stays on top");
  await shot("background");
  await page.click(".bg-dialog .bg-all");
  await page.waitForTimeout(250);
  assert((await deck()).slides.every((s) => s.background?.image === bg.image), "every slide");
  await page.click(".bg-dialog .bg-reset");
  await page.waitForTimeout(250);
  assert(!(await slide()).background, "this slide's background reset");
  await page.click('.bg-dialog .btn-primary');
  await undo();
  await undo();
  bg = (await slide()).background;
  assert(!(await deck()).slides.some((s) => s.background), `two undos: as before (${JSON.stringify(bg)})`);
});

await step("均等割り付け (⇧⌘J), オートコレクト ((c) → ©, 「・ 」で箇条書き, 「1. 」で段落番号)", async () => {
  await tab("挿入");
  await ribbonBtn("テキスト ボックス");
  await menuItem("横書きテキスト ボックス");
  const r = await page.locator(".slide-wrap .hs-slide").first().boundingBox();
  await page.mouse.click(r.x + r.width * 0.25, r.y + r.height * 0.6);
  await page.waitForTimeout(200);
  await page.keyboard.type("著作権 (c) と --> 矢印");
  await page.keyboard.press("Enter");
  await page.keyboard.type("・ 一つ目");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const o = (await slide()).elements.at(-1);
  assert(/著作権 © と → 矢印/.test(o.text), `symbols: ${o.text}`);
  assert(/<ul><li>一つ目<\/li><\/ul>/.test(o.text), `a bullet from 「・ 」: ${o.text}`);
  await page.keyboard.press("Control+Shift+j");
  await page.waitForTimeout(200);
  assert((await slide()).elements.find((x) => x.id === o.id).align === "distributed", "⇧⌘J: 均等割り付け");
  const css = await page.evaluate((id) => { const s = getComputedStyle(document.querySelector(`#stageBody .hs-obj[data-el="${id}"] .hs-obj-tx`)); return `${s.textAlign}|${s.textAlignLast}`; }, o.id);
  assert(css === "justify|justify", `drawn justified to the last line: ${css}`);
  // A numbered paragraph from 「1. 」, in a new box; turned off, it stays as typed.
  await tab("挿入");
  await ribbonBtn("テキスト ボックス");
  await menuItem("横書きテキスト ボックス");
  await page.mouse.click(r.x + r.width * 0.25, r.y + r.height * 0.8);
  await page.waitForTimeout(200);
  await page.keyboard.type("① 最初");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const n = (await slide()).elements.at(-1);
  assert(/^<ol data-style="circled"><li>最初<\/li><\/ol>$/.test(n.text), `numbers from 「① 」: ${n.text}`);
  await tab("校閲");
  await byTitle("入力中に (c)");
  await page.waitForSelector(".ac-dialog[open]");
  await page.uncheck('.ac-dialog input[data-ac="replace"]');
  await page.click(".ac-dialog .ac-ok");
  assert(JSON.parse(await page.evaluate(() => localStorage.getItem("hsej-autocorrect"))).replace === false, "kept");
  await page.locator(`#stageBody .hs-obj[data-el="${n.id}"]`).dblclick();
  await page.keyboard.press("End");
  await page.keyboard.type(" (c)");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert(/最初 \(c\)/.test((await slide()).elements.find((x) => x.id === n.id).text), "off: typed as it is");
  await page.evaluate(() => localStorage.removeItem("hsej-autocorrect"));
});

await step("表: 均等割り付け, セルの余白 (狭い・ユーザー設定), 文字列の方向 (縦書き)", async () => {
  await tab("挿入");
  await ribbonBtn("表");
  await page.waitForSelector(".tb-pick");
  await page.locator(".tb-pick button").nth(1 * 10 + 2).click();
  await page.waitForTimeout(400);
  await page.keyboard.type("見出し");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const id = (await slide()).elements.at(-1).id;
  const cell = async () => (await slide()).elements.find((x) => x.id === id).cells[0][0];
  assert(JSON.stringify(await page.evaluate(() => window.__hsej.selection())) === JSON.stringify([id]), "the table is chosen (typing ended)");
  await tab("レイアウト");
  await byTitle("均等割り付け");
  await page.waitForTimeout(200);
  assert((await cell()).align === "distributed", `the cells distributed: ${JSON.stringify(await cell())}`);
  await byTitle("セルの余白");
  await menuItem("狭い");
  await page.waitForTimeout(200);
  assert(JSON.stringify((await cell()).pad) === JSON.stringify([7.37, 7.37, 7.37, 7.37]), `狭い (0.13 cm): ${JSON.stringify((await cell()).pad)}`);
  await byTitle("セルの余白");
  await menuItem("ユーザー設定の余白");
  await page.waitForSelector("#askDialog[open]");
  await page.fill("#askInput", "0.2 0.5");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const pad = (await cell()).pad;
  assert(Math.abs(pad[0] - 11.34) < 0.1 && Math.abs(pad[1] - 28.35) < 0.1 && Math.abs(pad[2] - pad[0]) < 0.01 && Math.abs(pad[3] - pad[1]) < 0.01, `上下 0.2・左右 0.5 cm: ${JSON.stringify(pad)}`);
  await byTitle("文字列の方向");
  await page.waitForTimeout(200);
  assert((await cell()).vertical === true, "縦書き");
  assert(await page.locator(`#stageBody .hs-obj[data-el="${id}"] .hs-cell-tx.is-vertical`).count(), "drawn vertical");
  await shot("table-cells");
});

await step("パスワードを使用して暗号化: the file asks the password, a wrong one is refused, the right one opens the show", async () => {
  await page.click(".rb-file");
  await page.locator('.rb-pop .rb-menu button:has-text("情報")').click();
  await page.waitForSelector(".fileinfo-dialog[open]");
  await page.click(".fileinfo-dialog .fi-lock");
  await page.waitForSelector(".lock-dialog[open]");
  await page.fill(".lock-dialog .lock-pw", "sej-2026");
  await page.fill(".lock-dialog .lock-again", "sej-2025");
  await page.click(".lock-dialog .lock-go");
  assert((await page.textContent(".lock-dialog .lock-msg")).includes("違います"), "the two must match");
  await page.fill(".lock-dialog .lock-again", "sej-2026");
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.click(".lock-dialog .lock-go")]);
  const file = join(outDir, "format-locked.html");
  await download.saveAs(file);
  const html = await readFile(file, "utf8");
  const words = [(await deck()).title, ...(await deck()).slides.map((x) => x.title)].filter((w) => typeof w === "string" && w.length >= 3);
  assert(html.includes('id="hs-locked"') && !html.includes("sej-2026"), "locked, the password not kept");
  assert(!words.some((w) => html.includes(w)), `nothing of the deck readable: ${words.filter((w) => html.includes(w)).join(" / ")}`);
  const viewer = await context.newPage();
  viewer.on("pageerror", (error) => errors.push(`locked pageerror: ${error.message}`));
  await viewer.goto(`file://${file}`);
  await viewer.fill("#pw", "wrong");
  await viewer.click("#go");
  await viewer.waitForFunction(() => document.getElementById("msg")?.textContent.includes("違います"), null, { timeout: 20000 });
  await viewer.fill("#pw", "sej-2026");
  await viewer.click("#go");
  await viewer.waitForSelector(".hs-player .hs-slide", { timeout: 30000 });
  assert(await viewer.locator(".hs-player .hs-slide").count(), "the show opens");
  await viewer.close();
});

await step("テーブル デザイン → 罫線の作成: ペンの太さ 3 pt・濃紺で外枠、内側の横罫線、枠なし", async () => {
  await tab("挿入");
  await ribbonBtn("表");
  await page.waitForSelector(".tb-pick");
  await page.locator(".tb-pick button").nth(2 * 10 + 2).click();
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const id = (await slide()).elements.at(-1).id;
  const cells = async () => (await slide()).elements.find((x) => x.id === id).cells;
  await tab("テーブル デザイン");
  await byTitle("罫線を引くペンの太さ");
  await menuItem("3 pt");
  await byTitle("選んだセル（なければ表全体）に罫線");
  await menuItem("外枠");
  await page.waitForTimeout(300);
  let c = await cells();
  assert(JSON.stringify(c[0][0].bt) === JSON.stringify({ c: "#1f3864", w: 6 }) && JSON.stringify(c[2][2].bb) === JSON.stringify({ c: "#1f3864", w: 6 }) && !c[1][1].bt, `外枠 at 3 pt: ${JSON.stringify(c[0][0])} ${JSON.stringify(c[1][1])}`);
  const drawn = await page.evaluate((id) => getComputedStyle(document.querySelector(`#stageBody .hs-obj[data-el="${id}"] td[data-r="0"][data-c="0"]`)).borderTopWidth, id);
  assert(parseFloat(drawn) >= 5, `drawn 6px: ${drawn}`);
  await byTitle("選んだセル（なければ表全体）に罫線");
  await menuItem("横罫線（内側）");
  await page.waitForTimeout(300);
  c = await cells();
  assert(c[0][1].bb && c[1][1].bt && c[1][1].bb && !c[1][1].bl, `inside horizontal lines: ${JSON.stringify(c[1][1])}`);
  await shot("table-borders");
  await byTitle("選んだセル（なければ表全体）に罫線");
  await menuItem("枠なし");
  await page.waitForTimeout(300);
  c = await cells();
  assert(c.flat().every((cell) => cell.merged || (cell.bt === "none" && cell.bb === "none" && cell.bl === "none" && cell.br === "none")), "枠なし");
});

await step("箇条書きと段落番号…: 開始 3, 濃紺, 125%; 下線の種類 二重線; グラフの軸の書式 0〜200", async () => {
  await tab("挿入");
  await ribbonBtn("テキスト ボックス");
  await menuItem("横書きテキスト ボックス");
  const r = await page.locator(".slide-wrap .hs-slide").first().boundingBox();
  await page.mouse.click(r.x + r.width * 0.3, r.y + r.height * 0.45);
  await page.waitForTimeout(200);
  await page.keyboard.type("三つ目");
  await page.keyboard.press("Enter");
  await page.keyboard.type("四つ目");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const id = (await slide()).elements.at(-1).id;
  const o = async () => (await slide()).elements.find((x) => x.id === id);
  await tab("ホーム");
  await byTitle("段落番号の種類");
  await page.click('.rb-pop .rb-list-sw[data-list-style="decimal"]');
  await page.waitForTimeout(200);
  await byTitle("段落番号の種類");
  await page.click(".rb-pop .rb-list-more");
  await page.waitForSelector(".list-dialog[open]");
  await page.fill(".list-dialog .ld-start", "3");
  await page.selectOption(".list-dialog .ld-color", "navy");
  await page.selectOption(".list-dialog .ld-size", "125");
  await page.click(".list-dialog .ld-ok");
  await page.waitForTimeout(300);
  const text = (await o()).text;
  assert(/^<ol[^>]*\bstart="3"/.test(text) && /data-mark="navy"/.test(text) && /data-msize="125"/.test(text), `the list: ${text}`);
  const marker = await page.evaluate((id) => { const li = document.querySelector(`#stageBody .hs-obj[data-el="${id}"] li`); const m = getComputedStyle(li, "::marker"); return `${m.color}|${m.fontSize}|${li.parentElement.start}`; }, id);
  assert(/31, 56, 100/.test(marker) && marker.endsWith("|3"), `drawn: navy marks, from 3 (${marker})`);
  await byTitle("下線の種類");
  await menuItem("二重線");
  await page.waitForTimeout(200);
  const u = await o();
  assert(u.underline && u.uline === "double", `underlined double: ${JSON.stringify({ underline: u.underline, uline: u.uline })}`);
  assert((await page.evaluate((id) => getComputedStyle(document.querySelector(`#stageBody .hs-obj[data-el="${id}"] .hs-obj-tx`)).textDecorationStyle, id)) === "double", "drawn double");
  // グラフ: 軸の書式 (最小値・最大値).
  await tab("挿入");
  await ribbonBtn("グラフ");
  await page.click('.tb-chart-grid button[data-chart="line"]');
  await page.waitForTimeout(400);
  if (await page.isVisible("dialog[open]")) await page.keyboard.press("Escape");
  const chartId = (await slide()).elements.at(-1).id;
  await tab("グラフのデザイン");
  await ribbonBtn("グラフ要素");
  await menuItem("軸の書式");
  await page.waitForSelector("#askDialog[open]");
  await page.fill("#askInput", "0");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#askDialog[open]");
  await page.fill("#askInput", "200");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const opts = (await slide()).elements.find((x) => x.id === chartId).chart.opts || {};
  assert(opts.axisMin === 0 && opts.axisMax === 200, `the axis: ${JSON.stringify(opts)}`);
  const ticks = await page.$$eval(`#stageBody .hs-obj[data-el="${chartId}"] .hs-tick`, (els) => els.map((el) => el.textContent));
  assert(ticks[0] === "0" && ticks.at(-1) === "200", `ticks 0–200: ${ticks}`);
});

await step("グラフの色の変更（茶）; 表の行の高さ・列の幅（cm）; ファイル → オプション", async () => {
  await tab("挿入");
  await ribbonBtn("グラフ");
  await page.click('.tb-chart-grid button[data-chart="clustered-bar"]');
  await page.waitForTimeout(400);
  if (await page.isVisible("dialog[open]")) await page.keyboard.press("Escape");
  const chartId = (await slide()).elements.at(-1).id;
  await tab("グラフのデザイン");
  await byTitle("グラフの色（SEJの配色");
  await page.click('.rb-pop .tb-color-row[data-colors="brown"]');
  await page.waitForTimeout(300);
  assert((await slide()).elements.find((x) => x.id === chartId).chart.colors === "brown", "the chart's colours");
  const fill = await page.evaluate((id) => { const bar = document.querySelector(`#stageBody .hs-obj[data-el="${id}"] .hs-bar`); return bar ? getComputedStyle(bar).fill : ""; }, chartId);
  assert(/214, 201, 184|245, 240, 234|128, 128, 128/.test(fill), `drawn in browns: ${fill}`);
  // 表: the second row 2 cm high, the table taller by the difference.
  await tab("挿入");
  await ribbonBtn("表");
  await page.waitForSelector(".tb-pick");
  await page.locator(".tb-pick button").nth(2 * 10 + 1).click();
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const t0 = (await slide()).elements.at(-1);
  await tab("レイアウト");
  await byTitle("選んだ行（なければ全部）の高さ（cm）");
  await page.waitForSelector("#askDialog[open]");
  await page.fill("#askInput", "2");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const t1 = (await slide()).elements.find((x) => x.id === t0.id);
  const rowsCm = t1.rows.map((f) => Math.round((f * t1.h) / (144 / 2.54) * 10) / 10);
  assert(rowsCm.every((v) => Math.abs(v - 2) < 0.05), `every row 2 cm (none chosen: all): ${rowsCm}`);
  // ファイル → オプション: spelling on, the toolbar below the ribbon, then both back.
  await page.click(".rb-file");
  await page.locator('.rb-pop .rb-menu button:has-text("オプション…")').click();
  await page.waitForSelector(".options-dialog[open]");
  const spellBefore = await page.isChecked('.options-dialog input[data-opt="spell"]');
  await page.click('.options-dialog input[data-opt="spell"]');
  await page.selectOption('.options-dialog select[data-opt="qat"]', "below");
  await page.waitForTimeout(300);
  assert(await page.locator(".rb-qat-row").count(), "the Quick Access Toolbar below the ribbon");
  assert((await page.evaluate(() => localStorage.getItem("hsej-spellcheck"))) === (spellBefore ? "0" : "1"), "spelling switched and kept");
  await page.selectOption('.options-dialog select[data-opt="qat"]', "off");
  await page.click('.options-dialog input[data-opt="spell"]');
  await page.click(".options-dialog .btn-primary");
  assert(!(await page.locator(".rb-qat-row").count()), "the toolbar off again");
});

await step("クイック レイアウト（グラフ）; 図形の塗りつぶし → 図・並べて表示・色に戻す", async () => {
  await tab("挿入");
  await ribbonBtn("グラフ");
  await page.click('.tb-chart-grid button[data-chart="clustered-bar"]');
  await page.waitForTimeout(400);
  if (await page.isVisible("dialog[open]")) await page.keyboard.press("Escape");
  const chartId = (await slide()).elements.at(-1).id;
  const chartOf = async () => (await slide()).elements.find((x) => x.id === chartId).chart;
  await tab("グラフのデザイン");
  await byTitle("グラフ要素の組み合わせ");
  assert(await page.locator(".rb-pop .tb-layout-row").count() === 7, "seven layouts, each with a picture");
  await page.click('.rb-pop .tb-layout-row[data-layout="layout5"]');
  await page.waitForTimeout(300);
  let c = await chartOf();
  assert(c.opts?.axisX && c.opts?.axisY && c.opts.labels === false, `レイアウト 5: axis titles, no data labels: ${JSON.stringify(c.opts)}`);
  await byTitle("グラフ要素の組み合わせ");
  await page.click('.rb-pop .tb-layout-row[data-layout="layout7"]');
  await page.waitForTimeout(300);
  c = await chartOf();
  assert(c.opts?.legend === "none" && c.opts.grid === false && c.opts.labels === false && !c.opts.axisX, `レイアウト 7: the chart alone: ${JSON.stringify(c.opts)}`);
  await undo();
  assert((await chartOf()).opts?.axisX, "⌘Z goes back to レイアウト 5 in one step");
  // 図で塗りつぶし: a rectangle filled with the logo, then tiled, then a colour again.
  await page.keyboard.press("Escape");
  await tab("挿入");
  await ribbonBtn("図形");
  await page.click('.rb-pop .rb-gallery button[title="正方形/長方形"]');
  const box = await page.locator("#stageBody .hs-slide").first().boundingBox();
  const pt = (x, y) => [box.x + (x * box.width) / 1920, box.y + (y * box.height) / 1080];
  await page.mouse.move(...pt(1300, 300));
  await page.mouse.down();
  await page.mouse.move(...pt(1700, 600), { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const rect = (await slide()).elements.at(-1);
  assert(rect.kind === "shape", `the rectangle: ${rect.kind}`);
  await tab("図形の書式");
  await byTitle("図形の塗りつぶし");
  await withFiles(logo, () => page.click('.rb-pop .rb-extra[data-fill="picture"]'));
  await page.waitForFunction((id) => window.__hsej.slide().elements.find((o) => o.id === id)?.fillImg, rect.id, { timeout: 8000 });
  let o = (await slide()).elements.find((x) => x.id === rect.id);
  assert(o.fillImg.startsWith("idb:"), `the picture kept in this browser: ${o.fillImg.slice(0, 20)}`);
  const drawn = await page.evaluate((id) => { const el = document.querySelector(`#stageBody .hs-obj[data-el="${id}"]`); const p = el?.querySelector("pattern"); return p ? { fill: el.querySelector("path").getAttribute("fill"), id: p.id, w: p.getAttribute("width"), href: p.querySelector("image").getAttribute("href") } : null; }, rect.id);
  assert(drawn && drawn.fill === `url(#${drawn.id})` && drawn.href.startsWith("blob:"), `drawn with the picture: ${JSON.stringify(drawn)}`);
  await shot("picture-fill");
  await byTitle("図形の塗りつぶし");
  await page.click('.rb-pop .rb-extra[data-fill="tile"]');
  await page.waitForTimeout(300);
  o = (await slide()).elements.find((x) => x.id === rect.id);
  assert(o.fillTile === true, "並べて表示");
  assert(await page.evaluate((id) => document.querySelector(`#stageBody .hs-obj[data-el="${id}"] pattern`)?.getAttribute("width"), rect.id) === "160", "tiles");
  await byTitle("図形の塗りつぶし");
  await page.locator(".rb-pop .rb-sw").first().click();
  await page.waitForTimeout(300);
  o = (await slide()).elements.find((x) => x.id === rect.id);
  assert(!o.fillImg && !o.fillTile, `a colour replaces the picture: ${JSON.stringify({ fillImg: o.fillImg, fillTile: o.fillTile })}`);
  await undo();
  assert((await slide()).elements.find((x) => x.id === rect.id).fillImg, "⌘Z brings the picture back");
});

await step("フォント（⇧⌘F）・段落（インデント・ぶら下げ）の設定を1回の⌘Zで; グリッドとガイド; スライドに合わせて配置; ⌘Dが移動を繰り返す", async () => {
  await page.keyboard.press("Escape");
  await tab("挿入");
  await ribbonBtn("テキスト ボックス");
  await menuItem("横書きテキスト ボックス");
  const box = await page.locator("#stageBody .hs-slide").first().boundingBox();
  const pt = (x, y) => [box.x + (x * box.width) / 1920, box.y + (y * box.height) / 1080];
  await page.mouse.click(...pt(300, 860));
  await page.waitForTimeout(200);
  await page.keyboard.type("Seven Eleven");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const id = (await slide()).elements.at(-1).id;
  const obj = async () => (await slide()).elements.find((x) => x.id === id);
  // フォント: 太字・32pt・濃紺・二重下線・小型英大文字・広く, in one step.
  await page.keyboard.press("Control+Shift+F");
  await page.waitForSelector(".font-dialog[open]");
  await page.selectOption('.font-dialog select[name="スタイル"]', "bold");
  await page.fill('.font-dialog input[name="サイズ"]', "32");
  await page.click('.font-dialog .fp-sw[data-color="#1f3864"]');
  await page.selectOption('.font-dialog select[name="下線のスタイル"]', "double");
  await page.check('.font-dialog input[name="smallCaps"]');
  await page.selectOption('.font-dialog select[name="文字間隔"]', "0.05");
  await shot("font-dialog");
  await page.click(".font-dialog .fmt-ok");
  await page.waitForTimeout(300);
  let o = await obj();
  assert(o.bold && o.fs === 64 && o.color === "#1f3864" && o.underline && o.uline === "double" && o.caps === "small" && o.ls === 0.05, `the font settings: ${JSON.stringify({ bold: o.bold, fs: o.fs, color: o.color, underline: o.underline, uline: o.uline, caps: o.caps, ls: o.ls })}`);
  assert(await page.evaluate((i) => getComputedStyle(document.querySelector(`#stageBody .hs-obj[data-el="${i}"] .hs-obj-tx`)).fontVariantCaps, id) === "small-caps", "drawn in small capitals");
  await undo();
  o = await obj();
  assert(!o.bold && !o.caps && !o.ls && o.fs !== 64, `one ⌘Z takes all of the dialog back: ${JSON.stringify({ bold: o.bold, caps: o.caps, ls: o.ls, fs: o.fs })}`);
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(300);
  // 段落: 中央揃え, 1 cm before the text with a 0.5 cm hanging first line, 12 pt after, 1.5 lines.
  await tab("ホーム");
  await byTitle("段落の設定");
  await page.waitForSelector(".para-dialog[open]");
  await page.selectOption('.para-dialog select[name="配置"]', "center");
  await page.fill('.para-dialog input[name="テキストの前"]', "1");
  await page.selectOption('.para-dialog select[name="最初の行"]', "hanging");
  await page.fill('.para-dialog input[name="幅"]', "0.5");
  await page.fill('.para-dialog input[name="段落後"]', "12");
  await page.selectOption('.para-dialog select[name="行間"]', "1.5");
  await page.click(".para-dialog .fmt-ok");
  await page.waitForTimeout(300);
  o = await obj();
  assert(o.align === "center" && o.lh === 1.5 && Math.abs(o.psp - 12 / 32) < 0.01, `alignment, line and paragraph spacing: ${JSON.stringify({ align: o.align, lh: o.lh, psp: o.psp })}`);
  assert(/margin-left: ?85\.0\dpx/.test(o.text) && /text-indent: ?-28\.3\dpx/.test(o.text), `1.5 cm in, the first line 0.5 cm out: ${o.text}`);
  const ind = await page.evaluate((i) => { const p = document.querySelector(`#stageBody .hs-obj[data-el="${i}"] .hs-obj-tx p`); const cs = getComputedStyle(p); return [cs.marginLeft, cs.textIndent]; }, id);
  assert(parseFloat(ind[0]) > 80 && parseFloat(ind[1]) < -25, `drawn indented: ${ind}`);
  // グリッドとガイド: 0.5 cm, snap on.
  await tab("表示");
  await byTitle("グリッドとガイドの設定");
  await page.waitForSelector(".grid-dialog[open]");
  await page.selectOption('.grid-dialog select[name="間隔"]', "0.5");
  await page.check('.grid-dialog input[name="snapGrid"]');
  await page.check('.grid-dialog input[name="grid"]');
  await page.click(".grid-dialog .fmt-ok");
  await page.waitForTimeout(300);
  const ed = await page.evaluate(() => JSON.parse(localStorage.getItem("hsej-editor-gridStep") || "null"));
  assert(ed === 0.5, `the spacing kept: ${ed}`);
  assert(await page.locator("#stageBody .ed-grid").count(), "the grid is shown");
  await byTitle("グリッドとガイドの設定");
  await page.waitForSelector(".grid-dialog[open]");
  await page.uncheck('.grid-dialog input[name="snapGrid"]');
  await page.uncheck('.grid-dialog input[name="grid"]');
  await page.selectOption('.grid-dialog select[name="間隔"]', "0.25");
  await page.click(".grid-dialog .fmt-ok");
  await page.waitForTimeout(300);
  // ⌘D, move the copy, ⌘D again: the third lands as far again.
  await page.keyboard.press("Control+d");
  await page.waitForTimeout(300);
  const copy1 = (await slide()).elements.at(-1);
  for (let i = 0; i < 5; i += 1) await page.keyboard.press("Shift+ArrowRight");
  await page.waitForTimeout(300);
  const moved = (await slide()).elements.find((x) => x.id === copy1.id);
  await page.keyboard.press("Control+d");
  await page.waitForTimeout(300);
  const copy2 = (await slide()).elements.at(-1);
  const src = await obj();
  const [dx, dy] = [moved.x - src.x, moved.y - src.y];
  assert(Math.abs(copy2.x - moved.x - dx) < 0.6 && Math.abs(copy2.y - moved.y - dy) < 0.6, `the move repeated: source ${src.x},${src.y} copy ${moved.x},${moved.y} next ${copy2.x},${copy2.y}`);
  // 配置 → スライドに合わせて配置: two boxes both to the slide's right edge.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+a");
  await tab("ホーム");
  await ribbonBtn("配置");
  await menuItem("スライドに合わせて配置");
  await ribbonBtn("配置");
  await menuItem("右揃え");
  await page.waitForTimeout(300);
  const all = (await slide()).elements.filter((x) => [id, copy1.id, copy2.id].includes(x.id));
  assert(all.every((x) => Math.abs(x.x + x.w - 1920) < 1), `all at the slide's right edge: ${all.map((x) => x.x + x.w)}`);
  await ribbonBtn("配置");
  await menuItem("選択したオブジェクトを揃える");
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem("hsej-editor-alignTo") || "null")) === "auto", "back to aligning with each other");
});

// 画像として保存 shares this tab: a browser that accepts sharing its own tab, as a person would by choosing it.
const capBrowser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" } : undefined, args: [...browserArgs, "--auto-accept-this-tab-capture", "--use-fake-ui-for-media-stream"] });
await step("画像として保存: the current slide as a PNG of the slide itself, and every slide in a ZIP", async () => {
  const cap = await (await capBrowser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true })).newPage();
  cap.on("pageerror", (error) => errors.push(`capture pageerror: ${error.message}`));
  await cap.goto(base);
  await cap.evaluate(() => localStorage.clear());
  await cap.goto(base);
  await cap.click("#sampleDeckBtn");
  await cap.waitForSelector(".film-item");
  await cap.locator(".film-item").nth(1).click();
  const fileMenu = () => cap.click(".rb-file");
  await fileMenu();
  await cap.locator('.rb-pop button:has-text("画像として保存")').first().click();
  await cap.waitForSelector(".imgx-dialog[open]");
  await cap.check('.imgx-dialog input[value="one"]');
  const [png] = await Promise.all([cap.waitForEvent("download", { timeout: 60000 }), cap.click(".imgx-dialog .ix-go")]);
  const pngFile = join(outDir, "format-slide.png");
  await png.saveAs(pngFile);
  const facts = JSON.parse(execFileSync("python3", ["-c", `
from PIL import Image; import json, sys
im = Image.open(sys.argv[1]).convert("RGB"); w, h = im.size
colors = len(set(im.resize((64, 36)).getdata()))
px = im.load()
green = lambda p: p[1] > 100 and p[0] < 80 and p[2] < 100
red = lambda p: p[0] > 190 and p[1] < 80 and p[2] < 80
# The SEJ green line under the title runs across the slide (the whole slide is in the picture, not a part of it).
line = max(sum(green(px[x, y]) for x in range(0, w, 4)) * 4 / w for y in range(int(h * .08), int(h * .2)))
# The red 社内限り box at the bottom left.
box = sum(red(px[x, y]) for x in range(0, int(w * .2), 2) for y in range(int(h * .8), h, 2))
print(json.dumps({"w": w, "h": h, "colors": colors, "corner": im.getpixel((5, 5)), "line": round(line, 2), "box": box}))`, pngFile]).toString());
  assert(Math.abs(facts.w / facts.h - 16 / 9) < 0.03 && facts.w >= 640, `a slide-shaped picture: ${facts.w}×${facts.h}`);
  assert(facts.colors > 12, `the slide drawn (not blank): ${facts.colors} colours`);
  assert(facts.corner.every((v) => v > 200), `the slide's own white corner, not the dark show around it: ${facts.corner}`);
  assert(facts.line > 0.85 && facts.box > 50, `the whole slide (the master's green line across ${facts.line}, the 社内限り box ${facts.box})`);
  assert(facts.w >= 1500, `at the screen's resolution: ${facts.w}px wide`);
  await fileMenu();
  await cap.locator('.rb-pop button:has-text("画像として保存")').first().click();
  await cap.waitForSelector(".imgx-dialog[open]");
  const total = await cap.evaluate(() => Number(document.querySelector(".imgx-dialog").textContent.match(/（(\d+)枚/)?.[1] || 0));
  const [zip] = await Promise.all([cap.waitForEvent("download", { timeout: 240000 }), cap.click(".imgx-dialog .ix-go")]);
  const zipFile = join(outDir, "format-slides.zip");
  await zip.saveAs(zipFile);
  const names = execFileSync("python3", ["-c", "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print('|'.join(z.namelist()))", zipFile]).toString().trim().split("|");
  assert(names.length === total && names[0] === "スライド01.png", `a picture a slide: ${names.length} of ${total} (${names[0]})`);
  await cap.close();
});
await step("アニメーション GIF の作成: 2 slides at 極小 play into a looping GIF of the slides (frames that changed only)", async () => {
  const cap = await (await capBrowser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true })).newPage();
  cap.on("pageerror", (error) => errors.push(`gif pageerror: ${error.message}`));
  await cap.goto(base);
  await cap.evaluate(() => localStorage.clear());
  await cap.goto(base);
  await cap.click("#sampleDeckBtn");
  await cap.waitForSelector(".film-item");
  await cap.click(".rb-file");
  await cap.locator('.rb-pop button:has-text("アニメーション GIF の作成")').first().click();
  await cap.waitForSelector(".gif-dialog[open]");
  await cap.selectOption(".gif-dialog .gif-size", "xs");
  await cap.fill(".gif-dialog .gif-secs", "1.5");
  await cap.fill(".gif-dialog .gif-from", "2");
  await cap.fill(".gif-dialog .gif-to", "3");
  assert((await cap.textContent(".gif-dialog .gif-estimate")).includes("2枚"), "two slides");
  const [gif] = await Promise.all([cap.waitForEvent("download", { timeout: 120000 }), cap.click(".gif-dialog .gif-go")]);
  const gifFile = join(outDir, "format-show.gif");
  await gif.saveAs(gifFile);
  const facts = JSON.parse(execFileSync("python3", ["-c", `
from PIL import Image; import json, sys
im = Image.open(sys.argv[1]); w, h = im.size; n = im.n_frames; total = 0
for i in range(n): im.seek(i); total += im.info.get("duration", 0)
im.seek(n - 1); last = im.convert("RGB")
px = last.load(); green = sum(1 for x in range(0, w, 2) for y in range(int(h * .08), int(h * .2)) if px[x, y][1] > 100 and px[x, y][0] < 90 and px[x, y][2] < 110)
print(json.dumps({"format": im.format, "w": w, "h": h, "n": n, "loop": im.info.get("loop"), "ms": total, "green": green, "colors": len(set(last.resize((64, 36)).getdata()))}))`, gifFile]).toString());
  assert(facts.format === "GIF" && facts.w === 320 && facts.h === 180, `a 320×180 GIF: ${JSON.stringify(facts)}`);
  assert(facts.n >= 2 && facts.loop === 0, `animated and looping: ${facts.n} frames, loop ${facts.loop}`);
  assert(facts.ms >= 2000 && facts.ms <= 12000, `about the two slides' time: ${facts.ms} ms`);
  assert(facts.green > 20 && facts.colors > 8, `the slide drawn (the SEJ green line): ${JSON.stringify(facts)}`);
  await cap.close();
});
await capBrowser.close();

console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no errors");
await browser.close();
process.exit(errors.length ? 1 : 0);
