// The editor's controls, PowerPoint style: the ribbon over the slide (ホーム・挿入・図形の書式・図の形式・表示),
// the 書式 pane on the right (fill, line, text, size and position, picture, link) with the selection pane, and the
// galleries they open (shapes, colours in the SEJ palette, icons, photos).

import * as ops from "./ops.mjs";
import { ico } from "./icons.mjs";
import { createAnimations } from "./anim.mjs";

const SIZES_PT = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96];
const LINE_WIDTHS = [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 4.5, 6, 8, 12];
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
  let collapsed = false;
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
      onclick: (event) => { event.preventDefault(); run(event); } }, ico(icon, big ? 26 : 18), caption(label));
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
    closePop();
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
    pop = { el, anchor };
    setTimeout(() => document.addEventListener("pointerdown", outside, true), 0);
    document.addEventListener("keydown", popKey, true);
  }
  function outside(event) { if (pop && !pop.el.contains(event.target) && !pop.anchor.contains(event.target)) closePop(); }
  function popKey(event) { if (event.key === "Escape" && pop) { event.stopPropagation(); closePop(); } }
  function closePop() {
    pop?.el.remove();
    pop = null;
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", popKey, true);
  }
  const menu = (items) => (close) => h("div", { class: "rb-menu" }, items.filter(Boolean).map((item) => (item === "-" ? h("div", { class: "rb-sep" })
    : item.head ? h("div", { class: "rb-menu-head" }, item.head)
      : h("button", { type: "button", class: item.on ? "on" : "", disabled: item.disabled || null, onmousedown: (e) => e.preventDefault(), onclick: () => { close(); item.run(); } }, item.icon ? ico(item.icon) : h("span", { class: "rb-noicon" }), h("span", {}, item.label), item.keys ? h("kbd", {}, item.keys) : null))));

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
        }, lineThumb(variant)))));
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
  function pickTool(tool) {
    editor.setTool(tool);
    app.toast(tool.kind === "line" ? "スライド上をドラッグして線を引いてください（Shiftで水平・垂直・45°）" : tool.kind === "text" ? "クリックまたはドラッグでテキストボックスを置き、そのまま入力できます" : "スライド上をドラッグして描いてください（クリックで標準の大きさ。Shiftで縦横同じ比率）");
  }

  async function editLink() {
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
    { id: "transition", label: "画面切り替え" },
    { id: "animation", label: "アニメーション" },
    { id: "view", label: "表示" },
    { id: "shape", label: "図形の書式", contextual: () => hasShape() },
    { id: "picture", label: "図の形式", contextual: () => hasImage() },
  ];

  function signature() {
    const ctx = TABS.filter((t) => t.contextual?.()).map((t) => t.id).join(",");
    return `${tab}|${ctx}|${collapsed}|${onSlide()}`;
  }

  function renderRibbon(force = false) {
    if (!ribbon) return;
    const visible = onSlide();
    ribbon.hidden = !visible;
    if (!visible) { built = ""; return; }
    const tabs = TABS.filter((t) => !t.contextual || t.contextual());
    if (!tabs.some((t) => t.id === tab)) tab = "home";
    const sig = signature();
    if (!force && sig === built) { refresh(); return; }
    built = sig;
    updaters = [];
    const head = h("div", { class: "rb-tabs", role: "tablist" },
      tabs.map((t) => h("button", { type: "button", role: "tab", class: t.contextual ? "contextual" : "", "aria-selected": String(t.id === tab), onclick: () => { tab = t.id; collapsed = false; renderRibbon(true); editor.draw(); }, ondblclick: () => { collapsed = !collapsed; renderRibbon(true); } }, t.label)),
      h("span", { class: "rb-spacer" }),
      h("span", { class: "rb-hint" }, editor.tool ? "描画中（Escでやめる）" : editor.painter ? "書式を貼り付ける図形をクリック（Esc）" : ""),
      h("button", { type: "button", class: "rb-collapse", title: collapsed ? "リボンを表示" : "リボンを折りたたむ", onclick: () => { collapsed = !collapsed; renderRibbon(true); } }, collapsed ? "▾" : "▴"));
    const body = collapsed ? null : h("div", { class: "rb-body", role: "tabpanel" }, ...buildTab(tab));
    if (pop && !pop.anchor.isConnected) closePop();
    ribbon.replaceChildren(head, body || "");
    if (pop && !pop.anchor.isConnected) closePop();
    refresh();
    fitRibbon();
  }
  // A narrow window squeezes the ribbon as PowerPoint does, from the right-hand groups first: small buttons
  // lose their words (the tooltip keeps them), then whole groups fold into one button that opens them;
  // past that the groups draw closer, and last of all the ribbon scrolls sideways.
  const GROUP_ICONS = { スライド: "slide", クリップボード: "paste", フォント: "font", 段落: "textLeft", 図形描画: "shapes", 編集: "selectAll", 画像: "image", 図: "shapes", テキスト: "textbox", 線: "line", メディア: "video", リンク: "link",
    図形の挿入: "shapes", 図形のスタイル: "style", ワードアートのスタイル: "fontColor", 配置: "front", サイズ: "zoomFit", 調整: "bright", 図のスタイル: "outline", 表示: "slide", "表示/非表示": "grid", ズーム: "zoomIn", ウィンドウ: "pane" };
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
    if (hint) hint.textContent = editor.tool ? "描画中：スライド上をドラッグ（Escでやめる）" : editor.painter ? "書式を貼り付ける図形をクリック（Escでやめる）" : "";
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
        ]), { big: true }),
        col(btn("layout", "レイアウト", "このスライドのレイアウトを変える", () => app.openTypeDialog("change")), btn("duplicateSlide", "複製", "このスライドを複製", () => app.duplicateSlide()))),
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
          drop("valignMiddle", "", "文字の配置（上下）", () => menu([["top", "上揃え", "valignTop"], ["middle", "上下中央揃え", "valignMiddle"], ["bottom", "下揃え", "valignBottom"]].map(([v, label, icon]) => ({ label, icon, on: editor.textState()?.valign === v, run: () => editor.textFormat("valign", v) }))), { enabled: hasText }))),
      group("図形描画",
        drop("shapes", "図形", "図形を描く", () => shapeGallery(pickTool), { big: true }),
        col(drop("front", "配置", "前面・背面・整列・グループ・回転", () => arrangeMenu(), { enabled: any }),
          drop("style", "スタイル", "図形のクイックスタイル（SEJの色）", () => styleMenu(), { enabled: hasText })),
        col(drop("fill", "塗り", "図形の塗りつぶし", () => colors(E.PALETTE.fill, fillOf(), setFill, { none: "塗りつぶしなし" }), { enabled: hasText, swatch: fillOf }),
          drop("outline", "枠線", "図形の枠線", () => outlineMenu(), { enabled: () => any() && !kinds().has("icon") || kinds().has("icon"), swatch: strokeOf }))),
      group("編集",
        col(btn("selectAll", "すべて選択", "このスライドのオブジェクトをすべて選択（⌘A）", () => editor.select(editor.objects().filter((o) => !o.hidden).map((o) => o.id))),
          btn("pane", "選択ウィンドウ", "オブジェクトの一覧・表示/非表示・順番", () => app.openPanel("format", "selection")))),
    ];
  }

  function insertTab() {
    return [
      group("スライド", drop("slide", "新しい|スライド", "スライドを追加", menu([
        { label: "白紙（自由配置）", icon: "slide", run: () => app.insertBlankSlide() },
        { label: "レイアウトを選んで追加…", icon: "layout", run: () => app.openTypeDialog("insert") },
      ]), { big: true })),
      group("画像",
        drop("image", "画像", "画像を入れる", menu([
          { label: "このデバイス…", icon: "image", run: insertImages },
          { label: "内蔵の写真…", icon: "image", run: () => openPop(ribbon.querySelector('[data-rb="photos"]') || ribbon, photoGallery(insertPhoto)) },
          { label: "URLから…", icon: "link", run: () => insertFromUrl("image") },
        ]), { big: true }),
        h("span", { "data-rb": "photos" })),
      group("図",
        drop("shapes", "図形", "図形を描く", () => shapeGallery(pickTool), { big: true }),
        drop("icon", "アイコン", "アイコンを入れる", () => iconGallery(insertIcon), { big: true })),
      group("テキスト",
        drop("textbox", "テキスト ボックス", "テキストボックスを描く", menu([
          { label: "横書きテキスト ボックス", icon: "textbox", run: () => pickTool({ kind: "text" }) },
          { label: "縦書きテキスト ボックス", icon: "vtext", run: () => pickTool({ kind: "text", vertical: true }) },
        ]), { big: true })),
      group("線",
        col(btn("line", "直線", "直線を引く", () => pickTool({ kind: "line", variant: "line" })), btn("arrow", "矢印", "矢印を引く", () => pickTool({ kind: "line", variant: "arrow" }))),
        col(btn("arrows", "両矢印", "両方向の矢印", () => pickTool({ kind: "line", variant: "double" })), btn("line", "コネクタ", "図形どうしをつなぐカギ線（端を図形の点に近づけるとつながります）", () => pickTool({ kind: "line", variant: "elbow" })))),
      group("メディア",
        drop("video", "ビデオ", "動画・アニメーションを入れる", menu([
          { label: "このデバイスのビデオ・Lottie…", icon: "video", run: insertVideoFile },
          { label: "YouTube・URL…", icon: "link", run: () => insertFromUrl("video") },
        ]), { big: true })),
      group("リンク", h("span", { "data-rb": "link" }, btn("link", "リンク・|動作", "クリックしたときの動作（スライドへ移動・Webページを開く）", editLink, { big: true, enabled: () => Boolean(one()) }))),
    ];
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
          btn("textbox", "テキスト ボックス", "テキストボックスを描く", () => pickTool({ kind: "text" })))),
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
        btn("crop", "トリミング", "画像の端を切り取る（書式パネルで数値指定）", () => app.openPanel("format", "picture"), { big: true, enabled: hasImage }),
        sizeFields()),
    ];
  }

  function viewTab() {
    const st = editor.state;
    const zoomItems = [["fit", "全体を表示"], [0.5, "50%"], [0.66, "66%"], [0.75, "75%"], [1, "100%（実寸）"], [1.5, "150%"], [2, "200%"]];
    return [
      group("表示",
        btn("slide", "標準", "1枚ずつ編集", () => app.setView("single"), { big: true, pressed: () => app.state().view === "single" }),
        col(btn("grid", "一覧", "スライド一覧", () => app.setView("grid")), btn("textLeft", "構成", "見出しとキーメッセージの一覧", () => app.setView("outline")))),
      group("表示/非表示",
        col(btn("grid", "グリッド線", "1cmごとの線を表示", () => editor.setView("grid", !st.grid), { pressed: () => st.grid }),
          btn("guides", "ガイド", "SEJの本文の領域（安全領域）と中央に合わせる", () => editor.setView("guides", !st.guides), { pressed: () => st.guides })),
        col(btn("smart", "スマートガイド", "ほかの図形の端・中央・等間隔に吸着（Altで一時的に外す）", () => editor.setView("smart", !st.smart), { pressed: () => st.smart }),
          btn("snapGrid", "グリッドに|合わせる", "0.25cmごとに吸着", () => editor.setView("snapGrid", !st.snapGrid), { pressed: () => st.snapGrid }))),
      group("ズーム",
        drop("zoomIn", "ズーム", "表示の大きさ", () => menu(zoomItems.map(([z, label]) => ({ label, on: editor.zoom === z, run: () => editor.setZoom(z) }))), { big: true }),
        btn("zoomFit", "全体表示", "スライド全体をウィンドウに合わせる", () => editor.setZoom("fit"), { big: true, pressed: () => editor.zoom === "fit" })),
      group("ウィンドウ",
        btn("pane", "選択|ウィンドウ", "オブジェクトの一覧", () => app.openPanel("format", "selection"), { big: true })),
    ];
  }

  function buildTab(id) {
    return { home: homeTab, insert: insertTab, transition: anim.transitionTab, animation: anim.animationTab, shape: shapeTab, picture: pictureTab, view: viewTab }[id]();
  }

  function showTab(id) {
    tab = id;
    collapsed = false;
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
    if (o.kind === "shape") return shapeThumb(o.shape, 18, 14);
    return ico({ text: "textbox", image: "image", line: "line", icon: "icon", video: "video", lottie: "lottie" }[o.kind] || "shapes", 16);
  }

  // アニメーション・画面切り替え (anim.mjs) build their tabs and the animation pane with these same parts.
  const anim = createAnimations(editor, app, { btn, drop, group, col, row, menu, openPop, closePop, updater: (fn) => updaters.push(fn), tabNow: () => tab, refreshRibbon: () => refresh() });

  editor.subscribe(() => { renderRibbon(); renderPane(); });

  return { renderRibbon, renderPane, renderAnimPane: () => anim.renderPane(), showTab, closePop, openPop, shapeGallery, iconGallery, photoGallery, get tab() { return tab; } };
}
