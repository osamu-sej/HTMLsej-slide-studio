// Review comments on slides, as PowerPoint's コメント pane (校閲 → 新しいコメント): the comments of the slide on the
// stage (or of every slide), a box to write a new one, 解決 and 削除, and 前へ / 次へ to the slides that have some.
// Comments are slide.comments ({ id, text, at, done }): people's own, kept through AI changes, not in the slide show.

export function createComments(app) {
  const { h } = app;
  const pane = document.getElementById("commentPane");
  let draft = "";
  let all = false;
  const slides = () => app.deck()?.slides || [];
  const when = (at) => {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  function render() {
    if (!pane || pane.hidden) return;
    const index = app.index();
    const head = h("div", { class: "fp-head an-pane-head" }, h("b", {}, "コメント"),
      h("span", { class: "an-pane-btns" },
        h("button", { type: "button", class: "btn btn-sm", title: "前のコメントのあるスライドへ", onclick: () => go(-1) }, "‹ 前へ"),
        h("button", { type: "button", class: "btn btn-sm", title: "次のコメントのあるスライドへ", onclick: () => go(1) }, "次へ ›")));
    const body = h("div", { class: "fp-body" });
    body.append(h("label", { class: "fp-check cm-all" }, h("input", { type: "checkbox", checked: all || null, onchange: (event) => { all = event.target.checked; render(); } }), "すべてのスライドのコメントを表示"));
    const list = h("ul", { class: "cm-list" });
    const targets = all ? slides().map((slide, i) => [slide, i]) : [[slides()[index], index]];
    let count = 0;
    for (const [slide, i] of targets) {
      for (const c of slide?.comments || []) {
        count += 1;
        list.append(h("li", { class: ["cm-item", c.done ? "done" : ""], "data-id": c.id },
          h("div", { class: "cm-meta" },
            all ? h("button", { type: "button", class: "cm-slide", onclick: () => app.select(i) }, `スライド ${i + 1}`) : null,
            h("span", {}, when(c.at)),
            c.done ? h("span", { class: "cm-done" }, "解決済み") : null),
          h("div", { class: "cm-text" }, c.text),
          h("div", { class: "cm-actions" },
            h("button", { type: "button", class: "btn btn-sm", onclick: () => update(i, c.id, { done: !c.done }) }, c.done ? "未解決に戻す" : "✓ 解決"),
            h("button", { type: "button", class: "btn btn-sm btn-ghost btn-danger", onclick: () => remove(i, c.id) }, "削除"))));
      }
    }
    if (!count) body.append(h("p", { class: "hint" }, all ? "この資料にはまだコメントがありません。" : "このスライドにはまだコメントがありません。下に書いて追加できます。"));
    body.append(list);
    const input = h("textarea", { class: "cm-input", rows: 3, "aria-label": "新しいコメント", placeholder: `スライド ${index + 1} へのコメント（確かめたいこと・直してほしいこと）`, oninput: (event) => { draft = event.target.value; } }, draft);
    input.addEventListener("keydown", (event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.isComposing) { event.preventDefault(); post(); } });
    body.append(h("div", { class: "cm-new" }, input,
      h("div", { class: "cm-new-foot" }, h("span", { class: "hint" }, "⌘Enterで投稿"), h("button", { type: "button", class: "btn btn-primary btn-sm", onclick: () => post() }, "投稿"))));
    pane.replaceChildren(head, body);
  }

  function post() {
    const text = draft.trim();
    if (!text) return;
    const i = app.index();
    const slide = slides()[i];
    if (!slide) return;
    draft = "";
    app.setCommentsOf(i, [...(slide.comments || []), { id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, text: text.slice(0, 2000), at: new Date().toISOString() }]);
    app.toast(`スライド ${i + 1} にコメントを付けました`);
  }
  function update(i, id, patch) {
    app.setCommentsOf(i, (slides()[i]?.comments || []).map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function remove(i, id) {
    app.setCommentsOf(i, (slides()[i]?.comments || []).filter((c) => c.id !== id));
  }
  /** The next (or previous) slide that has comments, wrapping around. */
  function go(dir) {
    const n = slides().length;
    for (let k = 1; k <= n; k += 1) {
      const i = (((app.index() + dir * k) % n) + n) % n;
      if (slides()[i]?.comments?.length) { app.select(i); return; }
    }
    app.toast("コメントのあるスライドはほかにありません");
  }
  const focusNew = () => requestAnimationFrame(() => pane?.querySelector(".cm-input")?.focus());
  return { render, go, focusNew };
}
