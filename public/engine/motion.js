/*
 * HTML Slide Studio — motion runtime and presentation player.
 * Plays a slide's entrance and builds, counts numbers up, grows charts, lifts items on hover, opens
 * "click for details" cards, plays video, and drives a full-screen presentation with a presenter view.
 * Shared by the studio's presenter and exported HTML files (no dependencies).
 */
(function (root) {
  "use strict";
  const E = root.SlideEngine;
  if (!E) throw new Error("engine.js must load before motion.js");
  const { h } = E;

  const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------- numbers

  function formatCount(value, decimals, comma) {
    const fixed = Math.abs(value).toFixed(decimals);
    if (!comma) return fixed;
    const [int, frac] = fixed.split(".");
    return `${Number(int).toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
  }

  /** "1,234.5" counts up from 0 in the same format; the final frame is the original text. */
  function countUp(el, duration = 1100) {
    const target = el.dataset.count;
    if (!target || el.dataset.counting) return;
    const clean = target.replace(/[,\s]/g, "").replace("−", "-").replace(/^[▲+]/, "").replace(/^▼/, "-");
    const value = parseFloat(clean);
    if (!Number.isFinite(value) || value === 0) { el.textContent = target; return; }
    const decimals = (clean.split(".")[1] || "").length;
    const comma = target.includes(",");
    const neg = /^[-−▼]/.test(target) ? target[0] : "";
    const pos = /^[+▲]/.test(target) ? target[0] : "";
    const start = performance.now();
    el.dataset.counting = "1";
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      el.textContent = p >= 1 ? target : `${value < 0 ? neg || "-" : pos}${formatCount(value * eased, decimals, comma)}`;
      if (p < 1 && el.isConnected) requestAnimationFrame(tick);
      else delete el.dataset.counting;
    };
    el.textContent = `${pos}${formatCount(0, decimals, comma)}`;
    requestAnimationFrame(tick);
  }

  function countWithin(scope, delay = 380) {
    const slide = scope.closest?.(".hs-slide") || scope;
    if (!slide.classList.contains("hs-numbers") || reduced()) return;
    const els = [...scope.querySelectorAll(".hs-count")];
    if (!els.length) return;
    for (const el of els) el.textContent = el.dataset.count.replace(/\d/g, "0").replace(/0+(?=[,.]|$)/, "0");
    setTimeout(() => els.forEach((el) => countUp(el)), delay);
  }

  // ---------------------------------------------------------------- kinetic type

  // The big lines of a slide: cover, chapter, hero, statement and closing text, and a titled slide's title.
  const KINETIC_TARGETS = ".hs-cover-title, .hs-section-title, .hs-hero-title, .hs-statement-text, .hs-closing-message, .hs-closing-title, .hs-frame > .hs-head > .hs-title";
  // Characters that may not start a line ride with the unit before; opening brackets ride with the unit after.
  const NO_START = /^[、。，．,.)）」』】〕〉》！？!?:：;；ー〜…‥・ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ々ゝゞ%％]+$/u;
  const NO_END = /^[(（「『【〔〈《]+$/u;
  // [the whole line's time budget, the longest gap between two units] in ms, per style.
  const BUDGET = {
    mask: [900, 70], words: [1000, 90], chars: [1100, 45], type: [1700, 60], scramble: [1300, 55],
    wave: [1100, 45], zoom: [1000, 110], flip: [1100, 50], slide: [900, 90],
  };
  // Styles that move word by word (the rest move character by character).
  const BY_WORD = new Set(["mask", "words", "zoom", "slide"]);

  function segments(text, granularity) {
    try { return [...new Intl.Segmenter("ja", { granularity }).segment(text)].map((part) => part.segment); } catch { return Array.from(text); }
  }

  /** Text → units to animate ({ space } keeps spaces and line breaks as they are). */
  function unitsOf(text, mode) {
    const units = [];
    let carry = "";
    for (const part of segments(text, BY_WORD.has(mode) ? "word" : "grapheme")) {
      if (/^\s+$/.test(part)) {
        if (carry) { units.push(carry); carry = ""; }
        units.push({ space: part });
        continue;
      }
      if (NO_END.test(part)) { carry += part; continue; }
      const piece = carry + part;
      carry = "";
      if (NO_START.test(part) && typeof units[units.length - 1] === "string") units[units.length - 1] += piece;
      else units.push(piece);
    }
    if (carry) units.push(carry);
    return units;
  }

  /** Wrap every unit of `el`'s text in a span (inside <em> too). Returns the number of units. */
  function splitKinetic(el, mode) {
    if (el.classList.contains("hs-kin")) return el.querySelectorAll(".hs-k").length;
    const doc = el.ownerDocument;
    const perChar = !BY_WORD.has(mode);
    let n = 0;
    const wrap = (text) => {
      const frag = doc.createDocumentFragment();
      let word = null; // Latin words stay unbroken when split per character
      for (const unit of unitsOf(text, mode)) {
        if (typeof unit !== "string") { word = null; frag.append(unit.space); continue; }
        const k = doc.createElement("span");
        k.className = "hs-k";
        k.textContent = unit;
        k.style.setProperty("--k", String(n));
        n += 1;
        let node = k;
        if (mode === "mask") { node = doc.createElement("span"); node.className = "hs-km"; node.append(k); }
        if (perChar && /^[A-Za-z0-9.,:%+\-]+$/.test(unit)) {
          if (!word) { word = doc.createElement("span"); word.className = "hs-kw"; frag.append(word); }
          word.append(node);
        } else {
          word = null;
          frag.append(node);
        }
      }
      return frag;
    };
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) { if (child.data) child.replaceWith(wrap(child.data)); }
        else if (child.nodeType === 1 && child.namespaceURI === "http://www.w3.org/1999/xhtml" && !child.classList.contains("hs-detail-badge") && !child.classList.contains("hs-drill-badge")) walk(child);
      }
    };
    walk(el);
    el.classList.add("hs-kin");
    return n;
  }

  /** Split the slide's big lines and time them (called by play()). */
  function kinetic(slide) {
    const mode = slide.dataset.kinetic;
    if (!BUDGET[mode]) return;
    for (const el of slide.querySelectorAll(KINETIC_TARGETS)) {
      const n = splitKinetic(el, mode);
      if (!n) continue;
      const [budget, cap] = BUDGET[mode];
      const d = parseFloat(el.style.getPropertyValue("--d")) || 0;
      el.style.setProperty("--kst", `${Math.round(Math.min(cap, budget / n))}ms`);
      el.style.setProperty("--kd", `${Math.round(el.classList.contains("hs-enter") ? d * 90 + 120 : 60)}ms`);
      el.style.setProperty("--kn", String(n));
      const units = el.querySelectorAll(".hs-k");
      units[units.length - 1]?.classList.add("hs-k-last");
    }
    if (mode === "scramble") scramble(slide);
  }

  const GLYPHS = {
    wide: "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン",
    upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lower: "abcdefghijklmnopqrstuvwxyz",
    digit: "0123456789",
  };
  const poolOf = (ch) => (/[぀-ヿ㐀-鿿！-～]/u.test(ch) ? GLYPHS.wide : /[A-Z]/.test(ch) ? GLYPHS.upper : /[a-z]/.test(ch) ? GLYPHS.lower : /\d/.test(ch) ? GLYPHS.digit : null);

  /** "Decode": each unit flickers through random glyphs of its own kind, then settles, left to right. */
  function scramble(slide) {
    const units = [...slide.querySelectorAll(".hs-kin .hs-k")].map((el) => {
      el.classList.remove("on", "done");
      const host = el.closest(".hs-kin");
      const at = (parseFloat(host.style.getPropertyValue("--kd")) || 0) + Number(el.style.getPropertyValue("--k") || 0) * (parseFloat(host.style.getPropertyValue("--kst")) || 50);
      if (el.dataset.t == null) el.dataset.t = el.textContent;
      const text = el.dataset.t;
      return { el, text, chars: Array.from(text), at, until: at + 420, swapped: 0 };
    });
    if (!units.length) return;
    const start = performance.now();
    const finish = () => { for (const u of units) { u.el.textContent = u.text; u.el.classList.remove("on"); u.el.classList.add("done"); } };
    const last = Math.max(...units.map((u) => u.until));
    const safety = setTimeout(finish, last + 1500);
    const tick = (now) => {
      if (!slide.isConnected) { clearTimeout(safety); return; }
      const t = now - start;
      for (const u of units) {
        if (u.el.classList.contains("done")) continue;
        if (t >= u.until) { u.el.textContent = u.text; u.el.classList.remove("on"); u.el.classList.add("done"); continue; }
        if (t < u.at) continue;
        u.el.classList.add("on");
        if (now - u.swapped > 55) {
          u.swapped = now;
          u.el.textContent = u.chars.map((ch) => { const pool = poolOf(ch); return pool ? pool[Math.floor(Math.random() * pool.length)] : ch; }).join("");
        }
      }
      if (t < last) requestAnimationFrame(tick);
      else { clearTimeout(safety); finish(); }
    };
    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------- entrance & builds

  const stepsOf = (slide) => Number(slide.dataset.steps || 0);

  /** Start a slide's entrance. With a click build, `step` groups are already shown (going back shows all). */
  function play(slide, { step = 0, animate = true } = {}) {
    slide.classList.remove("hs-play");
    const toggling = measuresBuild(slide, step);
    const click = slide.dataset.build === "click" && !toggling;
    for (const el of slide.querySelectorAll("[data-g]")) {
      el.classList.remove("hs-in");
      el.classList.toggle("hs-hidden", click && Number(el.dataset.g) >= step);
    }
    spotlight(slide, step);
    if (!animate || reduced()) return;
    kinetic(slide);
    void slide.offsetWidth;
    slide.classList.add("hs-play");
    if (click) {
      countWithin(slide.querySelector(".hs-head") || slide, 300);
      for (const el of slide.querySelectorAll("[data-g]")) if (Number(el.dataset.g) < step) countWithin(el, 0);
    } else countWithin(slide);
  }

  /** A spotlight build keeps everything on screen and puts group `step - 1` in focus (0: nothing in focus). */
  function spotlight(slide, step) {
    if (slide.dataset.build !== "spotlight") return false;
    slide.classList.toggle("hs-spotting", step > 0);
    for (const el of slide.querySelectorAll("[data-g]")) el.classList.toggle("hs-spot", Number(el.dataset.g) === step - 1);
    return true;
  }

  /**
   * On a "gap" slide a click build turns the measures on one per click (everything stays on screen): step 0
   * shows the gap, the last step shows it filled. Starting a slide sets every switch; a click only turns the
   * next measure on, so measures the presenter switched by hand stay as they are. False for any other slide.
   */
  function measuresBuild(slide, step, { exact = true } = {}) {
    if (slide.dataset.build !== "click" || !slide.querySelector("[data-measure]")) return false;
    for (const el of slide.querySelectorAll("[data-measure]")) {
      const n = Number(el.dataset.measure);
      if (exact) el.classList.toggle("is-on", n < step);
      else if (n === step - 1) el.classList.add("is-on");
    }
    E.gapUpdate(slide);
    return true;
  }

  /** Show the next click step (1-based: step 1 shows group 0). */
  function reveal(slide, step) {
    if (measuresBuild(slide, step, { exact: false })) return;
    // In a spotlight build the item in focus counts its figure up again.
    if (spotlight(slide, step)) { for (const el of slide.querySelectorAll(".hs-spot")) countWithin(el, 120); return; }
    for (const el of slide.querySelectorAll(`[data-g="${step - 1}"]`)) {
      el.classList.remove("hs-hidden", "hs-in");
      void el.getBoundingClientRect();
      if (!reduced()) el.classList.add("hs-in");
      countWithin(el, 120);
    }
  }

  // ---------------------------------------------------------------- Lottie (motion graphics made in After Effects, LottieFiles…)

  // The studio points this at its copy of lottie-web; exported files carry the library inline instead.
  let lottieLoading = null;
  function lottieLib(doc) {
    const win = doc.defaultView || root;
    if (win.lottie) return Promise.resolve(win.lottie);
    if (!E.lottieUrl) return Promise.reject(new Error("Lottie のプレーヤーがありません"));
    if (!lottieLoading) {
      lottieLoading = new Promise((resolve, reject) => {
        const script = doc.createElement("script");
        script.src = E.lottieUrl;
        script.async = true;
        script.onload = () => (win.lottie ? resolve(win.lottie) : reject(new Error("Lottie を読み込めません")));
        script.onerror = () => { lottieLoading = null; reject(new Error("Lottie を読み込めません")); };
        doc.head.append(script);
      });
    }
    return lottieLoading;
  }

  const lottieFiles = new Map();
  function lottieJson(url) {
    if (!lottieFiles.has(url)) {
      lottieFiles.set(url, fetch(url).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      }).catch((error) => { lottieFiles.delete(url); throw error; }));
    }
    return lottieFiles.get(url);
  }

  /**
   * Load every Lottie animation in `scope`. play: start the ones set to autoplay (presentations);
   * otherwise hold one frame (`frame` 0–1 of the animation) — the editor, prints and reduced motion.
   */
  function mountLottie(scope, { play = true, frame = 0.5 } = {}) {
    const hosts = [...scope.querySelectorAll(".hs-lottie-host")];
    return Promise.all(hosts.map(async (host) => {
      try {
        if (!host.hsAnim) {
          const [lib, data] = await Promise.all([lottieLib(host.ownerDocument), lottieJson(host.dataset.src)]);
          if (!host.isConnected || host.hsAnim) return;
          host.hsAnim = lib.loadAnimation({
            container: host, renderer: "svg", loop: host.hasAttribute("data-loop"), autoplay: false,
            animationData: typeof structuredClone === "function" ? structuredClone(data) : JSON.parse(JSON.stringify(data)),
            rendererSettings: { preserveAspectRatio: host.dataset.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet" },
          });
        }
        const anim = host.hsAnim;
        if (play && !reduced() && host.hasAttribute("data-autoplay")) { anim.goToAndPlay(0, true); return; }
        const hold = () => anim.goToAndStop(Math.max(0, Math.round(frame * (anim.totalFrames - 1))), true);
        if (anim.isLoaded) hold();
        else anim.addEventListener("DOMLoaded", hold);
      } catch {
        host.classList.add("hs-lottie-failed");
      }
    }));
  }

  function stopLottie(scope) {
    for (const host of scope.querySelectorAll(".hs-lottie-host")) {
      try { host.hsAnim?.destroy(); } catch { /* already gone */ }
      host.hsAnim = null;
    }
  }

  // ---------------------------------------------------------------- media

  function playMedia(slide, { sound = false } = {}) {
    for (const video of slide.querySelectorAll("video[data-autoplay]")) {
      video.muted = !sound || video.hasAttribute("data-muted");
      video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
    }
    for (const frame of slide.querySelectorAll("iframe[data-autoplay]")) {
      const send = () => frame.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "playVideo", args: [] }), "*");
      frame.addEventListener("load", send, { once: true });
      send();
    }
    mountLottie(slide, { play: true, frame: 0 });
  }

  function stopMedia(slide) {
    for (const video of slide.querySelectorAll("video")) { try { video.pause(); } catch { /* detached */ } }
    for (const frame of slide.querySelectorAll("iframe")) frame.contentWindow?.postMessage(JSON.stringify({ event: "command", func: "pauseVideo", args: [] }), "*");
    stopLottie(slide);
  }

  // ---------------------------------------------------------------- interaction (hover, tooltips, details, parallax)

  function slideScale(slide) {
    const rect = slide.getBoundingClientRect();
    return rect.width ? rect.width / E.W : 1;
  }

  function toSlide(slide, clientX, clientY) {
    const rect = slide.getBoundingClientRect();
    const k = slide.getBoundingClientRect().width / E.W || 1;
    return [(clientX - rect.left) / k, (clientY - rect.top) / k];
  }

  function rectIn(slide, el) {
    const base = slide.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const k = base.width / E.W || 1;
    return { x: (r.left - base.left) / k, y: (r.top - base.top) / k, w: r.width / k, h: r.height / k };
  }

  /** A detail's breakdown: bars when every value is a figure, otherwise a two-column list. */
  function evidenceRows(rows) {
    const nums = rows.map((row) => { const parts = E.numParts(row.value); return parts.num == null ? null : Number(parts.num.replace(/[^\d.]/g, "")); });
    const bars = nums.every((n) => n != null && Number.isFinite(n));
    const max = bars ? Math.max(...nums, 0) || 1 : 1;
    return h("ul", { class: ["hs-ev-rows", bars ? "bars" : ""] }, rows.map((row, i) => h("li", { style: { "--i": i } },
      h("span", { class: "hs-ev-label" }, E.strip(row.label)),
      bars ? h("span", { class: "hs-ev-track" }, h("i", { style: { width: `${(nums[i] / max) * 100}%` } })) : null,
      h("span", { class: "hs-ev-value" }, E.strip(row.value)))));
  }

  /** The words that name an item (its title), without its badges. */
  function nameOf(el) {
    if (!el) return "";
    const copy = el.cloneNode(true);
    copy.querySelectorAll(".hs-detail-badge, .hs-drill-badge").forEach((badge) => badge.remove());
    const title = copy.querySelector(".hs-card-title, .hs-row-title, .hs-mlabel, .hs-label, .hs-tree-branch, .lab, .hs-rank-label");
    return E.strip((title || copy).textContent).replace(/\s+/g, " ").slice(0, 28);
  }

  /** Wire a presented slide. Returns a function that removes everything again. */
  function activate(slide, { details = [], onOpen, onClose, onDrill, onControl } = {}) {
    const overlay = slide.querySelector(".hs-overlay");
    let hotKey = null;
    let tip = null;
    const setHot = (key) => {
      if (key === hotKey) return;
      for (const el of slide.querySelectorAll(".hs-hot")) el.classList.remove("hs-hot");
      slide.querySelectorAll(".hs-has-hot").forEach((el) => el.classList.remove("hs-has-hot"));
      hotKey = key;
      if (!key) return;
      const els = slide.querySelectorAll(`[data-item="${E.cssEscape(key)}"]`);
      for (const el of els) el.classList.add("hs-hot");
      els[0]?.closest(".hs-body")?.classList.add("hs-has-hot");
    };
    const showTip = (mark, event) => {
      if (!tip) { tip = h("div", { class: "hs-tip" }); overlay.append(tip); }
      // Value and name, and where the figure comes from when the slide says so.
      tip.replaceChildren(h("span", {}, mark.dataset.tip), slide.dataset.source ? h("small", {}, `出所：${slide.dataset.source}`) : null);
      const [x, y] = toSlide(slide, event.clientX, event.clientY);
      tip.style.left = `${Math.max(120, Math.min(E.W - 120, x))}px`;
      tip.style.top = `${Math.max(90, y)}px`;
      mark.closest(".hs-chart, .hs-wf")?.classList.add("hs-has-hot");
      for (const other of slide.querySelectorAll(".hs-mark.hs-hot")) other.classList.remove("hs-hot");
      mark.classList.add("hs-hot");
    };
    const hideTip = () => {
      tip?.remove(); tip = null;
      slide.querySelectorAll(".hs-mark.hs-hot").forEach((el) => el.classList.remove("hs-hot"));
      slide.querySelectorAll(".hs-chart.hs-has-hot, .hs-wf.hs-has-hot").forEach((el) => el.classList.remove("hs-has-hot"));
    };
    const onOver = (event) => {
      if (event.target.closest?.(".hs-popover")) return;
      const mark = event.target.closest?.(".hs-mark");
      if (mark) showTip(mark, event); else hideTip();
      const itemEl = event.target.closest?.("[data-item]");
      setHot(itemEl && !itemEl.closest(".hs-popover") ? itemEl.dataset.item : null);
    };
    const onMove = (event) => {
      const mark = event.target.closest?.(".hs-mark");
      if (mark && tip) showTip(mark, event);
      // "Tilt" leans the item under the mouse towards it.
      if (slide.dataset.hover === "tilt") {
        const card = event.target.closest?.("[data-item]");
        if (card && !(card instanceof SVGElement) && !card.closest(".hs-popover")) {
          const r = card.getBoundingClientRect();
          if (r.width && r.height) {
            card.style.setProperty("--ry", `${(((event.clientX - r.left) / r.width - 0.5) * 12).toFixed(2)}deg`);
            card.style.setProperty("--rx", `${((0.5 - (event.clientY - r.top) / r.height) * 10).toFixed(2)}deg`);
          }
        }
      }
      const parallax = slide.querySelectorAll('.hs-media[data-motion="parallax"]');
      if (parallax.length) {
        const [x, y] = toSlide(slide, event.clientX, event.clientY);
        for (const media of parallax) {
          media.style.setProperty("--px", `${((x / E.W) - 0.5) * -3}%`);
          media.style.setProperty("--py", `${((y / E.H) - 0.5) * -3}%`);
        }
      }
    };
    const onLeave = () => { setHot(null); hideTip(); };
    const anchorOf = (target) => (target === "takeaway" ? slide.querySelector('[data-detail="takeaway"]')
      : [...slide.querySelectorAll(`[data-item="${E.cssEscape(target)}"]`)].find((el) => !(el instanceof SVGElement)) || slide.querySelector(`[data-item="${E.cssEscape(target)}"]`));
    // Evidence (a breakdown, a source, assumptions) slides in from the right over a dimmed slide.
    const openPanel = (detail) => {
      const rows = (detail.rows || []).filter((row) => row && E.strip(row.label));
      const source = E.strip(detail.source || "");
      const note = E.strip(detail.note || "");
      const where = [E.strip(slide.querySelector(".hs-title")?.textContent || ""), detail.target === "takeaway" ? "キーメッセージの根拠" : nameOf(anchorOf(detail.target))].filter(Boolean).join(" › ");
      const tabs = [rows.length ? ["rows", "内訳"] : null, source || note ? ["source", "出所と前提"] : null].filter(Boolean);
      const close = (event) => { event.stopPropagation(); closeDetail(); };
      const panel = h("aside", { class: "hs-evidence", role: "dialog", "aria-label": E.strip(detail.title || "根拠") },
        h("button", { class: "hs-popover-close", type: "button", "aria-label": "閉じる", onclick: close }, "×"),
        h("div", { class: "hs-ev-where" }, where),
        detail.title ? h("div", { class: "hs-ev-title" }, E.strip(detail.title)) : null,
        h("div", { class: "hs-ev-text" }, E.rich(detail.text)),
        tabs.length > 1 ? h("div", { class: "hs-ev-tabs", role: "tablist" }, tabs.map(([key, label], i) => h("button", { type: "button", role: "tab", "data-tab": key, "aria-selected": String(i === 0) }, label))) : null,
        rows.length ? h("div", { class: "hs-ev-pane", "data-pane": "rows" }, evidenceRows(rows)) : null,
        source || note ? h("div", { class: "hs-ev-pane", "data-pane": "source", hidden: rows.length > 0 },
          note ? h("p", { class: "hs-ev-note" }, E.rich(detail.note)) : null,
          source ? h("p", { class: "hs-ev-source" }, `出所：${source}`) : null) : null,
        source && rows.length ? h("div", { class: "hs-ev-foot" }, `出所：${source}`) : null);
      panel.addEventListener("click", (event) => {
        event.stopPropagation();
        const tab = event.target.closest?.("[data-tab]");
        if (!tab) return;
        for (const other of panel.querySelectorAll("[data-tab]")) other.setAttribute("aria-selected", String(other === tab));
        for (const pane of panel.querySelectorAll("[data-pane]")) pane.hidden = pane.dataset.pane !== tab.dataset.tab;
      });
      overlay.append(h("div", { class: "hs-scrim dim", onclick: close }), panel);
      slide.dataset.detailOpen = detail.target;
      onOpen?.(detail);
    };
    const openDetail = (target) => {
      const detail = details.find((entry) => entry.target === target);
      if (!detail) return;
      closeDetail();
      if ((detail.rows || []).length || detail.source || detail.note) { openPanel(detail); return; }
      const anchor = anchorOf(target);
      const box = anchor ? rectIn(slide, anchor) : { x: 700, y: 300, w: 200, h: 100 };
      const width = 760;
      const scrim = h("div", { class: "hs-scrim", onclick: (event) => { event.stopPropagation(); closeDetail(); } });
      const pop = h("div", { class: "hs-popover", role: "dialog", "aria-label": E.strip(detail.title || "詳細") },
        h("button", { class: "hs-popover-close", type: "button", "aria-label": "閉じる", onclick: (event) => { event.stopPropagation(); closeDetail(); } }, "×"),
        detail.title ? h("div", { class: "hs-popover-title" }, E.strip(detail.title)) : null,
        h("div", { class: "hs-popover-text" }, E.rich(detail.text)));
      pop.addEventListener("click", (event) => event.stopPropagation());
      const right = box.x + box.w + 32;
      const x = right + width < E.W - 48 ? right : Math.max(48, box.x - width - 32);
      pop.style.left = `${x}px`;
      pop.style.top = `${Math.max(72, Math.min(E.H - 420, box.y))}px`;
      overlay.append(scrim, pop);
      slide.dataset.detailOpen = target;
      onOpen?.(detail);
    };
    const closeDetail = () => {
      overlay.querySelectorAll(".hs-popover, .hs-scrim, .hs-evidence").forEach((el) => el.remove());
      if (slide.dataset.detailOpen) { delete slide.dataset.detailOpen; onClose?.(); }
    };
    const onClick = (event) => {
      // Controls change the slide in place (and never advance it): a view of a ranking, a measure switched on or off.
      const control = event.target.closest?.(".hs-control");
      if (control && !event.target.closest(".hs-popover, .hs-evidence")) {
        event.stopPropagation();
        const view = event.target.closest("[data-view]");
        if (view) { E.rankShow(view.closest(".hs-rank"), Number(view.dataset.view)); onControl?.("view"); }
        const measure = event.target.closest("[data-measure]");
        if (measure) { measure.classList.toggle("is-on"); E.gapUpdate(slide); onControl?.("measure"); }
        return;
      }
      const drill = event.target.closest?.("[data-drill]");
      if (drill && onDrill && !event.target.closest(".hs-popover")) {
        event.stopPropagation();
        event.preventDefault();
        onDrill(Number(drill.dataset.drill), drill);
        return;
      }
      const host = event.target.closest?.("[data-detail]");
      if (host && !event.target.closest(".hs-popover")) {
        event.stopPropagation();
        event.preventDefault();
        openDetail(host.dataset.detail);
        return;
      }
      const video = event.target.closest?.("video");
      if (video) {
        event.stopPropagation();
        if (video.paused) { video.muted = video.hasAttribute("data-muted"); video.play().catch(() => {}); } else video.pause();
      }
      // A Lottie animation that does not play by itself starts (or pauses) on click.
      const anim = event.target.closest?.(".hs-lottie-host")?.hsAnim;
      if (anim && !event.target.closest(".hs-lottie-host").hasAttribute("data-autoplay")) {
        event.stopPropagation();
        if (anim.isPaused) anim.play(); else anim.pause();
      }
      // Clicks inside the card reach its buttons (×); the card itself keeps them from advancing the slide.
      if (event.target.closest?.("iframe")) event.stopPropagation();
    };
    // Sliders recalculate as they move; letting go hands the keys back to the presentation.
    const onInput = (event) => { if (event.target.matches?.("input[data-sim]")) { E.simUpdate(slide); onControl?.("slider"); } };
    const onChange = (event) => { if (event.target.matches?.("input[data-sim]")) event.target.blur(); };
    slide.addEventListener("pointerover", onOver);
    slide.addEventListener("pointermove", onMove);
    slide.addEventListener("pointerleave", onLeave);
    slide.addEventListener("click", onClick, true);
    slide.addEventListener("input", onInput);
    slide.addEventListener("change", onChange);
    return {
      openDetail,
      closeDetail,
      get detailOpen() { return Boolean(slide.dataset.detailOpen); },
      destroy() {
        closeDetail(); hideTip(); setHot(null);
        slide.removeEventListener("pointerover", onOver);
        slide.removeEventListener("pointermove", onMove);
        slide.removeEventListener("pointerleave", onLeave);
        slide.removeEventListener("click", onClick, true);
        slide.removeEventListener("input", onInput);
        slide.removeEventListener("change", onChange);
      },
    };
  }

  // ---------------------------------------------------------------- engine stylesheet (for the presenter view window)

  function engineCss() {
    const out = [];
    for (const sheet of document.styleSheets) {
      const node = sheet.ownerNode;
      if (!node?.hasAttribute?.("data-hs-engine")) continue;
      try { for (const rule of sheet.cssRules) out.push(rule.cssText); } catch { /* cross-origin sheet */ }
    }
    return out.join("\n");
  }

  // ---------------------------------------------------------------- player

  const TRANSITIONS = new Set(Object.keys(E.TRANSITIONS));
  const TRANSITION_MS = { wipe: 920, circle: 920, drill: 560, push: 680, flip: 940, dive: 860, blinds: 920, curtain: 920 };
  // These clip the incoming slide itself, so edges and click points share the slide's own coordinates.
  const CLIPPED = new Set(["wipe", "circle", "blinds", "curtain"]);

  /**
   * A presentation in `host` (the studio's presenter overlay or an exported file's body).
   * opts: { deck, start, step, fitFor(i), renderOptions, onChange({index, step}), onClose(), closable, keyboard, static }
   * The story is the slides without `drillOf`; a deep-dive page opens from its item and returns to where it left.
   * `static` shows every slide finished (no motion, every step shown), like the "reduce motion" setting.
   */
  function createPlayer(host, opts) {
    const deck = opts.deck;
    const slides = deck.slides || [];
    const total = slides.length;
    const story = E.storyMap(slides);
    const order = story.order.length ? story.order : slides.map((_, i) => i);
    const place = (i) => Math.max(0, order.indexOf(story.parent[i] ?? i));
    const transition = TRANSITIONS.has(deck.transition) ? deck.transition : "fade";
    const doc = host.ownerDocument;
    const win = doc.defaultView;
    let index = Math.max(0, Math.min(total - 1, opts.start || 0));
    let step = 0;
    let current = null;
    let interaction = null;
    let busy = null;
    let pv = null;
    let gesture = false;
    let origin = null;
    // While a deep-dive page is shown: the slide (and build step) to go back to, and where it was opened from.
    let back = null;
    let hinted = false;
    let demoRun = null;
    const still = Boolean(opts.static);
    const started = Date.now();

    const stage = h("div", { class: "hs-player-stage" });
    const progress = h("div", { class: "hs-player-progress" }, h("i"));
    const counter = h("span", { class: "hs-player-count" });
    const notes = h("div", { class: "hs-player-notes", hidden: true });
    const btn = (label, title, fn, cls = "") => h("button", { class: `hs-player-btn ${cls}`, type: "button", title, "aria-label": title, onclick: (event) => { event.stopPropagation(); fn(); } }, label);
    const bar = h("div", { class: "hs-player-bar" },
      btn("‹", "前へ（←）", () => prev()),
      counter,
      btn("›", "次へ（→・クリック）", () => next()),
      h("span", { class: "hs-player-spacer" }),
      btn("一覧", "スライド一覧（O・G）", () => toggleGrid()),
      btn("自動デモ", "自動デモ：矢印が各ページを操作して見せます（D）", () => demo(), "demo"),
      btn("ノート", "ノートを表示（N）", () => toggleNotes()),
      btn("発表者ビュー", "別ウィンドウにノート・次のスライド・経過時間（P）", () => openPresenterView()),
      btn("全画面", "全画面（F）", () => toggleFullscreen()),
      opts.closable === false ? null : btn("終了", "発表を終了（Esc）", () => close(), "end"));
    const grid = h("div", { class: "hs-player-grid", hidden: true });
    const black = h("div", { class: "hs-player-black", hidden: true, onclick: (event) => { event.stopPropagation(); black.hidden = true; } });
    const backBtn = h("button", { class: "hs-player-back", type: "button", hidden: true, title: "元のスライドへ戻る（Esc・←）", onclick: (event) => { event.stopPropagation(); closeDrill(); } }, "← 元のスライドへ");
    const player = h("div", { class: "hs-player", tabindex: "-1" }, stage, progress, notes, backBtn, bar, grid, black);
    host.append(player);

    const renderAt = (i) => {
      const el = E.render(slides[i], { ...(opts.renderOptions || {}), deck, index: i, mode: "present", fit: opts.fitFor?.(i) });
      return E.mount(el, { contain: true, className: "hs-player-slide" });
    };

    function update() {
      const pos = place(index);
      counter.textContent = `${pos + 1} / ${order.length}${back ? " ・ 深掘り" : ""}`;
      progress.firstChild.style.width = `${((pos + 1) / order.length) * 100}%`;
      backBtn.hidden = !back;
      player.classList.toggle("in-drill", Boolean(back));
      notes.textContent = E.strip(slides[index]?.notes || "") || "（ノートはありません）";
      opts.onChange?.({ index, step });
      syncPresenterView();
    }

    function nameShared(scaler, on) {
      const slide = scaler?.firstElementChild;
      if (!slide) return;
      const pick = (sel, name) => { const el = slide.querySelector(sel); if (el) el.style.viewTransitionName = on ? name : ""; };
      pick(".hs-title, .hs-cover-title, .hs-section-title, .hs-hero-title", "hs-title");
      pick(".hs-eyebrow", "hs-eyebrow");
      pick(".hs-takeaway", "hs-takeaway");
      pick(".hs-foot", "hs-foot");
    }

    async function show(i, { dir = 1, fullStep = false, atStep = null, via = null, at = null } = {}) {
      if (busy) await busy;
      const prevScaler = current;
      const prevSlide = prevScaler?.firstElementChild;
      if (prevSlide) { interaction?.destroy(); stopMedia(prevSlide); }
      const from = index;
      index = i;
      const next = renderAt(i);
      const slide = next.firstElementChild;
      step = Math.min(still ? Infinity : atStep ?? (fullStep ? Infinity : 0), stepsOf(slide));
      // A slide may have its own way in; going back plays the way in of the slide being left, in reverse.
      const own = slides[dir < 0 ? from : i]?.transition;
      const type = still || reduced() || !prevScaler ? "none" : via || (TRANSITIONS.has(own) ? own : transition);
      // A deep-dive page grows out of the item that opened it, and shrinks back into it.
      if (type === "drill" && at) for (const el of [next, prevScaler]) { el.style.setProperty("--ox", `${at.x}px`); el.style.setProperty("--oy", `${at.y}px`); }
      const enter = () => {
        // Coming back from a deep-dive page, the slide is shown as it was left, without its entrance again.
        play(slide, { step, animate: atStep == null && !still });
        interaction = activate(slide, { details: slides[i]?.details || [], onDrill: back ? null : (to, el) => openDrill(to, el) });
        playMedia(slide, { sound: gesture });
        if (still) return;
        // The first slide with clickable items says how to use them (once per presentation), and every page
        // rings what can be clicked once, right after it has arrived.
        const kinds = [slide.querySelector(".hs-detail-badge") ? "「＋ 詳しく」" : "", slide.querySelector(".hs-drill-badge") ? "「↗ 深掘り」" : "", slide.querySelector(".hs-control") ? "切り替え・スライダー" : ""].filter(Boolean).join("・");
        if (kinds && !hinted) { hinted = true; setTimeout(() => flash(`${kinds}の付いた項目はクリックできます`), 900); }
        setTimeout(() => ring(slide), atStep == null ? 1900 : 300);
      };
      if (type === "morph" && doc.startViewTransition) {
        nameShared(prevScaler, true);
        const vt = doc.startViewTransition(() => {
          nameShared(prevScaler, false);
          prevScaler.remove();
          stage.append(next);
          E.scale(next);
          nameShared(next, true);
        });
        current = next;
        busy = vt.finished.catch(() => {}).then(() => { nameShared(next, false); busy = null; });
        vt.updateCallbackDone.then(enter, enter);
      } else if (type === "none" || type === "morph") {
        prevScaler?.remove();
        stage.append(next);
        current = next;
        E.scale(next);
        enter();
        if (type === "morph" && prevScaler) next.classList.add("hs-tr-in-fade");
      } else {
        stage.append(next);
        E.scale(next);
        current = next;
        const suffix = dir < 0 ? " rev" : "";
        // Wipe and circle clip the incoming slide itself, so the edge, its colour band and the click point
        // share the slide's own coordinates (letterboxing never shows them).
        const entering = CLIPPED.has(type) ? slide : next;
        let band = null;
        if (type === "circle") {
          const box = slide.getBoundingClientRect();
          const at = origin && box.width ? { x: ((origin.x - box.left) / box.width) * 100, y: ((origin.y - box.top) / box.height) * 100 } : { x: 50, y: 50 };
          slide.style.setProperty("--cx", `${Math.round(at.x)}%`);
          slide.style.setProperty("--cy", `${Math.round(at.y)}%`);
        }
        if (type === "wipe") {
          const tone = win.getComputedStyle(slide);
          band = h("div", { class: `hs-tr-band${suffix}` });
          band.style.setProperty("--band", tone.getPropertyValue("--accent").trim() || "#2451e6");
          band.style.setProperty("--band2", tone.getPropertyValue("--accent2").trim() || "#13a89e");
          slide.append(band);
        }
        origin = null;
        entering.className += ` hs-tr-in-${type}${suffix}`;
        prevScaler.className += ` hs-tr-out-${type}${suffix}`;
        enter();
        busy = new Promise((resolve) => setTimeout(resolve, TRANSITION_MS[type] ?? 620)).then(() => {
          prevScaler.remove();
          band?.remove();
          entering.classList.remove(`hs-tr-in-${type}`, "rev");
          busy = null;
        });
      }
      update();
    }

    function next() {
      if (!black.hidden) { black.hidden = true; return; }
      if (interaction?.detailOpen) { interaction.closeDetail(); return; }
      const slide = current?.firstElementChild;
      if (slide && step < stepsOf(slide)) {
        step += 1;
        reveal(slide, step);
        update();
        return;
      }
      // At the end of a deep-dive page, the talk goes back to the slide it came from.
      if (back) { closeDrill(); return; }
      const pos = place(index);
      if (pos < order.length - 1) show(order[pos + 1], { dir: 1 });
    }

    function prev() {
      if (interaction?.detailOpen) { interaction.closeDetail(); return; }
      if (back) { closeDrill(); return; }
      const pos = place(index);
      if (pos > 0) show(order[pos - 1], { dir: -1, fullStep: true });
    }

    /** Open a deep-dive page (one level: not from another deep-dive page). */
    function openDrill(to, el = null) {
      if (back || !slides[to] || story.parent[to] !== index) return;
      let at = null;
      if (el && current) {
        const base = current.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        at = { x: Math.round(r.left + r.width / 2 - base.left), y: Math.round(r.top + r.height / 2 - base.top) };
      }
      back = { index, step, at };
      show(to, { dir: 1, via: "drill", at });
    }

    function closeDrill() {
      if (!back) return false;
      const { index: to, step: at, at: point } = back;
      back = null;
      show(to, { dir: -1, atStep: at, via: "drill", at: point });
      return true;
    }

    /** Go to a slide by its place in the deck; a deep-dive page opens over its slide. */
    function go(i) {
      const target = Math.max(0, Math.min(total - 1, i));
      if (target === index) return;
      const parent = story.parent[target];
      back = parent != null ? { index: parent, step: Infinity, at: null } : null;
      show(target, { dir: place(target) >= place(index) ? 1 : -1 });
    }

    function toggleNotes() { notes.hidden = !notes.hidden; player.classList.toggle("with-notes", !notes.hidden); requestAnimationFrame(() => current && E.scale(current)); }

    function toggleGrid() {
      if (!grid.hidden) { grid.hidden = true; grid.replaceChildren(); return; }
      grid.replaceChildren(...order.map((i, pos) => {
        const slide = slides[i];
        const el = E.render(slide, { ...(opts.renderOptions || {}), deck, index: i, mode: "thumb", fit: opts.fitFor?.(i) });
        return h("button", { class: `hs-grid-cell${pos === place(index) ? " is-current" : ""}`, type: "button", onclick: (event) => { event.stopPropagation(); grid.hidden = true; grid.replaceChildren(); go(i); } },
          E.mount(el), h("span", {}, `${pos + 1}. ${E.strip(slide.title || slide.message || "")}`));
      }));
      grid.hidden = false;
    }

    async function toggleFullscreen() {
      try {
        if (doc.fullscreenElement) await doc.exitFullscreen();
        else await (opts.fullscreenTarget || player).requestFullscreen();
      } catch { /* not allowed here */ }
    }

    function close() {
      destroy();
      opts.onClose?.({ index });
    }

    // ---- presenter view: notes, the next slide and a clock in a second window (keep the audience window clean)
    function openPresenterView() {
      if (pv && !pv.win.closed) { pv.win.focus(); return; }
      const w = win.open("", "hs-presenter-view", "width=1180,height=760");
      if (!w) { flash("ポップアップがブロックされました。ブラウザで許可してください"); return; }
      const fonts = doc.querySelector("link[data-hs-fonts]")?.href || "";
      w.document.open();
      w.document.write(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>発表者ビュー</title>${fonts ? `<link rel="stylesheet" href="${fonts}">` : ""}<style>${engineCss()}\n${PV_CSS}</style></head><body><div class="pv"><section class="pv-now"></section><aside class="pv-side"><div class="pv-label">次のスライド</div><div class="pv-next"></div><div class="pv-clock"><b class="pv-timer">00:00</b><span class="pv-count"></span></div><div class="pv-btns"><button type="button" data-a="prev">‹ 前へ</button><button type="button" data-a="next">次へ ›</button><button type="button" data-a="reset">時間をリセット</button></div></aside><section class="pv-notes"></section></div></body></html>`);
      w.document.close();
      pv = { win: w, start: Date.now() };
      w.document.addEventListener("keydown", onKey);
      w.document.addEventListener("click", (event) => {
        const action = event.target.closest?.("button")?.dataset.a;
        if (action === "prev") prev();
        if (action === "next") next();
        if (action === "reset") pv.start = Date.now();
      });
      w.addEventListener("resize", () => layoutPresenterView());
      pv.timer = setInterval(() => {
        if (!pv || pv.win.closed) { clearInterval(pv?.timer); pv = null; return; }
        const sec = Math.floor((Date.now() - pv.start) / 1000);
        const el = pv.win.document.querySelector(".pv-timer");
        if (el) el.textContent = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
      }, 500);
      syncPresenterView();
    }

    function layoutPresenterView() {
      if (!pv || pv.win.closed) return;
      for (const box of pv.win.document.querySelectorAll(".pv-now, .pv-next")) {
        const slide = box.querySelector(".hs-slide");
        if (!slide) continue;
        const k = Math.min(box.clientWidth / E.W, box.clientHeight / E.H);
        slide.style.transform = `scale(${k})`;
        slide.style.left = `${(box.clientWidth - E.W * k) / 2}px`;
        slide.style.top = `${(box.clientHeight - E.H * k) / 2}px`;
      }
    }

    function syncPresenterView() {
      if (!pv || pv.win.closed) return;
      const d = pv.win.document;
      const put = (sel, i, stepShown) => {
        const box = d.querySelector(sel);
        if (!box) return;
        if (i == null || i >= total) { box.replaceChildren(d.createTextNode("（最後のスライドです）")); return; }
        const el = E.render(slides[i], { ...(opts.renderOptions || {}), deck, index: i, mode: "thumb", fit: opts.fitFor?.(i) });
        // Click steps not yet reached are hidden (a gap slide's measures are switched off instead).
        if (stepShown != null && el.dataset.build === "click") {
          if (el.querySelector("[data-measure]")) { for (const m of el.querySelectorAll("[data-measure]")) m.classList.toggle("is-on", Number(m.dataset.measure) < stepShown); E.gapUpdate(el); }
          else for (const g of el.querySelectorAll("[data-g]")) g.style.visibility = Number(g.dataset.g) < stepShown ? "" : "hidden";
        }
        el.style.position = "absolute";
        el.style.transformOrigin = "0 0";
        box.replaceChildren(d.adoptNode(el));
      };
      put(".pv-now", index, step);
      put(".pv-next", back ? back.index : order[place(index) + 1], back ? Infinity : null);
      d.querySelector(".pv-label").textContent = back ? "戻る先のスライド" : "次のスライド";
      d.querySelector(".pv-notes").textContent = E.strip(slides[index]?.notes || "") || "（このスライドにノートはありません）";
      d.querySelector(".pv-count").textContent = `${place(index) + 1} / ${order.length}${back ? " ・ 深掘り" : ""}${stepsOf(current?.firstElementChild || d.body) ? `　（${step}/${stepsOf(current.firstElementChild)}）` : ""}`;
      layoutPresenterView();
    }

    /** One ring around each thing on the slide that can be clicked or moved (once, when the page has arrived). */
    function ring(slide) {
      if (!slide.isConnected || current?.firstElementChild !== slide || reduced()) return;
      const overlay = slide.querySelector(".hs-overlay");
      const targets = [...slide.querySelectorAll("[data-detail], [data-drill], .hs-rank-views, .hs-sim-input input, .hs-gap-measure")]
        .filter((el) => !(el instanceof SVGElement) && !el.closest(".hs-hidden") && !el.parentElement?.closest("[data-detail], [data-drill]")).slice(0, 10);
      for (const el of targets) {
        const box = rectIn(slide, el);
        if (!box.w || !box.h) continue;
        const mark = h("span", { class: "hs-ring", "aria-hidden": "true", style: { left: `${box.x - 10}px`, top: `${box.y - 10}px`, width: `${box.w + 20}px`, height: `${box.h + 20}px` } });
        overlay.append(mark);
        setTimeout(() => mark.remove(), 1600);
      }
    }

    // ---- automatic demo (D): an arrow walks through every page and does what the page invites, then ends on the overview
    function stopDemo(message = "自動デモを止めました") {
      if (!demoRun) return;
      demoRun.stopped = true;
      demoRun.cursor.remove();
      demoRun = null;
      player.classList.remove("in-demo");
      if (message) flash(message);
    }

    async function demo() {
      if (demoRun) { stopDemo(); return; }
      if (!grid.hidden) toggleGrid();
      const run = { stopped: false, cursor: h("div", { class: "hs-demo-cursor", "aria-hidden": "true" }) };
      run.cursor.innerHTML = '<svg viewBox="0 0 32 32"><path d="M5 3 L5 25 L11 19.5 L15 29 L19.5 27 L15.5 18 L23 18 Z"/></svg>';
      demoRun = run;
      player.append(run.cursor);
      player.classList.add("in-demo");
      const wait = (ms) => new Promise((resolve, reject) => setTimeout(() => (run.stopped ? reject(new Error("stopped")) : resolve()), ms));
      const moveTo = (el, { x = 0.5, y = 0.5 } = {}) => {
        const base = player.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        run.cursor.style.transform = `translate(${r.left - base.left + r.width * x}px, ${r.top - base.top + r.height * y}px)`;
      };
      const pointAt = async (el, where) => { moveTo(el, where); await wait(700); };
      const tap = async (el, fn, where) => {
        await pointAt(el, where);
        run.cursor.classList.add("tap");
        fn();
        await wait(220);
        run.cursor.classList.remove("tap");
      };
      const slideNow = () => current?.firstElementChild;
      flash("自動デモ：D・Esc・クリックで止まります");
      try {
        for (;;) {
          await wait(2400);
          let slide = slideNow();
          // Steps: items that appear (or measures that switch on) one per click.
          while (slide && step < stepsOf(slide)) {
            const target = slide.querySelector(`[data-measure="${step}"]`) || [...slide.querySelectorAll(`[data-g="${step}"]`)].find((el) => el.getBoundingClientRect().width);
            if (target) await tap(target, () => next()); else next();
            await wait(900);
            slide = slideNow();
          }
          // Views of a ranking.
          for (const tab of [...(slide?.querySelectorAll("[data-view]") || [])].slice(1)) { await tap(tab, () => tab.click()); await wait(1500); }
          // Sliders: to the far end and back.
          for (const range of slide?.querySelectorAll("input[data-sim]") || []) {
            const from = Number(range.value);
            const min = Number(range.min);
            const max = Number(range.max);
            const to = from + (max - min) * 0.35 <= max ? from + (max - min) * 0.35 : min + (max - min) * 0.25;
            const at = (v) => ({ x: (v - min) / (max - min || 1), y: 0.5 });
            await pointAt(range, at(from));
            run.cursor.classList.add("drag");
            for (let k = 1; k <= 30; k += 1) {
              range.value = String(from + ((to - from) * k) / 30);
              range.dispatchEvent(new Event("input", { bubbles: true }));
              moveTo(range, at(Number(range.value)));
              await wait(45);
            }
            run.cursor.classList.remove("drag");
            await wait(1400);
            range.value = String(from);
            range.dispatchEvent(new Event("input", { bubbles: true }));
            await wait(500);
          }
          // One piece of evidence, opened and closed again.
          const host = slide?.querySelector("[data-detail]");
          if (host && interaction) {
            await tap(host, () => interaction.openDetail(host.dataset.detail), { x: 0.9, y: 0.2 });
            await wait(3200);
            interaction.closeDetail();
            await wait(500);
          }
          if (place(index) >= order.length - 1 && !back) break;
          next();
        }
        await wait(1600);
        stopDemo(null);
        toggleGrid();
      } catch { /* stopped */ }
    }

    function flash(text) {
      const note = h("div", { class: "hs-player-flash" }, text);
      player.append(note);
      setTimeout(() => note.remove(), 2600);
    }

    // ---- input
    let digits = "";
    function onKey(event) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      gesture = true;
      if (key === "d" || key === "D") { demo(); return; }
      if (demoRun) { stopDemo(); if (key === "Escape") return; }
      // A slider in use keeps its arrow keys.
      if (event.target?.matches?.("input[data-sim]") && /^Arrow/.test(key)) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(key)) {
        event.preventDefault();
        if (key === "Enter" && digits) { go(order[Math.min(order.length, Math.max(1, Number(digits))) - 1]); digits = ""; return; }
        next();
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(key)) { event.preventDefault(); prev(); }
      else if (key === "Home") { event.preventDefault(); go(order[0]); }
      else if (key === "End") { event.preventDefault(); go(order[order.length - 1]); }
      else if (/^[0-9]$/.test(key)) { digits = `${digits}${key}`.slice(-3); }
      else if (key === "Escape") {
        if (interaction?.detailOpen) interaction.closeDetail();
        else if (!grid.hidden) toggleGrid();
        else if (!black.hidden) black.hidden = true;
        else if (back) closeDrill();
        else if (opts.closable !== false) close();
      } else if (key === "f" || key === "F") toggleFullscreen();
      else if (key === "n" || key === "N") toggleNotes();
      else if (key === "g" || key === "G" || key === "o" || key === "O") toggleGrid();
      else if (key === "p" || key === "P") openPresenterView();
      else if (key === "b" || key === "B" || key === ".") { black.style.background = "#000"; black.hidden = !black.hidden; }
      else if (key === "w" || key === "W") { black.style.background = "#fff"; black.hidden = !black.hidden; }
    }
    const onStageClick = (event) => {
      if (event.target.closest(".hs-player-bar, .hs-player-grid, .hs-player-notes, .hs-control")) return;
      gesture = true;
      origin = { x: event.clientX, y: event.clientY };
      next();
    };
    let touchX = null;
    const onTouchStart = (event) => { touchX = event.target.closest?.(".hs-control") ? null : event.touches[0]?.clientX ?? null; };
    const onTouchEnd = (event) => {
      if (touchX == null) return;
      const dx = (event.changedTouches[0]?.clientX ?? touchX) - touchX;
      if (Math.abs(dx) > 60) { event.preventDefault(); dx < 0 ? next() : prev(); }
      touchX = null;
    };
    let idle = null;
    const onMove = () => {
      player.classList.remove("idle");
      clearTimeout(idle);
      idle = setTimeout(() => player.classList.add("idle"), 2600);
    };
    if (opts.keyboard !== false) doc.addEventListener("keydown", onKey);
    stage.addEventListener("click", onStageClick);
    stage.addEventListener("touchstart", onTouchStart, { passive: true });
    stage.addEventListener("touchend", onTouchEnd);
    player.addEventListener("pointermove", onMove);
    // The audience's own click stops the automatic demo (the demo's clicks are not "trusted").
    player.addEventListener("pointerdown", (event) => { if (event.isTrusted && demoRun && !event.target.closest?.(".hs-player-btn.demo")) stopDemo(); }, true);
    onMove();

    function destroy() {
      if (demoRun) demoRun.stopped = true;
      doc.removeEventListener("keydown", onKey);
      interaction?.destroy();
      if (current?.firstElementChild) stopMedia(current.firstElementChild);
      clearTimeout(idle);
      if (pv?.win && !pv.win.closed) pv.win.close();
      clearInterval(pv?.timer);
      player.remove();
    }

    if (story.parent[index] != null) back = { index: story.parent[index], step: Infinity, at: null };
    show(index, { dir: 1, fullStep: Boolean(opts.fullStep) });
    player.focus({ preventScroll: true });

    return {
      el: player, next, prev, go, destroy, close, toggleNotes, toggleGrid, toggleFullscreen, openPresenterView, openDrill, closeDrill, demo, stopDemo,
      get index() { return index; }, get step() { return step; }, get startedAt() { return started; }, get inDrill() { return Boolean(back); },
    };
  }

  const PV_CSS = `
html,body{margin:0;height:100%;background:#0d1017;color:#e8ecf4;font-family:"Noto Sans JP","Hiragino Sans",sans-serif}
.pv{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(280px,1fr);grid-template-rows:minmax(0,1fr) minmax(140px,34%);gap:14px;height:100%;padding:14px;box-sizing:border-box}
.pv-now,.pv-next{position:relative;overflow:hidden;background:#000;border-radius:10px}
.pv-now{grid-row:1;grid-column:1}.pv-side{grid-row:1;grid-column:2;display:flex;flex-direction:column;gap:10px;min-height:0}
.pv-next{flex:0 0 auto;aspect-ratio:16/9;opacity:.9}.pv-label{font-size:12px;letter-spacing:.1em;color:#8b95a8;font-weight:700}
.pv-clock{display:flex;align-items:baseline;gap:14px;margin-top:6px}.pv-timer{font-size:44px;font-variant-numeric:tabular-nums;font-weight:800}.pv-count{color:#9aa5b8;font-size:15px}
.pv-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto}.pv-btns button{flex:1;min-width:90px;height:40px;border:1px solid #2c3446;border-radius:10px;background:#161b26;color:#e8ecf4;font:inherit;font-weight:700;cursor:pointer}
.pv-notes{grid-row:2;grid-column:1/-1;overflow:auto;padding:16px 20px;border-radius:10px;background:#161b26;font-size:22px;line-height:1.75;white-space:pre-wrap}
.pv .hs-slide{position:absolute;top:0;left:0}`;

  Object.assign(E, { play, reveal, stepsOf, countUp, activate, playMedia, stopMedia, mountLottie, stopLottie, splitKinetic, createPlayer, engineCss });
})(typeof window !== "undefined" ? window : globalThis);
