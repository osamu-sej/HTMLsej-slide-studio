// PowerPoint's formatting odds and ends: トリミング ▾ (縦横比・塗りつぶし・枠に合わせる), 箇条書き・段落番号の種類 (kept on the
// list, nothing else let through), 文字列の方向 (90 / 270 度回転), ビデオの表紙画像, and 最終版にする (the document's 状態).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import { parseHTML } from "linkedom";

import { cropFill, cropFit, cropToAspect } from "../public/editor/crop.mjs";
import { FINAL_STATUS, isFinal } from "../public/editor/fileinfo.mjs";
import * as ops from "../public/editor/ops.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
async function loadEngine() {
  const { window } = parseHTML("<!doctype html><html><head></head><body></body></html>");
  const icons = (await readFile(join(root, "public", "engine", "icons.json"), "utf8")).trim();
  const context = vm.createContext(window);
  vm.runInContext((await readFile(join(root, "public", "engine", "engine.js"), "utf8")).replace("/*__ICONS__*/{}", () => icons), context, { filename: "engine.js" });
  vm.runInContext(await readFile(join(root, "public", "engine", "objects.js"), "utf8"), context, { filename: "objects.js" });
  return { E: window.SlideEngine, window };
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test("トリミング: 縦横比 keeps the picture's scale, 塗りつぶし keeps the frame, 枠に合わせる shows it all", () => {
  // A 4:3 picture shown 400 × 300 at (100, 100).
  const o = { x: 100, y: 100, w: 400, h: 300 };
  const sq = cropToAspect(o, 1, 4 / 3);
  assert.ok(near(sq.w, 300) && near(sq.h, 300), "1:1 — the largest middle square");
  assert.ok(near(sq.x + sq.w / 2, 300) && near(sq.y + sq.h / 2, 250), "the frame's middle kept");
  assert.ok(near(sq.crop.l, 0.125) && near(sq.crop.r, 0.125) && sq.crop.t === 0 && sq.crop.b === 0, `crop: ${JSON.stringify(sq.crop)}`);
  const wide = cropToAspect(o, 16 / 9, 4 / 3);
  assert.ok(near(wide.w, 400) && near(wide.h, 225) && near(wide.crop.t, 0.125), "16:9 — the top and bottom go");
  // An already cropped picture: the full picture is worked out from its crop.
  const again = cropToAspect({ ...sq, ...{ x: sq.x, y: sq.y } }, 4 / 3, 4 / 3);
  assert.ok(near(again.w, 400) && near(again.h, 300) && again.crop === undefined, "back to 4:3 — nothing cropped");
  // 塗りつぶし: a square frame filled by the 4:3 picture.
  const fill = cropFill({ x: 0, y: 0, w: 300, h: 300 }, 4 / 3);
  assert.ok(near(fill.crop.l, 0.125) && near(fill.crop.r, 0.125) && fill.crop.t === 0, "the sides cropped");
  assert.equal(fill.w, undefined, "the frame stays");
  // 枠に合わせる: the whole picture inside the square frame.
  const fit = cropFit({ x: 0, y: 0, w: 300, h: 300 }, 4 / 3);
  assert.ok(near(fit.w, 300) && near(fit.h, 225) && near(fit.y, 37.5) && fit.crop === undefined);
});

test("箇条書き・段落番号の種類: the marker kept on the list, only known ones; the editor reads it back", async () => {
  const { E, window } = await loadEngine();
  assert.equal(E.sanitizeRich('<ul data-style="diamond"><li>あ</li></ul>'), '<ul data-style="diamond"><li>あ</li></ul>');
  assert.equal(E.sanitizeRich('<ol data-style="circled"><li>あ</li></ol>'), '<ol data-style="circled"><li>あ</li></ol>');
  assert.equal(E.sanitizeRich('<ul data-style="circled"><li>あ</li></ul>'), "<ul><li>あ</li></ul>", "a number style is not a bullet");
  assert.equal(E.sanitizeRich('<ul data-style="x&quot; onclick=&quot;"><li>あ</li></ul>'), "<ul><li>あ</li></ul>");
  assert.equal(E.sanitizeRich('<ul data-style="disc"><li>あ</li></ul>'), "<ul><li>あ</li></ul>", "the plain one needs no mark");
  globalThis.document = window.document;
  try {
    const listed = ops.setList(E, "<p>一</p><p>二</p>", "number", "paren");
    assert.equal(listed, '<ol data-style="paren"><li>一</li><li>二</li></ol>');
    assert.equal(ops.listOf(listed), "number");
    assert.equal(ops.listStyleOf(listed), "paren");
    assert.equal(ops.listStyleOf("<ul><li>a</li></ul>"), "disc");
    assert.equal(ops.listStyleOf("<p>a</p>"), null);
    assert.equal(ops.setList(E, listed, null), "<p>一</p><p>二</p>", "なし: paragraphs again");
  } finally { delete globalThis.document; }
});

test("文字列の方向 and ビデオの表紙画像 are kept (and drawn); nothing else gets through", async () => {
  const { E } = await loadEngine();
  const t = E.normalizeObject({ id: "t", kind: "text", x: 0, y: 0, w: 200, h: 400, text: "<p>縦</p>", textRot: 270 });
  assert.equal(t.textRot, 270);
  assert.equal(E.normalizeObject({ id: "u", kind: "text", x: 0, y: 0, w: 200, h: 400, text: "<p>縦</p>", textRot: 45 }).textRot, undefined);
  const slide = { type: "blank", elements: [t] };
  const el = E.render(slide, { mode: "present", index: 1, deck: { slides: [slide], theme: "sej" } });
  assert.ok(el.querySelector(".hs-obj-text.is-rot270"), "drawn turned");
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const v = E.normalizeObject({ id: "v", kind: "video", x: 0, y: 0, w: 640, h: 360, src: "https://example.com/a.mp4", poster: png });
  assert.equal(v.poster, png);
  assert.equal(E.normalizeObject({ id: "w", kind: "video", x: 0, y: 0, w: 640, h: 360, src: "https://example.com/a.mp4", poster: "javascript:alert(1)" }).poster, undefined);
});

test("最終版にする is the document's 状態 (最終版)", () => {
  assert.equal(FINAL_STATUS, "最終版");
  assert.equal(isFinal({ info: { status: "最終版" } }), true);
  assert.equal(isFinal({ info: { status: "下書き" } }), false);
  assert.equal(isFinal({}), false);
  assert.equal(isFinal(null), false);
});

const plain = (v) => JSON.parse(JSON.stringify(v));
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("背景の書式設定: the SEJ's light colours only, a picture with its transparency, drawn under everything", async () => {
  const { E } = await loadEngine();
  assert.deepEqual(plain(E.normalizeBackground({ color: "#DCE4F2" })), { color: "#dce4f2" });
  assert.equal(E.normalizeBackground({ color: "#1f3864" }), null, "navy carries no text");
  assert.equal(E.normalizeBackground({ color: "#ff0000" }), null, "not an SEJ colour");
  assert.deepEqual(plain(E.normalizeBackground({ image: PNG, transparency: 0.333, tile: true, extra: 1 })), { image: PNG, transparency: 0.33, tile: true });
  assert.equal(E.normalizeBackground({ image: "javascript:alert(1)" }), null);
  assert.equal(E.normalizeBackground({ color: "#f5f0ea", transparency: 0.5 }).transparency, undefined, "transparency is the picture's");
  const slide = { type: "content", title: "背景", body: "本文", background: { color: "#f5f0ea" } };
  const el = E.render(slide, { mode: "present", index: 0, deck: { slides: [slide], theme: "sej" } });
  const bg = el.querySelector(".hs-bg");
  assert.ok(bg && el.firstElementChild === bg, "first in the slide: under the layout, its objects and the master");
  assert.match(bg.getAttribute("style") || "", /f5f0ea|245, 240, 234/);
  assert.ok(el.querySelector(".hs-sej"), "the SEJ master still drawn");
  const pic = { type: "blank", background: { image: PNG, transparency: 0.5, tile: true } };
  const img = E.render(pic, { mode: "present", index: 0, deck: { slides: [pic], theme: "sej" } }).querySelector(".hs-bg-img");
  assert.ok(img?.classList.contains("is-tiled"), "tiled");
  assert.match(img.getAttribute("style"), /url\("data:image\/png/);
  assert.match(img.getAttribute("style"), /opacity: ?0\.5/);
  assert.equal(E.render({ type: "blank" }, { mode: "present", index: 0, deck: { slides: [{ type: "blank" }], theme: "sej" } }).querySelector(".hs-bg"), null, "none set, none drawn");
});

test("均等割り付け on a box, a cell and a paragraph; a cell's text can be vertical", async () => {
  const { E } = await loadEngine();
  const t = E.normalizeObject({ id: "t", kind: "text", x: 0, y: 0, w: 400, h: 100, text: "<p>あいう</p>", align: "distributed" });
  assert.equal(t.align, "distributed");
  const slide = { type: "blank", elements: [t] };
  const tx = E.render(slide, { mode: "present", index: 0, deck: { slides: [slide], theme: "sej" } }).querySelector(".hs-obj-tx");
  assert.match(tx.getAttribute("style"), /text-align: ?justify/);
  assert.match(tx.getAttribute("style"), /text-align-last: ?justify/);
  assert.equal(E.sanitizeRich('<p style="text-align: justify; text-align-last: justify">あ</p>'), '<p style="text-align: justify; text-align-last: justify">あ</p>');
  assert.equal(E.sanitizeRich('<p style="text-align: justify">あ</p>'), '<p style="text-align: justify">あ</p>');
  assert.equal(E.sanitizeRich('<p style="text-align-last: justify">あ</p>'), "<p>あ</p>", "only with justified lines");
  const table = E.normalizeObject({ id: "g", kind: "table", x: 0, y: 0, w: 600, h: 200, cells: [[{ text: "<p>見出し</p>", align: "distributed", vertical: true, pad: [0, 0, 0, 0] }, { text: "<p>b</p>", vertical: "yes" }]] });
  assert.equal(table.cells[0][0].align, "distributed");
  assert.equal(table.cells[0][0].vertical, true);
  assert.equal(table.cells[0][1].vertical, undefined, "only true");
  assert.deepEqual(plain(table.cells[0][0].pad), [0, 0, 0, 0], "セルの余白 なし");
  const tslide = { type: "blank", elements: [table] };
  const cell = E.render(tslide, { mode: "present", index: 0, deck: { slides: [tslide], theme: "sej" } }).querySelector(".hs-cell-tx");
  assert.ok(cell.classList.contains("is-vertical"));
  assert.match(cell.getAttribute("style"), /text-align-last: ?justify/);
});

test("罫線: outside, inside, a side, none; the cell across an edge gets the same line; a merge only on its own edges", () => {
  const grid = (n, m) => ({ kind: "table", cells: Array.from({ length: n }, () => Array.from({ length: m }, () => ({}))) });
  const pen = { c: "#1f3864", w: 3 };
  const out = ops.tableBorders(grid(3, 3), 0, 0, 1, 1, "outside", pen);
  assert.deepEqual(out.cells[0][0].bt, pen);
  assert.deepEqual(out.cells[0][0].bl, pen);
  assert.equal(out.cells[0][0].br, undefined, "no inside line");
  assert.deepEqual(out.cells[1][1].bb, pen);
  assert.deepEqual(out.cells[2][1].bt, pen, "the cell under the range takes the same edge");
  assert.deepEqual(out.cells[0][2].bl, pen, "and the one to its right");
  assert.notEqual(out.cells[0][0].bt, out.cells[0][1].bt, "each cell its own copy");
  const inside = ops.tableBorders(grid(2, 2), 0, 0, 1, 1, "inside", pen);
  assert.deepEqual(inside.cells[0][0].br, pen);
  assert.deepEqual(inside.cells[0][0].bb, pen);
  assert.equal(inside.cells[0][0].bt, undefined);
  const bottom = ops.tableBorders(grid(2, 2), 0, 0, 0, 1, "bottom", pen);
  assert.deepEqual([bottom.cells[0][0].bb, bottom.cells[0][1].bb, bottom.cells[1][0].bt], [pen, pen, pen]);
  assert.equal(bottom.cells[0][0].bt, undefined);
  const none = ops.tableBorders(out, 0, 0, 1, 1, "none", pen);
  assert.equal(none.cells[0][0].bt, "none");
  assert.equal(none.cells[2][1].bt, "none", "the shared edge goes too");
  // A cell merged across two rows: an inside line across the merge is not drawn through it.
  const merged = grid(2, 2);
  merged.cells[0][0] = { rs: 2 };
  merged.cells[1][0] = { merged: true };
  const m = ops.tableBorders(merged, 0, 0, 1, 1, "insideH", pen);
  assert.equal(m.cells[0][0].bb, undefined, "no line through the merged cell");
  assert.deepEqual(m.cells[0][1].bb, pen, "but between the cells beside it");
  assert.equal(m.cells[0][0].rs, 2, "still merged");
});

/** The first list's tag and attributes, sorted (linkedom writes attributes in another order than browsers). */
const listTag = (html) => { const m = String(html).match(/^<(ul|ol)\b([^>]*)>/); return m ? `${m[1]} ${[...m[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => `${a[1]}=${a[2]}`).sort().join(" ")}`.trim() : null; };

test("箇条書きと段落番号: the first number, the marks' colour and size kept on the list (and through a change of style)", async () => {
  const { E, window } = await loadEngine();
  assert.equal(listTag(E.sanitizeRich('<ol start="3" data-mark="navy" data-msize="125"><li>あ</li></ol>')), "ol data-mark=navy data-msize=125 start=3");
  assert.equal(E.sanitizeRich('<ul start="3" data-mark="red" data-msize="300"><li>あ</li></ul>'), "<ul><li>あ</li></ul>", "no start on bullets; only SEJ colours and the sizes offered");
  assert.equal(E.sanitizeRich('<ol start="1"><li>あ</li></ol>'), "<ol><li>あ</li></ol>", "1 is the start anyway");
  globalThis.document = window.document;
  try {
    const list = ops.setListProps(E, "<ol><li>一</li><li>二</li></ol>", { start: 5, mark: "gray", msize: "150" });
    assert.equal(listTag(list), "ol data-mark=gray data-msize=150 start=5");
    assert.match(list, /<li>一<\/li><li>二<\/li><\/ol>$/);
    assert.deepEqual(ops.listPropsOf(list), { type: "number", start: 5, mark: "gray", msize: "150" });
    assert.equal(ops.listStyleOf('<ol data-style="circled" start="5"><li>一</li></ol>'), "circled", "the style read with other marks on the list");
    const restyled = ops.setList(E, list, "number", "circled");
    assert.equal(listTag(restyled), "ol data-mark=gray data-msize=150 data-style=circled start=5", "kept through a change of style");
    const bullets = ops.setList(E, list, "bullet", "diamond");
    assert.equal(listTag(bullets), "ul data-mark=gray data-msize=150 data-style=diamond", "bullets keep the colour and size, not the number");
    assert.equal(ops.setListProps(E, list, { start: 1, mark: "", msize: "100" }), "<ol><li>一</li><li>二</li></ol>", "all back to plain");
  } finally { delete globalThis.document; }
});

test("下線の種類・二重取り消し線: kept on the words and on the box, nothing else let through", async () => {
  const { E } = await loadEngine();
  assert.equal(E.sanitizeRich('<p><u data-line="wavy">波</u><s data-line="double">消</s></p>'), '<p><u data-line="wavy">波</u><s data-line="double">消</s></p>');
  assert.equal(E.sanitizeRich('<p><u data-line="zigzag">a</u><s data-line="wavy">b</s></p>'), "<p><u>a</u><s>b</s></p>", "only the kinds offered");
  const o = E.normalizeObject({ id: "t", kind: "text", x: 0, y: 0, w: 400, h: 100, text: "<p>見出し</p>", underline: true, uline: "double", strike: true, sline: "double" });
  assert.equal(o.uline, "double");
  assert.equal(o.sline, "double");
  assert.equal(E.normalizeObject({ id: "u", kind: "text", x: 0, y: 0, w: 400, h: 100, text: "<p>a</p>", uline: "zigzag" }).uline, undefined);
  const slide = { type: "blank", elements: [o] };
  const tx = E.render(slide, { mode: "present", index: 0, deck: { slides: [slide], theme: "sej" } }).querySelector(".hs-obj-tx");
  assert.match(tx.getAttribute("style"), /text-decoration-style: ?double/);
  const thick = E.normalizeObject({ id: "v", kind: "text", x: 0, y: 0, w: 400, h: 100, text: "<p>a</p>", underline: true, uline: "thick" });
  const s2 = { type: "blank", elements: [thick] };
  assert.match(E.render(s2, { mode: "present", index: 0, deck: { slides: [s2], theme: "sej" } }).querySelector(".hs-obj-tx").getAttribute("style"), /text-decoration-thickness/);
});

test("セルのサイズ: rows (or columns) set in pixels, the table growing by the difference, the others kept", () => {
  const t = { kind: "table", x: 0, y: 0, w: 600, h: 300, rows: [0.5, 0.25, 0.25], cols: [0.5, 0.5], cells: [[{}, {}], [{}, {}], [{}, {}]] };
  const taller = ops.tableSetSize(t, "rows", 1, 1, 150);
  assert.equal(taller.h, 375);
  const heights = taller.rows.map((f) => Math.round(f * taller.h));
  assert.deepEqual(heights, [150, 150, 75]);
  const narrow = ops.tableSetSize(t, "cols", 0, 1, 200);
  assert.equal(narrow.w, 400);
  assert.deepEqual(narrow.cols, [0.5, 0.5]);
  assert.equal(ops.tableSetSize(t, "rows", 0, 0, 2).rows.length, 3, "never below the smallest size");
});

test("図で塗りつぶし: a picture fills the shape (cut to its outline), stretched or tiled; only real pictures", async () => {
  const { E } = await loadEngine();
  const o = E.normalizeObject({ id: "s1", kind: "shape", shape: "ellipse", x: 100, y: 100, w: 400, h: 200, fill: "#dce4f2", fillImg: "data:image/png;base64,AAAA", fillTile: true });
  assert.equal(o.fillImg, "data:image/png;base64,AAAA");
  assert.equal(o.fillTile, true);
  assert.equal(E.normalizeObject({ id: "s2", kind: "shape", shape: "rect", fillImg: "javascript:alert(1)", fillTile: true }).fillImg, undefined, "only pictures");
  assert.equal(E.normalizeObject({ id: "s3", kind: "shape", shape: "rect", fillImg: "data:text/html,x" }).fillImg, undefined);
  const draw = (obj, ctx = {}) => { const slide = { type: "blank", elements: [obj] }; return E.render(slide, { mode: "present", index: 0, deck: { slides: [slide], theme: "sej" }, ...ctx }); };
  const tiled = draw(o);
  const pattern = tiled.querySelector(".hs-obj pattern");
  assert.ok(pattern, "a pattern of the picture");
  assert.equal(pattern.getAttribute("width"), "160", "tiles");
  assert.equal(pattern.querySelector("image").getAttribute("href"), "data:image/png;base64,AAAA");
  assert.equal(pattern.querySelector("image").getAttribute("preserveAspectRatio"), "xMidYMid slice");
  assert.equal(tiled.querySelector(".hs-obj path").getAttribute("fill"), `url(#${pattern.getAttribute("id")})`, "the outline is filled with it");
  const stretched = draw({ ...o, fillTile: undefined });
  assert.equal(stretched.querySelector(".hs-obj pattern").getAttribute("width"), "400", "one picture over the whole shape");
  // A picture kept in this browser is drawn once its address is known (and left out until then).
  const stored = E.normalizeObject({ ...o, fillImg: "idb:abc" });
  assert.equal(draw(stored).querySelector(".hs-obj pattern"), null);
  assert.equal(draw(stored, { mediaUrls: { "idb:abc": "blob:x" } }).querySelector(".hs-obj pattern image").getAttribute("href"), "blob:x");
});

test("段落 → インデント: before the text, a first line indented or hanging; kept by the sanitizer, read back", async () => {
  const { E, window } = await loadEngine();
  globalThis.document = window.document;
  try {
    const hanging = ops.setIndent(E, '<p>一つ目</p><p style="text-align: center">二つ目</p>', { left: 56.69, first: -28.35 });
    assert.match(hanging, /<p style="[^"]*margin-left: ?56\.69px[^"]*text-indent: ?-28\.35px[^"]*">一つ目<\/p>/);
    assert.match(hanging, /text-align: ?center[^"]*margin-left: ?56\.69px/, "the paragraph keeps its alignment");
    assert.deepEqual({ ...ops.indentOf(hanging) }, { left: 56.69, first: -28.35 });
    assert.equal(ops.setIndent(E, hanging, { left: 0, first: 0 }), '<p>一つ目</p><p style="text-align: center">二つ目</p>', "0 takes them away");
    assert.match(ops.setIndent(E, "<ul><li>a</li></ul>", { left: 20, first: 10 }), /<li style="margin-left: ?20px; text-indent: ?10px">a<\/li>/);
    assert.equal(E.sanitizeRich('<p style="margin-left: 99999px; text-indent: abc">x</p>'), "<p>x</p>", "only lengths in range");
    // フォント → すべて大文字・小型英大文字 on the box.
    const o = E.normalizeObject({ id: "t", kind: "text", x: 0, y: 0, w: 400, h: 100, text: "<p>Seven</p>", caps: "small" });
    assert.equal(o.caps, "small");
    assert.equal(E.normalizeObject({ id: "t2", kind: "text", text: "<p>x</p>", caps: "huge" }).caps, undefined);
    const slide = { type: "blank", elements: [o] };
    const el = E.render(slide, { mode: "edit", index: 0, deck: { slides: [slide], theme: "sej" } });
    assert.match(el.querySelector(".hs-obj-tx").getAttribute("style"), /font-variant: ?small-caps/);
  } finally { delete globalThis.document; }
});

test("図のレイアウト: pictures set out with a caption each, filling their frames, grouped", () => {
  const pics = [
    { id: "p1", kind: "image", x: 100, y: 300, w: 300, h: 200, src: "asset:office", alt: "売場", crop: { l: 0.1, t: 0, r: 0, b: 0 } },
    { id: "p2", kind: "image", x: 500, y: 320, w: 300, h: 200, src: "asset:office", fileName: "倉庫.jpg" },
    { id: "p3", kind: "image", x: 900, y: 340, w: 300, h: 200, src: "asset:office" },
  ];
  const other = { id: "t1", kind: "text", x: 0, y: 0, w: 100, h: 50, text: "<p>見出し</p>" };
  const { list, ids } = ops.pictureLayout([other, ...pics], ["p1", "p2", "p3", "t1"], "row");
  assert.equal(ids.length, 6, "three pictures and three captions");
  const placed = list.filter((o) => ids.includes(o.id));
  const group = placed[0].group;
  assert.ok(group && placed.every((o) => o.group === group), "one group");
  const [a, b, c] = ["p1", "p2", "p3"].map((id) => list.find((o) => o.id === id));
  assert.ok(Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - c.y) < 0.01 && a.x < b.x && b.x < c.x, "in a row");
  assert.ok(Math.abs(a.w - b.w) < 0.01 && Math.abs(a.h - c.h) < 0.01, "the same size");
  assert.equal(a.fit, "cover");
  assert.equal(a.crop, undefined, "the frame is filled instead of cropped");
  const caps = list.filter((o) => o.kind === "text" && ids.includes(o.id));
  assert.deepEqual(caps.map((o) => o.text), ["<p>売場</p>", "<p>倉庫</p>", "<p>説明を入力</p>"], "alternative text, then the file's name");
  assert.ok(caps.every((cap, i) => cap.y > [a, b, c][i].y + [a, b, c][i].h - 1), "each caption under its picture");
  assert.equal(list.find((o) => o.id === "t1").group, undefined, "other objects are left alone");
  const grid = ops.pictureLayout(pics, ["p1", "p2", "p3"], "grid").list;
  assert.equal(grid.find((o) => o.id === "p3").x, grid.find((o) => o.id === "p1").x, "2 columns: the third starts a new row");
  const side = ops.pictureLayout(pics, ["p1", "p2"], "side");
  const cap = side.list.find((o) => o.id === side.ids[2]);
  assert.ok(cap.x > side.list.find((o) => o.id === "p1").x && cap.align === "left", "the words to the right of the picture");
  assert.equal(ops.pictureLayout([other], ["t1"], "row").ids.length, 0, "only pictures");
});
