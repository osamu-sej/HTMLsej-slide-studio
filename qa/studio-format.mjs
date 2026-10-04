// 図の形式 and グラフ要素 and 校閲 in a real browser: 背景の削除 and 透明色を指定 (the new picture's pixels are checked),
// 図の圧縮 (a 3000-pixel picture comes back 1280 wide), グラフ要素を追加 (data labels, legend) and 行/列の切り替え,
// 比較 with a deck in the library (a changed slide taken back), and インクの非表示.
// Usage: node qa/studio-format.mjs [--base=http://127.0.0.1:8787]   (with `npm start` running)
import { mkdir } from "node:fs/promises";
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
await capBrowser.close();

console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no errors");
await browser.close();
process.exit(errors.length ? 1 : 0);
