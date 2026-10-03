// The editor's controls, PowerPoint style: the ribbon over the slide (ホーム・挿入・図形の書式・図の形式・表示),
// the 書式 pane on the right (fill, line, text, size and position, picture, link) with the selection pane, and the
// galleries they open (shapes, colours in the SEJ palette, icons, photos).

import * as ops from "./ops.mjs";
import { ico } from "./icons.mjs";
import { createAnimations } from "./anim.mjs";
import { createInteractions } from "./interact.mjs";
import { createTableUi } from "./tables.mjs";
import { createCrop } from "./crop.mjs";
import { createFreeform } from "./freeform.mjs";
import { createMedia } from "./media.mjs";
import { MERGE_HINTS, MERGE_MODES, canMerge, clippingLib, mergeObjects } from "./merge.mjs";
import { createSmartArt } from "./smartart.mjs";
import { createInk } from "./ink.mjs";
import { createExtras } from "./extras.mjs";

const SIZES_PT = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];
const LINE_WIDTHS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6, 8, 12];
// 文字の間隔 (PowerPoint's: tight to very loose), in em.
const CHAR_SPACING = [[-0.1, "より狭く"], [-0.05, "狭く"], [0, "標準"], [0.05, "広く"], [0.12, "より広く"]];
// 挿入 → 記号と特殊文字: what Japanese business slides use most (no < > &, which are markup).
const SYMBOLS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "※", "・", "→", "←", "↑", "↓", "⇒", "⇔", "○", "●", "◎", "△", "▲", "▼", "□", "■", "◇", "◆", "★", "☆", "✓", "✕", "±", "×", "÷", "≒", "≠", "≦", "≧", "∞", "℃", "％", "‰", "㎡", "㎏", "㎞", "￥", "€", "＄", "〒", "©", "®", "™", "…", "〜", "「", "」", "『", "』", "【", "】", "〔", "〕", "♪", "☎", "✉"];
const LINE_HEIGHTS = [[1, "1.0"], [1.15, "1.15"], [1.35, "1.35"], [1.5, "1.5"], [1.75, "1.75"], [2, "2.0"], [2.5, "2.5"], [3, "3.0"]];
// Brand quick styles (図形のスタイル): fills and lines of the SEJ palette, text black or navy, never white.
const QUICK_STYLES = [
  ["淡青", { fill: "#dce4f2", stroke: "none", color: "#1a1a1a" }],
  ["ごく淡い青", { fill: "#f1f5fb", stroke: "none", color: "#1a1a1a" }],
  ["青灰", { fill: "#b7c3da", stroke: "none", color: "#1a1a1a" }],
  ["グレー", { fill: "#f2f2f2", stroke: "none", color: "#1a1a1a" }],
  ["淡茶", { fill: "#f5f0ea", stroke: "none", color: "#1a1a1a" }],
  ["茶", { fill: "#d6c9b8", stroke: "none", color: "#1a1a1a" }],
  ["白・濃紺の線", { fill: "#ffffff", stroke: "#1f3864", strokeW: 3, color: "#1f3864" }],
  ["枠線だけ（濃紺）", { fill: "none", stroke: "#1f3864", strokeW: 3, color: "#1f3864" }],
  ["枠線だけ（グレー）", { fill: "none", stroke: "#808080", strokeW: 2, color: "#1a1a1a" }],
  ["濃紺（文字なし）", { fill: "#1f3864", stroke: "none", color: "#1a1a1a" }],
];
const ACTIONS = [["none", "なし"], ["next", "次のスライド"], ["prev", "前のスライド"], ["first", "最初のスライド"], ["last", "最後のスライド"], ["slide", "スライドを指定…"], ["url", "URL（Webページ・メール）…"], ["end", "スライドショーの終了"]];
const MASKS = ["rect", "roundRect", "ellipse", "triangle", "diamond", "pentagon", "hexagon", "octagon", "star5", "star8", "heart", "cloud", "teardrop", "wedgeRoundRectCallout", "flowTerminator", "snip2DiagRect", "round2DiagRect", "chevron", "homePlate"];

