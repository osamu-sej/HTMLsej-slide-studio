// More of PowerPoint, in a real browser: sections in the thumbnails (added, folded, renamed, swapped, in the slide
// sorter too) and dragging slides in the sorter; review comments (校閲 → 新しいコメント: post, resolve, delete, the
// thumbnail's mark); rehearse timings (スライド ショー → リハーサル: the times become 自動で切り替え); the 開発 tab
// (the slide's JSON edited and applied, checked first; the HTML it becomes); ⌘H for find and replace.
// Usage: node qa/studio-powerpoint.mjs [--base=http://127.0.0.1:8787]   (with `npm start` running)
import { mkdir } from "node:fs/promises";
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

const browserArgs = process.env.PROXY_CA_SPKI ? [`--ignore-certificate-errors-spki-list=${process.env.PROXY_CA_SPKI}`] : [];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "127.0.0.1,localhost" } : undefined, args: browserArgs });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => { if (message.type() === "error" && !/ERR_TUNNEL|ytimg|ERR_CERT|fonts\.g/.test(message.text())) errors.push(`console: ${message.text()}`); });
let lastDialog = "";
page.on("dialog", (dialog) => { lastDialog = dialog.message(); dialog.accept(); });
const shot = async (name) => { const file = join(outDir, `powerpoint-${name}.png`); await page.screenshot({ path: file }); console.log("saved", file); };
const step = async (label, fn) => {
  try { await page.waitForTimeout(150); await fn(); console.log("ok  ", label); } catch (error) { errors.push(`${label}: ${error.message}`); console.log("FAIL", label, error.message); }
  for (let i = 0; i < 3 && await page.isVisible("#presenter"); i += 1) { await page.keyboard.press("Escape"); await page.waitForTimeout(300); }
  if (await page.isVisible("dialog[open]")) await page.keyboard.press("Escape");
};
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const deck = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__hsej.deck())));
const tab = (label) => page.click(`.rb-tabs [role=tab]:has-text("${label}")`);
const ribbonBtn = async (label) => {
  const direct = page.locator(`.rb-body .rb-btn:has-text("${label}")`).first();
  if ((await direct.count()) && (await direct.isVisible())) return direct.click();
  for (const folded of await page.locator(".rb-body .rb-folded").all()) {
    await folded.click();
    const inside = page.locator(`.rb-pop .rb-fold .rb-btn:has-text("${label}")`).first();
    if (await inside.count()) return inside.click();
  }
  throw new Error(`no ribbon button "${label}"`);
};
const answer = async (text) => {
  await page.waitForSelector("#askDialog[open]");
  await page.fill("#askInput", text);
  await page.click("#askOk");
  await page.waitForTimeout(300);
};
const film = (n) => page.click(`.film-item:nth-child(${n})`);
const filmByIndex = (index) => page.locator(".film-item").nth(index);

await page.goto(base);
await page.evaluate(() => localStorage.clear());
await page.goto(base);
await page.click("#sampleDeckBtn");
await page.waitForSelector(".slide-wrap .hs-slide");
await page.waitForTimeout(500);

await step("セクション: added from the ribbon and from a thumbnail's menu; the thumbnails show and fold them", async () => {
  await filmByIndex(2).click();
  await tab("ホーム");
  await ribbonBtn("セクション");
  await answer("背景");
  let d = await deck();
  assert(d.slides[2].section === "背景", "section on slide 3");
  const heads = await page.$$eval(".film-section b", (els) => els.map((el) => el.textContent));
  assert(heads.join() === "既定のセクション,背景", `headers: ${heads}`);
  await filmByIndex(6).click({ button: "right" });
  await page.click('.ed-menu button:has-text("セクションの追加")');
  await answer("打ち手");
  d = await deck();
  assert(d.slides[6].section === "打ち手", "section on slide 7");
  const shown = await page.locator(".film-item").count();
  await page.click('.film-section:has(b:text-is("背景"))');
  await page.waitForTimeout(200);
  assert(await page.locator(".film-item").count() === shown - 4, "folded: its 4 slides are out of the way");
  await shot("sections-folded");
  await page.click('.film-section:has(b:text-is("背景"))');
  await page.waitForTimeout(200);
  assert(await page.locator(".film-item").count() === shown, "unfolded");
});

await step("セクション: renamed, swapped with the one before, removed (the slides stay); ⌘Z", async () => {
  await page.click('.film-section:has(b:text-is("背景"))', { button: "right" });
  await page.click('.ed-menu button:has-text("セクション名の変更")');
  await answer("現状と背景");
  assert((await deck()).slides[2].section === "現状と背景", "renamed");
  const before = (await deck()).slides.map((s) => s.title);
  await page.click('.film-section:has(b:text-is("打ち手"))', { button: "right" });
  await page.click('.ed-menu button:has-text("セクションを上へ移動")');
  await page.waitForTimeout(300);
  const after = await deck();
  assert(after.slides[2].section === "打ち手" && after.slides[2].title === before[6], `打ち手 comes first: ${after.slides[2].title}`);
  const back = after.slides.findIndex((s) => s.section === "現状と背景");
  assert(after.slides[back].title === before[2], "現状と背景 follows with its slides");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  assert((await deck()).slides.map((s) => s.title).join() === before.join(), "⌘Z puts them back");
  await page.click('.film-section:has(b:text-is("打ち手"))', { button: "right" });
  await page.click('.ed-menu button:has-text("セクションの削除")');
  await page.waitForTimeout(300);
  const d = await deck();
  assert(!d.slides.some((s) => s.section === "打ち手") && d.slides.length === before.length, "removed, every slide kept");
});

