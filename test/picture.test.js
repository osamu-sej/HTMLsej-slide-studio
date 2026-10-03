// 図の形式 (picture.mjs): 背景の削除 from the edges, 透明色を指定, and the size of a compressed picture.
import assert from "node:assert/strict";
import test from "node:test";

import { compressedSize, makeTransparent, removeBackground } from "../public/editor/picture.mjs";

/** A w × h picture: a white background with a navy square in the middle (and a white dot inside the square). */
function picture(w = 40, h = 30) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = (y * w + x) * 4;
    const inside = x >= 10 && x < 30 && y >= 8 && y < 22;
    const dot = x === 20 && y === 15;
    const c = inside && !dot ? [31, 56, 100] : [255, 255, 255];
    data.set([...c, 255], i);
  }
  return data;
}
const alpha = (data, w, x, y) => data[(y * w + x) * 4 + 3];

test("背景の削除 clears what the edges reach, keeps the subject and what is enclosed by it", () => {
  const w = 40;
  const data = picture();
  const share = removeBackground(data, w, 30);
  assert.equal(alpha(data, w, 0, 0), 0, "the corner goes");
  assert.equal(alpha(data, w, 5, 15), 0, "the background beside the subject goes");
  assert.equal(alpha(data, w, 15, 15), 255, "the subject stays");
  assert.equal(alpha(data, w, 20, 15), 255, "a white dot inside the subject is not background");
  assert.ok(Math.abs(share - (1200 - 280) / 1200) < 0.01, `share ${share}`);
});

test("透明色を指定 clears every pixel of that colour, wherever it is", () => {
  const w = 40;
  const data = picture();
  const n = makeTransparent(data, [255, 255, 255]);
  assert.equal(n, 1200 - 280 + 1);
  assert.equal(alpha(data, w, 20, 15), 0, "the dot too");
  assert.equal(alpha(data, w, 15, 15), 255);
});

test("compressed size keeps the shape and never enlarges", () => {
  assert.deepEqual(compressedSize(4000, 3000, 1600), [1600, 1200]);
  assert.deepEqual(compressedSize(800, 600, 1600), [800, 600]);
  assert.deepEqual(compressedSize(1000, 4000, 1280), [320, 1280]);
});
