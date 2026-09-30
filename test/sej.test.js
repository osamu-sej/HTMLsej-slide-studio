import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import { parseHTML } from "linkedom";

import { allLayoutSlides } from "./fixtures.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

/** The engine as the server hands it out: icons and the SEJ master pictures written in. */
async function loadEngine() {
  const { window } = parseHTML("<!doctype html><html><head></head><body></body></html>");
  const icons = (await readFile(join(root, "public", "engine", "icons.json"), "utf8")).trim();
  const art = {};
  for (const name of ["logo", "copyright"]) art[name] = `data:image/png;base64,${(await readFile(join(root, "assets", "sej", `${name}.png`))).toString("base64")}`;
  const engine = (await readFile(join(root, "public", "engine", "engine.js"), "utf8")).replace("/*__ICONS__*/{}", () => icons).replace("/*__SEJ__*/{}", () => JSON.stringify(art));
  const context = vm.createContext(window);
  window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  vm.runInContext(engine, context, { filename: "engine.js" });
  return window.SlideEngine;
}

const deckOf = (slides, extra = {}) => ({ title: "検証デッキ", audience: "役員", purpose: "意思決定", theme: "sej", transition: "fade", motion: {}, slides, ...extra });
const BODY = new Set(["title", "section", "closing", "hero", "statement"]);

test("a deck without a theme opens in the SEJ template", async () => {
  const E = await loadEngine();
  assert.equal(E.DEFAULT_THEME, "sej");
  const el = E.render(allLayoutSlides[4], { deck: deckOf(allLayoutSlides, { theme: undefined }), index: 4 });
  assert.equal(el.dataset.theme, "sej");
  assert.equal(E.render(allLayoutSlides[4], { deck: deckOf(allLayoutSlides, { theme: "no-such-theme" }), index: 4 }).dataset.theme, "sej");
});

test("every SEJ slide carries the template's masters", async () => {
  const E = await loadEngine();
  const deck = deckOf(allLayoutSlides);
  deck.slides.forEach((slide, index) => {
    const el = E.render(slide, { deck, index, mode: "thumb" });
    const master = ["title", "section"].includes(slide.type) ? "title" : "content";
    const chrome = el.querySelector(".hs-sej");
    assert.ok(chrome, `${slide.type}: master`);
    assert.equal(el.dataset.master, master, `${slide.type}: title master for the cover and chapters, content master for the rest`);
    assert.equal(chrome.getAttribute("aria-hidden"), "true", "the master is decoration for screen readers");
    assert.ok(chrome.querySelector(".hs-sej-rule"), "green rule");
    assert.deepEqual([...chrome.querySelectorAll(".hs-sej-tag")].map((tag) => tag.textContent), ["秘（B）", "社内限り"]);
    assert.equal(chrome.querySelector(".hs-sej-slogan").textContent, "明日の笑顔を 共に創る");
    assert.match(chrome.querySelector("img.hs-sej-logo").getAttribute("src"), /^data:image\/png;base64,/);
    assert.match(chrome.querySelector("img.hs-sej-copy").getAttribute("src"), /^data:image\/png;base64,/);
    // ‹#›: the content master numbers the page; the title master has no number.
    const page = chrome.querySelector(".hs-sej-page");
    if (master === "content") assert.equal(page.textContent, String(index + 1));
    else assert.equal(page, null);
    // The master's rule runs across the middle on the title master and under the title band on the content master.
    const top = parseFloat(chrome.querySelector(".hs-sej-rule").style.top);
    assert.ok(master === "title" ? top > 500 && top < 560 : top > 100 && top < 140, `${slide.type}: rule at ${top}px`);
  });
});

