// The studio's chart kinds (objects.js CHART_KINDS, drawn by engine.js): 面・円・散布図・レーダー・ウォーターフォール・じょうご
// as well as the bars, lines and donut — each drawn with the parts the グラフが伸びる animation moves.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import { parseHTML } from "linkedom";

const root = fileURLToPath(new URL("..", import.meta.url));
async function loadEngine() {
  const { window } = parseHTML("<!doctype html><html><head></head><body></body></html>");
  const icons = (await readFile(join(root, "public", "engine", "icons.json"), "utf8")).trim();
  const context = vm.createContext(window);
  vm.runInContext((await readFile(join(root, "public", "engine", "engine.js"), "utf8")).replace("/*__ICONS__*/{}", () => icons), context, { filename: "engine.js" });
  vm.runInContext(await readFile(join(root, "public", "engine", "objects.js"), "utf8"), context, { filename: "objects.js" });
  return window.SlideEngine;
}
const draw = (E, chart) => {
  const o = E.normalizeObject({ id: "c", kind: "chart", x: 100, y: 100, w: 960, h: 560, chart });
  const slide = { type: "blank", elements: [o] };
  return { o, el: E.render(slide, { mode: "present", index: 1, deck: { slides: [slide], theme: "sej" } }) };
};

test("every PowerPoint chart kind the studio offers is kept and drawn", async () => {
  const E = await loadEngine();
  for (const kind of ["area", "pie", "scatter", "radar", "waterfall", "funnel"]) assert.ok(E.CHART_KINDS[kind], kind);
  const two = { labels: ["A", "B", "C", "D"], series: [{ name: "今年", values: [3, 5, 4, 6] }, { name: "前年", values: [2, 4, 3, 5] }] };

  let { o, el } = draw(E, { type: "area", ...two });
  assert.equal(o.chart.type, "area");
  assert.equal(el.querySelectorAll(".hs-chart .hs-oarea").length, 2, "an area per series");
  assert.equal(el.querySelectorAll(".hs-chart .hs-draw").length, 2);
  assert.equal(el.querySelectorAll(".hs-legend span").length, 2, "a legend for two series");

  ({ el } = draw(E, { type: "pie", labels: ["来店", "アプリ", "宅配"], series: [{ name: "構成比", values: [60, 25, 15] }] }));
  const arcs = [...el.querySelectorAll(".hs-chart .hs-arc")];
  assert.equal(arcs.length, 3, "a slice each");
  assert.equal(Number(arcs[0].getAttribute("stroke-width")), Number(arcs[0].getAttribute("r")) * 2, "no hole");

  ({ el } = draw(E, { type: "scatter", labels: ["10", "20", "30"], series: [{ name: "y", values: [1, 4, 9] }] }));
  const dots = [...el.querySelectorAll(".hs-chart .hs-dot")];
  assert.equal(dots.length, 3);
  assert.ok(Number(dots[2].getAttribute("cx")) > Number(dots[0].getAttribute("cx")) && Number(dots[2].getAttribute("cy")) < Number(dots[0].getAttribute("cy")), "X from the labels, Y from the values");

  ({ el } = draw(E, { type: "radar", labels: ["a", "b", "c", "d", "e"], series: two.series.map((s) => ({ ...s, values: [...s.values, 2] })) }));
  assert.equal(el.querySelectorAll(".hs-chart polygon.hs-oarea").length, 2);
  assert.equal(el.querySelectorAll(".hs-chart polygon.hs-grid").length, 4, "four rings");

  ({ el } = draw(E, { type: "waterfall", labels: ["前年", "増", "減", "合計"], series: [{ name: "利益", values: [100, 30, -20, 0] }] }));
  const bars = [...el.querySelectorAll(".hs-chart rect.hs-bar")];
  assert.equal(bars.length, 4);
  assert.ok(bars[2].hasAttribute("data-neg"), "a decrease");
  assert.equal(bars[3].getAttribute("fill"), "var(--accent)", "the total stands on the axis in navy");
  // The decrease runs from 130 down to 110; the total's top is at 110, where the decrease ends.
  const bottomOf = (b) => Number(b.getAttribute("y")) + Number(b.getAttribute("height"));
  assert.ok(Math.abs(Number(bars[3].getAttribute("y")) - bottomOf(bars[2])) < 1, "the total reaches the running sum (110)");

  ({ el } = draw(E, { type: "funnel", labels: ["認知", "来店", "購入"], series: [{ name: "人", values: [1000, 400, 100] }] }));
  const widths = [...el.querySelectorAll(".hs-chart rect.hs-bar")].map((b) => Number(b.getAttribute("width")));
  assert.ok(widths[0] > widths[1] && widths[1] > widths[2], "narrowing stages");
  assert.ok([...el.querySelectorAll(".hs-chart text")].some((t) => t.textContent.includes("40%")), "the share of the first stage");
});

