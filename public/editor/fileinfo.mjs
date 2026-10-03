// ファイル → 情報 (PowerPoint's File → Info): the deck's properties (author, subject, keywords, category, company,
// status, comments — kept as deck.info and written into the exported HTML), its statistics, and ドキュメント検査
// (Inspect Document): comments, speaker notes, hidden slides, hidden objects and objects off the slide, each removable
// before the deck is passed on.

export const INFO_FIELDS = [["author", "作成者", 80], ["subject", "件名", 120], ["keywords", "キーワード", 200], ["category", "分類", 60], ["company", "会社", 80], ["status", "状態", 40], ["comments", "コメント", 1000]];

/** deck.info, checked (null when empty). */
export function infoOf(value) {
  const v = value && typeof value === "object" ? value : {};
  const out = {};
  for (const [key, , max] of INFO_FIELDS) {
    const text = String(v[key] ?? "").replace(/[\u0000-\u0008\u000b-\u001f<>]/g, "").trim().slice(0, max);
    if (text) out[key] = text;
  }
  return Object.keys(out).length ? out : null;
}

/** Counts for the 情報 page. */
export function deckStats(deck, E) {
  const slides = deck?.slides || [];
  const story = E?.storyMap ? E.storyMap(slides) : { parent: [] };
  const objects = slides.flatMap((s) => s.elements || []);
  const words = (text) => String(text ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, "").length;
  let chars = 0;
  for (const s of slides) {
    for (const key of ["title", "subtitle", "subhead", "takeaway", "message", "text"]) chars += words(s[key]);
    for (const key of ["points", "steps"]) for (const item of Array.isArray(s[key]) ? s[key] : []) chars += words(typeof item === "string" ? item : item?.title);
    for (const o of s.elements || []) chars += words(o.text);
  }
  return {
    slides: slides.length,
    hidden: slides.filter((s) => s.hidden).length,
    drill: slides.filter((_, i) => story.parent?.[i] != null).length,
    sections: slides.filter((s) => s.section).length,
    objects: objects.length,
    media: objects.filter((o) => ["image", "video", "audio", "lottie"].includes(o.kind)).length,
    animations: slides.reduce((n, s) => n + (s.timeline?.length || 0), 0),
    notes: slides.filter((s) => String(s.notes || "").trim()).length,
    comments: slides.reduce((n, s) => n + (s.comments?.length || 0), 0),
    open: slides.reduce((n, s) => n + (s.comments || []).filter((c) => !c.done).length, 0),
    chars,
  };
}

/** ドキュメント検査: what may be left in a deck that should not travel with it. */
export function inspect(deck, W = 1920, H = 1080) {
  const slides = deck?.slides || [];
  const off = (o) => {
    const [x, y, w, h] = o.kind === "line" ? [Math.min(o.x1, o.x2), Math.min(o.y1, o.y2), Math.abs(o.x2 - o.x1), Math.abs(o.y2 - o.y1)] : [o.x, o.y, o.w, o.h];
    return x + w <= 0 || y + h <= 0 || x >= W || y >= H;
  };
  return {
    comments: slides.reduce((n, s) => n + (s.comments?.length || 0), 0),
    notes: slides.filter((s) => String(s.notes || "").trim()).length,
    hiddenSlides: slides.filter((s) => s.hidden).length,
    hiddenObjects: slides.reduce((n, s) => n + (s.elements || []).filter((o) => o.hidden).length, 0),
    offSlide: slides.reduce((n, s) => n + (s.elements || []).filter((o) => !o.hidden && off(o)).length, 0),
    info: infoOf(deck?.info) ? 1 : 0,
  };
}

/** The deck without what ドキュメント検査 removes (`what`: comments, notes, hiddenSlides, hiddenObjects, offSlide, info). */
export function strip(deck, what, W = 1920, H = 1080) {
  const off = (o) => {
    const [x, y, w, h] = o.kind === "line" ? [Math.min(o.x1, o.x2), Math.min(o.y1, o.y2), Math.abs(o.x2 - o.x1), Math.abs(o.y2 - o.y1)] : [o.x, o.y, o.w, o.h];
    return x + w <= 0 || y + h <= 0 || x >= W || y >= H;
  };
  if (what === "info") { delete deck.info; return deck; }
  if (what === "hiddenSlides") {
    const keep = deck.slides.filter((s, i) => !s.hidden || i === 0);
    if (keep.length >= 2) deck.slides = keep;
    return deck;
  }
  for (const s of deck.slides) {
    if (what === "comments") delete s.comments;
    if (what === "notes") delete s.notes;
    if (what === "hiddenObjects" || what === "offSlide") {
      const gone = new Set((s.elements || []).filter((o) => (what === "hiddenObjects" ? o.hidden : !o.hidden && off(o))).map((o) => o.id));
      if (!gone.size) continue;
      s.elements = s.elements.filter((o) => !gone.has(o.id));
      if (!s.elements.length) delete s.elements;
      if (s.timeline) { s.timeline = s.timeline.filter((e) => !gone.has(e.el)); if (!s.timeline.length) delete s.timeline; }
      if (s.readingOrder) { s.readingOrder = s.readingOrder.filter((id) => !gone.has(id)); if (s.readingOrder.length < 2) delete s.readingOrder; }
    }
  }
  return deck;
}