export function createEditorUi(editor, app) {
  const { E, h } = app;
  const ribbon = document.getElementById("ribbon");
  const pane = document.getElementById("formatPane");
  let tab = "home";
  // Ribbon display options, as PowerPoint's: "full" (always shown), "tabs" (only the tabs; a tab opens the ribbon
  // over the slide until a command or a click elsewhere), "auto" (hidden behind a thin bar at the top).
  const RIBBON_MODES = { full: "常にリボンを表示する", tabs: "タブのみを表示する", auto: "自動的に非表示にする（全画面表示モード）" };
  let ribbonMode = (() => { try { const m = localStorage.getItem("hsej-ribbon-mode"); return RIBBON_MODES[m] ? m : "full"; } catch { return "full"; } })();
  let floating = false;
  let grayView = false; // 表示 → グレースケール (only how the slide is shown here)
  let built = "";
  let updaters = [];
  let pop = null;

  // ---------------------------------------------------------------- small building blocks

  const selected = () => editor.selectedObjects();
  const kinds = () => new Set(selected().map((o) => o.kind));
  const hasText = () => selected().some((o) => o.kind === "shape" || o.kind === "text");
  const hasShape = () => selected().some((o) => ["shape", "text", "line", "icon"].includes(o.kind));
  const hasImage = () => kinds().has("image");
  const one = () => (selected().length === 1 ? selected()[0] : null);
  const any = () => selected().length > 0;
  const onSlide = () => Boolean(app.slide()) && app.state().view === "single";

  // A big button's label breaks only where "|" says (新しい|スライド), as PowerPoint's two-line labels.
  const plain = (label) => (label || "").replaceAll("|", "");
  const caption = (label) => (label ? h("span", {}, ...label.split("|").flatMap((part, i) => (i ? [h("wbr"), part] : [part]))) : null);

  /** A ribbon button: icon + label, pressed/enabled follow the selection. */
  function btn(icon, label, title, run, { pressed = null, enabled = null, big = false, keep = false } = {}) {
    const el = h("button", { type: "button", class: ["rb-btn", big ? "big" : ""], title: title || plain(label), "aria-label": title || plain(label), "data-keeps-text": keep ? "" : null,
      onmousedown: (event) => { if (keep) event.preventDefault(); },
      // A command from the ribbon floating over the slide closes it afterwards (PowerPoint's タブのみを表示).
      onclick: (event) => { event.preventDefault(); const fromFloat = floating && ribbon.contains(el); run(event); if (fromFloat && floating && !pop) closeFloating(); } }, ico(icon, big ? 26 : 18), caption(label));
    updaters.push(() => {
      if (enabled) el.disabled = !enabled();
      if (pressed) el.setAttribute("aria-pressed", String(Boolean(pressed())));
    });
    return el;
  }
  /** A button that opens a menu or gallery under it. */
  function drop(icon, label, title, build, { enabled = null, big = false, keep = false, swatch = null } = {}) {
    const el = h("button", { type: "button", class: ["rb-btn", "rb-drop", big ? "big" : ""], title: title || plain(label), "aria-haspopup": "true", "data-keeps-text": keep ? "" : null,
      onmousedown: (event) => { if (keep) event.preventDefault(); },
      onclick: (event) => { event.preventDefault(); openPop(el, build); } },
    ico(icon, big ? 26 : 18), caption(label), swatch ? h("i", { class: "rb-swatch" }) : null, h("b", { class: "rb-caret" }, "▾"));
    updaters.push(() => {
      if (enabled) el.disabled = !enabled();
      if (swatch) el.querySelector(".rb-swatch").style.background = swatch() || "transparent";
    });
    return el;
  }
  const group = (label, ...items) => h("div", { class: "rb-group" }, h("div", { class: "rb-items" }, ...items.flat().filter(Boolean)), h("div", { class: "rb-label" }, label));
  const col = (...items) => h("div", { class: "rb-col" }, ...items.flat().filter(Boolean));
  const row = (...items) => h("div", { class: "rb-row" }, ...items.flat().filter(Boolean));

  // ---------------------------------------------------------------- popovers (menus and galleries)

  function openPop(anchor, build) {
    // Measure first: the anchor may sit in the popover being closed (a button of a folded ribbon group).
    const r = anchor.getBoundingClientRect();
    const nested = pop?.el.contains(anchor);
    const fromRibbon = floating && (ribbon.contains(anchor) || (nested && pop?.fromRibbon));
    closePop(true);
    // A builder may return the content, or a function that builds it with `close`.
    let content = build(closePop);
    while (typeof content === "function") content = content(closePop);
    if (!content) return;
    const el = h("div", { class: "rb-pop", role: "dialog", "data-keeps-text": "" }, content);
    document.body.append(el);
    if (nested) anchor = el;
    const pr = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(r.left, innerWidth - pr.width - 8))}px`;
    el.style.top = `${Math.min(r.bottom + 4, innerHeight - pr.height - 8)}px`;
    pop = { el, anchor, fromRibbon };
    setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
    document.addEventListener("keydown", popKey, true);
  }
  // A click elsewhere closes the menu (and the floating ribbon it came from, unless the click is on the ribbon).
  function outside(event) { if (pop && !pop.el.contains(event.target) && !pop.anchor.contains(event.target)) closePop(ribbon.contains(event.target)); }
  function popKey(event) { if (event.key === "Escape" && pop) { event.stopPropagation(); closePop(true); } }
  /** Closes the open menu or gallery; one opened from the floating ribbon closes the ribbon too (a command was chosen). */
  function closePop(keepRibbon = false) {
    const fromRibbon = pop?.fromRibbon;
    pop?.el.remove();
    pop = null;
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", popKey, true);
    if (fromRibbon && !keepRibbon && floating) { floating = false; renderRibbon(true); }
  }
  const menu = (items) => (close) => h("div", { class: "rb-menu" }, items.filter(Boolean).map((item) => (item === "-" ? h("div", { class: "rb-sep" })
    : item.head ? h("div", { class: "rb-menu-head" }, item.head)
      : h("button", { type: "button", class: item.on ? "on" : "", title: item.title || null, disabled: item.disabled || null, onmousedown: (e) => e.preventDefault(), onclick: () => { item.hover?.(false); close(); item.run(); },
        onmouseenter: item.hover ? () => item.hover(true) : null, onmouseleave: item.hover ? () => item.hover(false) : null }, item.icon ? ico(item.icon) : h("span", { class: "rb-noicon" }), h("span", {}, item.label), item.keys ? h("kbd", {}, item.keys) : null))));

  /** Colour swatches of the SEJ palette (plus none and, for fills and lines, any colour with a warning). */
  function colors(list, current, pick, { none = null, custom = true, note = "" } = {}) {
    return (close) => {
      const wrap = h("div", { class: "rb-colors" });
      if (none) wrap.append(h("button", { type: "button", class: ["rb-none", current === "none" ? "on" : ""], onmousedown: (e) => e.preventDefault(), onclick: () => { close(); pick("none"); } }, none));
      wrap.append(h("div", { class: "rb-swatches" }, list.map(([color, label]) => h("button", {
        type: "button", class: ["rb-sw", String(current).toLowerCase() === color ? "on" : ""], title: `${label}（${color.toUpperCase()}）`, "aria-label": label, style: { "--c": color },
        onmousedown: (e) => e.preventDefault(), onclick: () => { close(); pick(color); },
      }))));
      if (custom) {
        const input = h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(current) ? current : "#1f3864", onchange: (event) => { close(); pick(event.target.value); } });
        wrap.append(h("label", { class: "rb-custom" }, input, h("span", {}, "その他の色…"), h("small", {}, "SEJの色以外はチェックで知らせます")));
      }
      if (note) wrap.append(h("p", { class: "rb-note" }, note));
      return wrap;
    };
  }

  /** The shape gallery, by PowerPoint's categories (and the lines). */
  function shapeGallery(onPick, { lines = true } = {}) {
    return (close) => {
      const box = h("div", { class: "rb-gallery shapes" });
      if (lines) {
        box.append(h("div", { class: "rb-gallery-head" }, "線"));
        box.append(h("div", { class: "rb-gallery-grid" }, [["line", "直線"], ["arrow", "矢印"], ["double", "両方向矢印"], ["elbow", "カギ線コネクタ"], ["curve", "曲線コネクタ"]].map(([variant, label]) => h("button", {
          type: "button", title: label, "aria-label": label, onclick: () => { close(); onPick({ kind: "line", variant }); },
        }, lineThumb(variant))), [["curve", "曲線"], ["polygon", "フリーフォーム: 図形"], ["scribble", "フリーフォーム: フリーハンド"]].map(([mode, label]) => h("button", {
          type: "button", title: label, "aria-label": label, "data-freeform": mode, onclick: () => { close(); onPick({ kind: "freeform", mode }); },
        }, freeformThumb(mode)))));
      }
      for (const [name, keys] of E.SHAPE_GROUPS) {
        box.append(h("div", { class: "rb-gallery-head" }, name));
        box.append(h("div", { class: "rb-gallery-grid" }, keys.map((key) => h("button", {
          type: "button", title: E.SHAPES[key].label, "aria-label": E.SHAPES[key].label, onclick: () => { close(); onPick({ kind: "shape", shape: key }); },
        }, shapeThumb(key)))));
      }
      return box;
    };
  }
  function shapeThumb(key, w = 26, hh = 20) {
    const g = E.geometry(key, w, hh, E.SHAPES[key].adj);
    const svg = E.s("svg", { viewBox: `-2 -2 ${w + 4} ${hh + 4}`, width: w + 4, height: hh + 4, "aria-hidden": "true" });
    for (const d of g.paths) svg.append(E.s("path", { d, fill: g.open ? "none" : "#dce4f2", stroke: "#1f3864", "stroke-width": 1, "fill-rule": g.rule }));
    for (const extra of g.extras) svg.append(E.s("path", { d: extra.d, fill: extra.tone === "line" ? "none" : extra.tone === "dark" ? "rgba(0,0,0,.15)" : "rgba(255,255,255,.5)", stroke: "#1f3864", "stroke-width": 0.8 }));
    return svg;
  }
  function freeformThumb(mode) {
    const svg = E.s("svg", { viewBox: "0 0 30 24", width: 30, height: 24, "aria-hidden": "true" });
    const d = mode === "curve" ? "M3 18 C8 4 14 4 16 12 S24 22 27 6" : mode === "polygon" ? "M4 19 L9 5 L17 11 L25 4 L22 20 Z" : "M3 16 c3-6 5 4 8-2 s4-8 6 0 s5 6 7-4 s2-4 3 0";
    svg.append(E.s("path", { d, fill: mode === "polygon" ? "#dce4f2" : "none", stroke: "#1f3864", "stroke-width": 1.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    return svg;
  }
  function lineThumb(variant) {
    const svg = E.s("svg", { viewBox: "0 0 30 24", width: 30, height: 24, "aria-hidden": "true" });
    const d = variant === "elbow" ? "M4 20 H15 V4 H26" : variant === "curve" ? "M4 20 C15 20 15 4 26 4" : "M4 20 L26 4";
    svg.append(E.s("path", { d, fill: "none", stroke: "#1f3864", "stroke-width": 1.6 }));
    if (variant !== "line") svg.append(E.s("path", { d: variant === "elbow" ? "M21 1 L27 4 L21 7 Z" : variant === "curve" ? "M21 1 L27 4 L21 7 Z" : "M20 3 L26 4 L23 9 Z", fill: "#1f3864" }));
    if (variant === "double") svg.append(E.s("path", { d: "M4 20 L10 21 L7 15 Z", fill: "#1f3864" }));
    return svg;
  }

  function iconGallery(onPick) {
    return (close) => {
      const search = h("input", { type: "search", placeholder: "アイコンを探す（例：時計、店舗）", class: "rb-search" });
      const grid = h("div", { class: "rb-gallery-grid icons" });
      const fill = () => {
        const q = search.value.trim();
        grid.replaceChildren(...Object.entries(E.icons).filter(([key, entry]) => !q || key.includes(q) || String(entry.label || "").includes(q)).map(([key, entry]) => {
          const icon = E.icon(key);
          return h("button", { type: "button", title: entry.label || key, "aria-label": entry.label || key, onclick: () => { close(); onPick(key); } }, icon, h("small", {}, entry.label || key));
        }));
      };
      search.addEventListener("input", fill);
      fill();
      setTimeout(() => search.focus(), 0);
      return h("div", { class: "rb-gallery icons" }, search, grid);
    };
  }

  function photoGallery(onPick) {
    return (close) => h("div", { class: "rb-gallery photos" }, h("div", { class: "rb-gallery-head" }, "内蔵の写真（社内で使える素材）"),
      h("div", { class: "rb-gallery-grid photos" }, Object.entries(E.PHOTOS).map(([key, [file, label]]) => h("button", { type: "button", title: label, onclick: () => { close(); onPick(key); } },
        h("img", { src: `/assets/${file}`, alt: "", loading: "lazy" }), h("small", {}, label)))));
  }

  // ---------------------------------------------------------------- commands shared by the ribbon and the pane

  const fillOf = () => { const o = selected().find((x) => ["shape", "text"].includes(x.kind)); return o ? E.withDefaults(o).fill : null; };
  const strokeOf = () => { const o = selected()[0]; return o ? E.withDefaults(o).stroke : null; };
  const textColorOf = () => editor.textState()?.color ?? "#1a1a1a";
  const setFill = (color) => editor.apply((o) => (["shape", "text"].includes(o.kind) ? { fill: color } : null));
  const setStroke = (color) => editor.apply((o) => (["shape", "text", "image", "line"].includes(o.kind) ? { stroke: color, ...(color !== "none" && o.kind !== "line" && E.withDefaults(o).stroke === "none" ? { strokeW: E.withDefaults(o).strokeW || 2 } : {}) } : o.kind === "icon" ? { color } : null));
  const setStrokeWidth = (pt) => editor.apply((o) => (["shape", "text", "image", "line"].includes(o.kind) ? { strokeW: ops.fromPt(pt), ...(E.withDefaults(o).stroke === "none" && o.kind !== "line" ? { stroke: "#1f3864" } : {}) } : o.kind === "icon" ? { strokeW: Math.max(0.5, pt) } : null));
  const setDash = (dash) => editor.apply((o) => (["shape", "text", "image", "line"].includes(o.kind) ? { dash: dash === "solid" ? undefined : dash } : null));

  async function insertImages() {
    const files = await app.pickFiles("image/*", true);
    if (files.length) { await app.insertFiles(files); showTab("picture"); }
  }
  async function insertVideoFile() {
    const files = await app.pickFiles("video/mp4,video/webm,video/quicktime,.json,application/json", false);
    if (files.length) await app.insertFiles(files);
  }
  async function insertFromUrl(kind) {
    const url = await app.ask(kind === "image" ? "URLから画像を入れる" : "URLで動画（YouTube）・アニメーションを入れる", kind === "image" ? "画像のURL（https://…）" : "YouTubeのURL、動画（mp4）やLottie（.json）のURL", "");
    if (url) await app.insertUrl(url.trim(), kind);
  }
  function insertIcon(key) {
    const [o] = editor.insert([ops.makeObject("icon", { x: 0, y: 0, w: 144, h: 144 }, { icon: key, color: "#1f3864" })]);
    if (o) showTab("shape");
  }
  function insertPhoto(key) {
    const [file] = E.PHOTOS[key];
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(960 / img.naturalWidth, 640 / img.naturalHeight, 1);
      editor.insert([ops.makeObject("image", { x: 0, y: 0, w: img.naturalWidth * scale, h: img.naturalHeight * scale }, { src: `asset:${key}`, alt: E.PHOTOS[key][1] })]);
      showTab("picture");
    };
    img.onerror = () => editor.insert([ops.makeObject("image", { x: 0, y: 0, w: 960, h: 540 }, { src: `asset:${key}` })]);
    img.src = `/assets/${file}`;
  }
  /** 挿入 → 記号と特殊文字・日付と時刻: at the caret while typing, else a new text box in the middle of the slide. */
  function insertWords(text) {
    if (editor.typing && editor.restoreRange()) { document.execCommand("insertText", false, text); return; }
    const width = Math.min(1600, Math.max(160, [...text].length * 46 + 48));
    editor.insert([ops.makeObject("text", { x: 0, y: 0, w: width, h: 96 }, { text: `<p>${text}</p>`, fs: 40 })]);
  }
  function symbolGallery() {
    return (close) => h("div", { class: "rb-gallery symbols" }, h("div", { class: "rb-gallery-head" }, "記号と特殊文字"),
      h("div", { class: "rb-symbols" }, SYMBOLS.map((ch) => h("button", { type: "button", title: ch, "aria-label": ch, onmousedown: (e) => e.preventDefault(), onclick: () => { close(); insertWords(ch); } }, ch))));
  }
  function dateMenu() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const wd = "日月火水木金土"[now.getDay()];
    const era = y >= 2019 ? `令和${y - 2018 === 1 ? "元" : y - 2018}年${m}月${d}日` : `${y}年${m}月${d}日`;
    const pad = (n) => String(n).padStart(2, "0");
    return menu([{ head: "日付と時刻（今日）" }, ...[`${y}年${m}月${d}日`, `${y}年${m}月${d}日（${wd}）`, `${y}/${pad(m)}/${pad(d)}`, `${y}年${m}月`, era, `${m}月${d}日（${wd}）`, `${pad(now.getHours())}:${pad(now.getMinutes())}`].map((text) => ({ label: text, run: () => insertWords(text) }))]);
  }
  function pickTool(tool) {
    if (tool.kind === "freeform") { freeform.start(tool.mode); return; }
    editor.setTool(tool);
    app.toast(tool.kind === "line" ? "スライド上をドラッグして線を引いてください（Shiftで水平・垂直・45°）" : tool.kind === "text" ? "クリックまたはドラッグでテキストボックスを置き、そのまま入力できます" : "スライド上をドラッグして描いてください（クリックで標準の大きさ。Shiftで縦横同じ比率）");
  }

  async function editLink() {
    // While typing, the words picked become a link (挿入 → リンク), as in PowerPoint.
    if (editor.typing) {
      const selection = window.getSelection();
      const picked = selection && !selection.isCollapsed && selection.toString().trim();
      if (picked) {
        const range = selection.getRangeAt(0).cloneRange();
        const url = await app.ask("リンクの挿入", `「${picked.slice(0, 30)}」から開くWebページ（https://…）かメール（mailto:…）。空にするとリンクを外します`, "https://");
        if (url == null) return;
        editor.restoreRange();
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        if (!url.trim() || url.trim() === "https://") { editor.textFormat("unlink"); return; }
        if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) { app.toast("URLは https:// か mailto: で始めてください"); return; }
        editor.textFormat("link", url.trim());
        app.toast("リンクを付けました（発表中にクリックすると開きます）");
        return;
      }
    }
    const o = one();
    if (!o) return app.toast("リンクを付けるオブジェクトを1つ選んでください");
    openPop(document.querySelector('[data-rb="link"]') || ribbon, (close) => linkForm(o, close));
  }

  function linkForm(o, close = null) {
    const current = o.action?.type || "none";
    const kind = h("select", { "aria-label": "クリックしたときの動作" }, ACTIONS.map(([value, label]) => h("option", { value, selected: value === current || null }, label)));
    const slides = h("select", { "aria-label": "移動先のスライド", hidden: current !== "slide" }, app.deck().slides.map((slide, i) => h("option", { value: String(i), selected: o.action?.type === "slide" && app.slideOfSid(o.action.to) === i ? true : null }, `${i + 1}. ${E.strip(slide.title || slide.message || E.TYPE_LABELS[slide.type] || "")}`.slice(0, 40))));
    const url = h("input", { type: "url", placeholder: "https://… または mailto:…", value: o.action?.type === "url" ? o.action.href : "", hidden: current !== "url" });
    kind.addEventListener("change", () => { slides.hidden = kind.value !== "slide"; url.hidden = kind.value !== "url"; });
    const save = () => {
      const type = kind.value;
      let action;
      if (type === "none") action = undefined;
      else if (type === "slide") action = { type, to: app.ensureSid(Number(slides.value)) };
      else if (type === "url") { if (!/^(https?:\/\/|mailto:)/i.test(url.value.trim())) { app.toast("URLは https:// か mailto: で始めてください"); return; } action = { type, href: url.value.trim() }; }
      else action = { type };
      editor.apply({ action }, { ids: [o.id] });
      close?.();
      app.toast(action ? "クリックしたときの動作を設定しました（発表中とHTML出力で働きます）" : "動作を外しました");
    };
    return h("div", { class: "rb-form" }, h("b", {}, "クリックしたときの動作（発表中）"), kind, slides, url,
      h("div", { class: "rb-form-foot" }, h("button", { type: "button", class: "btn btn-primary btn-sm", onclick: save }, "設定する")));
  }

  // ---------------------------------------------------------------- the ribbon

  // PowerPoint's order: the tabs that are always there, then the ones the selection brings (図形の書式・図の形式).
  const TABS = [
    { id: "home", label: "ホーム" },
    { id: "insert", label: "挿入" },
    { id: "draw", label: "描画" },
    { id: "design", label: "デザイン" },
    { id: "transition", label: "画面切り替え" },
    { id: "animation", label: "アニメーション" },
    { id: "interact", label: "インタラクション" },
    { id: "slideshow", label: "スライド ショー" },
    { id: "review", label: "校閲" },
    { id: "view", label: "表示" },
    { id: "developer", label: "開発" },
    { id: "shape", label: "図形の書式", contextual: () => hasShape() },
    { id: "picture", label: "図の形式", contextual: () => hasImage() },
    { id: "tableDesign", label: "テーブル デザイン", contextual: () => tables.isTable() },
    { id: "tableLayout", label: "レイアウト", contextual: () => tables.isTable() },
    { id: "chartDesign", label: "グラフのデザイン", contextual: () => tables.isChart() },
    { id: "playback", label: "再生", contextual: () => media.has() },
    { id: "smartartDesign", label: "SmartArt のデザイン", contextual: () => smart.isSmartArt() },
    { id: "zoomTool", label: "ズーム", contextual: () => extras.isZoom() },
  ];

  function signature() {
    const ctx = TABS.filter((t) => t.contextual?.()).map((t) => t.id).join(",");
    return `${tab}|${ctx}|${ribbonMode}|${floating}|${onSlide()}`;
  }

  // ---------------------------------------------------------------- ribbon display options
  function setRibbonMode(mode) {
    if (!RIBBON_MODES[mode]) return;
    ribbonMode = mode;
    floating = false;
    try { localStorage.setItem("hsej-ribbon-mode", mode); } catch { /* private window */ }
    closePop(true);
    renderRibbon(true);
  }
  /** ⌘F1 / Ctrl+F1, a double-click on a tab, the ˄ button: the ribbon folds to its tabs, or comes back. */
  function toggleRibbon() { setRibbonMode(ribbonMode === "full" ? "tabs" : "full"); }
  function openFloating(id = tab) { tab = id; floating = true; renderRibbon(true); editor.draw(); }
  function closeFloating() { if (!floating) return; floating = false; closePop(true); renderRibbon(true); }
  function floatingOutside(event) { if (floating && !ribbon.contains(event.target) && !pop?.el.contains(event.target)) closeFloating(); }
  function floatingKey(event) { if (floating && !pop && event.key === "Escape") { event.stopPropagation(); closeFloating(); } }
  function fileMenu() {
    return menu([
      { head: "ファイル" },
      { label: "新規（作成画面へ）", icon: "plus", run: () => app.goCreate() },
      { label: "開く（保存庫）…", icon: "pane", run: () => app.openLibrary() },
      { label: "上書き保存", icon: "down", keys: "⌘S", run: () => app.saveDeck() },
      { label: "名前を付けて保存（別の資料として）", icon: "duplicate", run: () => app.saveDeck({ asNew: true }) },
      "-", { head: "書き出し" },
      { label: "HTMLファイル（動きごと）", icon: "play", run: () => app.exportHtml() },
      { label: "PDF・印刷（配布資料・ノート）…", icon: "print", keys: "⌘P", run: () => app.printPdf() },
      { label: "JSONで保存", icon: "down", run: () => app.saveJson() },
      { label: "レビュー用ファイル", icon: "review", run: () => app.exportReview() },
      { label: "ビデオの作成（WebM）…", icon: "video2", run: () => app.openVideoExport() },
      "-",
      { label: "JSONを読み込む…", icon: "up", run: () => app.openJson() },
      { label: "版の履歴・過去の資料…", icon: "clock", run: () => app.openHistory() },
      "-", { label: "情報（プロパティ・ドキュメント検査）…", icon: "info", run: () => app.openFileInfo() },
      { label: "共有（共同編集）…", icon: "share", run: () => app.share() },
      "-", { head: "オプション" },
      { label: `ユーザー名：${app.userName() || "未設定"}…`, icon: "people", run: () => app.changeUserName() },
      { label: "使い方とショートカット", icon: "tip", keys: "?", run: () => app.openHelp() },
    ]);
  }
  function ribbonOptions(anchor) {
    openPop(anchor, menu([
      { head: "リボンの表示オプション" },
      ...Object.entries(RIBBON_MODES).map(([mode, label]) => ({ label, icon: mode === "full" ? "ribbon" : mode === "tabs" ? "chevron" : "zoomFit", on: ribbonMode === mode, keys: mode === "tabs" ? "⌘F1" : "", run: () => setRibbonMode(mode) })),
    ]));
  }

  function renderRibbon(force = false) {
    if (!ribbon) return;
    // The ribbon is there in every view of the deck, as in PowerPoint; off the 1枚 view only what works on whole
    // slides (new slides, design, slide show, review, view) can be used.
    const visible = Boolean(app.deck());
    ribbon.hidden = !visible;
    if (!visible) { built = ""; floating = false; return; }
    const tabs = TABS.filter((t) => !t.contextual || t.contextual());
    if (!tabs.some((t) => t.id === tab)) tab = "home";
    const sig = signature();
    if (!force && sig === built) { refresh(); return; }
    built = sig;
    updaters = [];
    ribbon.dataset.mode = ribbonMode;
    ribbon.classList.toggle("rb-floating", floating);
    document.removeEventListener("pointerdown", floatingOutside, true);
    document.removeEventListener("keydown", floatingKey, true);
    if (floating) { document.addEventListener("pointerdown", floatingOutside, true); document.addEventListener("keydown", floatingKey, true); }
    // PowerPoint's ファイル: new, open, save, save as, export, history (a menu at the start of the tabs).
    const fileBtn = h("button", { type: "button", class: "rb-file", title: "ファイル：新規・開く・保存・書き出し・履歴", "aria-haspopup": "true", onclick: (event) => openPop(event.currentTarget, fileMenu()) }, "ファイル");
    const head = h("div", { class: "rb-tabs", role: "tablist" }, fileBtn,
      // Switching tabs keeps the caret (and the cells picked in a table), as in PowerPoint.
      tabs.map((t) => h("button", { type: "button", role: "tab", class: t.contextual ? "contextual" : "", "aria-selected": String(t.id === tab && (ribbonMode === "full" || floating)), "data-tab": t.id, "data-keeps-text": "", onmousedown: (event) => event.preventDefault(),
        onclick: () => {
          if (ribbonMode === "full") { tab = t.id; renderRibbon(true); editor.draw(); }
          else if (floating && tab === t.id) closeFloating();
          else openFloating(t.id);
        },
        ondblclick: () => toggleRibbon() }, t.label)),
      h("span", { class: "rb-spacer" }),
      h("span", { class: "rb-hint" }, ""),
      h("button", { type: "button", class: "rb-options", title: "リボンの表示オプション（常に表示・タブのみ・自動的に非表示）", "aria-haspopup": "true", onclick: (event) => ribbonOptions(event.currentTarget) }, ico("ribbon", 15), h("span", {}, "表示オプション"), h("b", { class: "rb-caret" }, "▾")));
    const showBody = ribbonMode === "full" || floating;
    const pin = h("div", { class: "rb-end" }, floating
      ? h("button", { type: "button", class: "rb-pin", title: "リボンを固定する（常に表示）", "aria-label": "リボンを固定する", onclick: () => setRibbonMode("full") }, ico("pin", 15))
      : h("button", { type: "button", class: "rb-pin", title: "リボンを折りたたむ（⌘F1）：タブだけを表示します", "aria-label": "リボンを折りたたむ", onclick: () => setRibbonMode("tabs") }, "˄"));
    const body = showBody ? h("div", { class: "rb-body", role: "tabpanel" }, ...buildTab(tab), pin) : null;
    if (body && !onSlide()) {
      for (const g of body.querySelectorAll(":scope > .rb-group")) {
        const label = g.querySelector(":scope > .rb-label")?.textContent || "";
        if (OFF_SLIDE_TABS.has(tab) || OFF_SLIDE_GROUPS.has(label)) continue;
        g.classList.add("rb-off");
        g.inert = true;
        g.title = "1枚表示（標準）で使えます";
      }
    }
    if (pop && !pop.anchor.isConnected) closePop(true);
    const reveal = h("button", { type: "button", class: "rb-reveal", title: "リボンを表示する（自動的に非表示）", "aria-label": "リボンを表示する", onclick: () => (floating ? closeFloating() : openFloating()) }, "•••");
    if (ribbonMode === "auto") ribbon.replaceChildren(reveal, floating ? h("div", { class: "rb-float" }, head, body) : "");
    else ribbon.replaceChildren(head, body || "");
    if (pop && !pop.anchor.isConnected) closePop(true);
    refresh();
    fitRibbon();
  }
  // Off the 1枚 view: whole tabs and groups that work on slides rather than on the objects of the one on the stage.
  const OFF_SLIDE_TABS = new Set(["design", "transition", "slideshow", "review", "view", "developer"]);
  const OFF_SLIDE_GROUPS = new Set(["スライド"]);
  // A narrow window squeezes the ribbon as PowerPoint does, from the right-hand groups first: small buttons
  // lose their words (the tooltip keeps them), then whole groups fold into one button that opens them;
  // past that the groups draw closer, and last of all the ribbon scrolls sideways.
  const GROUP_ICONS = { グラフィックの作成: "smartart", "SmartArt のスタイル": "fill", 文字: "font", リセット: "reset", プレビュー: "play", オプション: "audio", "オーディオ スタイル": "audio", スライド: "slide", クリップボード: "paste", フォント: "font", 段落: "textLeft", 図形描画: "shapes", 編集: "selectAll", 画像: "image", 図: "shapes", テキスト: "textbox", 線: "line", メディア: "video", リンク: "link",
    図形の挿入: "shapes", 図形のスタイル: "style", ワードアートのスタイル: "fontColor", 配置: "front", サイズ: "zoomFit", 調整: "bright", 図のスタイル: "outline", 表示: "slide", "表示/非表示": "grid", ズーム: "zoomIn", ウィンドウ: "pane",
    プレゼンテーションの表示: "slide", "カラー/グレースケール": "grayView", 記号と日付: "symbol", コメント: "comment", デザイナー: "magic", コード: "effectOpts", 資料のデータ: "down", 書き出し: "play", テーマ: "theme", "動き（資料全体）": "motionPath", ユーザー設定: "slide", "スライド ショーの開始": "showStart", 設定: "presenter", チェック: "check", 検索: "find", ノート: "notes", AI: "magic", レビュー: "review", 描画ツール: "pen", 変換: "inkShape", 再生: "play", 音声: "mic", ズームのオプション: "zoomSlide", ズームのスタイル: "outline", 数式と記号: "equation", モニター: "presenter", キャプションと字幕: "subtitles", 文章校正: "spell", キャプション: "caption", 言語: "textCase" };
  function fold(g) {
    const items = g.querySelector(":scope > .rb-items");
    const label = g.querySelector(":scope > .rb-label")?.textContent || "";
    const button = h("button", { type: "button", class: "rb-btn big rb-drop rb-folded", title: label, "aria-haspopup": "true",
      onclick: (event) => { event.preventDefault(); openPop(button, () => h("div", { class: "rb-fold" }, items, h("div", { class: "rb-label" }, label))); } },
    ico(GROUP_ICONS[label] || "chevron", 26), caption(label), h("b", { class: "rb-caret" }, "▾"));
    g.classList.add("folded");
    g.prepend(h("div", { class: "rb-items rb-fold-slot" }, button));
    g.foldedItems = items;
    items.remove();
  }
  function unfold(g) {
    if (pop?.el.contains(g.foldedItems)) closePop();
    g.querySelector(":scope > .rb-fold-slot")?.replaceWith(g.foldedItems);
    g.classList.remove("folded");
    delete g.foldedItems;
  }
  function fitRibbon() {
    const body = ribbon?.querySelector(".rb-body");
    if (!body || !body.clientWidth) return;
    const groups = [...body.querySelectorAll(":scope > .rb-group")];
    for (const g of groups) { if (g.foldedItems) unfold(g); g.classList.remove("compact"); }
    ribbon.classList.remove("rb-tight");
    const over = () => body.scrollWidth > body.clientWidth + 1;
    for (let i = groups.length - 1; i >= 0 && over(); i -= 1) groups[i].classList.add("compact");
    for (let i = groups.length - 1; i >= 1 && over(); i -= 1) fold(groups[i]);
    // Folding may have made room: the groups on the left get their words back where they fit.
    for (const g of groups) {
      if (g.foldedItems || !g.classList.contains("compact")) continue;
      g.classList.remove("compact");
      if (over()) { g.classList.add("compact"); break; }
    }
    if (over()) ribbon.classList.add("rb-tight");
  }
  if (ribbon && "ResizeObserver" in window) {
    let width = 0;
    new ResizeObserver(([entry]) => { const w = Math.round(entry.contentRect.width); if (w !== width) { width = w; fitRibbon(); } }).observe(ribbon);
  }
  function refresh() {
    for (const fn of updaters) { try { fn(); } catch { /* a control without a target */ } }
    const hint = ribbon?.querySelector(".rb-hint");
    if (hint) hint.textContent = ink?.tool ? `${{ pen: "ペンで書いています", eraser: "消しゴム：消したい線をなぞる", lasso: "投げ縄：インクを囲む" }[ink.tool]}（Escでやめる）` : editor.tool ? "描画中：スライド上をドラッグ（Escでやめる）" : editor.painter ? "書式を貼り付ける図形をクリック（Escでやめる）" : extras?.dictating ? "音声入力中：話すと文字になります" : "";
  }

  function fontControls() {
    const size = h("input", { class: "rb-size", type: "text", inputmode: "decimal", list: "rbSizes", title: "フォントサイズ（pt）", "aria-label": "フォントサイズ", "data-keeps-text": "",
      onchange: (event) => { const v = parseFloat(event.target.value); if (v > 0) editor.textFormat("size", v); },
      onkeydown: (event) => { if (event.key === "Enter") { event.preventDefault(); event.target.blur(); } } });
    updaters.push(() => { const st = editor.textState(); size.disabled = !st; if (document.activeElement !== size) size.value = st ? String(st.fs) : ""; });
    const font = h("select", { class: "rb-font", title: "フォント", "aria-label": "フォント", onchange: (event) => editor.textFormat("font", event.target.value) }, Object.entries(E.FONTS).map(([key, [label]]) => h("option", { value: key }, label)));
    updaters.push(() => { const st = editor.textState(); font.disabled = !st; font.value = st?.font || "body"; });
    return [font, size, h("datalist", { id: "rbSizes" }, SIZES_PT.map((v) => h("option", { value: String(v) })))];
  }
  const tState = (key) => () => editor.textState()?.[key];

  function homeTab() {
    return [
      group("スライド",
        drop("slide", "新しい|スライド", "スライドを追加", menu([
          { label: "白紙（自由配置）", icon: "slide", run: () => app.insertBlankSlide() },
          { label: "レイアウトを選んで追加…", icon: "layout", run: () => app.openTypeDialog("insert") },
          "-",
          { label: "スライドの再利用…", icon: "duplicateSlide", run: () => app.openReuse() },
          { label: "アウトラインからスライド…", icon: "textLeft", run: () => app.openOutlineSlides() },
        ]), { big: true }),
        col(btn("layout", "レイアウト", "このスライドのレイアウトを変える", () => app.openTypeDialog("change")), btn("duplicateSlide", "複製", "このスライドを複製", () => app.duplicateSlide()),
          btn("convert", "図形に変換", "このスライドのレイアウトを図形・テキストボックス・画像に分けて、1つずつ自由に編集できるようにする（白紙のスライドになります）", () => app.convertSlide(), { enabled: () => app.canConvert() })),
        col(btn("thumbs", "セクション", "このスライドからセクションを始める（サムネイルでセクション名を右クリックすると、名前の変更・削除・移動）", () => app.addSection()))),
      group("クリップボード",
        btn("paste", "貼り付け", "貼り付け（⌘V）", () => editor.pasteFromMemory(), { big: true }),
        col(btn("cut", "切り取り", "切り取り（⌘X）", () => { document.execCommand("cut") || cutFallback(); }, { enabled: any }),
          btn("copy", "コピー", "コピー（⌘C）", () => { document.execCommand("copy") || copyFallback(); }, { enabled: any }),
          btn("painter", "書式", "書式のコピー/貼り付け（⇧⌘C → クリック）", () => (editor.painter ? editor.pasteFormat(editor.selection) : editor.copyFormat()), { enabled: any, pressed: () => editor.painter }))),
      group("フォント",
        row(...fontControls()),
        row(btn("bold", "", "太字（⌘B）", () => editor.textFormat("bold"), { enabled: hasText, pressed: tState("bold"), keep: true }),
          btn("italic", "", "斜体（⌘I）", () => editor.textFormat("italic"), { enabled: hasText, pressed: tState("italic"), keep: true }),
          btn("underline", "", "下線（⌘U）", () => editor.textFormat("underline"), { enabled: hasText, pressed: tState("underline"), keep: true }),
          btn("strike", "", "取り消し線", () => editor.textFormat("strike"), { enabled: hasText, pressed: tState("strike"), keep: true }),
          btn("sup", "", "上付き", () => editor.textFormat("sup"), { enabled: () => editor.typing, keep: true }),
          btn("sub", "", "下付き", () => editor.textFormat("sub"), { enabled: () => editor.typing, keep: true }),
          btn("grow", "", "フォントサイズの拡大（⇧⌘>）", () => editor.textFormat("grow"), { enabled: hasText, keep: true }),
          btn("shrink", "", "フォントサイズの縮小（⇧⌘<）", () => editor.textFormat("shrink"), { enabled: hasText, keep: true }),
          drop("fontColor", "", "文字の色（SEJの文字色：黒・濃紺・グレー）", () => colors(E.PALETTE.text, textColorOf(), (c) => editor.textFormat("color", c), { custom: false, note: "白抜き文字は使いません（SEJテンプレート）" }), { enabled: hasText, keep: true, swatch: textColorOf }),
          drop("highlight", "", "蛍光ペン（マーカー）", () => colors(E.PALETTE.highlight, "", (c) => editor.textFormat("highlight", c === "none" ? null : c), { none: "マーカーなし", custom: false }), { enabled: hasText, keep: true }),
          drop("spacing", "", "文字の間隔", () => menu(CHAR_SPACING.map(([v, label]) => ({ label, on: Math.abs((one()?.ls || 0) - v) < 0.001, run: () => editor.textFormat("ls", v) }))), { enabled: hasText, keep: true }),
          drop("textCase", "", "文字種の変換（大文字・小文字・全角・半角）", () => extras.caseMenu(), { enabled: hasText, keep: true }),
          btn("clear", "", "書式のクリア", () => editor.textFormat("clear"), { enabled: hasText, keep: true }))),
      group("段落",
        row(btn("bullet", "", "箇条書き", () => editor.textFormat("bullet"), { enabled: hasText, pressed: () => editor.textState()?.list === "bullet", keep: true }),
          btn("number", "", "段落番号", () => editor.textFormat("number"), { enabled: hasText, pressed: () => editor.textState()?.list === "number", keep: true }),
          btn("indentLess", "", "インデントを減らす", () => editor.textFormat("outdent"), { enabled: () => editor.typing, keep: true }),
          btn("indentMore", "", "インデントを増やす", () => editor.textFormat("indent"), { enabled: () => editor.typing, keep: true }),
          drop("lineSpacing", "", "行間", () => menu(LINE_HEIGHTS.map(([v, label]) => ({ label, on: Math.abs((editor.textState()?.lh ?? 0) - v) < 0.01, run: () => editor.textFormat("lh", v) }))), { enabled: hasText, keep: true })),
        row(btn("textLeft", "", "左揃え（⌘L）", () => editor.textFormat("align", "left"), { enabled: hasText, pressed: () => editor.textState()?.align === "left", keep: true }),
          btn("textCenter", "", "中央揃え（⌘E）", () => editor.textFormat("align", "center"), { enabled: hasText, pressed: () => editor.textState()?.align === "center", keep: true }),
          btn("textRight", "", "右揃え（⌘R）", () => editor.textFormat("align", "right"), { enabled: hasText, pressed: () => editor.textState()?.align === "right", keep: true }),
          btn("textJustify", "", "両端揃え（⌘J）", () => editor.textFormat("align", "justify"), { enabled: hasText, pressed: () => editor.textState()?.align === "justify", keep: true }),
          btn("vtext", "", "縦書き", () => editor.textFormat("vertical"), { enabled: hasText, pressed: tState("vertical") }),
          drop("valignMiddle", "", "文字の配置（上下）", () => menu([["top", "上揃え", "valignTop"], ["middle", "上下中央揃え", "valignMiddle"], ["bottom", "下揃え", "valignBottom"]].map(([v, label, icon]) => ({ label, icon, on: editor.textState()?.valign === v, run: () => editor.textFormat("valign", v) }))), { enabled: hasText }),
          drop("columns", "", "段組み：テキストを2段・3段に分ける", () => extras.columnsMenu(), { enabled: hasText }),
          drop("smartart", "", "SmartArt に変換：選んだテキストの段落（箇条書きのレベル）を図に", () => smart.convertGallery(), { enabled: () => selected().some((o) => ["shape", "text"].includes(o.kind) && o.text) }))),
      group("図形描画",
        drop("shapes", "図形", "図形を描く", () => shapeGallery(pickTool), { big: true }),
        col(drop("front", "配置", "前面・背面・整列・グループ・回転", () => arrangeMenu(), { enabled: any }),
          drop("style", "スタイル", "図形のクイックスタイル（SEJの色）", () => styleMenu(), { enabled: hasText })),
        col(drop("fill", "塗り", "図形の塗りつぶし", () => colors(E.PALETTE.fill, fillOf(), setFill, { none: "塗りつぶしなし" }), { enabled: hasText, swatch: fillOf }),
          drop("outline", "枠線", "図形の枠線", () => outlineMenu(), { enabled: () => any() && !kinds().has("icon") || kinds().has("icon"), swatch: strokeOf }))),
      group("編集",
        col(btn("find", "検索・置換", "資料全体の文字を検索・置換（⌘F）", () => app.openReplace()),
          btn("selectAll", "すべて選択", "このスライドのオブジェクトをすべて選択（⌘A）", () => editor.select(editor.objects().filter((o) => !o.hidden).map((o) => o.id))),
          btn("pane", "選択ウィンドウ", "オブジェクトの一覧・表示/非表示・順番", () => app.openPanel("format", "selection")))),
      group("音声",
        btn("mic", "ディク|テーション", "音声入力：話した言葉をカーソルの位置に入力（もう一度押すと終わります。Chrome・Edge）", () => extras.toggleDictation(), { big: true, keep: true, pressed: () => extras.dictating })),
    ];
  }

  /** デザイン: the theme is the SEJ template; what changes is the deck's motion (as the 動き dialog, one menu each). */
  function designTab() {
    const motion = () => app.deckMotion() || {};
    const choose = (head, entries, current, apply) => () => menu([{ head }, ...entries.map(([value, label]) => ({ label, on: current() === value, run: () => apply(value) }))]);
    const setMotion = (key) => (value) => app.setDeckDesign({ motion: { [key]: value } });
    return [
      group("テーマ",
        btn("theme", "SEJ|テンプレート", "デザインはSEJの原本テンプレート（ロゴ・緑線・秘（B）・社内限り・スローガン）に決まっています", () => app.toast("デザインはSEJテンプレートに決まっています。配色・ロゴ・緑線はそのままで、動きを選べます"), { big: true, pressed: () => true })),
      group("動き（資料全体）",
        btn("motionPath", "動きの|設定", "切り替え・登場・背景の動き・文字の動き・強調を見比べて選ぶ（資料全体）", () => app.openDesign(), { big: true }),
        col(drop("transition", "切り替え", "スライドの切り替え（資料全体。1枚ずつは「画面切り替え」タブ）", choose("スライドの切り替え", Object.entries(E.TRANSITIONS), () => motion().transition, (value) => app.setDeckDesign({ transition: value }))),
          drop("previewPlay", "登場のしかた", "スライドの見出しと中身が現れるとき", choose("登場のしかた", [...Object.entries(E.ENTRANCES), ["none", "動かさない"]], () => motion().entrance, setMotion("entrance"))),
          drop("hover", "マウスを乗せたとき", "発表中、項目にマウスを乗せたとき", choose("マウスを乗せたとき", [...Object.entries(E.HOVERS), ["none", "変化なし"]], () => motion().hover, setMotion("hover")))),
        col(drop("loop", "背景の動き", "表紙・章扉・ひと言・最後のスライドの背景", choose("背景の動き", [["none", "テンプレートの波紋だけ"], ...Object.entries(E.BACKDROPS)], () => motion().backdrop, setMotion("backdrop"))),
          drop("textbox", "文字の動き", "表紙・章扉などの大きな文字", choose("大きな文字の動き", [["none", "動かさない"], ...Object.entries(E.KINETIC)], () => motion().kinetic, setMotion("kinetic"))),
          drop("highlight", "強調の見せ方", "**語句** で囲んだ語句", choose("強調の見せ方", Object.entries(E.EMPHASES), () => motion().emphasis, setMotion("emphasis"))))),
      group("デザイナー",
        btn("magic", "デザイン|アイデア", "このスライドの見せ方の違う3つの案をAIが作り、並べて選べます（Codexに接続しているとき。右の「AIと話す」に届きます）", () => app.designIdeas(), { big: true, enabled: () => app.canAi() })),
      group("ユーザー設定",
        btn("slide", "スライドの|サイズ", "ワイド画面（16:9・13.33×7.5インチ）：SEJテンプレートの大きさです", () => app.toast("スライドのサイズはワイド画面（16:9・13.33×7.5インチ）です（SEJテンプレート）"), { big: true }),
        col(btn("chartBar", "数字を数え上げる", "数字のカウントアップとグラフが伸びる動き（資料全体）", () => app.setDeckDesign({ motion: { numbers: !motion().numbers } }), { pressed: () => motion().numbers }),
          btn("spot", "波紋を広げる", "SEJの波紋を発表中にゆっくり広げる", () => app.setDeckDesign({ motion: { ambient: !motion().ambient } }), { pressed: () => motion().ambient }),
          btn("pen", "線を描くように", "アイコン・線・マーカーを描くように見せる", () => app.setDeckDesign({ motion: { draw: !motion().draw } }), { pressed: () => motion().draw }))),
    ];
  }

  /**
   * スライド ショー: start from the beginning, from here or a custom show; the show's settings (a kiosk, looping, a
   * range, timings, no animation), hiding a slide, rehearsing, the presenter view and live subtitles.
   */
  function slideshowTab() {
    const show = () => app.showSettings();
    const customMenu = () => menu([
      { head: "目的別スライド ショー" },
      ...app.customShows().map((cs) => ({ label: `${cs.name}（${cs.sids.length}枚）`, icon: "showStart", run: () => app.presentCustom(cs.id) })),
      app.customShows().length ? "-" : null,
      { label: "目的別スライド ショー…", icon: "customShow", run: () => app.openCustomShows() },
    ]);
    return [
      group("スライド ショーの開始",
        btn("showStart", "最初から", "最初のスライドから発表する（F5）", () => app.presentFrom(0), { big: true }),
        btn("showHere", "このスライド|から", "このスライドから発表する（⇧F5）", () => app.presentFrom(app.index()), { big: true }),
        drop("customShow", "目的別|スライド ショー", "相手や時間に合わせて選んだスライドだけを、決めた順番で発表する", customMenu, { big: true })),
      group("設定",
        btn("presenter", "スライド ショー|の設定", "種類（自動プレゼンテーション）・繰り返し・発表するスライド（範囲・目的別）・タイミング・アニメーションなし・ペンの色", () => app.openShowSettings(), { big: true }),
        btn("hideSlide", "非表示スライド|に設定", "発表ではこのスライドを飛ばす（編集用に残ります。もう一度で戻す）", () => app.toggleHiddenSlide(), { big: true, pressed: () => Boolean(app.slide()?.hidden), enabled: () => app.index() > 0 }),
        btn("clock", "リハーサル", "最初から発表して1枚ずつの時間を計り、終わったらその時間で自動的に切り替えるようにできます", () => app.rehearse(), { big: true }),
        drop("record", "記録", "スライド ショーの記録：発表しながらマイクでナレーションを録り、スライドごとのナレーションとタイミングにする", () => menu([
          { head: "スライド ショーの記録" },
          { label: "先頭から記録", icon: "record", run: () => app.recordShow(0) },
          { label: "現在のスライドから記録", icon: "record", run: () => app.recordShow(app.index()) },
          "-", { head: "クリア" },
          { label: "現在のスライドのタイミングをクリア", icon: "clock", run: () => app.clearRecording("timings", "slide") },
          { label: "すべてのスライドのタイミングをクリア", icon: "clock", run: () => app.clearRecording("timings", "all") },
          { label: "現在のスライドのナレーションをクリア", icon: "audio", run: () => app.clearRecording("narration", "slide") },
          { label: "すべてのスライドのナレーションをクリア", icon: "audio", run: () => app.clearRecording("narration", "all") },
        ]), { big: true }),
        col(btn("check", "タイミングを使用", "リハーサル・自動で切り替えの時間で進める（オフにするとクリックで進む）", () => app.setShowSettings({ useTimings: show().useTimings === false }), { pressed: () => show().useTimings !== false }),
          btn("audio", "ナレーションの再生", "記録したナレーションを発表で流す", () => app.setShowSettings({ noNarration: !show().noNarration }), { pressed: () => !show().noNarration }),
          btn("previewPlay", "動きを確認", "閲覧表示：このスライドの動きをこの画面で再生する", () => app.previewMotion()))),
      group("モニター",
        col(btn("presenter", "発表者ツールを使用", "発表を始めると、ノート・次のスライド・経過時間の発表者ビューを別ウィンドウで開く（発表中は P）", () => app.setPresenterView(!app.presenterView()), { pressed: () => app.presenterView() }),
          btn("pen", "ペンの色", "発表中のペン（Ctrl+P）の色：スライド ショーの設定で変えられます", () => app.openShowSettings()),
          btn("clock", "自動で切り替え", "このスライドを何秒で次へ進めるか（画面切り替えタブ）", () => showTab("transition", { open: true })))),
      group("キャプションと字幕",
        btn("subtitles", "常に字幕を|使用", "発表を始めると、話した言葉を字幕で出す（発表中は J で切り替え。マイクを使います）", () => app.setShowSettings({ captions: !show().captions }), { big: true, pressed: () => Boolean(show().captions) }),
        drop("caption", "字幕の|設定", "字幕の言語", () => menu([{ head: "話す言語" }, ...[["ja-JP", "日本語"], ["en-US", "英語"], ["zh-CN", "中国語"], ["ko-KR", "韓国語"]].map(([k, label]) => ({ label, on: (show().captionLang || "ja-JP") === k, run: () => app.setShowSettings({ captionLang: k }) }))]), { big: true })),
    ];
  }

  /** 校閲: the checks, find and replace, notes, the AI's review, and review files to and from others. */
  function reviewTab() {
    return [
      group("コメント",
        btn("comment", "新しい|コメント", "このスライド（図形を選んでいればその図形）にコメントを付ける", () => app.newComment(), { big: true }),
        drop("trash", "削除", "コメントを削除", () => menu([
          { label: "このスライドのコメントをすべて削除", icon: "trash", run: () => app.clearComments("slide") },
          { label: "資料のすべてのコメントを削除", icon: "trash", run: () => app.clearComments("deck") },
        ]), { big: true }),
        col(btn("up", "前へ", "前のコメントのあるスライドへ", () => app.commentGo(-1)),
          btn("down", "次へ", "次のコメントのあるスライドへ", () => app.commentGo(1)),
          drop("eye", "コメントの表示", "スライド上のコメントとコメント ウィンドウ", () => menu([
            { label: "スライド上にコメントを表示", icon: "comment", on: app.commentPins(), run: () => app.setCommentPins(!app.commentPins()) },
            { label: "コメント ウィンドウ", icon: "taskPane", on: app.panel() === "comment", run: () => app.showPanel("comment") },
          ]))),
        btn("people", "ユーザー名", "コメントと共同編集で表示するあなたの名前", () => app.changeUserName(), { big: true })),
      group("チェック",
        btn("check", "チェック", "構成・文字のあふれ・SEJブランドを確かめる", () => app.openCheck(), { big: true }),
        btn("accessibility", "アクセシビリティ|チェック", "代替テキスト・スライド タイトル・表の見出し・リンクの文字・コントラスト・読み取り順序を確かめる（作業ウィンドウに一覧）", () => app.openAccessibility(), { big: true }),
        btn("textbox", "代替|テキスト", "選んだ部品の代替テキスト（画面読み上げが読む説明）・装飾用", () => { const o = one(); if (o) app.editAlt(o.id); else app.toast("部品を1つ選んでください"); }, { big: true, enabled: () => Boolean(one()) }),
        btn("magic", "あふれを|AIで直す", "文字が収まらないスライドをAIで順番に直す", () => app.fixOverflow(), { big: true, enabled: () => app.canFixOverflow() })),
      group("文章校正",
        btn("spell", "スペル|チェック", "入力中の文字のスペルを確かめる（ブラウザの辞書。間違いに赤い波線）", () => app.setSpellcheck(!app.spellcheck()), { big: true, pressed: () => app.spellcheck() }),
        btn("textCase", "表記ゆれ|チェック", "全角・半角（ＡＩ／AI）、長音（ユーザ／ユーザー）、送り仮名（行う／行なう）のゆれを見つけて統一する", () => app.openProofing(), { big: true })),
      group("言語",
        drop("textCase", "翻訳", "スライドの文字をほかの言語に訳す（AI。部品・ノートも。数値と固有名詞はそのまま）", () => menu([
          { head: "このスライドを翻訳" },
          ...[["en", "英語"], ["zh", "中国語"], ["ko", "韓国語"], ["ja", "日本語"]].map(([k, l]) => ({ label: `${l}に`, run: () => app.translate(k, "slide") })),
          "-", { head: "資料全体を翻訳" },
          ...[["en", "英語"], ["zh", "中国語"], ["ko", "韓国語"], ["ja", "日本語"]].map(([k, l]) => ({ label: `資料全体を${l}に`, run: () => app.translate(k, "deck") })),
        ]), { big: true, enabled: () => app.canAi() })),
      group("検索", btn("find", "検索・|置換", "資料全体の文字を検索・置換（⌘F）", () => app.openReplace(), { big: true })),
      group("ノート", btn("notes", "ノートを|作成", "スピーカーノートをまとめて作る（簡易・AI）", () => app.openNotes(), { big: true })),
      group("AI", btn("magic", "AIで全体を|見直す", "指示を出して資料全体をAIに見直してもらう（Codexに接続しているとき）", () => app.reviseDeck(), { big: true, enabled: () => app.canAi() })),
      group("レビュー",
        btn("review", "レビュー用|ファイル", "相手はブラウザで開いてスライドごとにコメントを書き、結果のファイルを返送します", () => app.exportReview(), { big: true }),
        btn("comment", "レビューを|取り込む", "コメント付きのPowerPoint、またはレビュー結果（.json）からコメントを読み込み、AIで反映します", () => app.importReview(), { big: true })),
    ];
  }

  function insertTab() {
    return [
      group("スライド", drop("slide", "新しい|スライド", "スライドを追加", menu([
        { label: "白紙（自由配置）", icon: "slide", run: () => app.insertBlankSlide() },
        { label: "レイアウトを選んで追加…", icon: "layout", run: () => app.openTypeDialog("insert") },
        "-",
        { label: "スライドの再利用…", icon: "duplicateSlide", run: () => app.openReuse() },
        { label: "アウトラインからスライド…", icon: "textLeft", run: () => app.openOutlineSlides() },
      ]), { big: true })),
      group("画像",
        drop("image", "画像", "画像を入れる", menu([
          { label: "このデバイス…", icon: "image", run: insertImages },
          { label: "内蔵の写真…", icon: "image", run: () => openPop(ribbon.querySelector('[data-rb="photos"]') || ribbon, photoGallery(insertPhoto)) },
          { label: "URLから…", icon: "link", run: () => insertFromUrl("image") },
          "-",
          { label: "フォト アルバム…", icon: "image", run: () => app.openPhotoAlbum() },
        ]), { big: true }),
        btn("screenshot", "スクリーン|ショット", "ウィンドウ・タブ・画面を撮って画像として入れる", () => extras.insertScreenshot(), { big: true }),
        h("span", { "data-rb": "photos" })),
      group("表", drop("table", "表", "表を入れる（行と列を選ぶ）", () => tables.tablePicker(), { big: true })),
      group("図",
        drop("shapes", "図形", "図形を描く", () => shapeGallery(pickTool), { big: true }),
        drop("icon", "アイコン", "アイコンを入れる", () => iconGallery(insertIcon), { big: true }),
        drop("chartBar", "グラフ", "グラフを入れる（データは表で入力）", () => tables.chartPicker(), { big: true }),
        drop("smartart", "SmartArt", "SmartArt グラフィック：リスト・手順・循環・階層構造・集合関係・マトリックス・ピラミッド", () => smart.insertGallery(), { big: true })),
      group("テキスト",
        drop("textbox", "テキスト ボックス", "テキストボックスを描く", menu([
          { label: "横書きテキスト ボックス", icon: "textbox", run: () => pickTool({ kind: "text" }) },
          { label: "縦書きテキスト ボックス", icon: "vtext", run: () => pickTool({ kind: "text", vertical: true }) },
        ]), { big: true }),
        drop("wordart", "ワード|アート", "ワードアート：SEJの文字色で見出し向きの文字を入れる", () => extras.wordArtMenu(), { big: true }),
        col(drop("number", "スライド番号", "スライド番号・総数・日付のフィールド（自動で更新）", () => extras.fieldMenu(), { keep: true }))),
      group("線",
        col(btn("line", "直線", "直線を引く", () => pickTool({ kind: "line", variant: "line" })), btn("arrow", "矢印", "矢印を引く", () => pickTool({ kind: "line", variant: "arrow" }))),
        col(btn("arrows", "両矢印", "両方向の矢印", () => pickTool({ kind: "line", variant: "double" })), btn("line", "コネクタ", "図形どうしをつなぐカギ線（端を図形の点に近づけるとつながります）", () => pickTool({ kind: "line", variant: "elbow" })))),
      group("メディア",
        drop("video", "ビデオ", "動画・アニメーションを入れる", menu([
          { label: "このデバイスのビデオ・Lottie…", icon: "video", run: insertVideoFile },
          { label: "YouTube・URL…", icon: "link", run: () => insertFromUrl("video") },
        ]), { big: true }),
        drop("audio", "オーディオ", "音声を入れる：ファイル・この場で録音・URL", () => media.audioMenu(), { big: true }),
        btn("screenRec", "画面|録画", "画面・ウィンドウ・タブを録画して、ビデオとして入れる（マイクの音声も）", () => media.recorder("screen"), { big: true }),
        btn("camera", "カメオ", "カメラの映像（発表中にライブで映る。丸や角丸に切り抜けます）", () => extras.insertCamera(), { big: true })),
      group("数式と記号",
        btn("equation", "数式", "数式を入れる（TeXの書き方。分数・ルート・Σ…）", () => extras.equationDialog(), { big: true }),
        col(drop("symbol", "記号と特殊文字", "記号を入れる（文字の入力中はカーソルの位置に）", () => symbolGallery(), { keep: true }),
          drop("date", "日付と時刻", "今日の日付を入れる（文字の入力中はカーソルの位置に）", () => dateMenu(), { keep: true }))),
      group("リンク", zoomDrop(),
        h("span", { "data-rb": "link" }, btn("link", "リンク・|動作", "選んだ文字にリンク／図形をクリックしたときの動作（スライドへ移動・Webページを開く）", editLink, { big: true, keep: true, enabled: () => Boolean(one()) || editor.typing }))),
    ];
  }

  /** 挿入 → ズーム: サマリー・スライド・セクション (the slide picker opens under the same button). */
  function zoomDrop() {
    const el = drop("zoomSlide", "ズーム", "ズーム：別のスライドへ飛んで戻ってくる、スライドの縮小版を入れる", () => extras.zoomMenu(el), { big: true });
    return el;
  }

  function arrangeMenu() {
    return menu([
      { head: "オブジェクトの順序" },
      { label: "最前面へ移動", icon: "front", keys: "⇧⌘]", run: () => editor.order("front") },
      { label: "前面へ移動", icon: "front", keys: "⌘]", run: () => editor.order("forward") },
      { label: "背面へ移動", icon: "back", keys: "⌘[", run: () => editor.order("backward") },
      { label: "最背面へ移動", icon: "back", keys: "⇧⌘[", run: () => editor.order("back") },
      "-", { head: "配置（1つならスライドに、複数なら互いに）" },
      { label: "左揃え", icon: "alignLeft", run: () => editor.alignSelection("left") },
      { label: "左右中央揃え", icon: "alignCenter", run: () => editor.alignSelection("center") },
      { label: "右揃え", icon: "alignRight", run: () => editor.alignSelection("right") },
      { label: "上揃え", icon: "alignTop", run: () => editor.alignSelection("top") },
      { label: "上下中央揃え", icon: "alignMiddle", run: () => editor.alignSelection("middle") },
      { label: "下揃え", icon: "alignBottom", run: () => editor.alignSelection("bottom") },
      { label: "左右に整列（等間隔）", icon: "distH", run: () => editor.distributeSelection("x") },
      { label: "上下に整列（等間隔）", icon: "distV", run: () => editor.distributeSelection("y") },
      { label: "スライドの中央に置く", icon: "alignCenter", run: () => { editor.alignSelection("center", true); editor.alignSelection("middle", true); } },
      "-", { head: "グループ化" },
      { label: "グループ化", icon: "group", keys: "⌘G", run: () => editor.groupSelection(), disabled: editor.selection.length < 2 },
      { label: "グループ解除", icon: "ungroup", keys: "⇧⌘G", run: () => editor.ungroupSelection(), disabled: !selected().some((o) => o.group) },
      "-", { head: "回転" },
      { label: "右へ90°回転", icon: "rotate", run: () => editor.rotateSelection(90) },
      { label: "左へ90°回転", icon: "rotate", run: () => editor.rotateSelection(-90) },
      { label: "上下反転", icon: "flipV", run: () => editor.flipSelection("y") },
      { label: "左右反転", icon: "flipH", run: () => editor.flipSelection("x") },
    ]);
  }
  function styleMenu() {
    return (close) => h("div", { class: "rb-styles" }, QUICK_STYLES.map(([label, style]) => {
      const sample = h("button", { type: "button", title: label, onmousedown: (e) => e.preventDefault(), onclick: () => { close(); editor.apply((o) => (["shape", "text"].includes(o.kind) ? style : null)); } },
        h("span", { class: "rb-style", style: { background: style.fill === "none" ? "transparent" : style.fill, border: style.stroke !== "none" ? `2px solid ${style.stroke}` : "1px solid transparent", color: style.color } }, "Aa"), h("small", {}, label));
      return sample;
    }));
  }
  function outlineMenu() {
    return (close) => {
      const box = h("div", { class: "rb-outline" });
      box.append(colors(E.PALETTE.line, strokeOf(), setStroke, { none: "枠線なし" })(close));
      box.append(h("div", { class: "rb-menu-head" }, "太さ"), h("div", { class: "rb-menu" }, LINE_WIDTHS.map((pt) => h("button", { type: "button", onclick: () => { close(); setStrokeWidth(pt); } }, h("span", { class: "rb-weight", style: { "border-top-width": `${Math.max(1, pt)}px` } }), h("span", {}, `${pt} pt`)))));
      box.append(h("div", { class: "rb-menu-head" }, "実線/点線"), h("div", { class: "rb-menu" }, Object.entries(E.DASHES).map(([key, [label]]) => h("button", { type: "button", onclick: () => { close(); setDash(key); } }, dashSample(key), h("span", {}, label)))));
      return box;
    };
  }
  function dashSample(key) {
    const svg = E.s("svg", { viewBox: "0 0 60 8", width: 60, height: 8, "aria-hidden": "true" });
    const pattern = E.DASHES[key][1];
    svg.append(E.s("path", { d: "M2 4H58", stroke: "currentColor", "stroke-width": 2, "stroke-dasharray": pattern ? pattern.map((v) => Math.max(v * 2, v === 0 ? 0.01 : 2)).join(" ") : null, "stroke-linecap": key === "roundDot" ? "round" : "butt" }));
    return svg;
  }
  function arrowMenu() {
    return (close) => h("div", { class: "rb-arrows" }, [["none", "none"], ["none", "triangle"], ["triangle", "none"], ["triangle", "triangle"], ["none", "arrow"], ["none", "stealth"], ["none", "oval"], ["oval", "triangle"], ["diamond", "triangle"], ["oval", "oval"]].map(([head, tail]) => h("button", { type: "button", onclick: () => { close(); editor.apply((o) => (o.kind === "line" ? { head: head === "none" ? undefined : head, tail: tail === "none" ? undefined : tail } : null)); } }, arrowSample(head, tail))));
  }
  function arrowSample(head, tail) {
    const svg = E.s("svg", { viewBox: "0 0 70 14", width: 70, height: 14 });
    svg.append(E.s("path", { d: "M8 7H62", stroke: "currentColor", "stroke-width": 1.6 }));
    const mark = (kind, x, dir) => {
      if (kind === "none") return;
      if (kind === "oval") svg.append(E.s("circle", { cx: x, cy: 7, r: 3.4, fill: "currentColor" }));
      else if (kind === "diamond") svg.append(E.s("path", { d: `M${x - 4} 7 L${x} 3 L${x + 4} 7 L${x} 11 Z`, fill: "currentColor" }));
      else if (kind === "arrow") svg.append(E.s("path", { d: `M${x - 6 * dir} 2 L${x} 7 L${x - 6 * dir} 12`, fill: "none", stroke: "currentColor", "stroke-width": 1.6 }));
      else svg.append(E.s("path", { d: kind === "stealth" ? `M${x} 7 L${x - 8 * dir} 2 L${x - 5 * dir} 7 L${x - 8 * dir} 12 Z` : `M${x} 7 L${x - 8 * dir} 2 L${x - 8 * dir} 12 Z`, fill: "currentColor" }));
    };
    mark(head, 6, -1);
    mark(tail, 64, 1);
    return svg;
  }

  function sizeFields() {
    const field = (label, key) => {
      const input = h("input", { type: "number", step: "0.01", min: "0.05", class: "rb-num", "aria-label": `${label}（cm）`,
        onchange: (event) => {
          const v = parseFloat(event.target.value);
          if (!(v > 0)) return;
          const o = one();
          if (!o || o.kind === "line") return;
          const px = ops.fromCm(v);
          const ratio = o.lockRatio || o.kind === "image" ? o.w / o.h : null;
          const patch = key === "w" ? { w: px, ...(ratio ? { h: px / ratio } : {}) } : { h: px, ...(ratio ? { w: px * ratio } : {}) };
          // Resize about the centre, as the boxes in PowerPoint's ribbon do.
          patch.x = o.x + (o.w - (patch.w ?? o.w)) / 2;
          patch.y = o.y + (o.h - (patch.h ?? o.h)) / 2;
          editor.apply(patch, { ids: [o.id] });
        } });
      updaters.push(() => { const o = one(); input.disabled = !o || o.kind === "line"; if (document.activeElement !== input) input.value = o && o.kind !== "line" ? String(ops.toCm(o[key])) : ""; });
      return h("label", { class: "rb-field" }, h("span", {}, label), input, h("small", {}, "cm"));
    };
    return col(field("高さ", "h"), field("幅", "w"));
  }

  function shapeTab() {
    return [
      group("図形の挿入",
        drop("shapes", "図形", "図形を描く", () => shapeGallery(pickTool), { big: true }),
        col(drop("change", "図形の変更", "選んだ図形の形を変える", () => shapeGallery((tool) => { if (tool.kind === "shape") editor.apply((o) => (["shape", "text"].includes(o.kind) ? { kind: "shape", shape: tool.shape, adj: undefined } : null)); }, { lines: false }), { enabled: hasText }),
          btn("textbox", "テキスト ボックス", "テキストボックスを描く", () => pickTool({ kind: "text" })),
          drop("union", "図形の結合", "選んだ2つ以上の図形を1つにする：接合・型抜き/合成・切り出し・重なり抽出・単純型抜き（最初に選んだ図形の書式になります）", () => mergeMenu(), { enabled: () => canMerge(selected()) }))),
      group("図形のスタイル",
        drop("style", "クイック|スタイル", "SEJの色の組み合わせ", () => styleMenu(), { big: true, enabled: hasText }),
        col(drop("fill", "塗りつぶし", "図形の塗りつぶし", () => colors(E.PALETTE.fill, fillOf(), setFill, { none: "塗りつぶしなし" }), { enabled: hasText, swatch: fillOf }),
          drop("outline", "枠線", "図形の枠線（色・太さ・実線/点線）", () => outlineMenu(), { enabled: any, swatch: strokeOf }),
          drop("arrows", "矢印", "線の始点・終点の形", () => arrowMenu(), { enabled: () => kinds().has("line") })),
        col(drop("transparency", "透明度", "オブジェクトの透明度", () => menu([0, 0.15, 0.3, 0.5, 0.7].map((t) => ({ label: `${Math.round(t * 100)}%`, on: Math.abs((1 - (one()?.opacity ?? 1)) - t) < 0.01, run: () => editor.apply({ opacity: t ? Math.round((1 - t) * 100) / 100 : undefined }) }))), { enabled: any }),
          drop("line", "線の種類", "直線・カギ線・曲線", () => menu(Object.entries(E.ROUTES).map(([key, label]) => ({ label, run: () => editor.apply((o) => (o.kind === "line" ? { route: key === "straight" ? undefined : key } : null)) }))), { enabled: () => kinds().has("line") }))),
      group("ワードアートのスタイル",
        col(drop("fontColor", "文字の塗りつぶし", "文字の色（黒・濃紺・グレー）", () => colors(E.PALETTE.text, textColorOf(), (c) => editor.textFormat("color", c), { custom: false, note: "白抜き文字は使いません（SEJテンプレート）" }), { enabled: hasText, swatch: textColorOf, keep: true }),
          drop("textbox", "文字の配置", "文字の配置と余白", () => menu([["top", "上揃え", "valignTop"], ["middle", "上下中央揃え", "valignMiddle"], ["bottom", "下揃え", "valignBottom"]].map(([v, label, icon]) => ({ label, icon, on: editor.textState()?.valign === v, run: () => editor.textFormat("valign", v) }))), { enabled: hasText }))),
      arrangeGroup(),
      group("サイズ", sizeFields()),
    ];
  }
  /** 図形の結合: the five ways, in PowerPoint's order (the order of selection decides the first shape). */
  function mergeMenu() {
    return menu([
      { head: "図形の結合" },
      ...Object.entries(MERGE_MODES).map(([mode, label]) => ({ label, icon: mode, title: MERGE_HINTS[mode], run: () => mergeSelection(mode), hover: (on) => mergePreview(on ? mode : null) })),
    ]);
  }
  /** Live preview, as PowerPoint shows it while the pointer is on a choice: the result's outline over the slide. */
  let previewFor = null;
  async function mergePreview(mode) {
    previewFor = mode;
    if (!mode) { editor.draw(); return; }
    const chosen = editor.selection.map((id) => editor.objects().find((o) => o.id === id)).filter(Boolean);
    if (!canMerge(chosen)) return;
    let pc;
    try { pc = await clippingLib(); } catch { return; }
    if (previewFor !== mode) return;
    const made = mergeObjects(chosen, mode, E, pc, () => "preview") || [];
    const k = editor.scale();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ed-merge-preview");
    svg.setAttribute("width", String(E.W * k));
    svg.setAttribute("height", String(E.H * k));
    for (const o of made) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const d = E.geometry("custom", o.w, o.h, null, o.path).paths[0];
      path.setAttribute("d", d);
      path.setAttribute("fill-rule", "evenodd");
      path.setAttribute("transform", `translate(${o.x * k} ${o.y * k}) scale(${k})`);
      svg.append(path);
    }
    editor.draw(null, [svg]);
  }
  async function mergeSelection(mode) {
    const order = editor.selection;
    const chosen = order.map((id) => editor.objects().find((o) => o.id === id)).filter(Boolean);
    if (!canMerge(chosen)) { app.toast("図形を2つ以上選んでください（Shift＋クリック）"); return; }
    let pc;
    try { pc = await clippingLib(); } catch (error) { app.toast(error.message); return; }
    const made = mergeObjects(chosen, mode, E, pc, () => E.newObjectId());
    if (!made?.length) { app.toast(mode === "intersect" ? "重なっている部分がありません" : "結合すると何も残りません"); return; }
    const gone = new Set(chosen.filter((o) => ["shape", "text"].includes(o.kind) && !o.locked).map((o) => o.id));
    const list = editor.objects();
    // The result takes the first shape's place in the stacking order.
    const at = list.findIndex((o) => o.id === chosen[0].id);
    const next = [...list.slice(0, at).filter((o) => !gone.has(o.id)), ...made, ...list.slice(at).filter((o) => !gone.has(o.id))];
    editor.commit(next, { select: made.map((o) => o.id) });
    app.toast(`図形を${MERGE_MODES[mode]}しました${made.length > 1 ? `（${made.length}個の図形）` : ""}。頂点の編集で形を直せます`);
  }
  function arrangeGroup() {
    return group("配置",
      col(btn("front", "前面へ", "前面へ移動（最前面は ⇧⌘]）", () => editor.order("forward"), { enabled: any }), btn("back", "背面へ", "背面へ移動（最背面は ⇧⌘[）", () => editor.order("backward"), { enabled: any }), btn("pane", "選択ウィンドウ", "オブジェクトの一覧", () => app.openPanel("format", "selection"))),
      col(drop("alignLeft", "配置", "揃える・等間隔に並べる", () => arrangeMenu(), { enabled: any }), btn("group", "グループ化", "グループ化（⌘G）／もう一度でグループ解除", () => (selected().some((o) => o.group) && selected().every((o) => o.group === selected()[0].group) ? editor.ungroupSelection() : editor.groupSelection()), { enabled: () => editor.selection.length > 1 || selected().some((o) => o.group) }),
        drop("rotate", "回転", "回転・反転", () => menu([{ label: "右へ90°回転", icon: "rotate", run: () => editor.rotateSelection(90) }, { label: "左へ90°回転", icon: "rotate", run: () => editor.rotateSelection(-90) }, { label: "上下反転", icon: "flipV", run: () => editor.flipSelection("y") }, { label: "左右反転", icon: "flipH", run: () => editor.flipSelection("x") }]), { enabled: any })));
  }

  function pictureTab() {
    const img = () => selected().find((o) => o.kind === "image");
    return [
      group("調整",
        drop("bright", "修整", "明るさ・コントラスト", () => menu([
          { head: "明るさ / コントラスト" },
          ...[[-0.4, 0], [-0.2, 0], [0, 0], [0.2, 0], [0.4, 0], [0, 0.2], [0, 0.4], [0.2, 0.2], [-0.2, 0.2]].map(([b, c]) => ({ label: `明るさ ${b > 0 ? "+" : ""}${Math.round(b * 100)}% / コントラスト ${c > 0 ? "+" : ""}${Math.round(c * 100)}%`, run: () => editor.apply((o) => (o.kind === "image" ? { bright: b || undefined, contrast: c || undefined } : null)) })),
        ]), { big: true, enabled: hasImage }),
        col(btn("gray", "グレースケール", "白黒にする（もう一度で戻す）", () => editor.apply((o) => (o.kind === "image" ? { gray: !o.gray || undefined } : null)), { enabled: hasImage, pressed: () => img()?.gray }),
          drop("transparency", "透明度", "図の透明度", () => menu([0, 0.15, 0.3, 0.5, 0.7].map((t) => ({ label: `${Math.round(t * 100)}%`, run: () => editor.apply({ opacity: t ? Math.round((1 - t) * 100) / 100 : undefined }) }))), { enabled: hasImage })),
        col(btn("change", "図の変更", "画像を差し替える（大きさ・位置はそのまま）", async () => { const o = img(); if (!o) return; const [file] = await app.pickFiles("image/*", false); if (file) await app.replaceImage(o.id, file); }, { enabled: hasImage }),
          btn("reset", "リセット", "トリミング・修整・枠線を元に戻す", () => editor.apply((o) => (o.kind === "image" ? { crop: undefined, mask: undefined, adj: undefined, bright: undefined, contrast: undefined, sat: undefined, gray: undefined, opacity: undefined, stroke: undefined, strokeW: undefined } : null)), { enabled: hasImage }))),
      group("図のスタイル",
        drop("outline", "図の枠線", "枠線の色・太さ", () => outlineMenu(), { enabled: hasImage, swatch: strokeOf }),
        drop("mask", "図形に合わせて|切り抜き", "画像を図形の形に切り抜く", () => (close) => h("div", { class: "rb-gallery" }, h("div", { class: "rb-gallery-grid" }, MASKS.map((key) => h("button", { type: "button", title: E.SHAPES[key].label, onclick: () => { close(); editor.apply((o) => (o.kind === "image" ? { mask: key === "rect" ? undefined : key, adj: undefined } : null)); } }, shapeThumb(key))))), { big: true, enabled: hasImage })),
      arrangeGroup(),
      group("サイズ",
        btn("crop", "トリミング", "画像の端を切り取る：黒い印をドラッグ（Enterで確定）。数値は書式パネルで", () => { const o = one(); if (o?.kind === "image") crop.start(o.id); else app.openPanel("format", "picture"); }, { big: true, enabled: hasImage, pressed: () => crop.active }),
        sizeFields()),
    ];
  }

  // PowerPoint's zoom steps (100% is the slide at its real size: 13.33 inches at 96 dpi).
  const ZOOMS = [400, 300, 200, 150, 100, 66, 50, 33];
  function zoomMenu() {
    return menu([{ head: "ズーム" }, { label: "スライドを現在のウィンドウに合わせる", icon: "zoomFit", keys: "⌘0", on: editor.zoom === "fit", run: () => editor.setZoom("fit") }, "-",
      ...ZOOMS.map((z) => ({ label: `${z}%`, on: editor.zoom === z, run: () => editor.setZoom(z) }))]);
  }

  function viewTab() {
    const st = editor.state;
    return [
      group("プレゼンテーションの表示",
        btn("slide", "標準", "1枚ずつ編集", () => app.setView("single"), { big: true, pressed: () => app.state().view === "single" }),
        col(btn("grid", "スライド一覧", "スライド一覧", () => app.setView("grid"), { pressed: () => app.state().view === "grid" }),
          btn("textLeft", "構成", "見出しとキーメッセージの一覧（アウトライン）", () => app.setView("outline"), { pressed: () => app.state().view === "outline" }),
          btn("previewPlay", "閲覧表示", "このスライドの動きをこの画面で確認する", () => app.previewMotion()))),
      group("表示/非表示",
        col(btn("ruler", "ルーラー", "スライドの上と左に目盛り（cm、スライドの中央が0）を表示", () => app.toggleRulers(), { pressed: () => app.rulersShown() }),
          btn("grid", "グリッド線", "1cmごとの線を表示", () => editor.setView("grid", !st.grid), { pressed: () => st.grid }),
          drop("guides", "ガイド", "ガイド：SEJの本文の領域・中央と、自分で置くガイド（ドラッグで移動・スライドの外へ出すと削除）", () => menu([
            { label: "ガイドを表示する（吸着）", icon: "guides", on: st.guides, run: () => editor.setView("guides", !st.guides) },
            "-",
            { label: "垂直ガイドを追加", icon: "alignCenter", run: () => editor.addGuide("x") },
            { label: "水平ガイドを追加", icon: "alignMiddle", run: () => editor.addGuide("y") },
            { label: "ガイドをすべて削除", icon: "trash", disabled: !(editor.customGuides().x.length || editor.customGuides().y.length), run: () => editor.clearGuides() },
          ]))),
        col(btn("notes", "ノート", "スライドの下にスピーカーノートを表示", () => app.toggleNotes(), { pressed: () => app.notesShown() }),
          btn("smart", "スマートガイド", "ほかの図形の端・中央・等間隔に吸着（Altで一時的に外す）", () => editor.setView("smart", !st.smart), { pressed: () => st.smart }),
          btn("snapGrid", "グリッドに|合わせる", "0.25cmごとに吸着", () => editor.setView("snapGrid", !st.snapGrid), { pressed: () => st.snapGrid }))),
      group("カラー/グレースケール",
        btn("grayView", "グレース|ケール", "スライドを白黒で見る（白黒印刷やコピーで読めるかの確認。資料は変わりません）", () => { grayView = !grayView; document.getElementById("stageBody")?.classList.toggle("view-gray", grayView); refresh(); }, { big: true, pressed: () => grayView })),
      group("ズーム",
        drop("zoomIn", "ズーム", "表示の倍率", () => zoomMenu(), { big: true }),
        btn("zoomFit", "ウィンドウに|合わせる", "スライド全体を現在のウィンドウに合わせる（⌘0）", () => editor.setZoom("fit"), { big: true, pressed: () => editor.zoom === "fit" })),
      group("ウィンドウ",
        col(btn("thumbs", "サムネイル", "左のスライドのサムネイルを表示する", () => app.togglePane("film"), { pressed: () => app.paneOpen("film") }),
          btn("taskPane", "作業ウィンドウ", "右の作業ウィンドウ（AIと話す・編集・書式・アニメーション）を表示する", () => app.togglePane("side"), { pressed: () => app.paneOpen("side") }),
          btn("pane", "選択ウィンドウ", "オブジェクトの一覧", () => app.openPanel("format", "selection"))),
        drop("ribbon", "リボンの|表示", "リボンの表示オプション（常に表示・タブのみ・自動的に非表示。⌘F1で折りたたみ）", () => menu(Object.entries(RIBBON_MODES).map(([mode, label]) => ({ label, on: ribbonMode === mode, run: () => setRibbonMode(mode) }))), { big: true })),
    ];
  }

  /** 開発: the slide as code — its JSON (edit and apply, checked first) and the HTML it becomes; the deck's data and files. */
  function developerTab() {
    return [
      group("コード",
        btn("effectOpts", "スライドの|JSON", "このスライドのデータ（レイアウト・文字・部品・アニメーション・インタラクション）をJSONで見て直す", () => app.openSlideJson(), { big: true }),
        btn("textbox", "HTMLを|表示", "このスライドをエンジンが描いたHTMLを見る・コピーする", () => app.openSlideHtml(), { big: true })),
      group("資料のデータ",
        col(btn("down", "JSONで保存", "資料全体をJSONファイルに保存（別のPCで続きを編集できます）", () => app.saveJson()),
          btn("up", "JSONを読み込む", "JSONから資料を開く", () => app.openJson()))),
      group("書き出し",
        btn("play", "HTML出力", "動きごと1つのHTMLファイルに書き出す", () => app.exportHtml(), { big: true }),
        btn("slide", "PDF", "PDFとして保存・印刷", () => app.printPdf(), { big: true })),
    ];
  }

  function buildTab(id) {
    return { home: homeTab, insert: insertTab, design: designTab, transition: anim.transitionTab, animation: anim.animationTab, interact: ix.tab, slideshow: slideshowTab, review: reviewTab, shape: shapeTab, picture: pictureTab, view: viewTab, developer: developerTab, tableDesign: tables.designTab, tableLayout: tables.layoutTab, chartDesign: tables.chartTab, playback: media.playbackTab, smartartDesign: smart.designTab, draw: ink.drawTab, zoomTool: extras.zoomTab }[id]();
  }

  /**
   * Makes a tab the current one. When only the tabs show, the ribbon opens over the slide only when asked
   * (`open`: a button that says "open this tab"), not after an insertion, as in PowerPoint.
   */
  function showTab(id, { open = false } = {}) {
    tab = id;
    if (ribbonMode !== "full") { if (open) openFloating(id); else renderRibbon(true); return; }
    renderRibbon(true);
  }

  // Clipboard buttons without a keyboard event (Chrome only runs execCommand("copy") from a user gesture).
  function copyFallback() { const fake = new Event("copy"); fake.clipboardData = null; editor.onCopy(Object.assign(fake, { preventDefault() {} })); }
  function cutFallback() { const fake = new Event("cut"); editor.onCopy(Object.assign(fake, { preventDefault() {} }), true); }

  // ---------------------------------------------------------------- the 書式 pane (right panel)

  let paneFocus = null;
  function renderPane(focus = null) {
    if (!pane) return;
    if (focus) paneFocus = focus;
    const keepScroll = pane.querySelector(".fp-body")?.scrollTop ?? 0;
    const list = editor.objects();
    const chosen = selected();
    const body = h("div", { class: "fp-body" });
    const head = h("div", { class: "fp-head" });
    if (!onSlide()) {
      body.append(h("p", { class: "hint" }, "1枚表示（標準）で、スライドに図形・文字・画像を置いて書式を変えられます。"));
      pane.replaceChildren(head, body);
      return;
    }
    if (!chosen.length) {
      head.append(h("b", {}, "書式"), h("span", { class: "hint" }, "オブジェクトを選ぶと、ここで細かく設定できます"));
      body.append(h("div", { class: "fp-quick" },
        h("button", { type: "button", class: "btn", onclick: () => pickTool({ kind: "text" }) }, ico("textbox"), "テキスト ボックス"),
        h("button", { type: "button", class: "btn", onclick: (event) => openPop(event.currentTarget, shapeGallery(pickTool)) }, ico("shapes"), "図形"),
        h("button", { type: "button", class: "btn", onclick: insertImages }, ico("image"), "画像"),
        h("button", { type: "button", class: "btn", onclick: (event) => openPop(event.currentTarget, iconGallery(insertIcon)) }, ico("icon"), "アイコン"),
        h("button", { type: "button", class: "btn", onclick: () => app.insertBlankSlide() }, ico("slide"), "白紙のスライド")),
      h("p", { class: "hint fp-tips" }, "ドラッグで移動・四隅でサイズ・上の丸で回転。Shiftで比率を保つ、Altで吸着なし、Ctrlを押しながらドラッグでコピー。ダブルクリックで文字を入力。右クリックでメニュー。"));
    } else {
      const title = chosen.length === 1 ? E.objectName(chosen[0], list.indexOf(chosen[0])) : `${chosen.length}個のオブジェクト`;
      head.append(h("b", {}, title), chosen.length === 1 ? h("button", { type: "button", class: "btn btn-ghost btn-sm", title: "名前を変える", onclick: async () => { const name = await app.ask("オブジェクトの名前", "選択ウィンドウやアニメーションに表示される名前", E.objectName(chosen[0], list.indexOf(chosen[0]))); if (name != null) editor.rename(chosen[0].id, name); } }, "名前") : null);
      body.append(...paneSections(chosen, list));
    }
    body.append(selectionPane(list));
    pane.replaceChildren(head, body);
    if (paneFocus) {
      const target = body.querySelector(`[data-fp="${paneFocus}"]`);
      if (target) { target.open = true; requestAnimationFrame(() => target.scrollIntoView({ block: "start" })); }
      paneFocus = null;
    } else body.scrollTop = keepScroll;
  }

  const section = (key, label, open, ...content) => h("details", { class: "fp-sec", "data-fp": key, open: open || null }, h("summary", {}, label), h("div", { class: "fp-sec-body" }, ...content.flat().filter(Boolean)));
  const line = (label, ...controls) => h("div", { class: "fp-line" }, h("span", { class: "fp-label" }, label), h("div", { class: "fp-ctrl" }, ...controls.flat().filter(Boolean)));
  function swatchRow(palette, current, pick, { none = null } = {}) {
    return h("div", { class: "fp-swatches" },
      none ? h("button", { type: "button", class: ["fp-sw", "none", current === "none" ? "on" : ""], title: none, "aria-label": none, onclick: () => pick("none") }, "∅") : null,
      palette.map(([color, label]) => h("button", { type: "button", class: ["fp-sw", String(current).toLowerCase() === color ? "on" : ""], title: `${label}（${color.toUpperCase()}）`, "aria-label": label, style: { "--c": color }, onclick: () => pick(color) })));
  }
  function numberInput(value, onSet, { step = 0.1, min = null, max = null, unit = "", width = 70 } = {}) {
    return h("span", { class: "fp-num" }, h("input", { type: "number", value: value ?? "", step, min, max, style: { width: `${width}px` }, onchange: (event) => { const v = parseFloat(event.target.value); if (Number.isFinite(v)) onSet(v); }, onkeydown: (event) => { if (event.key === "Enter") event.target.blur(); } }), unit ? h("small", {}, unit) : null);
  }
  function slider(value, onSet, { min = 0, max = 100, unit = "%" } = {}) {
    const out = h("small", {}, `${Math.round(value)}${unit}`);
    return h("span", { class: "fp-range" }, h("input", { type: "range", min, max, value: Math.round(value), oninput: (event) => { out.textContent = `${event.target.value}${unit}`; }, onchange: (event) => onSet(Number(event.target.value)) }), out);
  }
  const choice = (options, value, onSet) => h("select", { onchange: (event) => onSet(event.target.value) }, options.map(([v, label]) => h("option", { value: v, selected: String(v) === String(value) || null }, label)));
  const toggle = (label, on, onSet) => h("label", { class: "fp-check" }, h("input", { type: "checkbox", checked: on || null, onchange: (event) => onSet(event.target.checked) }), label);
  const tool = (icon, title, run, pressed = false) => h("button", { type: "button", class: "fp-tool", title, "aria-label": title, "aria-pressed": String(Boolean(pressed)), onclick: run }, ico(icon));

  function paneSections(chosen, list) {
    const o = E.withDefaults(chosen[0]);
    const single = chosen.length === 1;
    const textual = chosen.some((x) => ["shape", "text"].includes(x.kind));
    const out = [];
    if (textual) {
      const fill = o.fill;
      out.push(section("fill", "塗りつぶし", true,
        swatchRow(E.PALETTE.fill, fill, setFill, { none: "塗りつぶしなし" }),
        line("その他の色", h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(fill) ? fill : "#dce4f2", onchange: (event) => setFill(event.target.value) }), h("small", { class: "hint" }, "SEJの面の色以外はチェックで知らせます")),
        line("透明度", slider((1 - (o.fillOpacity ?? 1)) * 100, (v) => editor.apply((x) => (["shape", "text"].includes(x.kind) ? { fillOpacity: v ? Math.round((1 - v / 100) * 100) / 100 : undefined } : null))))));
    }
    if (chosen.some((x) => ["shape", "text", "image", "line"].includes(x.kind))) {
      const isLine = chosen.every((x) => x.kind === "line");
      out.push(section("line", isLine ? "線" : "枠線", true,
        swatchRow(E.PALETTE.line, o.stroke, setStroke, { none: isLine ? null : "枠線なし" }),
        line("その他の色", h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(o.stroke) ? o.stroke : "#1f3864", onchange: (event) => setStroke(event.target.value) })),
        line("幅", numberInput(ops.toPt(o.strokeW || 2), (v) => setStrokeWidth(Math.max(0.25, v)), { step: 0.25, min: 0.25, unit: "pt" })),
        line("実線/点線", choice(Object.entries(E.DASHES).map(([k, [label]]) => [k, label]), o.dash || "solid", setDash)),
        chosen.some((x) => x.kind === "line") ? [
          line("線の種類", choice(Object.entries(E.ROUTES), o.route || "straight", (v) => editor.apply((x) => (x.kind === "line" ? { route: v === "straight" ? undefined : v } : null)))),
          line("始点の形", choice(Object.entries(E.ARROWHEADS), o.head || "none", (v) => editor.apply((x) => (x.kind === "line" ? { head: v === "none" ? undefined : v } : null)))),
          line("終点の形", choice(Object.entries(E.ARROWHEADS), o.tail || "none", (v) => editor.apply((x) => (x.kind === "line" ? { tail: v === "none" ? undefined : v } : null)))),
          line("矢印のサイズ", choice([[1, "小"], [2, "中"], [3, "大"]], o.tailSize || 2, (v) => editor.apply((x) => (x.kind === "line" ? { headSize: Number(v) === 2 ? undefined : Number(v), tailSize: Number(v) === 2 ? undefined : Number(v) } : null)))),
        ] : null));
    }
    if (chosen.some((x) => x.kind === "icon")) {
      out.push(section("icon", "アイコン", true,
        swatchRow(E.PALETTE.line.filter(([c]) => c !== "#ffffff"), o.color, (c) => editor.apply((x) => (x.kind === "icon" ? { color: c } : null))),
        line("線の太さ", numberInput(o.strokeW, (v) => editor.apply((x) => (x.kind === "icon" ? { strokeW: Math.max(0.5, Math.min(4, v)) } : null)), { step: 0.25, min: 0.5, max: 4 })),
        line("アイコンの変更", h("button", { type: "button", class: "btn btn-sm", onclick: (event) => openPop(event.currentTarget, iconGallery((key) => editor.apply((x) => (x.kind === "icon" ? { icon: key } : null)))) }, "選ぶ…"))));
    }
    if (textual) {
      const st = editor.textState() || {};
      out.push(section("text", "文字", true,
        line("フォント", choice(Object.entries(E.FONTS).map(([k, [label]]) => [k, label]), st.font || "body", (v) => editor.textFormat("font", v))),
        line("サイズ", numberInput(st.fs, (v) => editor.textFormat("size", v), { step: 1, min: 4, unit: "pt" }),
          tool("grow", "大きく", () => editor.textFormat("grow")), tool("shrink", "小さく", () => editor.textFormat("shrink"))),
        line("書式", tool("bold", "太字", () => editor.textFormat("bold"), st.bold), tool("italic", "斜体", () => editor.textFormat("italic"), st.italic), tool("underline", "下線", () => editor.textFormat("underline"), st.underline), tool("strike", "取り消し線", () => editor.textFormat("strike"), st.strike), tool("clear", "書式のクリア", () => editor.textFormat("clear"))),
        line("文字の色", swatchRow(E.PALETTE.text, st.color, (c) => editor.textFormat("color", c))),
        line("揃え", tool("textLeft", "左揃え", () => editor.textFormat("align", "left"), st.align === "left"), tool("textCenter", "中央揃え", () => editor.textFormat("align", "center"), st.align === "center"), tool("textRight", "右揃え", () => editor.textFormat("align", "right"), st.align === "right"), tool("textJustify", "両端揃え", () => editor.textFormat("align", "justify"), st.align === "justify")),
        line("上下の位置", tool("valignTop", "上揃え", () => editor.textFormat("valign", "top"), st.valign === "top"), tool("valignMiddle", "上下中央", () => editor.textFormat("valign", "middle"), st.valign === "middle"), tool("valignBottom", "下揃え", () => editor.textFormat("valign", "bottom"), st.valign === "bottom")),
        line("箇条書き", tool("bullet", "箇条書き", () => editor.textFormat("bullet"), st.list === "bullet"), tool("number", "段落番号", () => editor.textFormat("number"), st.list === "number"), tool("vtext", "縦書き", () => editor.textFormat("vertical"), st.vertical)),
        line("行間", choice(LINE_HEIGHTS.map(([v, label]) => [v, `${label} 行`]), LINE_HEIGHTS.find(([v]) => Math.abs(v - (st.lh || 0)) < 0.01)?.[0] ?? st.lh, (v) => editor.textFormat("lh", Number(v)))),
        line("段落の間隔", choice([[0, "なし"], [0.3, "小"], [0.6, "中"], [1, "大"]], o.psp || 0, (v) => editor.textFormat("psp", Number(v)))),
        line("文字の間隔", choice([[0, "標準"], [-0.05, "狭く"], [0.05, "広く"], [0.12, "より広く"]], o.ls || 0, (v) => editor.textFormat("ls", Number(v)))),
        line("自動調整", choice(Object.entries(E.AUTOFIT), st.autofit || "none", (v) => editor.textFormat("autofit", v))),
        line("折り返し", toggle("図形の幅で折り返す", st.wrap !== false, (on) => editor.textFormat("wrap", on))),
        line("余白（cm）", ...["上", "右", "下", "左"].map((label, i) => h("span", { class: "fp-pad" }, h("small", {}, label), numberInput(ops.toCm((st.pad || [7, 14, 7, 14])[i]), (v) => { const pad = [...(st.pad || [7, 14, 7, 14])]; pad[i] = ops.fromCm(Math.max(0, v)); editor.textFormat("pad", pad); }, { step: 0.05, min: 0, width: 54 }))))));
    }
    if (single && chosen[0].kind === "table") {
      const t = E.withDefaults(chosen[0]);
      const setTable = (patch) => editor.changeTable((o) => ({ ...o, ...patch }));
      out.push(section("table", "表", true,
        line("スタイル", choice(Object.entries(E.TABLE_STYLES), t.style || "sej", (v) => setTable({ style: v === "sej" ? undefined : v }))),
        line("オプション", toggle("ヘッダー行", t.header !== false, (on) => setTable({ header: on })), toggle("縞模様（行）", t.banded !== false, (on) => setTable({ banded: on }))),
        line("", toggle("最初の列", t.firstCol, (on) => setTable({ firstCol: on })), toggle("集計行", t.lastRow, (on) => setTable({ lastRow: on }))),
        line("文字のサイズ", numberInput(ops.toPt(t.fs), (v) => editor.textFormat("size", v), { step: 1, min: 6, unit: "pt" })),
        line("フォント", choice(Object.entries(E.FONTS).map(([k, [label]]) => [k, label]), t.font || "body", (v) => editor.textFormat("font", v))),
        line("大きさ", h("span", { class: "hint" }, `${t.cells.length}行 × ${t.cols.length}列（リボンの「レイアウト」で行・列の追加・削除・結合）`))));
    }
    if (single && chosen[0].kind === "chart") {
      const c = chosen[0].chart;
      out.push(section("chart", "グラフ", true,
        line("種類", choice(Object.entries(E.CHART_KINDS), c.type, (v) => editor.apply({ chart: { ...c, type: v } }, { ids: [chosen[0].id] }))),
        line("", h("button", { type: "button", class: "btn btn-sm", onclick: () => tables.editChart(chosen[0].id) }, "データの編集…"), h("small", { class: "hint" }, `${c.labels.length}項目 × ${c.series.length}系列`))));
    }
    if (chosen.some((x) => x.kind === "image")) {
      const img = E.withDefaults(chosen.find((x) => x.kind === "image"));
      const crop = img.crop || { l: 0, t: 0, r: 0, b: 0 };
      const setCrop = (side, v) => editor.apply((x) => {
        if (x.kind !== "image") return null;
        const c = { ...(x.crop || { l: 0, t: 0, r: 0, b: 0 }), [side]: Math.max(0, Math.min(0.9, v / 100)) };
        return { crop: c.l || c.t || c.r || c.b ? c : undefined };
      });
      out.push(section("picture", "図", true,
        line("切り抜く形", choice(MASKS.map((key) => [key, E.SHAPES[key].label.replace(/^.*: /, "")]), img.mask || "rect", (v) => editor.apply((x) => (x.kind === "image" ? { mask: v === "rect" ? undefined : v, adj: undefined } : null)))),
        line("トリミング（%）", ...[["l", "左"], ["t", "上"], ["r", "右"], ["b", "下"]].map(([side, label]) => h("span", { class: "fp-pad" }, h("small", {}, label), numberInput(Math.round(crop[side] * 100), (v) => setCrop(side, v), { step: 1, min: 0, max: 90, width: 54 })))),
        line("はめ込み方", choice(Object.entries(E.FITS), img.fit || "fill", (v) => editor.apply((x) => (x.kind === "image" ? { fit: v } : null)))),
        line("明るさ", slider((img.bright || 0) * 100 + 100, (v) => editor.apply((x) => (x.kind === "image" ? { bright: (v - 100) / 100 || undefined } : null)), { min: 0, max: 200 })),
        line("コントラスト", slider((img.contrast || 0) * 100 + 100, (v) => editor.apply((x) => (x.kind === "image" ? { contrast: (v - 100) / 100 || undefined } : null)), { min: 0, max: 200 })),
        line("彩度", slider((img.sat || 0) * 100 + 100, (v) => editor.apply((x) => (x.kind === "image" ? { sat: (v - 100) / 100 || undefined } : null)), { min: 0, max: 200 })),
        line("色", toggle("グレースケール", img.gray, (on) => editor.apply((x) => (x.kind === "image" ? { gray: on || undefined } : null)))),
        line("代替テキスト", h("input", { type: "text", value: img.alt || "", placeholder: "画像の説明（読み上げ用）", onchange: (event) => editor.apply((x) => (x.kind === "image" ? { alt: event.target.value.trim() || undefined } : null)) })),
        line("", h("button", { type: "button", class: "btn btn-sm", onclick: async () => { const [file] = await app.pickFiles("image/*", false); if (file) await app.replaceImage(img.id, file); } }, "図の変更…"),
          h("button", { type: "button", class: "btn btn-sm", onclick: () => editor.apply((x) => (x.kind === "image" ? { crop: undefined, mask: undefined, adj: undefined, bright: undefined, contrast: undefined, sat: undefined, gray: undefined } : null)) }, "リセット"))));
    }
    if (chosen.some((x) => x.kind === "video" || x.kind === "lottie")) {
      const media = E.withDefaults(chosen.find((x) => x.kind === "video" || x.kind === "lottie"));
      out.push(section("media", media.kind === "lottie" ? "アニメーション" : "ビデオ", true,
        line("再生", toggle("発表で自動再生", media.autoplay !== false, (on) => editor.apply((x) => (["video", "lottie"].includes(x.kind) ? { autoplay: on } : null)))),
        line("", toggle("繰り返す", media.loop !== false, (on) => editor.apply((x) => (["video", "lottie"].includes(x.kind) ? { loop: on } : null)))),
        media.kind === "video" ? line("", toggle("音を出さない", media.muted !== false, (on) => editor.apply((x) => (x.kind === "video" ? { muted: on } : null)))) : null,
        line("はめ込み方", choice([["cover", "トリミングして埋める"], ["contain", "全体を入れる"]], media.fit || "cover", (v) => editor.apply((x) => (["video", "lottie"].includes(x.kind) ? { fit: v } : null))))));
    }
    if (chosen.some((x) => x.kind === "audio")) {
      const sound = E.withDefaults(chosen.find((x) => x.kind === "audio"));
      out.push(section("audio", "オーディオ", true,
        line("ファイル", h("span", { class: "fp-file" }, sound.fileName || "（名前なし）")),
        line("アイコンの色", swatchRow(E.PALETTE.line.filter(([c]) => c !== "#ffffff"), sound.color, (c) => editor.apply((x) => (x.kind === "audio" ? { color: c } : null)))),
        line("再生", toggle("発表で自動再生", Boolean(sound.autoplay), (on) => editor.apply((x) => (x.kind === "audio" ? { autoplay: on } : null)))),
        line("", toggle("繰り返す", Boolean(sound.loop), (on) => editor.apply((x) => (x.kind === "audio" ? { loop: on } : null)))),
        line("", h("button", { type: "button", class: "btn btn-sm", onclick: () => showTab("playback", { open: true }) }, "再生タブ（トリミング・フェード・音量）"))));
    }
    if (single && chosen[0].kind === "smartart") {
      const sa = chosen[0].smartart;
      const setSa = (patch) => editor.apply((x) => (x.kind === "smartart" ? { smartart: { ...x.smartart, ...patch } } : null));
      out.push(section("smartart", "SmartArt", true,
        line("レイアウト", choice(Object.entries(E.SMARTART_LAYOUTS).map(([k, v]) => [k, `${v.group}：${v.label}`]), sa.layout, (v) => setSa({ layout: v }))),
        line("色", choice(Object.entries(E.SMARTART_COLORS), sa.color || "blue", (v) => setSa({ color: v }))),
        line("角", choice(Object.entries(E.SMARTART_STYLES), sa.style || "round", (v) => setSa({ style: v }))),
        line("項目", h("span", { class: "fp-file" }, `${sa.items.length}項目（${sa.items.filter((it) => it.level === 0).length}つの大項目）`)),
        line("", h("button", { type: "button", class: "btn btn-sm", onclick: () => smart.openPane(chosen[0].id) }, "テキスト ウィンドウ"),
          h("button", { type: "button", class: "btn btn-sm", onclick: () => smart.toShapes(chosen[0].id) }, "図形に変換"))));
    }
    // Size and position (cm, degrees), as PowerPoint's 配置とサイズ.
    if (single) out.push(sizeSection(chosen[0], list));
    out.push(section("opacity", "透明度", false, line("透明度", slider((1 - (o.opacity ?? 1)) * 100, (v) => editor.apply({ opacity: v ? Math.round((1 - v / 100) * 100) / 100 : undefined })))));
    out.push(section("arrange", "配置", false,
      h("div", { class: "fp-tools" },
        tool("front", "最前面へ", () => editor.order("front")), tool("back", "最背面へ", () => editor.order("back")),
        tool("alignLeft", "左揃え", () => editor.alignSelection("left")), tool("alignCenter", "左右中央", () => editor.alignSelection("center")), tool("alignRight", "右揃え", () => editor.alignSelection("right")),
        tool("alignTop", "上揃え", () => editor.alignSelection("top")), tool("alignMiddle", "上下中央", () => editor.alignSelection("middle")), tool("alignBottom", "下揃え", () => editor.alignSelection("bottom")),
        tool("distH", "左右に整列", () => editor.distributeSelection("x")), tool("distV", "上下に整列", () => editor.distributeSelection("y")),
        tool("group", "グループ化", () => editor.groupSelection()), tool("ungroup", "グループ解除", () => editor.ungroupSelection()),
        tool("flipH", "左右反転", () => editor.flipSelection("x")), tool("flipV", "上下反転", () => editor.flipSelection("y")),
        tool(chosen.some((x) => x.locked) ? "unlock" : "lock", chosen.some((x) => x.locked) ? "ロックを解除" : "ロック", () => editor.setLocked(!chosen.some((x) => x.locked))),
        tool("duplicate", "複製（⌘D）", () => editor.duplicateSelection()), tool("trash", "削除", () => editor.removeSelection()))));
    if (single) out.push(section("action", "リンク・動作（発表中にクリック）", Boolean(chosen[0].action), linkForm(chosen[0])));
    return out;
  }

  function sizeSection(o, list) {
    if (o.kind === "line") {
      const [[x1, y1], [x2, y2]] = E.lineEnds(o, list);
      const set = (patch) => editor.apply({ ...patch, from: undefined, to: undefined, x1, y1, x2, y2, ...patch }, { ids: [o.id] });
      return section("size", "サイズと位置", true,
        line("始点（横・縦）", numberInput(ops.toCm(x1), (v) => set({ x1: ops.fromCm(v) }), { step: 0.1, unit: "cm" }), numberInput(ops.toCm(y1), (v) => set({ y1: ops.fromCm(v) }), { step: 0.1, unit: "cm" })),
        line("終点（横・縦）", numberInput(ops.toCm(x2), (v) => set({ x2: ops.fromCm(v) }), { step: 0.1, unit: "cm" }), numberInput(ops.toCm(y2), (v) => set({ y2: ops.fromCm(v) }), { step: 0.1, unit: "cm" })),
        line("長さ", h("span", { class: "hint" }, `${ops.toCm(Math.hypot(x2 - x1, y2 - y1))} cm`)));
    }
    const ratio = o.w / o.h;
    const lock = o.lockRatio || (o.kind === "image" && o.lockRatio !== false);
    return section("size", "サイズと位置", true,
      line("高さ", numberInput(ops.toCm(o.h), (v) => { const hh = ops.fromCm(Math.max(0.05, v)); editor.apply(lock ? { h: hh, w: hh * ratio } : { h: hh }, { ids: [o.id] }); }, { step: 0.1, unit: "cm" })),
      line("幅", numberInput(ops.toCm(o.w), (v) => { const w = ops.fromCm(Math.max(0.05, v)); editor.apply(lock ? { w, h: w / ratio } : { w }, { ids: [o.id] }); }, { step: 0.1, unit: "cm" })),
      line("", toggle("縦横比を固定する", lock, (on) => editor.apply({ lockRatio: o.kind === "image" ? (on ? undefined : false) : on || undefined }, { ids: [o.id] }))),
      line("回転", numberInput(o.rot || 0, (v) => editor.apply({ rot: ops.normAngle(v) || undefined }, { ids: [o.id] }), { step: 1, unit: "°" })),
      line("横位置", numberInput(ops.toCm(o.x), (v) => editor.apply({ x: ops.fromCm(v) }, { ids: [o.id] }), { step: 0.1, unit: "cm" }), h("small", { class: "hint" }, "左上から")),
      line("縦位置", numberInput(ops.toCm(o.y), (v) => editor.apply({ y: ops.fromCm(v) }, { ids: [o.id] }), { step: 0.1, unit: "cm" })));
  }

  /** 選択ウィンドウ: every object, front first; click to select, eye to hide, drag to change the order. */
  function selectionPane(list) {
    const rows = [...list].map((o, i) => ({ o, i })).reverse();
    const box = h("details", { class: "fp-sec fp-selection", "data-fp": "selection", open: true },
      h("summary", {}, `選択ウィンドウ（${list.length}）`),
      h("div", { class: "fp-sec-body" },
        list.length ? h("div", { class: "fp-sel-actions" },
          h("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => editor.setHidden(list.map((o) => o.id), false) }, "すべて表示"),
          h("button", { type: "button", class: "btn btn-ghost btn-sm", onclick: () => editor.setHidden(list.map((o) => o.id), true) }, "すべて非表示")) : h("p", { class: "hint" }, "このスライドにはまだオブジェクトがありません。「挿入」から図形・文字・画像を置けます。"),
        h("ol", { class: "fp-sel-list" }, rows.map(({ o, i }) => {
          const item = h("li", { class: [editor.selection.includes(o.id) ? "on" : "", o.hidden ? "is-hidden" : ""], draggable: "true", "data-id": o.id,
            onclick: (event) => { if (event.target.closest("button")) return; editor.select(event.shiftKey || event.metaKey || event.ctrlKey ? [...new Set([...editor.selection, o.id])] : [o.id]); },
            ondblclick: async () => { const name = await app.ask("オブジェクトの名前", "", E.objectName(o, i)); if (name != null) editor.rename(o.id, name); },
            ondragstart: (event) => { event.dataTransfer.setData("text/x-hsej-object", o.id); event.dataTransfer.effectAllowed = "move"; },
            ondragover: (event) => { if ([...event.dataTransfer.types].includes("text/x-hsej-object")) { event.preventDefault(); item.classList.add("drop"); } },
            ondragleave: () => item.classList.remove("drop"),
            ondrop: (event) => { event.preventDefault(); item.classList.remove("drop"); const id = event.dataTransfer.getData("text/x-hsej-object"); if (id && id !== o.id) editor.moveInOrder(id, list.findIndex((x) => x.id === o.id)); } },
          h("span", { class: "fp-sel-kind" }, kindIcon(o)),
          h("span", { class: "fp-sel-name" }, E.objectName(o, i), o.group ? h("small", {}, " ・グループ") : null),
          o.locked ? h("span", { class: "fp-sel-lock", title: "ロック中" }, ico("lock", 14)) : null,
          h("button", { type: "button", class: "fp-sel-eye", title: o.hidden ? "表示する" : "非表示にする", "aria-label": o.hidden ? "表示する" : "非表示にする", onclick: () => editor.setHidden([o.id], !o.hidden) }, ico(o.hidden ? "eyeOff" : "eye", 15)));
          return item;
        })),
        list.length > 1 ? h("p", { class: "hint" }, "上ほど前面です。ドラッグで順番を変え、ダブルクリックで名前を変えられます。") : null));
    return box;
  }
  function kindIcon(o) {
    if (o.kind === "shape") return E.SHAPES[o.shape] ? shapeThumb(o.shape, 18, 14) : freeformThumb(o.path?.closed ? "polygon" : "curve");
    return ico({ text: "textbox", image: "image", line: "line", icon: "icon", video: "video", audio: "audio", lottie: "lottie", table: "table", chart: "chartBar", smartart: "smartart", ink: "pen", zoom: "zoomSlide", camera: "camera", equation: "equation" }[o.kind] || "shapes", 16);
  }

  // アニメーション・画面切り替え (anim.mjs) build their tabs and the animation pane with these same parts.
  const anim = createAnimations(editor, app, { btn, drop, group, col, row, menu, openPop, closePop, updater: (fn) => updaters.push(fn), tabNow: () => tab, refreshRibbon: () => refresh() });
  // インタラクション (interact.mjs): what only HTML does with an object — the mouse, a click, motion that keeps going.
  const ix = createInteractions(editor, app, { btn, drop, group, col, row, menu, openPop, closePop, updater: (fn) => updaters.push(fn), tabNow: () => tab, editLink: () => editLink() });
  const crop = createCrop(editor, app);
  const freeform = createFreeform(editor, app);
  // SmartArt (smartart.mjs): the gallery, the text pane and the SmartArt のデザイン tab.
  const smart = createSmartArt(editor, app, { btn, drop, group, col, row, menu, openPop, closePop, updater: (fn) => updaters.push(fn), showTab: (id) => showTab(id) });
  // 挿入 → オーディオ・画面録画 and the 再生 tab of a video or a sound (media.mjs).
  const media = createMedia(editor, app, { btn, drop, group, col, row, menu, openPop, closePop, updater: (fn) => updaters.push(fn), refreshRibbon: () => refresh() });
  const tables = createTableUi(editor, app, { btn, drop, group, col, row, menu, openPop, closePop, updater: (fn) => updaters.push(fn), colors, showTab: (id) => showTab(id) });
  // 描画 (ink.mjs): pens, highlighters, the eraser and the lasso, ink to shapes, ink replay.
  const ink = createInk(editor, app, { btn, drop, group, col, row, menu, openPop, closePop, updater: (fn) => updaters.push(fn), refreshRibbon: () => refresh() });
  // ズーム・カメオ・スクリーンショット・数式・ワードアート・フィールド・段組み・文字種・音声入力 (extras.mjs).
  const extras = createExtras(editor, app, { btn, drop, group, col, row, menu, openPop, closePop, updater: (fn) => updaters.push(fn), refreshRibbon: () => refresh() });

  editor.subscribe(() => { renderRibbon(); renderPane(); });

  return {
    renderRibbon, renderPane, renderAnimPane: () => anim.renderPane(), editChart: (id) => tables.editChart(id),
    editSmartart: (id, item) => { editor.select([id]); showTab("smartartDesign"); smart.openPane(id, item); }, smartartToShapes: (id) => smart.toShapes(id), startCrop: (id) => crop.start(id), editPoints: (id) => freeform.editPoints(id),
    showTab, closePop, openPop, shapeGallery, iconGallery, photoGallery, toggleRibbon, setRibbonMode, zoomMenu,
    popMenu: (anchor, items) => openPop(anchor, menu(items)),
    editEquation: (id) => { const o = editor.objects().find((x) => x.id === id); if (o?.kind === "equation") extras.equationDialog(o); },
    stopInk: () => ink.stop(), get inkTool() { return ink.tool; },
    get tab() { return tab; }, get ribbonMode() { return ribbonMode; }, get floating() { return floating; },
  };
}