test("outline to slides, album boxes and fitting pictures (slidetools.mjs)", async () => {
  const { outlineToSlides, albumBoxes, fitIn } = await import("../public/editor/slidetools.mjs");
  assert.deepEqual(outlineToSlides("売上の現状\n  前年比112%\n  - 東日本が伸びている\n来期の打ち手\n・品揃え\n# まとめ"), [
    { type: "content", title: "売上の現状", points: ["前年比112%", "東日本が伸びている"] },
    { type: "content", title: "来期の打ち手", points: ["品揃え"] },
    { type: "section", title: "まとめ" },
  ]);
  assert.deepEqual(outlineToSlides("## A\n1. one\n2) two"), [{ type: "content", title: "A", points: ["one", "two"] }]);
  for (const per of [1, 2, 4]) {
    const boxes = albumBoxes(per, { captions: true });
    assert.equal(boxes.length, per);
    for (const b of boxes) assert.ok(b.x >= 120 && b.x + b.w <= 1800 && b.y >= 230 && b.y + b.h + 56 <= 950, `${per}: ${JSON.stringify(b)}`);
  }
  const fit = fitIn({ x: 0, y: 0, w: 400, h: 400 }, 800, 400);
  assert.deepEqual(fit, { x: 0, y: 100, w: 400, h: 200 });
});

test("video plan: saved timings or the default seconds, slide by slide (video.mjs); SRT to WebVTT (media.mjs)", async () => {
  const { videoPlan } = await import("../public/editor/video.mjs");
  const slides = [{ advance: 2 }, {}, { advance: 0.5 }];
  assert.deepEqual(videoPlan([0, 1, 2], slides, { seconds: 4 }), { plan: [{ index: 0, ms: 2000 }, { index: 1, ms: 4000 }, { index: 2, ms: 500 }], total: 6500 });
  assert.equal(videoPlan([0, 1, 2], slides, { seconds: 4, useTimings: false }).total, 12000);
  const { toVtt } = await import("../public/editor/media.mjs");
  assert.equal(toVtt("1\r\n00:00:01,000 --> 00:00:02,500\r\nこんにちは\r\n"), "WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.500\nこんにちは");
  assert.equal(toVtt("﻿WEBVTT\n\n00:01.000 --> 00:02.000\nhi"), "WEBVTT\n\n00:01.000 --> 00:02.000\nhi");
  const E = await loadEngine();
  const o = E.normalizeObject({ id: "v", kind: "video", src: "https://example.com/a.mp4", x: 0, y: 0, w: 640, h: 360, captions: toVtt("1\n00:00:01,000 --> 00:00:02,000\n字幕"), captionLang: "ja" });
  assert.match(o.captions, /^WEBVTT/);
  const slide = { type: "blank", elements: [o] };
  const el = E.render(slide, { mode: "present", index: 1, deck: { slides: [slide], theme: "sej" } });
  const track = el.querySelector("video track");
  assert.ok(track && track.getAttribute("kind") === "captions" && track.getAttribute("src").startsWith("data:text/vtt"), "a captions track");
  assert.equal(E.normalizeObject({ id: "v", kind: "video", src: "https://example.com/a.mp4", x: 0, y: 0, w: 640, h: 360, captions: "not vtt" }).captions, undefined);
});

test("chart elements: no data labels, the legend below / at the right / none, no gridlines", async () => {
  const E = await loadEngine();
  const two = { labels: ["A", "B", "C"], series: [{ name: "今年", values: [3, 5, 4] }, { name: "前年", values: [2, 4, 3] }] };
  const kept = E.normalizeObject({ id: "c", kind: "chart", x: 0, y: 0, w: 900, h: 500, chart: { type: "clustered-bar", ...two, opts: { labels: false, legend: "right", grid: false, junk: 1 } } }).chart.opts;
  assert.deepEqual({ ...kept }, { labels: false, legend: "right", grid: false });
  let { el } = draw(E, { type: "clustered-bar", ...two });
  assert.ok(el.querySelectorAll(".hs-chart .hs-val").length > 0, "values by default");
  assert.ok(el.querySelector(".hs-chart-wrap > .hs-legend:first-child"), "the legend on top by default");
  ({ el } = draw(E, { type: "clustered-bar", ...two, opts: { labels: false, legend: "bottom" } }));
  assert.equal(el.querySelectorAll(".hs-chart .hs-val").length, 0, "no data labels");
  assert.ok(el.querySelector(".hs-chart-wrap > .hs-legend:last-child.at-bottom"), "the legend below");
  ({ el } = draw(E, { type: "area", ...two, opts: { legend: "none", grid: false } }));
  assert.equal(el.querySelectorAll(".hs-legend").length, 0, "no legend");
  assert.equal(el.querySelectorAll(".hs-chart line.hs-grid").length, 0, "no gridlines");
  assert.ok(el.querySelector(".hs-chart line.hs-axisline"), "the axis stays");
});
