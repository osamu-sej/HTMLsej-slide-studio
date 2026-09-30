/*
 * HTML Slide Studio — slide engine.
 * Turns a deck (JSON) into 1920×1080 HTML slides: themes, 44 layouts, SVG charts, text fitting.
 * Motion and the presentation player live in motion.js; both attach to window.SlideEngine.
 * The file is also inlined into exported presentations, so it has no dependencies.
 */
(function (root) {
  "use strict";

  const W = 1920;
  const H = 1080;
  const SVGNS = "http://www.w3.org/2000/svg";
  let ICONS = /*__ICONS__*/{};

  // Built-in photo library (public/assets). Keys are what the AI and the editor use.
  const PHOTOS = {
    executiveDecision: ["executive-decision.jpg", "経営判断"],
    storeOperations: ["store-operations.jpg", "店舗・現場"],
    customerExperience: ["customer-experience.jpg", "顧客体験"],
    dataInsight: ["data-insight.jpg", "データ分析"],
    transformationRoadmap: ["transformation-roadmap.jpg", "変革・計画"],
    businessWorkshop: ["business-workshop.jpg", "研修・会議"],
    businessEtiquette: ["business-etiquette.jpg", "接客・対話"],
    promptDesign: ["prompt-design.jpg", "設計・思考"],
    aiWorkflow: ["ai-workflow-visual.jpg", "AIワークフロー"],
    ai: ["ai-executive-hero.jpg", "テクノロジー"],
  };

  const THEMES = [
    { id: "clarity", name: "クリア", desc: "白地に深い青。報告・提案の定番", dark: false, swatch: ["#ffffff", "#0e1726", "#2451e6", "#13a89e"],
      fonts: ["Zen Kaku Gothic New:wght@500;700;900", "Noto Sans JP:wght@400;500;700;800", "Manrope:wght@600;800"] },
    { id: "midnight", name: "ミッドナイト", desc: "濃紺の舞台。画面共有で映える", dark: true, swatch: ["#0b1020", "#eef2fa", "#7cb8ff", "#ffb454"],
      fonts: ["Murecho:wght@400;500;700;800", "Sora:wght@600;700;800"] },
    { id: "editorial", name: "エディトリアル", desc: "明朝の見出しと朱。読ませる資料に", dark: false, swatch: ["#f7f6f2", "#151515", "#c8372d", "#2b3a67"],
      fonts: ["Shippori Mincho B1:wght@600;800", "Zen Kaku Gothic New:wght@400;500;700", "Cormorant Garamond:ital,wght@0,600;1,500;1,600"] },
    { id: "mono", name: "モノ", desc: "黒い罫線と信号の赤。スイス風の格子", dark: false, swatch: ["#ffffff", "#0a0a0a", "#ff3b1d", "#bdbdbd"],
      fonts: ["Noto Sans JP:wght@400;500;700;900", "Archivo:wght@600;800"] },
    { id: "forest", name: "フォレスト", desc: "緑と黄土。穏やかで親しみやすい", dark: false, swatch: ["#f3f6f1", "#17251c", "#2f7a4f", "#c9982e"],
      fonts: ["Zen Maru Gothic:wght@500;700;900", "Noto Sans JP:wght@400;500;700", "Figtree:wght@600;800"] },
    { id: "sunset", name: "サンセット", desc: "コーラルと琥珀。研修やキックオフに", dark: false, swatch: ["#fffaf6", "#2a1a2e", "#f0512f", "#ffb020"],
      fonts: ["M PLUS Rounded 1c:wght@500;700;800", "Noto Sans JP:wght@400;500;700", "Outfit:wght@600;800"] },
    { id: "aurora", name: "オーロラ", desc: "漂う光とガラスの面。動きが映える", dark: true, swatch: ["#05070e", "#f5f7ff", "#6ae3d1", "#ff8fb8"],
      fonts: ["Zen Kaku Gothic Antique:wght@500;700;900", "Noto Sans JP:wght@400;500;700", "Plus Jakarta Sans:wght@600;800"] },
    { id: "kinari", name: "生成り", desc: "生成りの紙に藍と弁柄。和の落ち着き", dark: false, swatch: ["#f2ece1", "#2b2522", "#2d4b78", "#b8452e"],
      fonts: ["Zen Old Mincho:wght@600;700;900", "Zen Kaku Gothic New:wght@400;500;700"] },
  ];
  const THEME_IDS = new Set(THEMES.map((theme) => theme.id));

  const TYPE_LABELS = {
    title: "表紙", section: "章扉", closing: "クロージング", hero: "全面写真", statement: "ひと言メッセージ",
    content: "本文・箇条書き", agenda: "アジェンダ", executiveSummary: "エグゼクティブサマリー", kpi: "KPI", dashboard: "ダッシュボード",
    imageText: "グラフ・画像＋説明", statsCompare: "数値比較", compare: "対比", beforeAfter: "Before→After", table: "表",
    process: "プロセス", processList: "工程リスト", flowChart: "フローチャート", timeline: "タイムライン", roadmap: "ロードマップ",
    gantt: "ガントチャート", waterfall: "ウォーターフォール", logicTree: "ロジックツリー", cards: "カード", headerCards: "見出しカード",
    bulletCards: "要点カード", headerTwoColumn: "2列比較", headerThreeSummary: "3列＋まとめ", grid2x2: "2×2グリッド", matrix: "マトリクス",
    swot: "SWOT", diagram: "レーン図", cycle: "サイクル", pyramid: "ピラミッド", funnel: "ファネル", stepUp: "ステップアップ",
    triangle: "トライアングル", venn: "ベン図", orgChart: "組織図", checklist: "チェックリスト", faq: "FAQ", quote: "引用",
    simulator: "試算（条件を動かす）", gap: "不足と打ち手",
  };

  // Builds: step-by-step content appears on click, parallel content cascades in, the rest fades once.
  // A "gap" slide turns its measures on one per click instead (see motion.js).
  const CLICK = new Set(["process", "processList", "flowChart", "stepUp", "timeline", "roadmap", "cycle", "pyramid", "funnel", "gantt", "waterfall", "logicTree", "gap"]);
  const CASCADE = new Set(["cards", "headerCards", "bulletCards", "kpi", "dashboard", "grid2x2", "swot", "matrix", "triangle", "venn", "orgChart",
    "checklist", "faq", "agenda", "executiveSummary", "headerTwoColumn", "headerThreeSummary", "statsCompare", "compare", "beforeAfter", "diagram", "content"]);
  const STILL = new Set(["title", "section", "closing", "hero", "statement"]);
  // spotlight: everything is on screen, and each click puts one item in focus while the rest step back.
  const BUILDS = ["auto", "none", "fade", "cascade", "click", "spotlight"];
  function recommendedBuild(type) {
    if (STILL.has(type)) return "none";
    if (CLICK.has(type)) return "click";
    if (CASCADE.has(type)) return "cascade";
    return "fade";
  }

  // Motion graphics: the big lines set themselves in motion (kinetic type), a graphic moves behind the slide
  // (backdrop), and icons, connectors and markers draw themselves. Stage slides (STILL) get them by default.
  const KINETIC = {
    mask: "マスクから立ち上がる", words: "ことばごとに浮かぶ", chars: "1文字ずつ弾む", type: "タイプライター", scramble: "デコード（文字が入れ替わって決まる）",
    wave: "波打って並ぶ", zoom: "手前から迫る", flip: "1文字ずつめくれる", slide: "横から滑り込む",
  };
  const BACKDROPS = {
    particles: "粒子が昇る", waves: "波が流れる", grid: "グリッドと走査線", orbits: "軌道を回る", gradient: "色がゆらぐ", lines: "線を光が流れる", shapes: "図形が漂う",
    confetti: "紙吹雪が舞う", network: "ネットワークがつながる", ripple: "波紋が広がる", stars: "星がまたたく", rays: "光の筋が回る",
  };
  // How a slide's parts arrive (deck-wide, or per slide), how items answer the mouse, and how the one
  // emphasized phrase (**語句**) is set off.
  const ENTRANCES = {
    rise: "下から浮かび上がる", fade: "ふわっと現れる", blur: "ぼかしから現れる", pop: "はじけるように現れる",
    slide: "左から滑り込む", zoom: "手前から迫ってくる", flip: "めくれるように現れる", wipe: "幕が開くように現れる", drop: "弾んで落ちてくる",
  };
  const HOVERS = { lift: "項目が浮き上がる", focus: "乗せた項目以外を薄くする", tilt: "3Dで傾く", glow: "光で縁取る", zoom: "少し大きくなる" };
  const EMPHASES = { marker: "マーカーを引く", underline: "下線を引く", circle: "手書きの丸で囲む", box: "枠で囲む", glow: "光らせる", none: "色だけ（飾りなし）" };
  const TRANSITIONS = {
    fade: "フェード", slide: "スライド（横に流れる）", zoom: "ズーム", morph: "モーフ（見出しがつながって動く）",
    wipe: "ワイプ（色の帯が横切る）", circle: "サークル（クリックした所から広がる）", push: "押し上げ（下から押し出す）",
    flip: "めくる（カードのように裏返る）", dive: "奥へ（飛び込むように進む）", blinds: "ブラインド（縞が開く）", curtain: "幕（中央から左右に開く）", none: "なし",
  };
  const PHOTO_MOTIONS = { zoom: "ゆっくりズーム", pan: "ゆっくり横に流す", float: "ふわふわ浮かぶ", parallax: "マウスに合わせて奥行き", reveal: "幕が開くように現れる", drift: "斜めにゆっくり流れる", tilt: "ゆっくり傾く（3D）" };

  const pick = (catalog, ...values) => values.find((value) => value === "none" || Object.hasOwn(catalog, value));

  /** The kinetic style a slide's big text plays with, or null. */
  function kineticOf(slide, type, motion = {}) {
    const own = slide?.kinetic;
    if (own === "none") return null;
    if (KINETIC[own]) return own;
    if (!STILL.has(type) || motion.kinetic === "none") return null;
    return KINETIC[motion.kinetic] ? motion.kinetic : "mask";
  }

  /** The moving graphic behind a slide, or null. The deck's choice covers the cover, chapters, statements and the close. */
  function backdropOf(slide, type, motion = {}) {
    const own = slide?.backdrop;
    if (own === "none") return null;
    if (BACKDROPS[own]) return own;
    return BACKDROPS[motion.backdrop] && STILL.has(type) && type !== "hero" ? motion.backdrop : null;
  }

  // ---------------------------------------------------------------- DOM helpers

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    applyAttrs(el, attrs);
    appendAll(el, children);
    return el;
  }

  function s(tag, attrs, ...children) {
    const el = document.createElementNS(SVGNS, tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      if (key === "style" && typeof value === "object") { for (const [k, v] of Object.entries(value)) if (v != null) el.style.setProperty(k, String(v)); continue; }
      el.setAttribute(key, String(value));
    }
    appendAll(el, children);
    return el;
  }

  function applyAttrs(el, attrs) {
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      if (key === "class") el.className = Array.isArray(value) ? value.filter(Boolean).join(" ") : value;
      else if (key === "style" && typeof value === "object") { for (const [k, v] of Object.entries(value)) if (v != null) el.style.setProperty(k, String(v)); }
      else if (key === "dataset") Object.assign(el.dataset, value);
      else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
      else if (value === true) el.setAttribute(key, "");
      else el.setAttribute(key, String(value));
    }
  }

  function appendAll(el, children) {
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false || child === "") continue;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
  }

  const str = (value) => (value == null ? "" : String(value));
  const strip = (value) => str(value).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[\[([^\]]+)\]\]/g, "$1").trim();
  const arr = (value) => (Array.isArray(value) ? value : []);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  /** "**語句**" becomes the one emphasized phrase (accent color, marker). */
  function rich(text) {
    const frag = document.createDocumentFragment();
    const source = str(text).replace(/\[\[([^\]]+)\]\]/g, "**$1**");
    let last = 0;
    for (const match of source.matchAll(/\*\*([^*]+)\*\*/g)) {
      if (match.index > last) frag.append(source.slice(last, match.index));
      frag.append(h("em", { class: "hs-em" }, match[1]));
      last = match.index + match[0].length;
    }
    if (last < source.length) frag.append(source.slice(last));
    return frag;
  }

  /** Editable text: `field` is the JSON path the editor writes back to (items[0].title). */
  function t(tag, cls, text, field, { emphasis = false, box = false } = {}) {
    const el = h(tag, { class: ["hs-t", cls], "data-field": field || null, "data-box": box ? "" : null });
    if (emphasis) el.append(rich(text));
    else el.textContent = strip(text);
    return el;
  }

  /** "工程名：説明" → ["工程名", "説明"] */
  function splitLabel(text) {
    const value = strip(text);
    const match = value.match(/^([^：:]{1,28})[：:]\s*([\s\S]+)$/);
    return match ? [match[1].trim(), match[2].trim()] : [value, ""];
  }

  function icon(name, cls = "") {
    const entry = ICONS[name];
    if (!entry) return null;
    const el = s("svg", { class: ["hs-icon", cls].filter(Boolean).join(" "), viewBox: "0 0 24 24", "aria-hidden": "true" });
    el.innerHTML = entry.svg;
    // Every stroke measures 1 so the icon can draw itself line by line (see "draw" in engine.css).
    for (const shape of el.children) shape.setAttribute("pathLength", "1");
    return el;
  }

  const pad2 = (n) => String(n).padStart(2, "0");

  /** "120h/月" → { pre: "", num: "120", unit: "h/月" }; text without a figure comes back as { num: null }. */
  function numParts(value) {
    const text = strip(value);
    const match = text.match(/^(\D{0,3}?)([+\-−▲▼]?\s?\d[\d,]*(?:\.\d+)?)(.{0,12})$/);
    if (!match) return { pre: "", num: null, unit: "", text };
    return { pre: match[1], num: match[2].replace(/\s/g, ""), unit: match[3].trim(), text };
  }

  function figure(value, cls = "hs-value") {
    const parts = numParts(value);
    if (parts.num == null) return h("div", { class: cls }, h("span", { class: "hs-num" }, parts.text || "—"));
    return h("div", { class: cls },
      parts.pre ? h("span", { class: "hs-unit" }, parts.pre) : null,
      h("span", { class: "hs-num hs-count", "data-count": parts.num }, parts.num),
      parts.unit ? h("span", { class: "hs-unit" }, parts.unit) : null);
  }

  function item(key, attrs, ...children) {
    const el = h(attrs?.tag || "div", { ...attrs, tag: null, "data-item": key });
    el.classList.add("hs-item");
    appendAll(el, children);
    return el;
  }

  // ---------------------------------------------------------------- media

  function youtubeId(url) {
    const match = str(url).match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,15})/);
    return match ? match[1] : null;
  }

  /** The photo or video a slide shows: uploaded media first, then a built-in photo. */
  function mediaOf(slide, ctx) {
    const media = slide.media && typeof slide.media === "object" ? slide.media : null;
    const motion = Object.hasOwn(PHOTO_MOTIONS, slide.photoMotion ?? "") ? slide.photoMotion : "none";
    if (media?.src) {
      const yt = youtubeId(media.src);
      const kind = yt ? "youtube"
        : media.kind === "lottie" || /^data:application\/json/.test(media.src) || /\.json(\?|#|$)/i.test(media.src) ? "lottie"
          : media.kind === "video" || /^data:video\//.test(media.src) || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(media.src) ? "video" : "image";
      // Lottie animations usually sit on a transparent square: show all of it unless asked to fill.
      const fit = media.fit === "contain" || (kind === "lottie" && media.fit !== "cover") ? "contain" : "cover";
      return { kind, src: media.src, yt, motion: kind === "youtube" || kind === "lottie" ? "none" : motion, fit, autoplay: media.autoplay !== false, loop: media.loop !== false, muted: media.muted !== false, placement: media.placement || null, name: media.name || "" };
    }
    if (typeof slide.customImage === "string" && slide.customImage.startsWith("data:image/")) return { kind: "image", src: slide.customImage, motion, fit: "cover", placement: slide.imagePlacement || null };
    if (slide.visualAsset && PHOTOS[slide.visualAsset]) return { kind: "image", src: `asset:${slide.visualAsset}`, motion, fit: "cover", placement: null };
    return null;
  }

  function resolveSrc(src, ctx) {
    if (!src) return "";
    if (src.startsWith("asset:")) {
      const file = PHOTOS[src.slice(6)]?.[0];
      if (!file) return "";
      return ctx.assetMap?.[file] || `${ctx.assetBase ?? "/assets/"}${file}`;
    }
    if (src.startsWith("idb:")) return ctx.mediaUrls?.[src] || "";
    return src;
  }

  function mediaEl(desc, ctx, cls = "") {
    const box = h("div", { class: ["hs-media", cls, desc.fit === "contain" ? "fit-contain" : "", ctx.live ? "hs-lean" : ""], "data-motion": desc.motion !== "none" ? desc.motion : null, "data-kind": desc.kind });
    const url = resolveSrc(desc.src, ctx);
    if (desc.kind === "youtube") {
      // YouTube refuses to play inside a file opened from disk (no page address to report): link out instead.
      if (ctx.live && root.location?.protocol === "file:") {
        box.append(h("a", { class: "hs-yt-link", href: `https://www.youtube.com/watch?v=${desc.yt}`, target: "_blank", rel: "noopener" },
          h("img", { src: `https://i.ytimg.com/vi/${desc.yt}/hqdefault.jpg`, alt: "", draggable: "false" }), h("span", { class: "hs-play-badge" }, icon("play"))));
        return box;
      }
      if (ctx.live) {
        // YouTube only plays for a page that says where it is (error 153 otherwise). The studio keeps its
        // address to itself (Referrer-Policy: same-origin), so the player alone is told the site, not the page.
        const origin = /^https?:$/.test(root.location?.protocol ?? "") ? root.location.origin : "";
        const params = new URLSearchParams({ autoplay: "0", mute: desc.muted ? "1" : "0", playsinline: "1", rel: "0", modestbranding: "1", enablejsapi: "1", ...(origin ? { origin } : {}), ...(desc.loop ? { loop: "1", playlist: desc.yt } : {}) });
        box.append(h("iframe", { src: `https://www.youtube-nocookie.com/embed/${desc.yt}?${params}`, title: desc.name || "動画", allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: true, loading: "lazy", referrerpolicy: "strict-origin-when-cross-origin", "data-autoplay": desc.autoplay ? "" : null }));
      } else {
        box.append(h("img", { src: `https://i.ytimg.com/vi/${desc.yt}/hqdefault.jpg`, alt: "", draggable: "false" }), h("span", { class: "hs-play-badge" }, icon("play")));
      }
      return box;
    }
    if (desc.kind === "lottie") {
      // Played by motion.js (mountLottie); thumbnails show a badge instead of loading the animation.
      box.classList.add("hs-lottie");
      if (url && ctx.mode !== "thumb") {
        box.append(h("div", { class: "hs-lottie-host", "data-src": url, "data-fit": desc.fit, "data-loop": desc.loop ? "" : null, "data-autoplay": desc.autoplay ? "" : null }));
      } else {
        box.append(h("span", { class: "hs-lottie-badge" }, icon("sparkles"), h("span", {}, desc.name ? strip(desc.name).replace(/\.json$/i, "").slice(0, 24) : "アニメーション")));
      }
      return box;
    }
    if (desc.kind === "video") {
      if (!url) { box.append(h("span", { class: "hs-play-badge" }, icon("video"))); return box; }
      const video = h("video", { src: url, playsinline: true, muted: true, preload: ctx.live ? "auto" : "metadata", loop: desc.loop ? true : null, "data-autoplay": desc.autoplay ? "" : null, "data-muted": desc.muted ? "" : null, controls: ctx.live && !desc.autoplay ? true : null });
      video.muted = true;
      box.append(video);
      if (!ctx.live) box.append(h("span", { class: "hs-play-badge" }, icon("play")));
      return box;
    }
    if (url) box.append(h("img", { src: url, alt: "", draggable: "false", decoding: "async" }));
    return box;
  }

  // ---------------------------------------------------------------- charts (SVG, drawn in slide pixels)

  const TIME_LABEL = /(\d+\s*(月|年|期|週|日|Q)|FY|^Q\d|上期|下期|年度|月度)/;

  function niceMax(value) {
    if (value <= 0) return 1;
    const exp = 10 ** Math.floor(Math.log10(value));
    for (const step of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (step * exp >= value) return step * exp;
    return 10 * exp;
  }

  const fmt = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return str(value);
    return Math.abs(n) >= 1000 ? n.toLocaleString("ja-JP") : String(Math.round(n * 100) / 100);
  };

  function pathLength(points) {
    let len = 0;
    for (let i = 1; i < points.length; i += 1) len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    return Math.ceil(len) + 2;
  }

  const SERIES = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)", "var(--c2)", "var(--c3)"];

  /** Normalize the studio's chart data (items / series / barData) into labels + series. */
  function chartModel(spec) {
    const type = spec?.chartType || "bar";
    const data = spec?.data || {};
    if (type === "stacked-bar" || type === "100-stacked-bar") {
      const rows = arr(data.barData);
      const names = arr(data.legendLabels);
      const width = Math.max(names.length, ...rows.map((row) => arr(row.values).length), 1);
      return { type, labels: rows.map((row) => strip(row.label)), series: Array.from({ length: width }, (_, si) => ({ name: strip(names[si] ?? `系列${si + 1}`), values: rows.map((row) => Number(arr(row.values)[si]) || 0) })) };
    }
    if (arr(data.series).length) {
      return { type: type === "line" ? "multi-line" : type, labels: arr(data.xAxisLabels).map(strip), series: arr(data.series).map((serie, i) => ({ name: strip(serie.label ?? serie.id ?? `系列${i + 1}`), values: arr(serie.values).map((v) => Number(v) || 0) })) };
    }
    const items = arr(data.items);
    const labels = items.map((it) => strip(it.label));
    if (type === "combo" && items.some((it) => it.barValue != null)) {
      return { type: "combo", labels, series: [{ name: "棒", values: items.map((it) => Number(it.barValue ?? it.value) || 0) }, { name: "線", values: items.map((it) => Number(it.value) || 0) }] };
    }
    return { type: type === "combo" ? "bar" : type, labels, series: [{ name: strip(data.title || ""), values: items.map((it) => Number(it.value ?? it.barValue) || 0) }] };
  }

  function chart(spec, { w = 900, h: ht = 560, key = "image" } = {}) {
    const wrap = h("div", { class: "hs-chart-wrap", style: { display: "flex", "flex-direction": "column", flex: "1", "min-height": "0", "min-width": "0" } });
    // Charts the audience works with are HTML, so their bars can move between states.
    if (spec?.chartType === "rank") { wrap.append(rankChart(spec, key)); return wrap; }
    if (spec?.chartType === "shift") { wrap.append(shiftChart(spec, key)); return wrap; }
    const model = chartModel(spec);
    const legendNames = model.type === "donut" ? model.labels : model.series.length > 1 ? model.series.map((serie) => serie.name) : [];
    if (legendNames.length > 1 && model.type !== "donut") {
      wrap.append(h("div", { class: "hs-legend" }, legendNames.map((name, i) => h("span", { style: { "--c": SERIES[i % SERIES.length] } }, h("i"), name))));
    }
    const holder = h("div", { class: "hs-chart", "data-field": key });
    const svg = s("svg", { viewBox: `0 0 ${w} ${ht}`, preserveAspectRatio: "xMidYMid meet", role: "img", "aria-label": strip(spec?.data?.title || "グラフ") });
    const draw = { bar: barChart, combo: barChart, line: lineChart, "multi-line": lineChart, donut: donutChart, "stacked-bar": stackedChart, "100-stacked-bar": stackedChart }[model.type] || barChart;
    draw(svg, model, w, ht);
    holder.append(svg);
    wrap.append(holder);
    return wrap;
  }

  function markTip(el, text, i) {
    el.setAttribute("class", `${el.getAttribute("class") || ""} hs-mark`.trim());
    el.setAttribute("data-tip", text);
    el.style.setProperty("--i", String(i));
    return el;
  }

  function barChart(svg, model, w, h) {
    const values = model.series[0]?.values || [];
    const labels = model.labels;
    const n = Math.max(1, values.length);
    const longLabels = labels.some((label) => label.length > 7) || n > 9;
    const timeSeries = labels.some((label) => TIME_LABEL.test(label));
    const hot = timeSeries ? n - 1 : values.indexOf(Math.max(...values));
    if (longLabels) {
      // Horizontal bars: names on the left, values at the bar ends.
      const labelW = Math.min(w * 0.36, Math.max(...labels.map((label) => label.length), 2) * 26 + 24);
      const plotW = w - labelW - 130;
      const slot = h / n;
      const barH = Math.min(46, slot * 0.58);
      const max = Math.max(...values, 0) || 1;
      labels.forEach((label, i) => {
        const y = slot * i + (slot - barH) / 2;
        const bw = (Math.max(0, values[i]) / max) * plotW;
        svg.append(s("text", { x: labelW - 20, y: y + barH / 2 + 8, "text-anchor": "end" }, label.length > 14 ? `${label.slice(0, 13)}…` : label));
        svg.append(markTip(s("rect", { class: `hs-bar h${i === hot ? " is-hot" : ""}`, x: labelW, y, width: Math.max(2, bw), height: barH, rx: 8, fill: i === hot ? "var(--accent)" : "var(--c-muted)" }), `${label}：${fmt(values[i])}`, i));
        svg.append(s("text", { class: `hs-val${i === hot ? " hot" : ""}`, x: labelW + bw + 16, y: y + barH / 2 + 9 }, fmt(values[i])));
      });
      return;
    }
    const top = 56;
    const bottom = 64;
    const plotH = h - top - bottom;
    const combo = model.type === "combo" && model.series[1];
    const all = combo ? [...values, ...model.series[1].values] : values;
    const max = niceMax(Math.max(...all, 0) * 1.05);
    const slot = w / n;
    const bw = Math.min(110, slot * 0.54);
    const y0 = top + plotH;
    svg.append(s("line", { class: "hs-axisline", x1: 0, x2: w, y1: y0, y2: y0 }));
    values.forEach((value, i) => {
      const x = slot * i + (slot - bw) / 2;
      const bh = (Math.max(0, value) / max) * plotH;
      const isHot = i === hot && !combo;
      svg.append(markTip(s("path", { class: `hs-bar${isHot ? " is-hot" : ""}`, d: roundTop(x, y0 - bh, bw, bh, 10), fill: combo ? "var(--c-muted)" : isHot ? "var(--accent)" : "var(--c-muted)" }), `${labels[i]}：${fmt(value)}`, i));
      if (!combo) svg.append(s("text", { class: `hs-val${isHot ? " hot" : ""}`, x: x + bw / 2, y: y0 - bh - 16, "text-anchor": "middle" }, fmt(value)));
      svg.append(s("text", { x: x + bw / 2, y: y0 + 40, "text-anchor": "middle" }, labels[i]));
    });
    if (combo) {
      const line = model.series[1].values;
      const pts = line.map((value, i) => [slot * i + slot / 2, y0 - (Math.max(0, value) / max) * plotH]);
      const len = pathLength(pts);
      svg.append(s("polyline", { class: "hs-draw", points: pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: "var(--accent)", "stroke-width": 5, "stroke-linejoin": "round", "stroke-linecap": "round", style: { "--len": len } }));
      pts.forEach(([x, y], i) => {
        svg.append(markTip(s("circle", { cx: x, cy: y, r: 9, fill: "var(--accent)", stroke: "var(--bg)", "stroke-width": 4 }), `${labels[i]}：${fmt(line[i])}`, i));
        if (i === pts.length - 1) svg.append(s("text", { class: "hs-val hot", x, y: y - 22, "text-anchor": "middle" }, fmt(line[i])));
      });
    }
  }

  function roundTop(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h);
    if (h <= 0.5) return `M${x},${y} h${w}`;
    return `M${x},${y + h} V${y + radius} Q${x},${y} ${x + radius},${y} H${x + w - radius} Q${x + w},${y} ${x + w},${y + radius} V${y + h} Z`;
  }

  function lineChart(svg, model, w, h) {
    const labels = model.labels.length ? model.labels : (model.series[0]?.values || []).map((_, i) => String(i + 1));
    const series = model.series.filter((serie) => serie.values.length);
    const many = series.length > 1;
    const direct = many && series.length <= 4;
    const right = direct ? Math.min(300, w * 0.26) : 36;
    const left = 76;
    const top = 40;
    const bottom = 64;
    const all = series.flatMap((serie) => serie.values);
    const rawMax = Math.max(...all, 0);
    const rawMin = Math.min(...all, 0);
    // Lines do not need a zero baseline: when every value is far from zero, zoom into the range.
    const minAll = Math.min(...all);
    let lo = rawMin < 0 ? rawMin : minAll > rawMax * 0.45 ? Math.floor((minAll - (rawMax - minAll) * 0.4) / niceStep(rawMax - minAll)) * niceStep(rawMax - minAll) : 0;
    lo = Math.max(lo, rawMin < 0 ? rawMin : 0);
    const hi = lo + niceMax((rawMax - lo) * 1.08 || 1);
    const plotW = w - left - right;
    const plotH = h - top - bottom;
    const n = Math.max(1, labels.length);
    const xOf = (i) => left + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
    const yOf = (v) => top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
    for (let k = 0; k <= 4; k += 1) {
      const v = lo + ((hi - lo) * k) / 4;
      const y = yOf(v);
      svg.append(s("line", { class: k === 0 ? "hs-axisline" : "hs-grid", x1: left, x2: left + plotW, y1: y, y2: y }));
      svg.append(s("text", { class: "hs-tick", x: left - 14, y: y + 7, "text-anchor": "end" }, fmt(v)));
    }
    const step = Math.ceil(n / 8);
    labels.forEach((label, i) => { if (i % step === 0 || i === n - 1) svg.append(s("text", { x: xOf(i), y: top + plotH + 42, "text-anchor": "middle" }, label.length > 8 ? `${label.slice(0, 7)}…` : label)); });
    series.forEach((serie, si) => {
      const color = many ? SERIES[si % SERIES.length] : "var(--accent)";
      const pts = serie.values.map((v, i) => [xOf(i), yOf(v)]);
      if (!many) {
        const area = `M${pts[0][0]},${yOf(lo)} ${pts.map((p) => `L${p[0]},${p[1]}`).join(" ")} L${pts.at(-1)[0]},${yOf(lo)} Z`;
        svg.append(s("path", { d: area, fill: color, "fill-opacity": 0.1 }));
      }
      svg.append(s("polyline", { class: "hs-draw", points: pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: color, "stroke-width": si === 0 ? 5 : 3.5, "stroke-linejoin": "round", "stroke-linecap": "round", style: { "--len": pathLength(pts), "--i": si } }));
      const hotIndex = serie.values.length - 1;
      pts.forEach(([x, y], i) => {
        const end = i === hotIndex;
        svg.append(markTip(s("circle", { cx: x, cy: y, r: end ? 11 : 7, fill: color, stroke: "var(--bg)", "stroke-width": 4 }), `${many ? `${serie.name} ` : ""}${labels[i] ?? ""}：${fmt(serie.values[i])}`, i));
        if (!many && (end || serie.values[i] === Math.max(...serie.values))) svg.append(s("text", { class: `hs-val${end ? " hot" : ""}`, x, y: y - 24, "text-anchor": "middle" }, fmt(serie.values[i])));
      });
      if (direct) {
        const [x, y] = pts.at(-1);
        svg.append(s("text", { x: x + 22, y: y + 8, style: { "font-weight": si === 0 ? 800 : 600, fill: "var(--ink)" } }, `${serie.name}  `, s("tspan", { class: "hs-val" }, fmt(serie.values.at(-1)))));
      }
    });
  }

  function niceStep(range) {
    const raw = (range || 1) / 4;
    const exp = 10 ** Math.floor(Math.log10(raw));
    for (const step of [1, 2, 2.5, 5, 10]) if (step * exp >= raw) return step * exp;
    return 10 * exp;
  }

  function donutChart(svg, model, w, h) {
    const values = (model.series[0]?.values || []).map((v) => Math.max(0, v));
    const labels = model.labels;
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const r = Math.min(h * 0.38, w * 0.24);
    const cx = r + 60;
    const cy = h / 2;
    const stroke = r * 0.42;
    const circ = 2 * Math.PI * r;
    let start = -90;
    values.forEach((value, i) => {
      const len = (value / total) * circ;
      const gap = values.length > 1 ? 4 : 0;
      svg.append(markTip(s("circle", { class: "hs-arc", cx, cy, r, fill: "none", stroke: SERIES[i % SERIES.length], "stroke-width": stroke, "stroke-dasharray": `${Math.max(0, len - gap)} ${circ}`, transform: `rotate(${start} ${cx} ${cy})`, style: { "--len": Math.max(0, len - gap), "--i": i } }), `${labels[i]}：${fmt(value)}（${Math.round((value / total) * 100)}%）`, i));
      start += (value / total) * 360;
    });
    const top = values.indexOf(Math.max(...values));
    svg.append(s("text", { class: "hs-val", x: cx, y: cy + 10, "text-anchor": "middle", style: { "font-size": "64px" } }, `${Math.round((values[top] / total) * 100)}%`));
    svg.append(s("text", { x: cx, y: cy + 52, "text-anchor": "middle", class: "hs-tick" }, labels[top] ?? ""));
    const lx = cx + r + stroke / 2 + 70;
    const rowH = Math.min(72, (h - 40) / Math.max(1, labels.length));
    const y0 = cy - (rowH * labels.length) / 2 + rowH / 2;
    labels.forEach((label, i) => {
      const y = y0 + rowH * i;
      svg.append(s("rect", { x: lx, y: y - 12, width: 24, height: 24, rx: 6, fill: SERIES[i % SERIES.length] }));
      svg.append(s("text", { x: lx + 40, y: y + 9 }, label.length > 12 ? `${label.slice(0, 11)}…` : label));
      svg.append(s("text", { class: "hs-val", x: w - 10, y: y + 9, "text-anchor": "end" }, `${Math.round((values[i] / total) * 100)}%`));
    });
  }

  function stackedChart(svg, model, w, h) {
    const percent = model.type === "100-stacked-bar";
    const labels = model.labels;
    const n = Math.max(1, labels.length);
    const totals = labels.map((_, i) => model.series.reduce((sum, serie) => sum + Math.max(0, serie.values[i] || 0), 0));
    const max = percent ? 100 : niceMax(Math.max(...totals, 0) * 1.08);
    const top = 50;
    const bottom = 64;
    const plotH = h - top - bottom;
    const slot = w / n;
    const bw = Math.min(120, slot * 0.56);
    const y0 = top + plotH;
    svg.append(s("line", { class: "hs-axisline", x1: 0, x2: w, y1: y0, y2: y0 }));
    labels.forEach((label, i) => {
      const x = slot * i + (slot - bw) / 2;
      let base = 0;
      model.series.forEach((serie, si) => {
        let value = Math.max(0, serie.values[i] || 0);
        if (percent) value = totals[i] ? (value / totals[i]) * 100 : 0;
        const y1 = y0 - ((base + value) / max) * plotH;
        const y2 = y0 - (base / max) * plotH;
        const hh = Math.max(0, y2 - y1 - 3);
        svg.append(markTip(s("rect", { class: "hs-bar", x, y: y1, width: bw, height: hh, rx: si === model.series.length - 1 ? 8 : 2, fill: SERIES[si % SERIES.length] }), `${label} ${serie.name}：${fmt(serie.values[i])}${percent ? `（${Math.round(value)}%）` : ""}`, i));
        if (hh > 40 && bw > 60) svg.append(s("text", { x: x + bw / 2, y: y1 + hh / 2 + 8, "text-anchor": "middle", style: { fill: "#fff", "font-weight": 700, "font-size": "20px" } }, percent ? `${Math.round(value)}%` : fmt(serie.values[i])));
        base += value;
      });
      if (!percent) svg.append(s("text", { class: "hs-val", x: x + bw / 2, y: y0 - (totals[i] / max) * plotH - 14, "text-anchor": "middle" }, fmt(totals[i])));
      svg.append(s("text", { x: x + bw / 2, y: y0 + 40, "text-anchor": "middle" }, label.length > 8 ? `${label.slice(0, 7)}…` : label));
    });
  }

  // ---------------------------------------------------------------- charts the audience works with
  // Each page lets the audience check its headline with one action, chosen by what the headline says:
  // a ranking re-sorts when the view changes (切り口), bars move from before to after (差分), a result is
  // recalculated when a condition moves (因果: simulator), measures fill a gap when switched on (不足と打ち手).

  const numberOf = (value) => { const n = Number(value); return value === "" || value == null || !Number.isFinite(n) ? null : n; };
  const inputValue = (input) => numberOf(input.value !== undefined && input.value !== "" ? input.value : input.getAttribute("value")) ?? 0;
  /** Figures with sensible decimals: 1,440 / 12.5 / 0.83 (or exactly `digits`). */
  function fmtNum(value, digits = null) {
    const d = Number.isInteger(digits) ? digits : Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
    return Number(value).toLocaleString("ja-JP", { maximumFractionDigits: d, minimumFractionDigits: 0 });
  }

  /** A ranking that re-sorts when the audience switches the view (by year, by measure, by who counts). */
  function rankChart(spec, key) {
    const data = spec?.data || {};
    const views = arr(data.views).filter((view) => arr(view?.items).length).slice(0, 4);
    const labels = [...new Set(views.flatMap((view) => arr(view.items).map((it) => strip(it?.label))).filter(Boolean))].slice(0, 12);
    const hot = strip(data.highlight || "");
    const box = h("div", { class: ["hs-rank", hot && labels.includes(hot) ? "has-hot" : ""], "data-field": key, "data-unit": strip(data.unit || ""), style: { "--n": Math.max(1, labels.length) } },
      views.length > 1 ? h("div", { class: "hs-rank-views hs-control", role: "tablist", "aria-label": "切り口" },
        views.map((view, i) => h("button", { type: "button", role: "tab", "data-view": String(i), "aria-selected": String(i === 0) }, strip(view.label) || `切り口${i + 1}`))) : null,
      h("div", { class: "hs-rank-rows" }, labels.map((label) => {
        const values = {};
        views.forEach((view, vi) => {
          const n = numberOf(arr(view.items).find((it) => strip(it?.label) === label)?.value);
          if (n != null) values[`data-v${vi}`] = String(n);
        });
        return h("div", { class: ["hs-rank-row", "hs-mark", label === hot ? "is-hot" : ""], "data-label": label, ...values },
          h("span", { class: "hs-rank-no" }), h("span", { class: "hs-rank-label" }, label),
          h("span", { class: "hs-rank-track" }, h("i", { class: "hs-rank-bar" })), h("span", { class: "hs-rank-val" }));
      })));
    rankShow(box, 0);
    return box;
  }

  /** Show view `vi` of a ranking: rows move to their new places, bars change length, items without a value go last. */
  function rankShow(box, vi) {
    if (!box) return;
    const rows = [...box.querySelectorAll(".hs-rank-row")];
    const unit = box.dataset.unit || "";
    const valueOf = (row) => numberOf(row.getAttribute(`data-v${vi}`));
    const max = Math.max(...rows.map((row) => Math.abs(valueOf(row) ?? 0)), 0) || 1;
    const sorted = [...rows].sort((a, b) => (valueOf(b) ?? -Infinity) - (valueOf(a) ?? -Infinity));
    sorted.forEach((row, rank) => {
      const value = valueOf(row);
      const text = value == null ? "データなし" : `${fmt(value)}${unit}`;
      row.style.setProperty("--r", String(rank));
      row.classList.toggle("is-top", rank === 0 && value != null);
      row.classList.toggle("is-empty", value == null);
      row.querySelector(".hs-rank-no").textContent = value == null ? "—" : String(rank + 1);
      row.querySelector(".hs-rank-bar").style.width = `${value == null ? 0 : Math.max(0.8, (Math.max(0, value) / max) * 100)}%`;
      row.querySelector(".hs-rank-val").textContent = text;
      row.dataset.tip = `${row.dataset.label}：${text}${value == null ? "" : `（${rank + 1}位）`}`;
    });
    for (const tab of box.querySelectorAll("[data-view]")) tab.setAttribute("aria-selected", String(Number(tab.dataset.view) === vi));
    box.dataset.view = String(vi);
  }

  /** Before → after: each bar moves from its old length to the new one; the old length stays as a dashed outline. */
  function shiftChart(spec, key) {
    const data = spec?.data || {};
    const unit = strip(data.unit || "");
    const pairs = arr(data.items).filter((it) => strip(it?.label)).slice(0, 8)
      .map((it) => ({ label: strip(it.label), before: numberOf(it.before) ?? 0, after: numberOf(it.value) ?? 0 }));
    const max = niceMax(Math.max(...pairs.flatMap((p) => [p.before, p.after]), 0) * 1.02);
    const deltas = pairs.map((p) => p.after - p.before);
    const biggest = Math.max(...deltas.map(Math.abs), 0);
    const pct = (v) => `${(Math.max(0, v) / max) * 100}%`;
    const signed = (d) => `${d > 0 ? "+" : d < 0 ? "−" : "±"}${fmt(Math.abs(d))}`;
    return h("div", { class: "hs-shift", "data-field": key },
      h("div", { class: "hs-legend hs-shift-legend" },
        h("span", {}, h("i", { class: "ghost" }), strip(data.beforeLabel) || "前"),
        h("span", {}, h("i"), strip(data.afterLabel) || "後")),
      h("div", { class: "hs-shift-rows" }, pairs.map((p, i) => h("div", {
        class: ["hs-shift-row", "hs-mark", biggest > 0 && Math.abs(deltas[i]) === biggest ? "is-hot" : ""], style: { "--i": i },
        "data-tip": `${p.label}：${fmt(p.before)} → ${fmt(p.after)}${unit}（${signed(deltas[i])}${unit}）`,
      },
      h("span", { class: "hs-shift-label" }, p.label),
      h("span", { class: "hs-shift-track" },
        h("i", { class: "hs-shift-ghost", style: { width: pct(p.before) } }),
        h("i", { class: "hs-shift-bar", style: { "--from": pct(p.before), "--to": pct(p.after) } })),
      h("span", { class: "hs-shift-nums" }, h("span", { class: "hs-shift-after" }, `${fmt(p.after)}${unit}`), h("span", { class: "hs-shift-delta" }, signed(deltas[i])))))));
  }

  // Simulator formulas: numbers, the conditions a, b, c (in order), + − × ÷ and parentheses. They are parsed
  // here, never evaluated as code (exported files forbid eval, and the formula comes from the deck).
  const FORMULA_OPS = { "+": "+", "-": "-", "−": "-", "*": "*", "×": "*", "/": "/", "÷": "/", "(": "(", ")": ")" };
  function formulaTokens(formula) {
    const text = str(formula).normalize("NFKC").toLowerCase();
    const tokens = [];
    for (let i = 0; i < text.length;) {
      const ch = text[i];
      if (/\s/.test(ch)) { i += 1; continue; }
      const num = /^\d+(?:\.\d+)?/.exec(text.slice(i));
      if (num) { tokens.push({ kind: "num", value: Number(num[0]) }); i += num[0].length; continue; }
      if (/[a-c]/.test(ch)) { tokens.push({ kind: "var", name: ch }); i += 1; continue; }
      const op = FORMULA_OPS[ch];
      if (!op) return null;
      tokens.push({ kind: op === "(" || op === ")" ? op : "op", op });
      i += 1;
    }
    return tokens;
  }

  /** The value of a formula for { a, b, c }, or NaN when it cannot be read. */
  function evalFormula(formula, vars = {}) {
    const tokens = formulaTokens(formula);
    if (!tokens?.length) return NaN;
    let i = 0;
    const isOp = (...ops) => tokens[i]?.kind === "op" && ops.includes(tokens[i].op);
    const atom = () => {
      const tok = tokens[i++];
      if (tok?.kind === "num") return tok.value;
      if (tok?.kind === "var") { if (!Number.isFinite(vars[tok.name])) throw new Error("var"); return vars[tok.name]; }
      if (tok?.kind === "(") { const v = sum(); if (tokens[i++]?.kind !== ")") throw new Error(")"); return v; }
      throw new Error("token");
    };
    const unary = () => { if (isOp("-")) { i += 1; return -unary(); } if (isOp("+")) { i += 1; return unary(); } return atom(); };
    const product = () => { let v = unary(); while (isOp("*", "/")) { const op = tokens[i++].op; const r = unary(); v = op === "*" ? v * r : v / r; } return v; };
    const sum = () => { let v = product(); while (isOp("+", "-")) { const op = tokens[i++].op; const r = product(); v = op === "+" ? v + r : v - r; } return v; };
    try {
      const value = sum();
      return i === tokens.length && Number.isFinite(value) ? value : NaN;
    } catch { return NaN; }
  }

  /** "a × b ÷ 100" shown with the conditions' names. */
  function formulaView(formula, inputs, result) {
    const tokens = formulaTokens(formula);
    if (!tokens?.length || !Number.isFinite(evalFormula(formula, { a: 1, b: 1, c: 1 }))) return h("span", { class: "hs-sim-eq bad" }, "式を読み取れません（a・b・c と + − × ÷ で書きます）");
    const line = h("span", { class: "hs-sim-eq" }, h("span", { class: "hs-sim-eq-result" }, result), " ＝ ");
    const symbol = { "+": "＋", "-": "−", "*": "×", "/": "÷" };
    for (const tok of tokens) {
      if (tok.kind === "var") line.append(h("span", { class: "hs-sim-chip" }, strip(inputs["abc".indexOf(tok.name)]?.label) || tok.name.toUpperCase()));
      else if (tok.kind === "num") line.append(h("span", { class: "hs-sim-k" }, fmt(tok.value)));
      else line.append(h("span", { class: "hs-sim-op" }, tok.kind === "op" ? ` ${symbol[tok.op]} ` : tok.kind));
    }
    return line;
  }

  /** Recalculate a simulator from its sliders (the engine draws the first state; motion.js calls this on input). */
  function simUpdate(scope) {
    const box = scope?.classList?.contains("hs-sim") ? scope : scope?.querySelector?.(".hs-sim");
    if (!box) return NaN;
    const vars = {};
    for (const range of box.querySelectorAll("input[data-sim]")) {
      const i = Number(range.dataset.sim);
      const value = inputValue(range);
      vars["abc"[i]] = value;
      const min = numberOf(range.getAttribute("min")) ?? 0;
      const max = numberOf(range.getAttribute("max")) ?? 1;
      range.style.setProperty("--fill", `${clamp(((value - min) / (max - min || 1)) * 100, 0, 100)}%`);
      const shown = box.querySelector(`[data-sim-show="${i}"]`);
      if (shown) shown.textContent = fmtNum(value);
    }
    const result = evalFormula(box.dataset.formula, vars);
    const digits = numberOf(box.dataset.digits);
    const unit = box.dataset.unit || "";
    const scale = Number(box.dataset.scale) || 1;
    const ok = Number.isFinite(result);
    box.querySelector(".hs-sim-out").textContent = ok ? fmtNum(result, digits) : "—";
    const bar = box.querySelector(".hs-sim-barrow.now .hs-sim-bar");
    if (bar) bar.style.width = `${ok ? Math.min(100, (Math.abs(result) / scale) * 100) : 0}%`;
    const barValue = box.querySelector(".hs-sim-barrow.now .hs-sim-barval");
    if (barValue) barValue.textContent = ok ? `${fmtNum(result, digits)}${unit}` : "—";
    const compare = numberOf(box.dataset.compare);
    const diff = box.querySelector(".hs-sim-diff");
    if (diff && compare != null && ok) {
      const d = result - compare;
      const name = box.dataset.compareLabel || "比べる値";
      diff.textContent = d >= 0 ? `${name}を ${fmtNum(d, digits)}${unit} 上回る` : `${name}まで あと ${fmtNum(-d, digits)}${unit}`;
      box.classList.toggle("is-met", d >= 0);
    }
    box.dataset.result = ok ? String(result) : "";
    return result;
  }

  /** Redraw a gap slide from which measures are on: the bar fills, and what is still missing (or the surplus) is shown. */
  function gapUpdate(scope) {
    const box = scope?.classList?.contains("hs-gap") ? scope : scope?.querySelector?.(".hs-gap");
    if (!box) return;
    const scale = Number(box.dataset.scale) || 1;
    const target = Number(box.dataset.target) || 0;
    const unit = box.dataset.unit || "";
    const on = new Set([...box.querySelectorAll("[data-measure].is-on")].map((el) => el.dataset.measure));
    let reach = Number(box.dataset.current) || 0;
    for (const seg of box.querySelectorAll("[data-seg]")) {
      const value = on.has(seg.dataset.seg) ? Number(seg.dataset.value) || 0 : 0;
      seg.style.width = `${(value / scale) * 100}%`;
      seg.classList.toggle("is-on", value > 0);
      reach += value;
    }
    for (const el of box.querySelectorAll("[data-measure]")) el.setAttribute("aria-checked", String(el.classList.contains("is-on")));
    const missing = Math.max(0, target - reach);
    const round = (v) => fmt(Math.round(v * 100) / 100);
    box.querySelector(".hs-gap-rest").style.width = `${(missing / scale) * 100}%`;
    box.classList.toggle("is-met", missing <= 0);
    box.querySelector(".hs-gap-state").textContent = missing > 0 ? "目標まで あと" : reach > target ? "目標を上回る" : "目標に到達";
    box.querySelector(".hs-gap-num").textContent = missing > 0 ? round(missing) : `+${round(reach - target)}`;
    box.querySelector(".hs-gap-reach").textContent = `現状と打ち手で ${round(reach)}${unit}`;
  }

  // ---------------------------------------------------------------- slide chrome

  function header(slide, ctx) {
    return h("header", { class: "hs-head" },
      ctx.eyebrow ? h("div", { class: "hs-eyebrow" }, ctx.eyebrow) : null,
      t("h2", "hs-title", slide.title, "title", { emphasis: true }),
      slide.takeaway ? t("p", "hs-takeaway", slide.takeaway, "takeaway", { emphasis: true }) : null);
  }

  function body(cls, ...children) {
    return h("div", { class: ["hs-body", cls] }, ...children);
  }

  const cols = (n, max = 4) => clamp(n, 1, max);

  // ---------------------------------------------------------------- layouts
  // Each returns the slide body; `ctx.photo` is the slide's media element when it has one.

  const LAYOUTS = {
    content(slide, ctx) {
      const points = arr(slide.points).map(strip).filter(Boolean);
      const photo = ctx.media && !ctx.media.placement ? mediaEl(ctx.media, ctx) : null;
      let list;
      if (slide.twoColumn || (Array.isArray(slide.columns) && slide.columns.length === 2)) {
        const source = Array.isArray(slide.columns) && slide.columns.length === 2 ? slide.columns.flat() : points;
        list = h("ul", { class: "hs-bullets two" }, source.map((text, i) => item(`points[${i}]`, { tag: "li" }, t("span", "", text, `points[${i}]`))));
      } else {
        const pairs = points.map(splitLabel);
        const numbered = points.length >= 2 && points.length <= 5 && pairs.every(([label, desc]) => desc && label.length <= 22);
        list = numbered
          ? h("ol", { class: "hs-rows" }, pairs.map(([label, desc], i) => item(`points[${i}]`, { tag: "li", class: "hs-row" },
            h("span", { class: "hs-index" }, pad2(i + 1)),
            h("div", { class: "hs-row-main" }, h("span", { class: "hs-row-title" }, label), h("span", { class: "hs-row-desc" }, desc)))))
          : h("ul", { class: "hs-bullets" }, points.map((text, i) => item(`points[${i}]`, { tag: "li" }, t("span", "", text, `points[${i}]`))));
        if (numbered) list.querySelectorAll(".hs-row").forEach((row, i) => { row.dataset.field = `points[${i}]`; row.classList.add("hs-t-row"); });
      }
      if (!photo) return body("hs-content", h("div", { style: { display: "flex", "flex-direction": "column", "justify-content": "center", flex: "1" } }, list));
      return body("hs-content", h("div", { class: "hs-split" }, h("div", { class: "hs-col" }, list), photo));
    },

    agenda(slide) {
      const items = arr(slide.items).map(splitLabel);
      const two = items.length > 5;
      return body("", h("ol", { class: ["hs-agenda", two ? "two" : ""], style: { "grid-template-columns": two ? "1fr 1fr" : "1fr" } },
        items.map(([title, desc], i) => item(`items[${i}]`, { tag: "li" },
          h("span", { class: "hs-index" }, pad2(i + 1)),
          h("div", {}, t("div", "hs-card-title", title, desc ? null : `items[${i}]`), desc ? h("div", { class: "hs-card-desc" }, desc) : null)))));
    },

    compare(slide) {
      const side = (key, title, items, strong, tag) => h("div", { class: ["hs-panel", strong ? "strong" : ""] },
        h("div", { class: "hs-panel-head" }, t("span", "", title, key === "leftItems" ? "leftTitle" : "rightTitle"), tag ? h("span", { class: "hs-tag" }, tag) : null),
        h("ul", {}, arr(items).map((text, i) => item(`${key}[${i}]`, { tag: "li" }, icon(strong ? "check" : "arrowRight"), t("span", "", text, `${key}[${i}]`)))));
      return body("", h("div", { class: "hs-vs" }, side("leftItems", slide.leftTitle, slide.leftItems, false), side("rightItems", slide.rightTitle, slide.rightItems, true)));
    },

    beforeAfter(slide) {
      const left = arr(slide.leftItems).map(splitLabel);
      const right = arr(slide.rightItems).map(splitLabel);
      const aligned = left.length >= 2 && left.length === right.length && left.every(([label, desc], i) => desc && right[i][1] && label === right[i][0]);
      if (aligned) {
        const grid = h("div", { class: "hs-aspects" },
          h("div", { class: "hs-cell head" }, "観点"), t("div", "hs-cell head", slide.leftTitle || "Before", "leftTitle"), h("div", { class: "hs-cell head" }), t("div", "hs-cell head after", slide.rightTitle || "After", "rightTitle"));
        left.forEach(([label, desc], i) => {
          grid.append(item(`leftItems[${i}]`, { class: "hs-cell aspect" }, label), item(`leftItems[${i}]`, { class: "hs-cell before" }, desc),
            item(`leftItems[${i}]`, { class: "hs-cell arrow" }, icon("arrowRight")), item(`leftItems[${i}]`, { class: "hs-cell after" }, right[i][1]));
        });
        return body("", grid);
      }
      const side = (key, title, items, strong) => h("div", { class: ["hs-panel", strong ? "strong" : ""] },
        h("div", { class: "hs-panel-head" }, t("span", "", title, key === "leftItems" ? "leftTitle" : "rightTitle"), h("span", { class: "hs-tag" }, strong ? "AFTER" : "BEFORE")),
        h("ul", {}, arr(items).map((text, i) => item(`${key}[${i}]`, { tag: "li" }, icon(strong ? "check" : "chartDown"), t("span", "", text, `${key}[${i}]`)))));
      return body("", h("div", { class: "hs-vs arrow" }, side("leftItems", slide.leftTitle, slide.leftItems, false), h("div", { class: "hs-vs-arrow", "data-step": "" }, h("span", {}, icon("arrowRight"))), side("rightItems", slide.rightTitle, slide.rightItems, true)));
    },

    process(slide) {
      const steps = arr(slide.steps).map(splitLabel);
      return body("", h("div", { class: "hs-steps" }, h("div", { class: "hs-rail" }, h("i")),
        steps.map(([title, desc], i) => item(`steps[${i}]`, { class: ["hs-step", i === steps.length - 1 ? "goal" : ""] },
          h("div", { class: "hs-dot" }, pad2(i + 1)),
          t("div", "hs-card-title", title, desc ? null : `steps[${i}]`),
          desc ? h("div", { class: "hs-card-desc" }, desc) : null))));
    },

    processList(slide) {
      const steps = arr(slide.steps).map(splitLabel);
      const rows = steps.length > 4 ? Math.ceil(steps.length / 2) : steps.length;
      return body("", h("ol", { class: "hs-vsteps", style: { "--rows": rows } },
        steps.map(([title, desc], i) => item(`steps[${i}]`, { tag: "li", class: ["hs-vstep", i === steps.length - 1 || (i + 1) % rows === 0 ? "last" : ""] },
          h("span", { class: "hs-dot" }, i + 1),
          h("div", {}, t("div", "hs-card-title", title, desc ? null : `steps[${i}]`), desc ? h("div", { class: "hs-card-desc" }, desc) : null)))));
    },

    flowChart(slide) {
      return body("", h("div", { class: "hs-flows" }, arr(slide.flows).map((flow, fi) => h("div", { class: "hs-flow" },
        arr(flow.steps).map((step, i, list) => item(`flows[${fi}]`, { class: ["hs-flow-box", i === list.length - 1 ? "last" : ""], "data-box": "" }, t("span", "", step, `flows[${fi}].steps[${i}]`)))))));
    },

    timeline(slide) {
      const miles = arr(slide.milestones);
      const nextAt = miles.findIndex((m) => m.state === "next");
      const doneUntil = nextAt >= 0 ? nextAt : miles.reduce((last, m, i) => (m.state === "done" ? i : last), -1);
      const progress = miles.length ? ((doneUntil + 0.5) / miles.length) * 100 : 0;
      return body("", h("div", { class: "hs-timeline" }, h("div", { class: "hs-axis" }, h("i", { style: { width: `${clamp(progress, 0, 100)}%` } })),
        miles.map((mile, i) => item(`milestones[${i}]`, { class: ["hs-mile", mile.state || "todo"] },
          t("div", "hs-date", mile.date, `milestones[${i}].date`),
          h("span", { class: "hs-mdot" }),
          h("div", {}, t("div", "hs-mlabel", mile.label, `milestones[${i}].label`),
            mile.state === "done" ? h("span", { class: "hs-mstate" }, "完了") : mile.state === "next" ? h("span", { class: "hs-mstate" }, "次に実施") : null)))));
    },

    diagram(slide) {
      return body("", h("div", { class: "hs-lanes" }, arr(slide.lanes).map((lane, li) => item(`lanes[${li}]`, { class: "hs-lane" },
        t("div", "hs-lane-name", lane.title, `lanes[${li}].title`),
        h("div", { class: "hs-lane-items" }, arr(lane.items).flatMap((text, i, list) => [
          t("span", "hs-chip", text, `lanes[${li}].items[${i}]`),
          i < list.length - 1 ? h("span", { class: "hs-chip-arrow" }, icon("arrowRight")) : null,
        ]))))));
    },

    cycle(slide) {
      const items = arr(slide.items);
      const n = Math.max(3, items.length);
      const size = 640;
      const c = size / 2;
      const r = 248;
      const svg = s("svg", { viewBox: `0 0 ${size} ${size}` });
      const gap = 7;
      items.forEach((it, i) => {
        const a0 = -90 + (360 / n) * i + gap / 2;
        const a1 = -90 + (360 / n) * (i + 1) - gap / 2;
        const p = (deg, rad = r) => [c + rad * Math.cos((deg * Math.PI) / 180), c + rad * Math.sin((deg * Math.PI) / 180)];
        const [x0, y0] = p(a0);
        const [x1, y1] = p(a1);
        const seg = s("path", { class: "hs-seg", d: `M${x0},${y0} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1}`, fill: "none", stroke: `color-mix(in srgb, var(--accent) ${Math.round(100 - (i * 55) / n)}%, var(--surface2))`, "stroke-width": 84, pathLength: 1, "data-item": `items[${i}]` });
        seg.classList.add("hs-item");
        svg.append(seg);
        const [ax, ay] = p(a1 + gap / 2);
        const dir = a1 + gap / 2 + 90;
        svg.append(s("path", { d: "M-16,-22 L14,0 L-16,22 Z", fill: "var(--ink)", opacity: 0.55, transform: `translate(${ax} ${ay}) rotate(${dir})` }));
        const [nx, ny] = p((a0 + a1) / 2);
        svg.append(s("text", { x: nx, y: ny + 12, "text-anchor": "middle", style: { "font-family": "var(--font-num)", "font-weight": 800, "font-size": "34px", fill: i < n / 2 ? "var(--accent-ink)" : "var(--ink)" } }, pad2(i + 1)));
      });
      const ring = h("div", { class: "hs-cycle-ring" }, svg, h("div", { class: "hs-cycle-center" }, t("span", "", slide.centerText || "", "centerText")));
      const legend = h("ol", { class: "hs-cycle-legend" }, items.map((it, i) => item(`items[${i}]`, { tag: "li" },
        h("span", { class: "hs-index" }, pad2(i + 1)),
        h("div", {}, t("div", "hs-card-title", it.label, `items[${i}].label`), it.subLabel ? t("div", "hs-card-desc", it.subLabel, `items[${i}].subLabel`) : null))));
      return body("", h("div", { class: "hs-cycle" }, ring, legend));
    },

    cards(slide, ctx) { return cardsLayout(slide, ctx, "rule"); },
    headerCards(slide, ctx) { return cardsLayout(slide, ctx, "header"); },

    bulletCards(slide) {
      const items = arr(slide.items);
      return body("", h("div", { class: "hs-bcards" }, items.map((it, i) => item(`items[${i}]`, { class: "hs-bcard" },
        h("span", { class: "hs-bubble" }, icon(it.icon) || h("span", { class: "hs-index" }, pad2(i + 1))),
        h("div", {}, t("div", "hs-card-title", it.title, `items[${i}].title`), t("div", "hs-card-desc", it.desc, `items[${i}].desc`))))));
    },

    table(slide) {
      const headers = arr(slide.headers);
      const rows = arr(slide.rows);
      const NUMERIC = /^[\s+\-−▲▼△約]*[¥$]?\d[\d,.]*\s*(%|％|pt|倍|[万億千百]?円|[万千]?人分?|件|店|h|時間|分|秒|日|週|か月|ヶ月|年|回|点|個|台|社|名|g|kg|km|本|枚)?$/;
      const numeric = headers.map((_, ci) => ci > 0 && rows.length && rows.every((row) => NUMERIC.test(strip(row[ci] ?? "")) || /^[—\-–]?$/.test(strip(row[ci] ?? ""))) && rows.some((row) => NUMERIC.test(strip(row[ci] ?? ""))));
      return body("", h("div", { class: "hs-table-wrap" }, h("table", { class: "hs-table" },
        h("thead", {}, h("tr", {}, headers.map((head, ci) => t("th", numeric[ci] ? "num" : "", head, `headers[${ci}]`)))),
        h("tbody", {}, rows.map((row, ri) => item(`rows[${ri}]`, { tag: "tr" }, headers.map((_, ci) => t("td", numeric[ci] ? "num" : "", row[ci] ?? "", `rows[${ri}][${ci}]`))))))));
    },

    quote(slide, ctx) {
      const photo = ctx.media && !ctx.media.placement ? mediaEl(ctx.media, ctx) : null;
      return body("", h("div", { class: ["hs-quote", photo ? "with-photo" : ""] },
        photo,
        h("div", {}, h("span", { class: "hs-quote-mark", "aria-hidden": "true" }, "“"),
          t("p", "hs-quote-text", slide.text, "text", { emphasis: true }),
          slide.author ? t("p", "hs-quote-author", slide.author, "author") : null)));
    },


    kpi(slide) {
      const items = arr(slide.items);
      const one = items.length === 1 ? items[0] : null;
      const status = (it) => (it.status === "good" ? "good" : it.status === "bad" ? "bad" : "");
      const changeEl = (it, i) => (it.change ? h("span", { class: ["hs-pill", status(it)] }, it.status === "good" ? icon("chartUp") : it.status === "bad" ? icon("chartDown") : null, t("span", "", it.change, `items[${i}].change`)) : null);
      if (one) {
        const parts = numParts(one.value);
        const pct = parts.num != null && /^%|％$/.test(parts.unit) && Math.abs(Number(parts.num.replace(/[,−]/g, (m) => (m === "−" ? "-" : "")))) <= 100;
        const side = h("div", { class: "hs-kpi-side" }, t("div", "hs-label", one.label, "items[0].label"), changeEl(one, 0));
        if (pct) {
          const value = Number(parts.num.replace(/,/g, "").replace("−", "-"));
          const r = 250;
          const circ = 2 * Math.PI * r;
          const arc = circ * 0.75;
          const len = arc * clamp(Math.abs(value) / 100, 0, 1);
          const svg = s("svg", { viewBox: "0 0 600 600" },
            s("circle", { cx: 300, cy: 300, r, fill: "none", stroke: "var(--c-muted)", "stroke-width": 44, "stroke-linecap": "round", "stroke-dasharray": `${arc} ${circ}`, transform: "rotate(135 300 300)" }),
            s("circle", { class: "hs-arc", cx: 300, cy: 300, r, fill: "none", stroke: "var(--accent)", "stroke-width": 44, "stroke-linecap": "round", "stroke-dasharray": `${len} ${circ}`, transform: "rotate(135 300 300)", style: { "--len": len } }));
          return body("", item("items[0]", { class: "hs-kpi-hero" },
            h("div", { class: "hs-gauge" }, svg, h("div", { class: "hs-gauge-value" }, figure(one.value))),
            side));
        }
        return body("", item("items[0]", { class: "hs-kpi-hero" }, figure(one.value), side));
      }
      const n = items.length;
      const layout = n === 2 ? { "grid-template-columns": "1.25fr 1fr" } : n === 3 ? { "grid-template-columns": "1.2fr 1fr", "grid-template-rows": "1fr 1fr" } : { "grid-template-columns": "1fr 1fr", "grid-template-rows": "1fr 1fr" };
      return body("", h("div", { class: "hs-kpis", style: layout }, items.map((it, i) => item(`items[${i}]`, { class: ["hs-kpi", i === 0 ? "lead" : ""], style: n === 3 && i === 0 ? { "grid-row": "1 / span 2" } : null },
        t("div", "hs-label", it.label, `items[${i}].label`),
        figure(it.value),
        changeEl(it, i)))));
    },

    dashboard(slide) {
      const items = arr(slide.items);
      const kpis = h("div", { class: "hs-dash-kpis" }, items.map((it, i) => item(`items[${i}]`, { class: "hs-dash-kpi" },
        t("div", "hs-label", it.label, `items[${i}].label`), figure(it.value), it.change ? t("div", "hs-change", it.change, `items[${i}].change`) : null)));
      const spec = slide.image && typeof slide.image === "object" ? slide.image : null;
      const panel = h("div", { class: "hs-chart-panel", "data-step": "" },
        spec?.data?.title ? h("div", { class: "hs-chart-title" }, strip(spec.data.title)) : null,
        spec ? chart(spec, { w: 860, h: 460 }) : h("div", { class: "hs-muted" }, "グラフのデータがありません"));
      return body("", h("div", { class: "hs-dash" }, kpis, panel));
    },

    statsCompare(slide) {
      const stats = arr(slide.stats);
      return body("", h("div", { class: "hs-stats" },
        h("div", { class: "hs-stat-row head" }, h("span"), t("span", "", slide.leftTitle, "leftTitle"), h("span"), t("span", "right", slide.rightTitle, "rightTitle"), h("span")),
        stats.map((st, i) => item(`stats[${i}]`, { class: "hs-stat-row" },
          t("span", "lab", st.label, `stats[${i}].label`),
          h("span", { class: "left" }, figure(st.leftValue, "hs-value")),
          h("span", { class: "arrow" }, icon("arrowRight")),
          h("span", { class: "right" }, figure(st.rightValue, "hs-value")),
          h("span", { class: ["trend", st.trend || ""] }, st.trend === "up" ? icon("chartUp") : st.trend === "down" ? icon("chartDown") : null)))));
    },

    faq(slide) {
      const items = arr(slide.items);
      return body("", h("div", { class: "hs-faq", style: { "grid-template-columns": items.length > 3 ? "1fr 1fr" : "1fr" } }, items.map((it, i) => item(`items[${i}]`, { class: "hs-qa" },
        h("span", { class: "q" }, "Q"), t("div", "hs-card-title", it.q, `items[${i}].q`),
        h("span", { class: "a" }, "A"), t("div", "hs-card-desc", it.a, `items[${i}].a`)))));
    },

    triangle(slide) {
      const items = arr(slide.items).slice(0, 3);
      const spots = [[50, 8], [17, 64], [83, 64]];
      const svg = s("svg", { class: "hs-wipe", viewBox: "0 0 100 100", preserveAspectRatio: "none" },
        s("polygon", { points: "50,8 17,64 83,64", fill: "color-mix(in srgb, var(--accent) 7%, transparent)", stroke: "var(--line2)", "stroke-width": 3, "vector-effect": "non-scaling-stroke", "stroke-dasharray": "10 10" }));
      return body("", h("div", { class: "hs-tri" }, svg, items.map((it, i) => item(`items[${i}]`, { class: "hs-tri-node", style: { left: `${spots[i][0]}%`, top: `${spots[i][1]}%` } },
        h("span", { class: "hs-bubble" }, icon(it.icon) || h("span", { class: "hs-index" }, pad2(i + 1))),
        t("div", "hs-card-title", it.title, `items[${i}].title`),
        it.desc ? t("div", "hs-card-desc", it.desc, `items[${i}].desc`) : null))));
    },

    pyramid(slide) { return stackLayout(slide, "pyramid"); },
    funnel(slide) { return stackLayout(slide, "funnel"); },

    stepUp(slide) {
      const items = arr(slide.items);
      const n = items.length;
      return body("", h("div", { class: "hs-stairs" }, items.map((it, i) => item(`items[${i}]`, { class: ["hs-stair", i === n - 1 ? "last" : ""] },
        t("div", "hs-card-title", it.title, `items[${i}].title`),
        it.desc ? t("div", "hs-card-desc", it.desc, `items[${i}].desc`) : null,
        h("div", { class: "hs-stair-block", style: { "--h": `${Math.round(22 + (48 * (i + 1)) / n)}%`, "--mix": `${Math.round(14 + (46 * i) / n)}%` } }, h("span", { class: "hs-index" }, pad2(i + 1)))))));
    },

    imageText(slide, ctx) {
      const spec = slide.image && typeof slide.image === "object" ? slide.image : null;
      const picture = !spec && typeof slide.image === "string" && slide.image.startsWith("data:image/") ? { kind: "image", src: slide.image, motion: slide.photoMotion || "none", fit: "cover" } : null;
      const media = picture || (!spec && ctx.media && !ctx.media.placement ? ctx.media : null);
      const visual = h("div", { class: "hs-imgtext-visual", "data-step": "" },
        spec?.data?.title ? h("div", { class: "hs-chart-title" }, strip(spec.data.title)) : null,
        spec ? chart(spec, { w: 900, h: 540 }) : media ? mediaEl(media, ctx) : h("div", { class: "hs-media" }),
        slide.imageCaption ? t("div", "hs-media-caption", slide.imageCaption, "imageCaption") : null);
      const points = arr(slide.points).map(strip).filter(Boolean);
      const text = h("div", { class: "hs-imgtext-text" }, h("ol", { class: "hs-points" }, points.map((p, i) => item(`points[${i}]`, { tag: "li" }, h("span", { class: "hs-index" }, pad2(i + 1)), t("span", "", p, `points[${i}]`)))));
      return body("", h("div", { class: ["hs-imgtext", slide.imagePosition === "right" ? "right" : ""] }, visual, text));
    },

    grid2x2(slide) { return quadLayout(slide, "grid"); },
    swot(slide) { return quadLayout(slide, "swot"); },

    matrix(slide) {
      const quad = quadLayout(slide, "matrix").firstChild;
      return body("", h("div", { class: "hs-matrix" },
        h("div", { class: "hs-ylab" }, h("span", { class: "hs-axis-arrow up" }, "↑"), t("span", "", slide.yLabel || "効果", "yLabel"), h("span", { class: "hs-axis-hint" }, "高い")),
        quad,
        h("div", { class: "hs-xlab" }, h("span", { class: "hs-axis-hint" }, "低い"), t("span", "", slide.xLabel || "始めやすさ", "xLabel"), h("span", { class: "hs-axis-hint" }, "高い"), h("span", { class: "hs-axis-arrow" }, "→"))));
    },

    headerTwoColumn(slide) { return columnsLayout(slide, false); },
    headerThreeSummary(slide) { return columnsLayout(slide, true); },

    venn(slide, ctx) {
      const items = arr(slide.items).slice(0, 3);
      const n = items.length;
      // Positions in % of a 900×640 box (left, top, diameter as % of width).
      const spots = n === 2 ? [[7.8, 10.9, 55.6], [36.7, 10.9, 55.6]] : [[26.1, 0, 47.8], [10.6, 32.8, 47.8], [41.7, 32.8, 47.8]];
      const shape = h("div", { class: "hs-venn-shape" }, items.map((it, i) => item(`items[${i}]`, {
        class: "hs-circle",
        style: { left: `${spots[i][0]}%`, top: `${spots[i][1]}%`, width: `${spots[i][2]}%`, "aspect-ratio": "1", background: `color-mix(in srgb, ${SERIES[i]} ${ctx.dark ? 42 : 30}%, transparent)`, "align-items": n === 3 ? (i === 0 ? "flex-start" : "flex-end") : "center", "justify-content": n === 2 ? (i === 0 ? "flex-start" : "flex-end") : "center", "padding-top": n === 3 && i === 0 ? "14%" : null, "padding-bottom": n === 3 && i > 0 ? "14%" : null },
      }, t("span", "", it.title, `items[${i}].title`))));
      const legend = h("ul", { class: "hs-venn-legend" }, items.map((it, i) => item(`items[${i}]`, { tag: "li" },
        h("span", { class: "sw", style: { background: SERIES[i] } }),
        h("div", {}, h("div", { class: "hs-card-title" }, strip(it.title)), it.desc ? t("div", "hs-card-desc", it.desc, `items[${i}].desc`) : null))));
      return body("", h("div", { class: "hs-venn" }, shape, legend));
    },

    gantt(slide) {
      const periods = arr(slide.periods).length ? arr(slide.periods) : ["1", "2", "3", "4"];
      const p = periods.length;
      const grid = h("div", { class: "hs-gantt", style: { "--periods": p } },
        h("div", { class: "hs-gh first" }, "タスク"),
        periods.map((period, i) => t("div", "hs-gh", period, `periods[${i}]`)));
      arr(slide.items).forEach((it, i) => {
        const start = clamp(Number(it.start) || 0, 0, p - 1);
        const span = clamp(Number(it.span) || 1, 1, p - start);
        grid.append(item(`items[${i}]`, { class: "hs-gt" }, t("span", "", it.title, `items[${i}].title`)));
        grid.append(item(`items[${i}]`, { class: "hs-gtrack" }, h("div", { class: "hs-gbar", style: { "--s": start, "--n": span, "--i": i } }, strip(it.desc || ""))));
      });
      // "いま": where today falls on the plan (1.5 = the middle of the second period).
      const now = numberOf(slide.now);
      if (now == null) return body("", grid);
      grid.append(h("div", { class: "hs-gnow", style: { "--at": clamp(now, 0, p) }, "aria-hidden": "true" }, h("span", {}, "いま")));
      // The line spans the chart only, so the chart sits in the middle of the page instead of filling it.
      return body("", h("div", { class: "hs-gantt-center" }, grid));
    },

    orgChart(slide) {
      const items = arr(slide.items);
      const n = Math.max(1, items.length);
      return body("", h("div", { class: "hs-org" },
        slide.root ? h("div", { class: "hs-org-root", "data-step": "" }, t("span", "", slide.root, "root")) : null,
        slide.root ? h("div", { class: "hs-org-stem" }) : null,
        h("div", { class: "hs-org-row", style: { "--edge": `calc(${50 / n}% - ${16 * (n - 1) / n}px)` } }, items.map((it, i) => item(`items[${i}]`, { class: "hs-org-node" },
          icon(it.icon), t("div", "hs-card-title", it.title, `items[${i}].title`), it.desc ? t("div", "hs-card-desc", it.desc, `items[${i}].desc`) : null)))));
    },

    checklist(slide) {
      const items = arr(slide.items);
      return body("", h("div", { class: "hs-checks", style: { "grid-template-columns": items.length > 4 ? "1fr 1fr" : "1fr" } }, items.map((it, i) => item(`items[${i}]`, { class: ["hs-check", it.done ? "done" : ""] },
        h("span", { class: "box" }, icon("check")),
        h("div", {}, t("div", "hs-card-title", it.title, `items[${i}].title`), it.desc ? t("div", "hs-card-desc", it.desc, `items[${i}].desc`) : null)))));
    },

    roadmap(slide) {
      const items = arr(slide.items);
      const n = items.length;
      if (n >= 5) {
        return body("", h("div", { class: "hs-chevrons" }, items.map((it, i) => {
          const [when, what] = splitLabel(it.title);
          return item(`items[${i}]`, { class: ["hs-chevron", i === n - 1 ? "goal" : ""] },
            h("div", { class: "hs-band", style: { "--mix": `${Math.round(12 + (40 * i) / n)}%` } }, what ? when : pad2(i + 1)),
            t("div", "hs-card-title", what || it.title, `items[${i}].title`),
            it.desc ? t("div", "hs-card-desc", it.desc, `items[${i}].desc`) : null);
        })));
      }
      // Rising curve with a milestone per item (acceleration toward the goal).
      const y = (x) => 0.9 - 0.62 * x ** 1.6;
      const pts = [];
      for (let k = 0; k <= 40; k += 1) { const x = k / 40; pts.push([x * 1000, y(x) * 1000]); }
      const svg = s("svg", { class: "hs-road", viewBox: "0 0 1000 1000", preserveAspectRatio: "none" },
        s("path", { d: `M${pts.map((p) => p.join(",")).join(" L")} L1000,1000 L0,1000 Z`, fill: "color-mix(in srgb, var(--accent) 7%, transparent)" }),
        s("polyline", { class: "hs-draw", points: pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: "var(--accent)", "stroke-width": 6, "vector-effect": "non-scaling-stroke", "stroke-linecap": "round", style: { "--len": 1800 } }));
      const nodes = items.map((it, i) => {
        const x = (i + 0.6) / (n + 0.2);
        const [when, what] = splitLabel(it.title);
        const px = x * 100;
        const py = y(x) * 100;
        return [
          h("span", { style: { position: "absolute", left: `${px}%`, top: `${py}%`, width: "30px", height: "30px", margin: "-15px 0 0 -15px", "border-radius": "50%", background: i === n - 1 ? "var(--accent)" : "var(--bg)", "box-shadow": "inset 0 0 0 6px var(--accent)", "z-index": 2 } }),
          h("span", { style: { position: "absolute", left: `${px}%`, top: `calc(${py}% - 120px)`, width: "3px", height: "105px", "margin-left": "-1.5px", background: "var(--line2)" } }),
          item(`items[${i}]`, { class: ["hs-road-node", i === n - 1 ? "goal" : ""], style: { left: `calc(${px}% - 24px)`, bottom: `calc(${100 - py}% + 130px)` } },
            what ? h("div", { class: "hs-when" }, when) : null,
            t("div", "hs-card-title", what || it.title, `items[${i}].title`),
            it.desc ? t("div", "hs-card-desc", it.desc, `items[${i}].desc`) : null),
        ];
      });
      return body("", h("div", { class: "hs-roadmap" }, svg, nodes));
    },

    waterfall(slide) {
      const items = arr(slide.items);
      const w = 1680;
      const hgt = 560;
      const top = 70;
      const bottom = 70;
      let run = 0;
      const bars = items.map((it) => {
        const value = Number(it.value) || 0;
        if (it.total) { const bar = { from: 0, to: value, total: true, value }; run = value; return bar; }
        const bar = { from: run, to: run + value, total: false, value };
        run += value;
        return bar;
      });
      const hi = niceMax(Math.max(...bars.map((b) => Math.max(b.from, b.to)), 0) * 1.08);
      const lo = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
      const plotH = hgt - top - bottom;
      const yOf = (v) => top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
      const n = Math.max(1, bars.length);
      const slot = w / n;
      const bw = Math.min(150, slot * 0.58);
      const moves = bars.filter((b) => !b.total).map((b) => Math.abs(b.value));
      const biggest = Math.max(...moves, 0);
      const svg = s("svg", { viewBox: `0 0 ${w} ${hgt}`, preserveAspectRatio: "xMidYMid meet" });
      svg.append(s("line", { class: "hs-axisline", x1: 0, x2: w, y1: yOf(0), y2: yOf(0), stroke: "var(--line2)", "stroke-width": 2 }));
      bars.forEach((b, i) => {
        const x = slot * i + (slot - bw) / 2;
        const y1 = yOf(Math.max(b.from, b.to));
        const y2 = yOf(Math.min(b.from, b.to));
        const hot = !b.total && Math.abs(b.value) === biggest;
        const fill = b.total ? "var(--ink)" : hot ? "var(--accent)" : b.value >= 0 ? "color-mix(in srgb, var(--accent) 38%, var(--surface2))" : "color-mix(in srgb, var(--bad) 42%, var(--surface2))";
        const g = s("g", { "data-item": `items[${i}]`, class: "hs-item" });
        g.append(markTip(s("rect", { class: "hs-bar", x, y: y1, width: bw, height: Math.max(3, y2 - y1), rx: 8, fill }), `${strip(items[i].label)}：${b.value > 0 && !b.total ? "+" : ""}${fmt(b.value)}${strip(slide.unit || "")}`, i));
        g.append(s("text", { class: `hs-val${hot ? " hot" : ""}`, x: x + bw / 2, y: y1 - 16, "text-anchor": "middle" }, `${!b.total && b.value > 0 ? "+" : ""}${fmt(b.value)}`));
        g.append(s("text", { x: x + bw / 2, y: hgt - bottom + 46, "text-anchor": "middle" }, strip(items[i].label)));
        svg.append(g);
        if (i < bars.length - 1) {
          const level = yOf(b.to);
          svg.append(s("line", { x1: x + bw, x2: x + slot, y1: level, y2: level, stroke: "var(--muted)", "stroke-width": 2, "stroke-dasharray": "6 6" }));
        }
      });
      if (slide.unit) svg.append(s("text", { class: "hs-tick", x: 0, y: 24 }, `単位：${strip(slide.unit)}`));
      return body("", h("div", { class: "hs-wf" }, svg));
    },

    logicTree(slide) {
      const branches = arr(slide.branches);
      const n = Math.max(1, branches.length);
      const svg = s("svg", { class: "hs-wipe", viewBox: "0 0 1000 1000", preserveAspectRatio: "none" });
      const line = (x1, y1, x2, y2, hot) => s("polyline", { points: `${x1},${y1} ${x2},${y1} ${x2},${y2}`, fill: "none", stroke: hot ? "var(--accent)" : "var(--line2)", "stroke-width": hot ? 4 : 3, "vector-effect": "non-scaling-stroke" });
      const nodes = [h("div", { class: "hs-tree-node", style: { left: "0", top: "50%", width: "24%", transform: "translateY(-50%)" }, "data-step": "" }, t("div", "hs-tree-root", slide.root, "root"))];
      branches.forEach((branch, i) => {
        const cy = ((i + 0.5) / n) * 1000;
        svg.append(line(240, 500, 270, 500, branch.highlight), s("polyline", { points: `270,500 270,${cy} 300,${cy}`, fill: "none", stroke: branch.highlight ? "var(--accent)" : "var(--line2)", "stroke-width": branch.highlight ? 4 : 3, "vector-effect": "non-scaling-stroke" }));
        svg.append(s("line", { x1: 560, x2: 600, y1: cy, y2: cy, stroke: branch.highlight ? "var(--accent)" : "var(--line2)", "stroke-width": branch.highlight ? 4 : 3, "vector-effect": "non-scaling-stroke" }));
        nodes.push(item(`branches[${i}]`, { class: "hs-tree-node", style: { left: "30%", width: "26%", top: `${(cy / 10).toFixed(2)}%`, transform: "translateY(-50%)" } },
          t("div", ["hs-tree-branch", branch.highlight ? "hot" : ""].join(" "), branch.title, `branches[${i}].title`)));
        nodes.push(item(`branches[${i}]`, { class: "hs-tree-node", style: { left: "61%", width: "39%", top: `${(cy / 10).toFixed(2)}%`, transform: "translateY(-50%)" } },
          h("ul", { class: ["hs-tree-leaves", branch.highlight ? "hot" : ""] }, arr(branch.items).map((leaf, li) => t("li", "", leaf, `branches[${i}].items[${li}]`)))));
      });
      return body("", h("div", { class: "hs-tree" }, svg, nodes));
    },

    // 因果: move a condition and the result is recalculated, with the formula on screen.
    simulator(slide) {
      const inputs = arr(slide.inputs).slice(0, 3);
      const names = ["a", "b", "c"];
      const unit = strip(slide.resultUnit || "");
      const compare = numberOf(slide.compareValue);
      const valueAt = (pick) => evalFormula(slide.formula, Object.fromEntries(inputs.map((input, i) => [names[i], numberOf(pick(input)) ?? 0])));
      // The bars share one scale: the largest result any combination of the sliders' ends can reach.
      let peak = Math.abs(valueAt((input) => input.value)) || 0;
      for (let mask = 0; mask < 2 ** inputs.length; mask += 1) {
        const v = evalFormula(slide.formula, Object.fromEntries(inputs.map((input, i) => [names[i], numberOf((mask >> i) & 1 ? input.max : input.min) ?? 0])));
        if (Number.isFinite(v)) peak = Math.max(peak, Math.abs(v));
      }
      if (compare != null) peak = Math.max(peak, Math.abs(compare));
      const resultLabel = strip(slide.resultLabel) || "試算の結果";
      const box = h("div", {
        class: "hs-sim", "data-formula": str(slide.formula), "data-scale": String(peak * 1.04 || 1), "data-unit": unit,
        "data-digits": Number.isInteger(slide.digits) ? String(slide.digits) : "", "data-compare": compare == null ? "" : String(compare), "data-compare-label": strip(slide.compareLabel || ""),
      },
      h("div", { class: "hs-sim-main", "data-step": "" },
        h("div", { class: "hs-sim-head" }, t("span", "hs-label", resultLabel, "resultLabel"), h("span", { class: "hs-sim-tag" }, "試算")),
        h("div", { class: "hs-sim-result" }, h("span", { class: "hs-num hs-sim-out" }), unit ? h("span", { class: "hs-unit" }, unit) : null),
        compare != null ? h("div", { class: "hs-sim-diff" }) : null,
        h("div", { class: "hs-sim-bars" },
          h("div", { class: "hs-sim-barrow now" }, h("span", { class: "hs-sim-barname" }, "試算"), h("span", { class: "hs-sim-track" }, h("i", { class: "hs-sim-bar" })), h("span", { class: "hs-sim-barval" })),
          compare != null ? h("div", { class: "hs-sim-barrow compare" }, t("span", "hs-sim-barname", slide.compareLabel || "比べる値", "compareLabel"),
            h("span", { class: "hs-sim-track" }, h("i", { class: "hs-sim-bar", style: { width: `${(Math.abs(compare) / (peak * 1.04 || 1)) * 100}%` } })), h("span", { class: "hs-sim-barval" }, `${fmtNum(compare, numberOf(slide.digits))}${unit}`)) : null),
        h("div", { class: "hs-sim-formula" }, h("span", { class: "hs-sim-formula-label" }, "計算式"), formulaView(slide.formula, inputs, resultLabel))),
      h("div", { class: "hs-sim-panel" }, inputs.map((input, i) => {
        const min = numberOf(input.min) ?? 0;
        const max = numberOf(input.max) ?? Math.max(min + 1, (numberOf(input.value) ?? 0) * 2);
        const value = clamp(numberOf(input.value) ?? min, Math.min(min, max), Math.max(min, max));
        const step = numberOf(input.step) || 10 ** Math.floor(Math.log10(Math.abs(max - min) / 50 || 1));
        const u = strip(input.unit || "");
        return item(`inputs[${i}]`, { class: "hs-sim-input" },
          h("div", { class: "hs-sim-input-head" },
            h("span", { class: "hs-sim-var" }, names[i].toUpperCase()),
            t("span", "hs-card-title", input.label, `inputs[${i}].label`),
            h("span", { class: "hs-sim-input-value" }, h("span", { class: "hs-sim-input-num", "data-sim-show": String(i) }, fmtNum(value)), u ? h("span", {}, u) : null)),
          h("input", { class: "hs-control hs-range", type: "range", min, max, step, value, "data-sim": String(i), "aria-label": strip(input.label) || names[i] }),
          h("div", { class: "hs-sim-range" }, h("span", {}, `${fmtNum(min)}${u}`), h("span", {}, `${fmtNum(max)}${u}`)));
      })));
      simUpdate(box);
      return body("", box);
    },

    // 不足と打ち手: switch the measures on and the gap to the target fills (or stays).
    gap(slide) {
      const unit = strip(slide.unit || "");
      const target = numberOf(slide.target) ?? 0;
      const current = numberOf(slide.current) ?? 0;
      const measures = arr(slide.measures).slice(0, 5);
      const values = measures.map((m) => Math.max(0, numberOf(m?.value) ?? 0));
      const scale = Math.max(target, current + values.reduce((a, b) => a + b, 0), 1) * 1.06;
      const pct = (v) => `${(Math.max(0, v) / scale) * 100}%`;
      const box = h("div", { class: "hs-gap", "data-target": String(target), "data-current": String(current), "data-scale": String(scale), "data-unit": unit },
        h("div", { class: "hs-gap-readout" },
          h("span", { class: "hs-gap-state" }),
          h("span", { class: "hs-gap-amount" }, h("span", { class: "hs-num hs-gap-num" }), unit ? h("span", { class: "hs-unit" }, unit) : null),
          h("span", { class: "hs-gap-reach" })),
        h("div", { class: "hs-gap-chart" },
          h("div", { class: "hs-gap-track" },
            h("span", { class: "hs-gap-seg current", style: { width: pct(current) } }, h("span", { class: "hs-gap-seglabel" }, `${strip(slide.currentLabel) || "現状"} ${fmt(current)}`)),
            measures.map((m, i) => h("span", { class: "hs-gap-seg measure", "data-item": `measures[${i}]`, "data-seg": String(i), "data-value": String(values[i]), style: { "--mix": `${Math.round(100 - (i * 50) / Math.max(1, measures.length))}%` } },
              h("span", { class: "hs-gap-seglabel" }, `+${fmt(values[i])}`))),
            h("span", { class: "hs-gap-rest" }, h("span", { class: "hs-gap-seglabel" }, "不足"))),
          h("div", { class: "hs-gap-target", style: { left: pct(target) } },
            h("span", {}, t("span", "", slide.targetLabel || "目標", "targetLabel"), ` ${fmt(target)}${unit}`))),
        h("div", { class: "hs-gap-measures", style: { "--n": Math.max(1, measures.length) } }, measures.map((m, i) => item(`measures[${i}]`, {
          class: "hs-gap-measure hs-control is-on", role: "switch", "aria-checked": "true", "data-measure": String(i), "data-value": String(values[i]), style: { "--mix": `${Math.round(100 - (i * 50) / Math.max(1, measures.length))}%` },
        },
        h("div", { class: "hs-gap-measure-top" }, h("span", { class: "hs-switch", "aria-hidden": "true" }, h("i")), h("span", { class: "hs-gap-plus" }, `+${fmt(values[i])}${unit}`)),
        t("div", "hs-card-title", m?.title, `measures[${i}].title`),
        m?.desc ? t("div", "hs-card-desc", m.desc, `measures[${i}].desc`) : null))));
      gapUpdate(box);
      return body("", box);
    },

    executiveSummary(slide) {
      const items = arr(slide.items);
      return body("", h("div", { class: "hs-exec" },
        slide.conclusion ? h("div", { class: "hs-exec-conclusion", "data-step": "" }, h("span", { class: "hs-label" }, "結論"), t("span", "", slide.conclusion, "conclusion", { emphasis: true })) : null,
        h("ol", { class: "hs-exec-rows" }, items.map((it, i) => item(`items[${i}]`, { tag: "li" },
          h("span", { class: "hs-index" }, pad2(i + 1)), t("div", "hs-card-title", it.title, `items[${i}].title`), t("div", "hs-card-desc", it.desc, `items[${i}].desc`)))),
        slide.action ? h("div", { class: "hs-exec-action", "data-step": "" }, h("span", { class: "hs-tag" }, icon("arrowRight"), "NEXT"), t("span", "", slide.action, "action", { emphasis: true })) : null));
    },
  };

  function cardsLayout(slide, ctx, style) {
    const items = arr(slide.items).map((it) => (typeof it === "string" ? (([title, desc]) => ({ title, desc }))(splitLabel(it)) : it));
    const n = items.length;
    const count = Number(slide.columns) || (n === 4 ? 2 : n >= 5 ? 3 : n);
    const grid = h("div", { class: "hs-grid", style: { "grid-template-columns": `repeat(${cols(count)}, minmax(0, 1fr))`, gap: style === "header" ? "36px" : count >= 3 ? "56px" : "72px" } });
    items.forEach((it, i) => {
      const titleField = typeof arr(slide.items)[i] === "string" ? `items[${i}]` : `items[${i}].title`;
      if (style === "header") {
        grid.append(item(`items[${i}]`, { class: "hs-hcard" },
          h("div", { class: "hs-hcard-head" }, icon(it.icon), t("div", "hs-card-title", it.title, titleField)),
          it.desc ? t("div", "hs-hcard-body", it.desc, `items[${i}].desc`) : null));
      } else {
        grid.append(item(`items[${i}]`, { class: "hs-card" },
          h("div", { class: "hs-card-mark" }, icon(it.icon) || h("span", { class: "hs-index" }, pad2(i + 1))),
          t("div", "hs-card-title", it.title, titleField),
          it.desc ? t("div", "hs-card-desc", it.desc, typeof arr(slide.items)[i] === "string" ? null : `items[${i}].desc`) : null));
      }
    });
    return body("", grid);
  }

  function quadLayout(slide, kind) {
    const items = arr(slide.items).slice(0, 4);
    const letters = ["S", "W", "O", "T"];
    const names = ["STRENGTHS", "WEAKNESSES", "OPPORTUNITIES", "THREATS"];
    const quad = h("div", { class: ["hs-quad", kind === "swot" ? "hs-swot" : ""] }, items.map((it, i) => item(`items[${i}]`, { class: kind === "matrix" && i === 1 ? "target" : "" },
      kind === "swot" ? h("span", { class: "hs-swot-letter", "aria-hidden": "true" }, letters[i]) : null,
      kind === "swot" ? h("span", { class: "hs-swot-name" }, names[i]) : null,
      kind === "grid" ? h("div", { class: "hs-quad-icon" }, icon(it.icon) || h("span", { class: "hs-index" }, pad2(i + 1))) : null,
      kind === "matrix" && i === 1 ? h("span", { class: "hs-target-tag" }, "狙う領域") : null,
      t("div", "hs-card-title", it.title, `items[${i}].title`),
      it.desc ? t("div", "hs-card-desc", it.desc, `items[${i}].desc`) : null)));
    return body("", quad);
  }

  function columnsLayout(slide, summary) {
    const items = arr(slide.items);
    return body("",
      h("div", { class: "hs-cols" }, items.map((it, i) => item(`items[${i}]`, {},
        icon(it.icon, "hs-col-icon") || h("span", { class: "hs-col-no" }, pad2(i + 1)),
        t("div", "hs-card-title", it.title, `items[${i}].title`),
        it.desc ? t("div", "hs-card-desc", it.desc, `items[${i}].desc`) : null))),
      summary && slide.summary ? h("div", { class: "hs-summary", "data-step": "" }, icon("arrowRight"), t("span", "", slide.summary, "summary", { emphasis: true })) : null);
  }

  function stackLayout(slide, kind) {
    const levels = arr(slide.levels);
    const n = Math.max(1, levels.length);
    const layerH = clamp(Math.floor(560 / n) - 10, 84, 150);
    const shape = h("div", { class: "hs-stack-shape" }, levels.map((lv, i) => {
      // pyramid: narrow on top; funnel: wide on top.
      const topW = kind === "pyramid" ? 12 + (88 * i) / n : 100 - (70 * i) / n;
      const botW = kind === "pyramid" ? 12 + (88 * (i + 1)) / n : 100 - (70 * (i + 1)) / n;
      const inset = (w) => (100 - w) / 2;
      const strength = kind === "pyramid" ? 100 - (55 * i) / n : 45 + (55 * i) / n;
      return item(`levels[${i}]`, { class: "hs-layer", "data-box": "", style: {
        "--h": `${layerH}px`, height: `${layerH}px`,
        "clip-path": `polygon(${inset(topW)}% 0, ${100 - inset(topW)}% 0, ${100 - inset(botW)}% 100%, ${inset(botW)}% 100%)`,
        background: `color-mix(in srgb, var(--accent) ${Math.round(strength)}%, var(--surface2))`,
        color: strength > 55 ? "var(--accent-ink)" : "var(--ink)",
      } }, t("span", "", lv.title, `levels[${i}].title`));
    }));
    const desc = h("ol", { class: "hs-stack-desc" }, levels.map((lv, i) => item(`levels[${i}]`, { tag: "li", style: { "--h": `${layerH}px` } },
      h("div", { class: "hs-card-title" }, strip(lv.title)),
      lv.description ? t("div", "hs-card-desc", lv.description, `levels[${i}].description`) : null)));
    return body("", h("div", { class: "hs-stack" }, shape, desc));
  }

  // ---------------------------------------------------------------- full-bleed layouts (cover, section, closing, hero)

  function coverArt(theme, dark) {
    const svg = s("svg", { width: 1100, height: 1080, viewBox: "0 0 1100 1080", style: { right: "-120px", top: "0" }, "aria-hidden": "true" });
    const accent = "var(--accent)";
    const accent2 = "var(--accent2)";
    if (theme === "mono") {
      svg.append(s("rect", { x: 620, y: 0, width: 360, height: 1080, fill: "var(--ink)" }), s("rect", { x: 620, y: 700, width: 360, height: 120, fill: accent }));
    } else if (theme === "editorial") {
      svg.append(s("line", { x1: 700, x2: 700, y1: 140, y2: 940, stroke: "var(--ink)", "stroke-width": 1.5 }), s("circle", { cx: 700, cy: 540, r: 12, fill: accent }));
    } else if (theme === "kinari") {
      svg.append(s("circle", { class: "hs-spin", cx: 640, cy: 520, r: 300, fill: "none", stroke: accent, "stroke-width": 26, "stroke-dasharray": "1500 400", "stroke-linecap": "round", opacity: 0.85 }), s("circle", { cx: 820, cy: 330, r: 30, fill: accent2 }));
    } else if (theme === "forest") {
      svg.append(s("path", { d: "M540,240 C720,120 960,200 980,420 C1000,640 820,820 620,780 C420,740 360,360 540,240 Z", fill: accent, opacity: 0.16 }),
        s("path", { d: "M640,420 C760,360 900,420 900,560 C900,720 760,780 660,720 C560,660 540,470 640,420 Z", fill: accent2, opacity: 0.4 }));
    } else if (theme === "sunset") {
      svg.append(s("circle", { cx: 700, cy: 560, r: 330, fill: accent, opacity: 0.9 }), s("circle", { cx: 520, cy: 360, r: 120, fill: accent2 }), s("circle", { cx: 900, cy: 860, r: 60, fill: "var(--ink)", opacity: 0.85 }));
    } else if (theme === "midnight" || theme === "aurora") {
      const ring = (r, o, dash) => s("circle", { class: "hs-spin", cx: 680, cy: 540, r, fill: "none", stroke: dark ? "#ffffff" : "var(--ink)", "stroke-opacity": o, "stroke-width": 2, "stroke-dasharray": dash });
      svg.append(s("circle", { cx: 680, cy: 540, r: 150, fill: accent, opacity: 0.9 }), ring(250, 0.35, "4 12"), ring(360, 0.22, "none"), ring(470, 0.14, "2 10"), s("circle", { cx: 680 + 360 * Math.cos(-0.7), cy: 540 + 360 * Math.sin(-0.7), r: 14, fill: accent2 }));
    } else {
      for (let i = 0; i < 6; i += 1) svg.append(s("circle", { cx: 760, cy: 560, r: 120 + i * 78, fill: "none", stroke: accent, "stroke-opacity": 0.5 - i * 0.07, "stroke-width": i === 0 ? 0 : 2 }));
      svg.append(s("circle", { cx: 760, cy: 560, r: 120, fill: accent }), s("circle", { cx: 905, cy: 318, r: 30, fill: accent2 }));
    }
    return h("div", { class: "hs-cover-art" }, svg);
  }

  // ---------------------------------------------------------------- backdrops (moving graphics behind a slide)

  /** A small deterministic random source, so a slide's backdrop looks the same in every copy of it. */
  function seeded(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let x = a;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  const SHAPES = {
    ring: () => s("circle", { cx: 50, cy: 50, r: 34 }),
    tri: () => s("polygon", { points: "50,14 86,80 14,80" }),
    square: () => s("rect", { x: 20, y: 20, width: 60, height: 60, rx: 10 }),
    plus: () => s("path", { d: "M50 16V84M16 50H84" }),
    zig: () => s("polyline", { points: "8,62 29,38 50,62 71,38 92,62" }),
    dots: () => s("g", { class: "fill" }, [20, 50, 80].flatMap((x) => [20, 50, 80].map((y) => s("circle", { cx: x, cy: y, r: 7 })))),
  };

  /** Every piece is placed and timed here; engine.css moves it (and keeps it still in thumbnails and prints). */
  function backdrop(kind, seed) {
    const rnd = seeded(seed);
    const r = (min, max) => min + (max - min) * rnd();
    const px = (n) => `${Math.round(n)}px`;
    const sec = (n) => `${n.toFixed(1)}s`;
    const box = h("div", { class: "hs-bd", "data-bd": kind, "aria-hidden": "true" });
    if (kind === "particles") {
      for (let i = 0; i < 38; i += 1) {
        const soft = rnd() < 0.2;
        const size = soft ? r(28, 70) : r(6, 17);
        box.append(h("i", { class: [soft ? "soft" : "", ["", "", "c2", "c3"][i % 4]], style: {
          left: `${r(-2, 99).toFixed(1)}%`, top: `${r(6, 102).toFixed(1)}%`, width: px(size), height: px(size),
          "--o": (soft ? r(0.1, 0.2) : r(0.22, 0.5)).toFixed(2), "--t": sec(r(11, 24)), "--dl": sec(-r(0, 24)), "--dx": px(r(-90, 90)), "--dy": px(-r(180, 360)),
        } }));
      }
    } else if (kind === "waves") {
      // Periods divide 1920, so sliding a 3840px strip by 1920px loops without a seam.
      const layers = [["a", 960, 62, 190, 0.13, 26], ["b", 640, 44, 250, 0.09, 19], ["c", 1920, 96, 150, 0.07, 36]];
      let crest = "";
      for (const [cls, period, amp, base, opacity, secs] of layers) {
        const pts = [];
        for (let x = 0; x <= 3840; x += 24) pts.push(`${x},${(base + amp * Math.sin((2 * Math.PI * x) / period)).toFixed(1)}`);
        if (cls === "a") crest = pts.join(" L");
        box.append(h("div", { class: `hs-bd-wave ${cls}`, style: { "--o": opacity, "--t": `${secs}s` } },
          s("svg", { viewBox: "0 0 3840 400", preserveAspectRatio: "none" }, s("path", { d: `M0,400 L${pts.join(" L")} L3840,400 Z` }))));
      }
      box.append(h("div", { class: "hs-bd-wave line", style: { "--t": "26s" } }, s("svg", { viewBox: "0 0 3840 400", preserveAspectRatio: "none" }, s("path", { d: `M${crest}` }))));
    } else if (kind === "grid") {
      box.append(h("div", { class: "hs-bd-lines" }), h("b", { class: "hs-bd-scan" }));
      for (let i = 0; i < 10; i += 1) {
        box.append(h("i", { class: ["hs-bd-node", i % 3 === 2 ? "c2" : ""], style: { left: px(96 * Math.round(r(8, 19))), top: px(96 * Math.round(r(1, 10))), "--dl": sec(-r(0, 6)) } }));
      }
    } else if (kind === "orbits") {
      const orbit = h("div", { class: "hs-bd-orbit" });
      const rings = [[300, 116, 17], [470, 186, 27], [660, 262, 41]];
      orbit.append(s("svg", { viewBox: "-720 -320 1440 640", width: 1440, height: 640 },
        rings.map(([rx, ry]) => s("ellipse", { cx: 0, cy: 0, rx, ry })),
        s("circle", { class: "core", cx: 0, cy: 0, r: 46 })));
      rings.forEach(([rx, ry, secs], i) => {
        for (let k = 0; k < (i === 1 ? 2 : 1); k += 1) {
          orbit.append(h("i", { class: ["hs-bd-sat", i === 2 ? "c2" : ""], style: {
            "offset-path": `path("M ${-rx} 0 A ${rx} ${ry} 0 1 0 ${rx} 0 A ${rx} ${ry} 0 1 0 ${-rx} 0 Z")`,
            "--p": `${Math.round(r(0, 100))}%`, "--t": `${secs}s`,
          } }));
        }
      });
      box.append(orbit);
    } else if (kind === "gradient") {
      // Colour gathers top right and along the bottom, away from the headline on the left.
      for (const [cls, x, y, size] of [["a", 58, -30, 1000], ["b", 66, 50, 860], ["c", 22, 78, 760], ["d", -16, -34, 560]]) {
        box.append(h("i", { class: `hs-bd-blob ${cls}`, style: { left: `${x}%`, top: `${y}%`, width: px(size), height: px(size) } }));
      }
    } else if (kind === "lines") {
      const svg = s("svg", { viewBox: "0 0 1920 1080", preserveAspectRatio: "none" });
      for (let i = 0; i < 8; i += 1) {
        const y0 = r(460, 1080);
        const y1 = r(140, 880);
        const d = `M-60,${y0.toFixed(0)} C${r(320, 720).toFixed(0)},${(y0 - r(-160, 280)).toFixed(0)} ${r(1080, 1500).toFixed(0)},${(y1 + r(-220, 220)).toFixed(0)} 1980,${y1.toFixed(0)}`;
        const cls = i % 3 === 0 ? "c2" : "";
        svg.append(s("path", { class: `base ${cls}`, d }),
          s("path", { class: `flow ${cls}`, d, pathLength: 1000, style: { "--s": Math.round(r(0, 1000)), "--t": sec(r(5, 10)), "--dl": sec(-r(0, 10)) } }));
      }
      box.append(svg);
    } else if (kind === "shapes") {
      ["ring", "tri", "square", "plus", "dots", "zig", "ring", "tri", "plus", "square", "zig", "ring"].forEach((shape, i) => {
        // Keep the reading area (left and middle) clear; shapes gather at the right and along the top and bottom.
        let x = 0;
        let y = 0;
        do { x = r(1, 95); y = r(3, 92); } while (x < 64 && y > 12 && y < 86);
        box.append(h("i", { class: ["hs-bd-shape", ["", "c2", "c3"][i % 3]], style: { left: `${x.toFixed(1)}%`, top: `${y.toFixed(1)}%`, "--sz": px(r(48, 96)), "--rot": `${Math.round(r(0, 360))}deg`, "--t": sec(r(6, 11)), "--dl": sec(-r(0, 11)) } },
          s("svg", { viewBox: "0 0 100 100" }, SHAPES[shape]())));
      });
    } else if (kind === "confetti") {
      // Pieces fall from above the slide; `--y` only places them for still pictures (thumbnails, prints).
      for (let i = 0; i < 46; i += 1) {
        box.append(h("i", { class: ["hs-bd-conf", ["strip", "square", "dot"][i % 3], `c${1 + (i % 5)}`], style: {
          left: `${r(0, 99).toFixed(1)}%`, "--y": `${r(-4, 94).toFixed(1)}%`, "--rot": `${Math.round(r(0, 360))}deg`,
          "--spin": `${Math.round(r(360, 1080)) * (rnd() < 0.5 ? -1 : 1)}deg`, "--sway": px(r(-140, 140)), "--t": sec(r(7, 13)), "--dl": sec(-r(0, 13)),
        } }));
      }
    } else if (kind === "network") {
      // Nodes on the right, each tied to its two nearest neighbours; light runs along the ties.
      const nodes = Array.from({ length: 16 }, () => [r(940, 1860), r(90, 990)]);
      const svg = s("svg", { viewBox: "0 0 1920 1080", preserveAspectRatio: "none" });
      const tied = new Set();
      nodes.forEach(([x, y], i) => {
        const near = nodes.map(([x2, y2], j) => [Math.hypot(x - x2, y - y2), j]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]).slice(0, 2);
        for (const [, j] of near) {
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (tied.has(key)) continue;
          tied.add(key);
          const d = `M${x.toFixed(0)},${y.toFixed(0)} L${nodes[j][0].toFixed(0)},${nodes[j][1].toFixed(0)}`;
          svg.append(s("path", { class: "edge", d }), s("path", { class: "pulse", d, pathLength: 100, style: { "--t": sec(r(2.4, 4.8)), "--dl": sec(-r(0, 4.8)) } }));
        }
      });
      nodes.forEach(([x, y], i) => svg.append(s("circle", { class: i % 4 === 0 ? "node hub" : "node", cx: x.toFixed(0), cy: y.toFixed(0), r: i % 4 === 0 ? 13 : 7, style: { "--dl": sec(-r(0, 4)) } })));
      box.append(svg);
    } else if (kind === "ripple") {
      const ripple = h("div", { class: "hs-bd-ripple" });
      for (let i = 0; i < 5; i += 1) ripple.append(h("i", { style: { "--i": i, "--dl": sec(-i * 1.7) } }));
      ripple.append(h("b"));
      box.append(ripple);
    } else if (kind === "stars") {
      for (let i = 0; i < 84; i += 1) {
        const big = rnd() < 0.12;
        box.append(h("i", { class: ["hs-bd-star", big ? "big" : ""], style: { left: `${r(0, 100).toFixed(1)}%`, top: `${r(0, 100).toFixed(1)}%`, "--o": r(0.3, 0.95).toFixed(2), "--t": sec(r(1.8, 5)), "--dl": sec(-r(0, 5)) } }));
      }
      for (let i = 0; i < 2; i += 1) box.append(h("b", { class: "hs-bd-shoot", style: { left: `${r(40, 88).toFixed(1)}%`, top: `${r(2, 28).toFixed(1)}%`, "--dl": sec(i * 4.6 + r(0, 2)) } }));
    } else if (kind === "rays") {
      box.append(h("div", { class: "hs-bd-rays" }));
    }
    return box;
  }

  function renderTitle(slide, ctx, parts) {
    const media = ctx.media && !ctx.media.placement ? ctx.media : null;
    const kicker = strip(ctx.deck?.purpose || "");
    const meta = [ctx.deck?.audience ? `対象：${strip(ctx.deck.audience)}` : "", strip(slide.date || "")].filter(Boolean);
    if (media) parts.root.append(h("div", { class: "hs-cover-photo" }, mediaEl(media, ctx)));
    else if (!ctx.backdrop) parts.decor.append(coverArt(ctx.theme, ctx.dark));
    parts.frame.append(h("div", { class: ["hs-cover", media ? "with-photo" : ""] },
      kicker ? h("div", { class: "hs-cover-kicker hs-enter", style: { "--d": 0 } }, kicker) : null,
      h("h1", { class: "hs-t hs-cover-title hs-enter", style: { "--d": 1 }, "data-field": "title" }, rich(slide.title)),
      slide.subtitle ? h("p", { class: "hs-t hs-cover-sub hs-enter", style: { "--d": 2 }, "data-field": "subtitle" }, strip(slide.subtitle)) : null,
      meta.length ? h("div", { class: "hs-cover-meta hs-enter", style: { "--d": 3 } }, meta.map((text) => h("span", {}, text))) : null));
  }

  function renderSection(slide, ctx, parts) {
    const media = ctx.media && !ctx.media.placement ? ctx.media : null;
    if (media) parts.root.append(h("div", { class: "hs-cover-photo", style: { width: "38%" } }, mediaEl(media, ctx)));
    parts.frame.append(h("div", { class: "hs-section" },
      h("div", { class: "hs-section-no hs-enter", style: { "--d": 0 } }, pad2(slide.sectionNo || ctx.sectionNo || 1)),
      h("h2", { class: "hs-t hs-section-title hs-enter", style: { "--d": 1 }, "data-field": "title" }, rich(slide.title)),
      slide.takeaway ? h("p", { class: "hs-t hs-section-sub hs-enter", style: { "--d": 2 }, "data-field": "takeaway" }, rich(slide.takeaway)) : null));
  }

  function renderClosing(slide, ctx, parts) {
    const media = ctx.media && !ctx.media.placement ? ctx.media : null;
    const message = str(slide.message).trim();
    const actions = message.split(/\n|／|(?<=。)(?=.)/).map((part) => part.trim()).filter(Boolean);
    const many = actions.length >= 2 && actions.length <= 3 && !media;
    if (media) parts.root.append(mediaEl(media, ctx, "hs-closing-photo"));
    else if (!ctx.backdrop) parts.decor.append(coverArt(ctx.theme, ctx.dark));
    const box = h("div", { class: ["hs-closing", media ? "with-photo" : ""] },
      h("div", { class: "hs-closing-title hs-enter", style: { "--d": 0 } }, t("span", "", slide.title || "次のアクション", "title")));
    if (many) {
      box.append(h("ol", { class: "hs-closing-actions" }, actions.map((action, i) => {
        const [title, desc] = splitLabel(action);
        return item(`message[${i}]`, { tag: "li", class: "hs-enter", style: { "--d": i + 1 } }, h("span", { class: "hs-index" }, pad2(i + 1)), h("div", { class: "hs-card-title" }, title), desc ? h("div", { class: "hs-card-desc" }, desc) : null);
      })));
      box.lastChild.dataset.field = "message";
    } else {
      box.append(h("p", { class: "hs-t hs-closing-message hs-enter", style: { "--d": 1 }, "data-field": "message" }, rich(message || "ご清聴ありがとうございました")));
    }
    parts.frame.append(box);
  }

  function renderHero(slide, ctx, parts) {
    const media = ctx.media && !ctx.media.placement ? ctx.media : null;
    const bg = h("div", { class: "hs-hero-media" });
    if (media) bg.append(mediaEl(media, ctx));
    else bg.append(h("div", { class: "hs-media", style: { background: "radial-gradient(1200px 800px at 80% 20%, color-mix(in srgb, var(--accent) 70%, #000), #0b0e16)" } }));
    parts.root.append(bg, h("div", { class: "hs-hero-scrim" }));
    parts.frame.append(h("div", { class: "hs-hero" },
      ctx.eyebrow ? h("div", { class: "hs-eyebrow hs-enter", style: { "--d": 0 } }, ctx.eyebrow) : null,
      h("h2", { class: "hs-t hs-hero-title hs-enter", style: { "--d": 1 }, "data-field": "title" }, rich(slide.title)),
      slide.takeaway ? h("p", { class: "hs-t hs-hero-sub hs-enter", style: { "--d": 2 }, "data-field": "takeaway" }, rich(slide.takeaway)) : null));
  }

  function renderStatement(slide, ctx, parts) {
    const media = ctx.media && !ctx.media.placement ? ctx.media : null;
    if (media) parts.root.append(h("div", { class: "hs-cover-photo", style: { width: "36%" } }, mediaEl(media, ctx)));
    parts.frame.append(h("div", { class: ["hs-statement", media ? "with-photo" : ""] },
      h("div", { class: "hs-eyebrow hs-enter", style: { "--d": 0 } }, t("span", "", slide.title, "title")),
      t("p", "hs-statement-text hs-enter", slide.text, "text", { emphasis: true }),
      slide.takeaway ? t("p", "hs-statement-sub hs-enter", slide.takeaway, "takeaway", { emphasis: true }) : null));
    parts.frame.querySelector(".hs-statement-text").style.setProperty("--d", "1");
    parts.frame.querySelector(".hs-statement-sub")?.style.setProperty("--d", "2");
  }

  const FULL = { title: renderTitle, section: renderSection, closing: renderClosing, hero: renderHero, statement: renderStatement };

  // ---------------------------------------------------------------- story and deep-dive pages

  /**
   * A slide with `drillOf` ("items[1]") is a deep-dive page: it is not part of the story, and opens when
   * that item of the nearest story slide above it is clicked. `order` lists the story slides; `parent`
   * maps a deep-dive page to its slide; `drills` lists each slide's deep-dive pages; `no` is the number
   * the audience sees (a deep-dive page shows its slide's number).
   */
  function storyMap(slides) {
    const order = [];
    const parent = {};
    const drills = {};
    const no = {};
    let last = -1;
    arr(slides).forEach((slide, i) => {
      if (slide?.drillOf && last >= 0) {
        parent[i] = last;
        (drills[last] ||= []).push({ index: i, target: String(slide.drillOf) });
        no[i] = no[last];
      } else {
        order.push(i);
        last = i;
        no[i] = order.length;
      }
    });
    return { order, parent, drills, no };
  }

  // ---------------------------------------------------------------- render

  /**
   * Render one slide.
   * opts: { deck, index, mode: "edit" | "thumb" | "present" | "print", assetBase, assetMap, mediaUrls, fit: { fs, ts } }
   */
  function render(slide, opts = {}) {
    const deck = opts.deck || {};
    const index = opts.index ?? 0;
    const slides = arr(deck.slides);
    const story = storyMap(slides);
    // Numbers count the story only; a deep-dive page carries the number of the slide it belongs to.
    const total = story.order.length || 1;
    const drillParent = slide?.drillOf && index > 0 ? story.parent[index] ?? null : null;
    const pageNo = story.no[index] ?? index + 1;
    const theme = THEME_IDS.has(deck.theme) ? deck.theme : "clarity";
    const meta = THEMES.find((entry) => entry.id === theme);
    const mode = opts.mode || "edit";
    const live = mode === "present";
    const type = LAYOUTS[slide?.type] || FULL[slide?.type] ? slide.type : "content";
    const motion = deck.motion || {};
    const backdropKind = slide ? backdropOf(slide, type, motion) : null;
    const kinetic = slide ? kineticOf(slide, type, motion) : null;
    const ctx = {
      deck, index, total, theme, dark: meta.dark, mode, live,
      assetBase: opts.assetBase, assetMap: opts.assetMap, mediaUrls: opts.mediaUrls,
      media: slide ? mediaOf(slide, opts) : null,
      backdrop: backdropKind,
      eyebrow: "", sectionNo: 1,
    };
    // The nearest chapter above this slide names where the audience is in the story.
    let chapter = null;
    let chapterNo = 0;
    for (let i = 0; i <= index && i < slides.length; i += 1) {
      if (slides[i]?.type === "section") { chapterNo += 1; if (i < index) chapter = slides[i]; }
    }
    ctx.sectionNo = chapterNo || 1;
    ctx.eyebrow = strip(slide?.subhead || (drillParent != null ? `↳ ${strip(slides[drillParent]?.title || slides[drillParent]?.message || "")}` : chapter ? `${pad2(chapter.sectionNo || chapterNo)}  ${strip(chapter.title)}` : ""));

    const build = BUILDS.includes(slide?.animation) && slide.animation !== "auto" ? slide.animation : recommendedBuild(type);
    const root = h("div", {
      class: ["hs-slide", mode === "thumb" || mode === "print" ? "hs-static" : "", mode === "edit" ? "hs-editable" : "", mode === "print" ? "hs-print" : "", live ? "hs-live" : "", motion.numbers !== false ? "hs-numbers" : "", STILL.has(type) ? "hs-stage" : "", drillParent != null ? "hs-drill" : ""],
      "data-theme": theme, "data-type": type, "data-build": build, "data-tone": meta.dark ? "dark" : "light",
      // A slide may choose its own entrance and emphasis; otherwise the deck's apply.
      "data-entrance": pick(ENTRANCES, slide?.entrance, motion.entrance) || "rise",
      "data-hover": pick(HOVERS, motion.hover) || "lift",
      "data-emphasis": pick(EMPHASES, slide?.emphasis, motion.emphasis) || "marker",
      "data-ambient": motion.ambient === false ? "off" : "on",
      "data-draw": motion.draw === false ? "off" : "on",
      "data-kinetic": kinetic, "data-backdrop": backdropKind,
      "data-drill-of": drillParent != null ? String(drillParent) : null,
      role: "img", "aria-label": `${pageNo}枚目${drillParent != null ? "の深掘り" : ""}：${strip(slide?.title || TYPE_LABELS[type] || "")}`,
    });
    if (deck.accent && /^#[0-9a-f]{6}$/i.test(deck.accent)) {
      root.style.setProperty("--accent", deck.accent);
      root.style.setProperty("--c1", deck.accent);
      root.style.setProperty("--accent-soft", `color-mix(in srgb, ${deck.accent} 12%, transparent)`);
      root.style.setProperty("--hl", `color-mix(in srgb, ${deck.accent} 20%, transparent)`);
    }
    const fitValues = opts.fit || {};
    if (fitValues.fs && fitValues.fs < 1) root.style.setProperty("--fs", String(fitValues.fs));
    if (fitValues.ts && fitValues.ts < 1) root.style.setProperty("--ts", String(fitValues.ts));

    const decor = h("div", { class: "hs-decor", "aria-hidden": "true" });
    if (theme === "aurora") decor.append(h("i"), h("i"), h("i"));
    if (backdropKind) decor.append(backdrop(backdropKind, (index + 1) * 7919 + Object.keys(BACKDROPS).indexOf(backdropKind) * 104729));
    const frame = h("div", { class: "hs-frame" });
    const overlay = h("div", { class: "hs-overlay" });
    root.append(decor);
    const parts = { root, decor, frame, overlay };
    if (!slide) {
      frame.append(h("div", { class: "hs-body", style: { "align-items": "center", "justify-content": "center", color: "var(--muted)" } }, "スライドがありません"));
    } else if (FULL[type]) {
      FULL[type](slide, ctx, parts);
    } else {
      frame.append(header(slide, ctx));
      frame.append(LAYOUTS[type](slide, ctx));
      if (theme === "editorial") root.append(h("div", { class: "hs-vlabel", "aria-hidden": "true" }, chapter ? strip(chapter.title) : strip(deck.title || "")));
    }
    root.append(frame);
    // Media the user placed by hand (or media on a layout with no photo slot) floats above the layout.
    const media = ctx.media;
    const slotted = FULL[type] || ["content", "quote", "imageText"].includes(type);
    if (media && (media.placement || (!slotted && (slide.media?.src || slide.customImage)))) {
      const p = media.placement || { x: 0.6, y: 0.3, w: 0.32, h: 0.46 };
      const placed = mediaEl(media, ctx, "hs-placed");
      Object.assign(placed.style, { left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w * 100}%`, height: `${p.h * 100}%` });
      placed.dataset.placed = "";
      overlay.append(placed);
    }
    root.append(overlay);
    if (!["title", "section", "closing"].includes(type)) {
      // Where the figures come from sits at the foot of the page (and in the chart tooltips); otherwise the deck's name.
      const source = strip(slide?.source || "");
      if (source) root.dataset.source = source;
      root.append(h("footer", { class: "hs-foot" },
        source ? h("span", { class: "hs-source", "data-field": "source" }, `出所：${source}`) : h("span", {}, strip(deck.title || "")),
        h("span", { class: "hs-page" }, drillParent != null ? `${pad2(pageNo)} ・ 深掘り` : `${pad2(pageNo)} / ${pad2(total)}`)));
    }
    assignGroups(root, build);
    markDetails(root, slide);
    if (drillParent == null) markDrills(root, story.drills[index]);
    return root;
  }

  /** Build steps: each list item is one step; parts marked data-step follow the items. */
  function assignGroups(root, build) {
    if (build === "none") { root.dataset.steps = "0"; return; }
    const keys = [];
    const byKey = new Map();
    const bodyEl = root.querySelector(".hs-body") || root.querySelector(".hs-frame");
    if (!bodyEl) return;
    for (const el of bodyEl.querySelectorAll("[data-item], [data-step]")) {
      const key = el.dataset.item ?? `step:${keys.length}`;
      if (el.closest("[data-item]") !== el && el.closest("[data-item]")) continue;
      if (!byKey.has(key)) { byKey.set(key, []); keys.push(key); }
      byKey.get(key).push(el);
    }
    if (!keys.length && bodyEl.classList.contains("hs-body")) { keys.push("body"); byKey.set("body", [...bodyEl.children]); }
    const flat = build === "fade";
    keys.forEach((key, g) => {
      for (const el of byKey.get(key)) {
        el.dataset.g = String(flat ? 0 : g);
        el.style.setProperty("--g", String(flat ? 0 : g));
      }
    });
    root.dataset.steps = String(build === "click" || build === "spotlight" ? keys.length : 0);
  }

  /**
   * Items with "click for details" text get a badge and open a card when clicked in a presentation. Details with
   * a breakdown, a source or assumptions open as an evidence panel from the right; "takeaway" puts the evidence
   * for the slide's conclusion on the key message itself.
   */
  function markDetails(root, slide) {
    for (const detail of arr(slide?.details)) {
      if (!detail || !strip(detail.text)) continue;
      const badge = (label) => h("span", { class: "hs-detail-badge", "aria-hidden": "true" }, plusIcon(), h("span", { class: "hs-badge-label" }, label));
      if (detail.target === "takeaway") {
        const line = root.querySelector(".hs-head .hs-takeaway");
        if (!line || line.parentElement.classList.contains("hs-takeaway-row")) continue;
        // The badge sits beside the sentence (not inside it), so the sentence stays editable on the slide.
        const row = h("div", { class: "hs-takeaway-row", "data-detail": "takeaway" });
        line.replaceWith(row);
        row.append(line, badge("根拠"));
        continue;
      }
      const targets = [...root.querySelectorAll(`[data-item="${cssEscape(detail.target)}"]`)];
      if (!targets.length) continue;
      for (const el of targets) el.dataset.detail = detail.target;
      badgeAnchor(targets)?.append(badge(arr(detail.rows).length ? "内訳" : "詳しく"));
    }
  }

  /**
   * Where an item's mark goes. When a shape and a line of text both show the item (pyramids, funnels, Venn
   * diagrams), the mark sits on the text: shapes are clipped to their outline and would cut it off.
   */
  function badgeAnchor(targets) {
    const html = targets.filter((el) => !(el instanceof SVGElement));
    const host = html.find((el) => el.tagName === "LI") || html[0];
    if (!host) return null;
    const anchor = host.tagName === "TR" ? host.cells[host.cells.length - 1] : host;
    if (getComputedStyleSafe(anchor) === "static") anchor.style.position = "relative";
    return anchor;
  }

  /** Items with a deep-dive page get an arrow badge; clicking them in a presentation opens that page. */
  function markDrills(root, drills) {
    for (const drill of arr(drills)) {
      const targets = [...root.querySelectorAll(`[data-item="${cssEscape(drill.target)}"]`)];
      if (!targets.length) continue;
      for (const el of targets) el.dataset.drill = String(drill.index);
      const anchor = badgeAnchor(targets);
      if (!anchor) continue;
      [...anchor.children].find((child) => child.classList?.contains("hs-detail-badge"))?.remove();
      anchor.append(h("span", { class: "hs-drill-badge", "data-drill-to": String(drill.index), title: "クリックで深掘りページへ", "aria-hidden": "true" }, drillIcon(), h("span", { class: "hs-badge-label" }, "深掘り")));
    }
  }

  function drillIcon() {
    const el = s("svg", { class: "hs-icon", viewBox: "0 0 24 24" });
    el.innerHTML = '<path d="M7 17 17 7" pathLength="1"/><path d="M8 7h9v9" pathLength="1"/>';
    return el;
  }

  function plusIcon() {
    const el = s("svg", { class: "hs-icon", viewBox: "0 0 24 24" });
    el.innerHTML = '<path d="M12 5v14" pathLength="1"/><path d="M5 12h14" pathLength="1"/>';
    return el;
  }

  function getComputedStyleSafe(el) {
    // Layout classes that already position their items absolutely keep their position.
    return /hs-(tri-node|road-node|tree-node|circle)/.test(el.className) ? "absolute" : "static";
  }

  const cssEscape = (value) => (root.CSS?.escape ? root.CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&"));

  // ---------------------------------------------------------------- scaling & fitting

  const observed = new WeakSet();
  const resizer = typeof ResizeObserver === "function" ? new ResizeObserver((entries) => {
    for (const entry of entries) scale(entry.target, entry.contentRect.width, entry.contentRect.height);
  }) : null;

  function scale(scaler, width, height) {
    const w = width ?? scaler.clientWidth;
    const hh = height ?? scaler.clientHeight;
    if (!w) return;
    const factor = scaler.classList.contains("hs-contain") ? Math.min(w / W, hh / H) : w / W;
    scaler.style.setProperty("--hs-s", String(factor));
    const slide = scaler.firstElementChild;
    if (slide && scaler.classList.contains("hs-contain")) {
      slide.style.left = `${(w - W * factor) / 2}px`;
      slide.style.top = `${(hh - H * factor) / 2}px`;
    }
  }

  /** Put a rendered slide into a scaled 16:9 box (contain: letterbox inside any box). */
  function mount(slideEl, { contain = false, className = "" } = {}) {
    const scaler = h("div", { class: ["hs-scaler", contain ? "hs-contain" : "", className] });
    if (contain) scaler.style.aspectRatio = "auto";
    scaler.append(slideEl);
    if (resizer && !observed.has(scaler)) { resizer.observe(scaler); observed.add(scaler); }
    requestAnimationFrame(() => scale(scaler));
    return scaler;
  }

  function overflowing(el) {
    return el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2;
  }

  function lineCount(el) {
    const style = getComputedStyle(el);
    const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.3;
    return Math.round(el.getBoundingClientRect().height / (line * currentScale(el)));
  }

  function currentScale(el) {
    const slide = el.closest(".hs-slide");
    const rect = slide?.getBoundingClientRect();
    return rect && rect.width ? rect.width / W : 1;
  }

  /**
   * Shrink text until the slide fits (the slide must be in the document). Returns the scale factors
   * to reuse on every copy of the slide, and what still does not fit.
   */
  function fit(slideEl, { min = 0.7, minTitle = 0.7 } = {}) {
    const issues = [];
    slideEl.querySelectorAll(".hs-overflow").forEach((el) => el.classList.remove("hs-overflow"));
    const bodyEl = slideEl.querySelector(".hs-body");
    const frame = slideEl.querySelector(".hs-frame");
    const boxes = () => [...slideEl.querySelectorAll("[data-box]")];
    const bad = () => (bodyEl && bodyEl.scrollHeight > bodyEl.clientHeight + 2) || (frame && frame.scrollHeight > frame.clientHeight + 2) || boxes().some(overflowing);
    let fs = 1;
    slideEl.style.setProperty("--fs", "1");
    while (bad() && fs > min + 0.001) {
      fs = Math.round((fs - 0.05) * 100) / 100;
      slideEl.style.setProperty("--fs", String(fs));
    }
    const titles = [...slideEl.querySelectorAll(".hs-title, .hs-cover-title, .hs-section-title, .hs-hero-title")];
    let ts = 1;
    slideEl.style.setProperty("--ts", "1");
    const maxLines = (el) => (el.classList.contains("hs-title") ? 2 : 3);
    const titleBad = () => titles.some((el) => lineCount(el) > maxLines(el)) || (frame && frame.scrollHeight > frame.clientHeight + 2);
    while (titleBad() && ts > minTitle + 0.001) {
      ts = Math.round((ts - 0.05) * 100) / 100;
      slideEl.style.setProperty("--ts", String(ts));
    }
    if (bad()) {
      const culprits = boxes().filter(overflowing);
      if (!culprits.length && bodyEl) culprits.push(bodyEl);
      for (const el of culprits) {
        el.classList.add("hs-overflow");
        const field = el.dataset.field || el.querySelector("[data-field]")?.dataset.field || "body";
        issues.push({ kind: "overflow", severity: "error", field, message: el === bodyEl ? "本文が枠に収まりません。項目を減らすか文を短くしてください" : "文字が枠に収まりません。短くしてください" });
      }
    }
    for (const el of titles) {
      if (lineCount(el) > maxLines(el)) {
        el.classList.add("hs-overflow");
        issues.push({ kind: "overflow", severity: "error", field: el.dataset.field || "title", message: `タイトルが${maxLines(el)}行に収まりません。短くしてください` });
      }
    }
    return { fs, ts, issues };
  }

  function fontHref(themeIds) {
    const families = new Set();
    for (const id of themeIds) for (const family of THEMES.find((theme) => theme.id === id)?.fonts ?? []) families.add(family);
    if (!families.size) return "";
    return `https://fonts.googleapis.com/css2?${[...families].map((family) => `family=${family.replace(/ /g, "+")}`).join("&")}&display=swap`;
  }

  /** Chrome does not repaint SVG text when a web font arrives: nudge every chart once fonts settle. */
  function repaintCharts(scope = root.document) {
    for (const svg of scope?.querySelectorAll?.(".hs-slide svg") ?? []) {
      svg.style.display = "none";
      void svg.getBoundingClientRect();
      svg.style.display = "";
    }
  }
  if (root.document?.fonts?.addEventListener) {
    let pending = null;
    root.document.fonts.addEventListener("loadingdone", () => {
      clearTimeout(pending);
      pending = setTimeout(() => repaintCharts(), 60);
    });
  }

  const Engine = root.SlideEngine || {};
  Object.assign(Engine, {
    W, H, THEMES, PHOTOS, TYPE_LABELS, BUILDS, KINETIC, BACKDROPS, ENTRANCES, HOVERS, EMPHASES, TRANSITIONS, PHOTO_MOTIONS, LAYOUT_TYPES: [...Object.keys(FULL), "hero", ...Object.keys(LAYOUTS)].filter((v, i, a) => a.indexOf(v) === i),
    get icons() { return ICONS; },
    setIcons(map) { ICONS = map || {}; },
    render, mount, fit, scale, fontHref, recommendedBuild, kineticOf, backdropOf, repaintCharts, mediaOf, youtubeId, numParts, splitLabel, strip, rich, icon, h, s, cssEscape, storyMap,
    evalFormula, formulaTokens, rankShow, simUpdate, gapUpdate, fmtNum,
  });
  root.SlideEngine = Engine;
})(typeof window !== "undefined" ? window : globalThis);