test("SEJ titles sit in one line above the green rule; the key message opens the body", async () => {
  const E = await loadEngine();
  const deck = deckOf(allLayoutSlides);
  deck.slides.forEach((slide, index) => {
    if (BODY.has(slide.type) && slide.type !== "closing" && slide.type !== "hero" && slide.type !== "statement") return;
    const el = E.render(slide, { deck, index });
    const title = el.querySelector(".hs-sej-titlebar > .hs-title[data-field=title]");
    assert.ok(title, `${slide.type}: title in the band`);
    assert.equal(title.dataset.lines, "1", `${slide.type}: the band holds one line`);
    if (!BODY.has(slide.type) && slide.takeaway) assert.ok(el.querySelector(".hs-head > .hs-takeaway[data-field=takeaway]"), `${slide.type}: key message`);
  });
  const chapterFirst = deckOf([allLayoutSlides[0], allLayoutSlides[1], allLayoutSlides[4]]);
  assert.equal(E.render(chapterFirst.slides[2], { deck: chapterFirst, index: 2 }).querySelector(".hs-eyebrow"), null, "no chapter line on an SEJ page");
  const clarity = { ...chapterFirst, theme: "clarity" };
  assert.ok(E.render(clarity.slides[2], { deck: clarity, index: 2 }).querySelector(".hs-eyebrow"), "other themes keep the chapter line");
});

test("the SEJ cover, chapter and closing follow the template", async () => {
  const E = await loadEngine();
  const deck = deckOf(allLayoutSlides);
  const cover = E.render(allLayoutSlides[0], { deck, index: 0 });
  assert.ok(cover.querySelector(".hs-sej-ripples[data-kind=title]"), "the cover's ripples");
  assert.equal(cover.querySelector(".hs-cover-title").dataset.field, "title");
  assert.equal(cover.querySelector(".hs-sej-cover-meta").textContent, "2026年9月役員", "the date on the left, the audience on the right");
  const chapter = E.render(allLayoutSlides[1], { deck, index: 1 });
  assert.equal(chapter.querySelector(".hs-section-no").textContent, "01");
  assert.ok(chapter.querySelector(".hs-sej-ripples[data-kind=section]"));
  const last = deck.slides.length - 1;
  const closing = E.render(deck.slides[last], { deck, index: last });
  assert.equal(closing.dataset.master, "content");
  assert.ok(closing.querySelector(".hs-sej-titlebar .hs-title"), "the closing's title in the band");
  assert.ok(closing.querySelector(".hs-sej-ripples[data-kind=closing]"), "the ripples return to close the deck");
  // A full-page photo would cover the master: on SEJ it fills the body under the rule instead.
  const hero = E.render(allLayoutSlides[2], { deck, index: 2 });
  assert.ok(hero.querySelector(".hs-sej-hero > .hs-media"));
  assert.equal(hero.querySelector(".hs-hero-media"), null);
});

test("SEJ keeps the brand's colours: a deck accent does not apply", async () => {
  const E = await loadEngine();
  const sej = E.render(allLayoutSlides[4], { deck: deckOf(allLayoutSlides, { accent: "#ff0066" }), index: 4 });
  assert.equal(sej.style.getPropertyValue("--accent"), "");
  const clarity = E.render(allLayoutSlides[4], { deck: deckOf(allLayoutSlides, { theme: "clarity", accent: "#ff0066" }), index: 4 });
  assert.equal(clarity.style.getPropertyValue("--accent"), "#ff0066");
});

test("the SEJ stylesheet never sets white text and keeps navy fills off text", async () => {
  const css = await readFile(join(root, "public", "engine", "engine.css"), "utf8");
  const start = css.indexOf("SEJ (the SEJ corporate template)");
  assert.ok(start > 0);
  const sej = css.slice(start);
  for (const rule of sej.split("}")) {
    const [selector, body = ""] = rule.split("{");
    if (/\.hs-sej-tag|\.hs-sej-slogan|\.hs-sej-page/.test(selector)) continue;
    assert.doesNotMatch(body, /(^|[;\s])color:\s*(#fff\b|#ffffff\b|white\b|var\(--accent-ink\))/i, `white text in ${selector.trim()}`);
    assert.doesNotMatch(body, /box-shadow:\s*0 \d+px \d+px/, `a drop shadow in ${selector.trim()}`);
  }
  // The theme's tokens are the brand profile's colours.
  const profile = JSON.parse(await readFile(join(root, "assets", "sej", "brand-profile.json"), "utf8"));
  const tokens = sej.slice(0, sej.indexOf("/* ---- the masters"));
  for (const color of profile.textColors) assert.match(tokens, new RegExp(`#${color}`, "i"), `text colour #${color}`);
  for (const color of ["DCE4F2", "F1F5FB", "F5F0EA", "F2F2F2", "B7C3DA", "D6C9B8"]) assert.match(tokens, new RegExp(`#${color}`, "i"), `fill #${color}`);
});
