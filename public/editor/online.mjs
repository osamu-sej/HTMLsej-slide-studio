// スライド ショー → オンライン プレゼンテーション (PowerPoint's Present Online): the presenter shares a link; anyone
// who opens it watches the show in their browser, following the presenter slide by slide and click by click. The
// server keeps a room of the "show" kind (server/rooms.mjs): the deck, the presenter's text fitting and where the show
// is. Only the presenter holds the room's key; viewers only watch (no editing, no moving the show).

import { userName } from "./people.mjs";

const newClientId = () => `v${(globalThis.crypto?.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/[^a-z0-9]/gi, "").slice(0, 20)}`;
const mediaIds = (slides) => [...new Set((slides || []).flatMap((s) => [s?.media?.src, ...(s?.elements || []).map((o) => o?.src)]).filter((src) => typeof src === "string" && src.startsWith("idb:")))];
const api = (id, rest = "") => `/api/rooms/${encodeURIComponent(id)}${rest}`;

export function createOnline(app) {
  const { h } = app;
  // The presenter's side: { id, key, es, client, viewers, sent (deck JSON when connected), chain, last }.
  let live = null;

  async function post(path, body, method = "POST") {
    const response = await fetch(api(live.id, path), { method, credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: live.key, ...body }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }
  async function uploadMedia(deck) {
    for (const src of mediaIds(deck.slides)) {
      try {
        const blob = await app.mediaBlob(src);
        if (blob) await fetch(api(live.id, `/media/${encodeURIComponent(src.slice(4))}`), { method: "PUT", credentials: "same-origin", headers: { "content-type": blob.type || "application/octet-stream" }, body: blob });
      } catch { /* the viewers see the slide without it */ }
    }
  }
  const link = () => { const url = new URL(location.href); url.search = ""; url.hash = ""; url.searchParams.set("watch", live.id); return url.toString(); };

  /** 接続: the deck goes to a new show room; the presenter listens to it to know how many are watching. */
  async function connect() {
    const deck = app.deck();
    if (!deck) return false;
    app.ensureAllSids();
    const fits = await app.fitsForShow();
    const response = await fetch("/api/rooms", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ deck: app.deck(), fits, show: true }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    live = { id: result.id, key: result.key, es: null, client: newClientId(), viewers: 0, sent: JSON.stringify(app.deck()), chain: Promise.resolve(), last: null, presenting: false };
    await uploadMedia(app.deck());
    const params = new URLSearchParams({ client: live.client, name: `${userName() || "発表者"}（発表者）` });
    const es = new EventSource(api(live.id, `?${params}`));
    live.es = es;
    const count = (people) => { if (!live) return; live.viewers = (people || []).filter((p) => p.id !== live.client).length; refresh(); };
    es.addEventListener("snapshot", (event) => count(JSON.parse(event.data).people));
    es.addEventListener("people", (event) => count(JSON.parse(event.data).people));
    app.refreshRibbon();
    return true;
  }

  /** Where the show is now, to everyone watching (in order; a newer position replaces one not yet sent). */
  function sendState(state) {
    if (!live) return;
    live.last = state;
    live.chain = live.chain.then(async () => {
      if (!live || live.last !== state) return;
      try { await post("/show", state); } catch { /* the next move sends again */ }
    });
  }

  /** プレゼンテーションの開始: present here; every slide and click goes to the viewers. */
  async function present(start = app.index(), { custom = null } = {}) {
    if (!live) return;
    live.presenting = true;
    await app.openPresenter(start, {
      custom,
      extra: { onChange: ({ index, step }) => sendState({ index, step: Number.isFinite(step) ? step : 10_000, sid: app.deck()?.slides[index]?.sid }) },
      onClosed: (index) => { if (!live) return; live.presenting = false; sendState({ index: index ?? 0, step: 0, ended: true }); refresh(); },
    });
  }

  /** 資料の更新: the deck as it is now (after editing during the show) goes to the viewers. */
  async function update() {
    if (!live) return;
    app.ensureAllSids();
    const fits = await app.fitsForShow();
    await post("/deck", { deck: app.deck(), fits }, "PUT");
    await uploadMedia(app.deck());
    live.sent = JSON.stringify(app.deck());
    app.toast("視聴者の資料を更新しました");
    refresh();
  }

  /** オンライン プレゼンテーションの終了: viewers are told it is over; the link stops working when the room is forgotten. */
  async function end() {
    if (!live) return;
    try { await post("/show", { index: 0, step: 0, ended: true, over: true }); } catch { /* the room may be gone already */ }
    try { live.es?.close(); } catch { /* closed */ }
    live = null;
    app.toast("オンライン プレゼンテーションを終了しました");
    app.refreshRibbon();
  }

  // ---------------------------------------------------------------- the dialog

  let dialog = null;
  function refresh() {
    if (!dialog?.isConnected) return;
    const body = dialog.querySelector(".op-body");
    body.replaceChildren(...content());
  }
  function content() {
    if (!live) {
      return [
        h("p", {}, "リンクを知っている人は、ブラウザでこの発表を見られます。視聴者の画面は、発表者のスライドとクリックに合わせて進みます。"),
        h("ul", { class: "op-points" },
          h("li", {}, "視聴者はアカウントもアプリも要りません（リンクを開くだけ）"),
          h("li", {}, "視聴者は資料を変更できません。発表を進められるのは発表者だけです"),
          h("li", {}, "資料はサーバーに一時的に置かれ、終了したりしばらく誰もいなかったりすると消えます")),
      ];
    }
    const input = h("input", { class: "op-link", readonly: true, value: link(), onfocus: (event) => event.target.select() });
    const changed = JSON.stringify(app.deck()) !== live.sent;
    return [
      h("p", {}, "このリンクを視聴者に送ってください。"),
      h("div", { class: "op-row" }, input,
        h("button", { type: "button", class: "btn btn-sm op-copy", onclick: async () => { try { await navigator.clipboard.writeText(link()); app.toast("リンクをコピーしました"); } catch { input.select(); } } }, "リンクのコピー"),
        h("a", { class: "btn btn-sm", href: `mailto:?subject=${encodeURIComponent(`オンライン プレゼンテーション：${app.deck()?.title || ""}`)}&body=${encodeURIComponent(link())}` }, "メールで送信")),
      h("p", { class: "op-status" }, h("span", { class: ["op-dot", live.presenting ? "on" : ""] }), live.presenting ? "発表中" : "接続済み（発表はまだ始まっていません）", `・視聴者 ${live.viewers}人`),
      changed ? h("p", { class: "hint" }, "接続したあとに資料を変更しました。「資料の更新」で視聴者にも反映できます。") : null,
    ].filter(Boolean);
  }
  async function open() {
    dialog?.remove();
    const start = h("button", { type: "button", class: "btn btn-primary op-start" });
    const updateBtn = h("button", { type: "button", class: "btn op-update", onclick: () => update().catch((error) => app.toast(`更新できません：${error.message}`)) }, "資料の更新");
    const endBtn = h("button", { type: "button", class: "btn op-end", onclick: () => { end(); dialog.close(); } }, "オンライン プレゼンテーションの終了");
    const sync = () => {
      start.textContent = live ? "プレゼンテーションの開始" : "接続";
      updateBtn.hidden = !live;
      endBtn.hidden = !live;
    };
    start.onclick = async () => {
      if (!live) {
        start.disabled = true;
        start.textContent = "接続中…";
        try { await connect(); } catch (error) { app.toast(`接続できません：${error.message}`); }
        start.disabled = false;
        sync();
        refresh();
        return;
      }
      dialog.close();
      present(app.index());
    };
    dialog = h("dialog", { class: "online-dialog", "aria-label": "オンライン プレゼンテーション" },
      h("div", { class: "dialog-head" }, h("h3", {}, "オンライン プレゼンテーション"), h("button", { class: "btn btn-ghost btn-icon", type: "button", "aria-label": "閉じる", onclick: () => dialog.close() }, "✕")),
      h("div", { class: "dialog-body op-body" }),
      h("div", { class: "dialog-foot" }, endBtn, updateBtn, h("span", { class: "op-spacer" }), h("button", { type: "button", class: "btn btn-ghost", onclick: () => dialog.close() }, "閉じる"), start));
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove());
    sync();
    refresh();
    dialog.showModal();
  }

  // ---------------------------------------------------------------- the viewer

  /** Opened from a link (…?watch=ID): the show fills the window and follows the presenter. */
  function watch(id) {
    const client = newClientId();
    let player = null;
    let deck = null;
    let fits = null;
    let state = null;
    const banner = h("div", { class: "op-banner", role: "status" });
    const placeMedia = (slides) => { for (const src of mediaIds(slides)) app.setMediaUrl(src, api(id, `/media/${encodeURIComponent(src.slice(4))}`)); };
    const say = (text) => { banner.textContent = text || ""; banner.hidden = !text; };
    const status = () => {
      if (!state) return say("接続しています…");
      if (state.over) return say("オンライン プレゼンテーションは終了しました。");
      if (!state.live) return say("発表者がスライド ショーを始めるのを待っています。");
      return say("");
    };
    const mount = () => {
      player?.destroy();
      player = app.openViewer(deck, { fits, start: state?.index ?? 0, step: state?.step ?? 0, label: deck.title ? `${deck.title}：発表者に合わせて表示しています` : null });
      player?.el.append(banner);
    };
    const es = new EventSource(api(id, `?${new URLSearchParams({ client, name: "視聴者" })}`));
    es.addEventListener("snapshot", (event) => {
      const data = JSON.parse(event.data);
      if (data.kind !== "show") { es.close(); app.toast("このリンクはオンライン プレゼンテーションではありません"); return; }
      deck = data.deck;
      fits = data.fits;
      state = data.show;
      placeMedia(deck.slides);
      if (!player) mount(); else player.follow(state.index, state.step);
      status();
    });
    es.addEventListener("show", (event) => {
      state = JSON.parse(event.data);
      if (player && state.live) player.follow(state.index, state.step);
      status();
      if (state.over) es.close();
    });
    es.addEventListener("deck", (event) => {
      const data = JSON.parse(event.data);
      deck = data.deck;
      fits = data.fits;
      state = data.show || state;
      placeMedia(deck.slides);
      mount();
      status();
    });
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED && !state?.over) {
        if (!player) { app.openViewerMessage("オンライン プレゼンテーションが見つかりません（終了したか、リンクが違います）。"); return; }
        say("接続が切れました。発表者の資料がサーバーから消えた可能性があります。");
      }
    };
    return { get player() { return player; }, get state() { return state; }, get deck() { return deck; } };
  }

  return {
    open, connect, present, update, end, watch,
    get active() { return Boolean(live); },
    info: () => (live ? { id: live.id, viewers: live.viewers, presenting: live.presenting, link: link() } : null),
  };
}