const INSPECT_LABELS = { comments: ["コメント", "件"], notes: ["スピーカー ノート", "枚"], hiddenSlides: ["非表示スライド", "枚"], hiddenObjects: ["非表示の部品", "個"], offSlide: ["スライドの外にある部品", "個"], info: ["ドキュメントのプロパティ（作成者など）", ""] };

export function createFileInfo(app) {
  const { h, E } = app;
  function open() {
    const deck = app.deck();
    if (!deck) return;
    const info = infoOf(deck.info) || {};
    const inputs = {};
    const fields = h("div", { class: "fi-fields" }, h("label", {}, h("span", {}, "タイトル"), h("input", { type: "text", value: deck.title || "", maxlength: "100", disabled: true, title: "タイトルは上部の資料名で変えます" })),
      INFO_FIELDS.map(([key, label, max]) => {
        inputs[key] = key === "comments" ? h("textarea", { rows: 3, maxlength: String(max) }, info[key] || "") : h("input", { type: "text", value: info[key] || "", maxlength: String(max), placeholder: key === "author" ? app.userName() || "" : "" });
        return h("label", {}, h("span", {}, label), inputs[key]);
      }));
    const stats = h("dl", { class: "fi-stats" });
    const inspectBox = h("div", { class: "fi-inspect" });
    function renderSide() {
      const d = app.deck();
      const st = deckStats(d, E);
      stats.replaceChildren(...[["スライド", `${st.slides}枚${st.hidden ? `（非表示 ${st.hidden}）` : ""}${st.drill ? `・深掘り ${st.drill}` : ""}`], ["セクション", `${st.sections}`], ["部品", `${st.objects}個（画像・動画・音声 ${st.media}）`], ["アニメーション", `${st.animations}`], ["ノート", `${st.notes}枚`], ["コメント", `${st.comments}件（未解決 ${st.open}）`], ["文字数", `${st.chars.toLocaleString("ja-JP")}字`], ["スタジオの版", app.version || ""]]
        .flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
      const found = inspect(d, E.W, E.H);
      inspectBox.replaceChildren(h("b", {}, "ドキュメント検査"), h("p", { class: "hint" }, "資料を社外や他部署へ渡す前に、残したくない情報を確かめて削除します。"),
        ...Object.entries(INSPECT_LABELS).map(([key, [label, unit]]) => h("div", { class: "fi-row", "data-inspect": key },
          h("span", { class: found[key] ? "found" : "clean" }, found[key] ? "!" : "✓"),
          h("span", {}, label, found[key] && unit ? `：${found[key]}${unit}` : found[key] ? "" : "：なし"),
          found[key] ? h("button", { type: "button", class: "btn btn-xs", onclick: () => {
            if (key === "info") { Object.values(inputs).forEach((el) => { el.value = ""; }); }
            app.stripDeck(key);
            renderSide();
          } }, "すべて削除") : null)));
    }
    renderSide();
    const dialog = h("dialog", { class: "fileinfo-dialog", "aria-label": "情報" },
      h("div", { class: "dialog-head" }, h("h3", {}, "情報（プロパティ）"), h("button", { class: "btn btn-ghost btn-icon", type: "button", "aria-label": "閉じる", onclick: () => dialog.close() }, "✕")),
      h("div", { class: "dialog-body fi-body" }, h("div", {}, fields), h("div", { class: "fi-side" }, h("b", {}, "統計"), stats, inspectBox)),
      h("div", { class: "dialog-foot" }, h("button", { type: "button", class: "btn btn-ghost", onclick: () => dialog.close() }, "キャンセル"),
        h("button", { type: "button", class: "btn btn-primary fi-ok", onclick: () => {
          const next = infoOf(Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value])));
          if (JSON.stringify(next) !== JSON.stringify(infoOf(app.deck().info))) app.setDeckFields({ info: next });
          dialog.close();
        } }, "OK")));
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove());
    dialog.showModal();
  }
  return { open };
}
