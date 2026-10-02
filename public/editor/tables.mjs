// Tables and charts, PowerPoint style: 挿入 → 表 (a grid to pick rows × columns) and グラフ, the contextual tabs
// テーブル デザイン・レイアウト (styles, header and banded rows, cell fill, rows and columns, merge and split,
// alignment) and グラフのデザイン (kind, data), the chart's data sheet, and dragging a table's column and row
// lines on the stage.

import * as ops from "./ops.mjs";
import { ico } from "./icons.mjs";

const SAMPLE = {
  labels: ["4月", "5月", "6月", "7月"],
  series: [{ name: "売上", values: [120, 135, 128, 160] }, { name: "前年", values: [110, 118, 125, 131] }],
};
const CHART_ICONS = { bar: "chartBar", "stacked-bar": "chartStack", "100-stacked-bar": "chartStack", line: "chartLine", "multi-line": "chartLine", donut: "chartDonut", combo: "chartCombo" };

export function createTableUi(editor, app, kit) {
  const { E, h } = app;
  const { btn, drop, group, col, row, menu, openPop, updater, colors, showTab } = kit;
  let line = null;

  const one = () => (editor.selection.length === 1 ? editor.objects().find((o) => o.id === editor.selection[0]) : null) || (editor.typing ? editor.objects().find((o) => o.id === editor.state.typing?.id) : null);
  const table = () => { const o = one(); return o?.kind === "table" ? o : null; };
  const chart = () => { const o = one(); return o?.kind === "chart" ? o : null; };
  const target = () => editor.tableTarget();
  const change = (fn) => editor.changeTable(fn);

  // ---------------------------------------------------------------- inserting

  function insertTable(rows, cols) {
    const w = Math.min(1640, cols * 240);
    const hh = rows * 76;
    const o = { ...ops.makeTable(rows, cols, { x: 0, y: 0, w, h: hh }), id: ops.newId() };
    const [made] = editor.insert([o]);
    if (made) { showTab("tableDesign"); editor.startTyping(made.id, { cell: [0, 0] }); }
  }
  /** The grid under 表: hover to pick rows × columns (PowerPoint's 10 × 8), or type the numbers. */
  function tablePicker() {
    return (close) => {
      const label = h("div", { class: "tb-pick-label" }, "表の挿入");
      const cells = [];
      const grid = h("div", { class: "tb-pick" });
      for (let r = 0; r < 8; r += 1) for (let c = 0; c < 10; c += 1) {
        const cell = h("button", { type: "button", "aria-label": `${r + 1}行 × ${c + 1}列`, onmouseenter: () => mark(r, c), onfocus: () => mark(r, c), onclick: () => { close(); insertTable(r + 1, c + 1); } });
        cells.push([r, c, cell]);
        grid.append(cell);
      }
      const mark = (rr, cc) => { label.textContent = `${cc + 1} × ${rr + 1} 表`; for (const [r, c, el] of cells) el.classList.toggle("on", r <= rr && c <= cc); };
      return h("div", { class: "tb-picker" }, label, grid, h("div", { class: "rb-sep" }),
        h("button", { type: "button", class: "tb-pick-more", onclick: async () => {
          close();
          const answer = await app.ask("表の挿入", "列数 × 行数（例：4 × 5）", "4 × 5");
          const m = /(\d+)\s*[×xX*,\s]\s*(\d+)/.exec(answer || "");
          if (m) insertTable(Math.min(40, Math.max(1, Number(m[2]))), Math.min(20, Math.max(1, Number(m[1]))));
        } }, ico("table"), "表の挿入…（列数と行数を指定）"));
    };
  }
  function insertChart(type) {
    const data = JSON.parse(JSON.stringify(SAMPLE));
    if (["bar", "line", "donut"].includes(type)) data.series = data.series.slice(0, 1);
    if (type === "donut") { data.labels = ["来店", "アプリ", "宅配"]; data.series[0].values = [60, 25, 15]; data.series[0].name = "構成比"; }
    const o = ops.makeObject("chart", { x: 0, y: 0, w: 960, h: 560 }, { chart: { type, ...data } });
    const [made] = editor.insert([o]);
    if (made) { showTab("chartDesign"); editChart(made.id); }
  }
  function chartPicker(run = insertChart) {
    return (close) => h("div", { class: "rb-gallery tb-charts" },
      h("div", { class: "rb-gallery-head" }, "グラフの種類"),
      h("div", { class: "tb-chart-grid" }, Object.entries(E.CHART_KINDS).map(([key, name]) => h("button", { type: "button", "data-chart": key, onclick: () => { close(); run(key); } }, ico(CHART_ICONS[key] || "chartBar", 30), h("small", {}, name)))),
      h("p", { class: "rb-note" }, "色はSEJの配色（強調は濃紺、ほかは淡い青）。データは表で入力・貼り付けできます。"));
  }

  // ---------------------------------------------------------------- the chart's data sheet

  /** グラフのデータ: categories down, series across; paste from Excel; the chart previews as you type. */
  function editChart(id) {
    const o = editor.objects().find((x) => x.id === id);
    if (o?.kind !== "chart") return;
    const data = JSON.parse(JSON.stringify(o.chart));
    const dialog = h("dialog", { class: "tb-sheet-dialog" });
    const preview = h("div", { class: "tb-sheet-preview" });
    const sheet = h("div", { class: "tb-sheet-wrap" });
    const kind = h("select", { "aria-label": "グラフの種類", onchange: () => { data.type = kind.value; draw(); } }, Object.entries(E.CHART_KINDS).map(([k, l]) => h("option", { value: k, selected: k === data.type || null }, l)));
    const title = h("input", { type: "text", value: data.title || "", placeholder: "（なし）", "aria-label": "グラフのタイトル", oninput: () => { data.title = title.value; draw(); } });
    const unit = h("input", { type: "text", value: data.unit || "", placeholder: "例：億円", maxlength: 10, "aria-label": "単位", oninput: () => { data.unit = unit.value; } });
    const draw = () => {
      renderSheet();
      const clean = E.normalizeObject({ ...o, chart: data });
      preview.replaceChildren();
      if (!clean) { preview.append(h("p", { class: "hint" }, "項目と系列を1つ以上入れてください")); return; }
      const el = E.objectNode(clean, {}, [clean]);
      el.style.left = "0px";
      el.style.top = "0px";
      const holder = h("div", { class: "tb-sheet-slide hs-slide", "data-theme": "sej" }, el);
      holder.style.width = `${clean.w}px`;
      holder.style.height = `${clean.h}px`;
      preview.append(holder);
      const fit = () => { const k = Math.min((preview.clientWidth - 16) / clean.w, (preview.clientHeight - 16) / clean.h); holder.style.transform = `translate(${(preview.clientWidth - clean.w * k) / 2}px, ${(preview.clientHeight - clean.h * k) / 2}px) scale(${k})`; };
      if (preview.clientWidth) fit(); else requestAnimationFrame(fit);
      requestAnimationFrame(() => E.repaintCharts?.(preview));
    };
    const single = () => ["bar", "line", "donut"].includes(data.type);
    function renderSheet() {
      const shown = single() ? data.series.slice(0, 1) : data.series;
      const head = h("tr", {}, h("th", {}, ""), shown.map((s, j) => h("th", {}, h("input", { type: "text", value: s.name, "aria-label": `系列${j + 1}の名前`, oninput: (event) => { data.series[j].name = event.target.value; } }),
        !single() && data.series.length > 1 ? h("button", { type: "button", class: "tb-x", title: "この系列を削除", onclick: () => { data.series.splice(j, 1); draw(); } }, "×") : null)));
      const body = data.labels.map((label, i) => h("tr", {},
        h("th", {}, h("input", { type: "text", value: label, "aria-label": `項目${i + 1}`, oninput: (event) => { data.labels[i] = event.target.value; scheduleDraw(); } }),
          data.labels.length > 1 ? h("button", { type: "button", class: "tb-x", title: "この項目を削除", onclick: () => { data.labels.splice(i, 1); for (const s of data.series) s.values.splice(i, 1); draw(); } }, "×") : null),
        shown.map((s, j) => h("td", {}, h("input", { type: "text", inputmode: "decimal", value: String(s.values[i] ?? 0), "aria-label": `${label}・${s.name}`, oninput: (event) => { const v = Number(String(event.target.value).replace(/[,，]/g, "")); data.series[j].values[i] = Number.isFinite(v) ? v : 0; scheduleDraw(); } })))));
      sheet.replaceChildren(h("table", { class: "tb-sheet", onpaste: onPaste }, h("thead", {}, head), h("tbody", {}, body)),
        h("div", { class: "tb-sheet-btns" },
          h("button", { type: "button", class: "btn btn-sm", disabled: data.labels.length >= E.CHART_MAX_LABELS || null, onclick: () => { data.labels.push(`項目${data.labels.length + 1}`); for (const s of data.series) s.values.push(0); draw(); } }, "＋ 項目（行）"),
          single() ? null : h("button", { type: "button", class: "btn btn-sm", disabled: data.series.length >= E.CHART_MAX_SERIES || null, onclick: () => { data.series.push({ name: `系列${data.series.length + 1}`, values: data.labels.map(() => 0) }); draw(); } }, "＋ 系列（列）"),
          h("span", { class: "hint" }, "Excelの表をコピーして貼り付けられます（1行目が系列名、1列目が項目名）")));
    }
    let timer = null;
    const scheduleDraw = () => { clearTimeout(timer); timer = setTimeout(() => { const focus = document.activeElement?.getAttribute("aria-label"); draw(); sheet.querySelector(`[aria-label="${CSS.escape(focus || "")}"]`)?.focus(); }, 350); };
    function onPaste(event) {
      const text = event.clipboardData?.getData("text/plain") || "";
      if (!text.includes("\t") && !text.includes("\n")) return;
      event.preventDefault();
      const rows = text.replace(/\r/g, "").split("\n").filter(Boolean).map((line) => line.split("\t"));
      if (rows.length < 2) return;
      const names = rows[0].slice(1).map((name, j) => name.trim() || `系列${j + 1}`).slice(0, E.CHART_MAX_SERIES);
      data.labels = rows.slice(1, E.CHART_MAX_LABELS + 1).map((r) => (r[0] || "").trim());
      data.series = names.map((name, j) => ({ name, values: rows.slice(1, E.CHART_MAX_LABELS + 1).map((r) => { const v = Number(String(r[j + 1] ?? "").replace(/[,，%％\s]/g, "")); return Number.isFinite(v) ? v : 0; }) }));
      if (single() && data.series.length > 1) data.type = data.type === "line" ? "multi-line" : data.type === "bar" ? "stacked-bar" : data.type;
      kind.value = data.type;
      draw();
    }
    const close = (save) => {
      if (save) {
        const next = E.normalizeObject({ ...o, chart: { ...data, title: data.title?.trim() || undefined, unit: data.unit?.trim() || undefined } });
        if (next) editor.commit(editor.objects().map((x) => (x.id === id ? { ...x, chart: next.chart } : x)), { select: [id] });
      }
      dialog.close();
      dialog.remove();
    };
    dialog.append(
      h("div", { class: "dialog-head" }, h("h3", {}, "グラフのデータ"), h("button", { class: "btn btn-ghost btn-icon", type: "button", "aria-label": "閉じる", onclick: () => close(false) }, "✕")),
      h("div", { class: "dialog-body tb-sheet-body" },
        h("div", { class: "tb-sheet-side" },
          h("label", { class: "field" }, h("span", {}, "種類"), kind),
          h("label", { class: "field" }, h("span", {}, "タイトル"), title),
          h("label", { class: "field" }, h("span", {}, "単位"), unit),
          preview),
        sheet),
      h("div", { class: "dialog-foot" }, h("button", { class: "btn", type: "button", onclick: () => close(false) }, "キャンセル"), h("button", { class: "btn btn-primary", type: "button", onclick: () => close(true) }, "反映する")));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(false); });
    document.body.append(dialog);
    draw();
    dialog.showModal();
  }

  // ---------------------------------------------------------------- the contextual tabs

  const isTable = () => Boolean(table());
  const isChart = () => Boolean(chart());
  const option = (key, label, title) => btn("check", label, title, () => change((o) => ({ ...o, [key]: !(E.withDefaults(o)[key]) })), { pressed: () => Boolean(table() && E.withDefaults(table())[key]) });
  function styleThumb(key) {
    const t = h("span", { class: `tb-style-thumb ts-${key}` });
    for (let r = 0; r < 4; r += 1) t.append(h("i", { class: r === 0 ? "head" : r % 2 === 0 ? "band" : "" }));
    return t;
  }
  function designTab() {
    const styles = Object.entries(E.TABLE_STYLES).map(([key, name]) => {
      const b = h("button", { type: "button", class: "tb-style", title: name, "data-keeps-text": "", onmousedown: (event) => event.preventDefault(), onclick: () => change((o) => ({ ...o, style: key === "sej" ? undefined : key })) }, styleThumb(key), h("small", {}, name));
      updater(() => b.classList.toggle("on", (table()?.style || "sej") === key));
      return b;
    });
    return [
      group("表スタイルのオプション",
        col(option("header", "ヘッダー行", "1行目を見出しにする"), option("lastRow", "集計行", "最後の行を太字と罫線で"), option("banded", "縞模様（行）", "1行おきに淡い色")),
        col(option("firstCol", "最初の列", "1列目を太字に"))),
      group("表のスタイル", h("div", { class: "tb-styles" }, styles)),
      group("セル",
        col(drop("fill", "塗りつぶし", "選んだセルの色（SEJの面の色）", () => colors(E.PALETTE.fill, "", (c) => change((o, t) => ops.tableCells(o, t.r0, t.c0, t.r1, t.c1, { fill: c === "none" ? undefined : c })), { none: "塗りつぶしなし" }), { enabled: isTable, keep: true }),
          drop("fontColor", "文字の色", "選んだセルの文字の色（黒・濃紺・グレー）", () => colors(E.PALETTE.text, "", (c) => editor.textFormat("color", c), { custom: false }), { enabled: isTable, keep: true }),
          btn("clear", "書式のクリア", "選んだセルの太字・色を戻す", () => editor.textFormat("clear"), { enabled: isTable, keep: true }))),
    ];
  }
  function layoutTab() {
    const t = () => target();
    const merged = () => { const x = t(); return Boolean(x && x.cells && (x.r1 > x.r0 || x.c1 > x.c0) && !editor.cellRange); };
    const ranged = () => Boolean(editor.cellRange);
    return [
      group("表", btn("selectAll", "表の選択", "表全体を選ぶ（セルの入力を終える）", () => { const o = table(); if (o) { editor.stopTyping(true); editor.select([o.id]); } }, { big: true, enabled: isTable , keep: true })),
      group("行と列",
        col(btn("rowAbove", "上に行を挿入", "", () => change((o, x) => ops.tableInsertRow(o, x.r0)), { enabled: isTable, keep: true }),
          btn("rowBelow", "下に行を挿入", "", () => change((o, x) => ops.tableInsertRow(o, x.r1 + 1)), { enabled: isTable, keep: true })),
        col(btn("colLeft", "左に列を挿入", "", () => change((o, x) => ops.tableInsertCol(o, x.c0)), { enabled: isTable, keep: true }),
          btn("colRight", "右に列を挿入", "", () => change((o, x) => ops.tableInsertCol(o, x.c1 + 1)), { enabled: isTable, keep: true })),
        drop("trash", "削除", "行・列・表の削除", () => menu([
          { label: "行の削除", icon: "rowAbove", run: () => { const x = t(); if (!x) return; const next = ops.tableDeleteRows(x.o, x.r0, x.r1); if (next) change(() => next); else editor.removeSelection(); } },
          { label: "列の削除", icon: "colLeft", run: () => { const x = t(); if (!x) return; const next = ops.tableDeleteCols(x.o, x.c0, x.c1); if (next) change(() => next); else editor.removeSelection(); } },
          { label: "表の削除", icon: "trash", run: () => { const o = table(); if (o) { editor.stopTyping(false); editor.select([o.id]); editor.removeSelection(); } } },
        ]), { big: true, enabled: isTable , keep: true })),
      group("結合",
        col(btn("merge", "セルの結合", "選んだセル（Shift＋クリックかドラッグで選ぶ）を1つに", () => editor.changeTable((o, x) => ops.tableMerge(o, x.r0, x.c0, x.r1, x.c1), { keepRange: false }), { enabled: ranged , keep: true }),
          btn("split", "セルの分割", "結合したセルを元に戻す", () => change((o, x) => ops.tableSplit(o, x.r0, x.c0)), { enabled: merged , keep: true }))),
      group("セルのサイズ",
        col(btn("distV", "高さを揃える", "選んだ行（なければ全部）の高さを同じに", () => change((o, x) => ops.tableDistribute(o, "rows", x.cells ? x.r0 : 0, x.cells ? x.r1 : Infinity)), { enabled: isTable , keep: true }),
          btn("distH", "幅を揃える", "選んだ列（なければ全部）の幅を同じに", () => change((o, x) => ops.tableDistribute(o, "cols", x.cells ? x.c0 : 0, x.cells ? x.c1 : Infinity)), { enabled: isTable , keep: true }))),
      group("配置",
        row(btn("textLeft", "", "左揃え", () => editor.textFormat("align", "left"), { enabled: isTable, keep: true }), btn("textCenter", "", "中央揃え", () => editor.textFormat("align", "center"), { enabled: isTable, keep: true }), btn("textRight", "", "右揃え", () => editor.textFormat("align", "right"), { enabled: isTable, keep: true })),
        row(btn("valignTop", "", "上揃え", () => editor.textFormat("valign", "top"), { enabled: isTable, keep: true }), btn("valignMiddle", "", "上下中央揃え", () => editor.textFormat("valign", "middle"), { enabled: isTable, keep: true }), btn("valignBottom", "", "下揃え", () => editor.textFormat("valign", "bottom"), { enabled: isTable, keep: true }))),
    ];
  }
  function chartTab() {
    const resetStyle = () => { const o = chart(); if (o?.chart.style) editor.commit(editor.objects().map((x) => (x.id === o.id ? { ...x, chart: { ...x.chart, style: undefined } } : x)), { select: [o.id] }); };
    const setKind = (type) => { const o = chart(); if (o) editor.commit(editor.objects().map((x) => (x.id === o.id ? { ...x, chart: { ...x.chart, type } } : x)), { select: [o.id] }); };
    const ask = async (key, label, hint) => {
      const o = chart();
      if (!o) return;
      const value = await app.ask(label, hint, o.chart[key] || "");
      if (value == null) return;
      editor.commit(editor.objects().map((x) => (x.id === o.id ? { ...x, chart: { ...x.chart, [key]: value.trim() || undefined } } : x)), { select: [o.id] });
    };
    return [
      group("種類", drop("chartBar", "グラフの種類|の変更", "縦棒・積み上げ・折れ線・ドーナツ・複合", () => chartPicker(setKind), { big: true, enabled: isChart })),
      group("データ", btn("table", "データの|編集", "項目と値を表で直す（Excelから貼り付けもできます）", () => { const o = chart(); if (o) editChart(o.id); }, { big: true, enabled: isChart }),
        // A chart brought over from PowerPoint keeps its formatting until it is reset to the studio's look.
        btn("reset", "書式を|リセット", "PowerPointから取り込んだグラフの書式（色・ラベル・軸・凡例）を外し、スタジオのグラフの描き方にします", resetStyle, { big: true, enabled: () => Boolean(chart()?.chart.style) })),
      group("グラフ要素", col(btn("textbox", "タイトル…", "グラフの上に出す見出し", () => ask("title", "グラフのタイトル", "空にすると消えます"), { enabled: isChart }), btn("font", "単位…", "値の単位（例：億円）", () => ask("unit", "値の単位", "例：億円・%"), { enabled: isChart }))),
    ];
  }

  // ---------------------------------------------------------------- moving a table's lines on the stage

  function overlay(list, k) {
    const o = editor.selection.length === 1 ? list.find((x) => x.id === editor.selection[0]) : null;
    if (!o || o.kind !== "table" || o.locked || o.rot) return [];
    const out = [];
    let x = o.x;
    o.cols.slice(0, -1).forEach((f, i) => { x += f * o.w; out.push(h("span", { class: "ed-handle ed-tline col", "data-handle": `tbl:col:${i}`, title: "ドラッグで列の幅を変える", style: { left: `${x * k}px`, top: `${o.y * k}px`, height: `${o.h * k}px` } })); });
    let y = o.y;
    o.rows.slice(0, -1).forEach((f, i) => { y += f * o.h; out.push(h("span", { class: "ed-handle ed-tline row", "data-handle": `tbl:row:${i}`, title: "ドラッグで行の高さを変える", style: { top: `${y * k}px`, left: `${o.x * k}px`, width: `${o.w * k}px` } })); });
    if (line) out.push(h("span", { class: `ed-tguide ${line.axis}`, style: line.axis === "cols" ? { left: `${line.at * k}px`, top: `${o.y * k}px`, height: `${o.h * k}px` } : { top: `${line.at * k}px`, left: `${o.x * k}px`, width: `${o.w * k}px` } }));
    return out;
  }
  editor.overlay(overlay);
  editor.handle("tbl:", (event, handle, p) => {
    const [, kind, index] = handle.split(":");
    const axis = kind === "row" ? "rows" : "cols";
    const o = table();
    if (!o) return;
    const i = Number(index);
    const start = axis === "cols" ? p[0] : p[1];
    const base = (axis === "cols" ? o.x : o.y) + o[axis].slice(0, i + 1).reduce((s, f) => s + f, 0) * (axis === "cols" ? o.w : o.h);
    line = { axis, at: base };
    editor.draw();
    const move = (ev) => { const q = editor.toSlide(ev); line = { axis, at: base + ((axis === "cols" ? q[0] : q[1]) - start) }; editor.draw(); };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const q = editor.toSlide(ev);
      const d = (axis === "cols" ? q[0] : q[1]) - start;
      line = null;
      if (Math.abs(d) > 1) editor.commit(editor.objects().map((x) => (x.id === o.id ? ops.tableResizeLine(x, axis, i, d) : x)), { select: [o.id] });
      else editor.draw();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });

  return { tablePicker, chartPicker, insertChart, editChart, designTab, layoutTab, chartTab, isTable, isChart };
}