await step("スライド一覧: the sections over their slides; drag a slide to move it", async () => {
  await page.click('#statusBar label:has-text("一覧")');
  await page.waitForTimeout(400);
  assert(await page.locator(".grid-section").count() >= 2, "sections in the sorter");
  const before = (await deck()).slides.map((s) => s.title);
  await page.locator(".grid-item").nth(5).dragTo(page.locator(".grid-item").nth(3));
  await page.waitForTimeout(400);
  const after = (await deck()).slides.map((s) => s.title);
  assert(after[3] === before[5], `slide 6 moved before slide 4: ${after.slice(2, 7)}`);
  await shot("sorter");
  await page.click('#statusBar label:has-text("1枚")');
  await page.waitForTimeout(300);
});

await step("校閲 → 新しいコメント: post, the thumbnail's mark, resolve, delete", async () => {
  await filmByIndex(1).click();
  await tab("校閲");
  await ribbonBtn("新しい");
  await page.waitForSelector("#commentPane:not([hidden])");
  await page.waitForTimeout(150);
  assert(await page.evaluate(() => document.activeElement?.classList.contains("cm-input")), "the box is ready to type");
  await page.keyboard.type("数字の出所を確認してください");
  await page.click('#commentPane button:has-text("投稿")');
  await page.waitForTimeout(300);
  let d = await deck();
  assert(d.slides[1].comments?.length === 1 && d.slides[1].comments[0].text === "数字の出所を確認してください", "posted");
  assert(await filmByIndex(1).locator(".flag-comment").count(), "the thumbnail shows it");
  await shot("comments");
  await page.click('#commentPane button:has-text("解決")');
  await page.waitForTimeout(300);
  d = await deck();
  assert(d.slides[1].comments[0].done === true, "resolved");
  assert(!(await filmByIndex(1).locator(".flag-comment").count()), "a resolved comment drops the mark");
  await filmByIndex(4).click();
  await page.click('#commentPane button:has-text("前へ")');
  await page.waitForTimeout(300);
  assert((await page.textContent("#slidePos")).startsWith("スライド 2 /"), "前へ goes to the slide with comments");
  await page.click('#commentPane .cm-item button:has-text("削除")');
  await page.waitForTimeout(300);
  assert(!(await deck()).slides[1].comments, "deleted");
});

await step("スライド ショー → リハーサル: the slides are timed; the times become 自動で切り替え", async () => {
  await tab("スライド ショー");
  await ribbonBtn("リハーサル");
  await page.waitForSelector("#presenter .rehearse-clock", { timeout: 10000 });
  await page.waitForTimeout(1300);
  assert(/リハーサル/.test(await page.textContent(".rehearse-clock")), "the clock");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
  assert(/リハーサルの時間/.test(lastDialog), `asked to keep the times: ${lastDialog}`);
  const d = await deck();
  assert(d.slides[0].advance >= 1, `slide 1 moves on by itself after its rehearsed time: ${d.slides[0].advance}`);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  assert(!(await deck()).slides[0].advance, "⌘Z takes the timings back");
});

await step("開発 → スライドのJSON: edited and applied (checked first); HTMLを表示", async () => {
  await filmByIndex(3).click();
  await tab("開発");
  await ribbonBtn("JSON");
  await page.waitForSelector("#codeDialog[open]");
  const text = await page.inputValue("#codeText");
  const data = JSON.parse(text);
  assert(data.type && data.title, "the slide's data");
  await page.fill("#codeText", "{ broken");
  await page.click("#codeApply");
  assert(await page.isVisible("#codeDialog[open]") && /JSONとして読めません/.test(await page.textContent("#codeStatus")), "broken JSON is refused");
  await page.fill("#codeText", JSON.stringify({ ...data, type: "nope" }));
  await page.click("#codeApply");
  assert(/未対応のレイアウト/.test(await page.textContent("#codeStatus")), "an unknown layout is refused");
  await page.fill("#codeText", JSON.stringify({ ...data, title: "JSONで直したタイトル" }, null, 2));
  await page.click("#codeApply");
  await page.waitForTimeout(300);
  assert(await page.isHidden("#codeDialog[open]"), "applied and closed");
  assert((await deck()).slides[3].title === "JSONで直したタイトル", "the slide changed");
  assert((await page.textContent(".slide-wrap .hs-slide")).includes("JSONで直したタイトル"), "and shows it");
  await ribbonBtn("HTMLを");
  await page.waitForSelector("#codeDialog[open]");
  assert(await page.evaluate(() => document.getElementById("codeText").readOnly), "read-only HTML");
  assert(/class="hs-slide/.test(await page.inputValue("#codeText")), "the engine's HTML");
  await shot("code-html");
  await page.keyboard.press("Escape");
});

await step("⌘H opens find and replace", async () => {
  await page.click("#stageBody", { position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+h");
  await page.waitForSelector("#replaceDialog[open]");
  await page.keyboard.press("Escape");
});

console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no errors");
await browser.close();
process.exit(errors.length ? 1 : 0);
