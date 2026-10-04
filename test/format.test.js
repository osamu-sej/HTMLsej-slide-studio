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
