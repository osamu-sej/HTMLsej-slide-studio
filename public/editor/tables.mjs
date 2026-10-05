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
const CHART_ICONS = { bar: "chartBar", "stacked-bar": "chartStack", "100-stacked-bar": "chartStack", line: "chartLine", "multi-line": "chartLine", donut: "chartDonut", combo: "chartCombo", area: "chartArea", pie: "chartPie", scatter: "chartScatter", radar: "chartRadar", waterfall: "chartWaterfall", funnel: "chartFunnel",
  hbar: "chartHbar", "stacked-hbar": "chartHstack", "stacked-area": "chartStackArea", bubble: "chartBubble", histogram: "chartHistogram", boxplot: "chartBox", treemap: "chartTreemap", sunburst: "chartSunburst" };
// What the data sheet means for the kinds that read it differently.
const CHART_HINTS = {
  bubble: "項目名がX（数値）、1列目（系列1）がY、2列目（系列2）がバブルの大きさです。",
  histogram: "1列目（系列1）の値を同じ幅の区間に分けて数えます（項目名は使いません）。",
  boxplot: "列（系列）ごとに1つの箱になります。各列に値を縦に並べてください（項目名は使いません）。",
  treemap: "「親/子」の項目名でグループにまとまります（例：食品/おにぎり）。",
  sunburst: "「親/子」の項目名で、内側の輪が親、外側の輪が子になります（例：食品/おにぎり）。",
};
// Sample data that suits each kind of chart when it is inserted (the data editor opens right after).
const SAMPLES = {
  pie: { labels: ["来店", "アプリ", "宅配"], series: [{ name: "構成比", values: [60, 25, 15] }] },
  scatter: { labels: ["10", "20", "30", "40", "50", "60"], series: [{ name: "売上（万円）", values: [120, 180, 210, 260, 300, 380] }] },
  radar: { labels: ["品揃え", "接客", "清潔さ", "価格", "立地"], series: [{ name: "自店", values: [4, 3.5, 4.5, 3, 4] }, { name: "地区平均", values: [3.5, 3.5, 3.8, 3.4, 3.6] }] },
  waterfall: { labels: ["前年", "来店客増", "客単価", "廃棄減", "人件費", "合計"], series: [{ name: "利益（百万円）", values: [100, 25, 12, 8, -15, 0] }] },
  funnel: { labels: ["認知", "興味", "来店", "購入", "リピート"], series: [{ name: "人数", values: [1000, 620, 380, 240, 120] }] },
  hbar: { labels: ["東日本", "中部", "西日本", "九州"], series: [{ name: "今期", values: [320, 210, 280, 150] }, { name: "前期", values: [290, 200, 250, 160] }] },
  "stacked-hbar": { labels: ["東日本", "中部", "西日本", "九州"], series: [{ name: "食品", values: [180, 120, 150, 80] }, { name: "飲料", values: [90, 60, 80, 45] }, { name: "日用品", values: [50, 30, 50, 25] }] },
  "stacked-area": { labels: ["4月", "5月", "6月", "7月", "8月"], series: [{ name: "店舗", values: [80, 85, 90, 96, 102] }, { name: "アプリ", values: [20, 26, 33, 41, 50] }, { name: "宅配", values: [10, 12, 15, 19, 24] }] },
  bubble: { labels: ["20", "35", "50", "65", "80"], series: [{ name: "売上（万円）", values: [120, 260, 180, 320, 240] }, { name: "店舗数", values: [8, 20, 12, 30, 15] }] },
  histogram: { labels: Array.from({ length: 24 }, (_, i) => String(i + 1)), series: [{ name: "待ち時間（分）", values: [2, 3, 3, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 9, 10, 11, 12, 14, 18] }] },
  boxplot: { labels: Array.from({ length: 8 }, (_, i) => String(i + 1)), series: [{ name: "東日本", values: [62, 68, 70, 71, 74, 77, 80, 95] }, { name: "中部", values: [55, 60, 63, 66, 68, 70, 72, 75] }, { name: "西日本", values: [58, 64, 69, 73, 76, 79, 83, 86] }] },
  treemap: { labels: ["食品/おにぎり", "食品/弁当", "食品/パン", "飲料/お茶", "飲料/コーヒー", "日用品/洗剤", "日用品/ティッシュ"], series: [{ name: "売上（百万円）", values: [42, 35, 18, 24, 20, 9, 6] }] },
  sunburst: { labels: ["食品/おにぎり", "食品/弁当", "食品/パン", "飲料/お茶", "飲料/コーヒー", "日用品/洗剤", "日用品/ティッシュ"], series: [{ name: "売上（百万円）", values: [42, 35, 18, 24, 20, 9, 6] }] },
};

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
    if (type === "donut") Object.assign(data, JSON.parse(JSON.stringify(SAMPLES.pie)));
    if (SAMPLES[type]) Object.assign(data, JSON.parse(JSON.stringify(SAMPLES[type])));
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
    const kindHint = h("p", { class: "hint tb-kind-hint" });
    const kind = h("select", { "aria-label": "グラフの種類", onchange: () => { data.type = kind.value; draw(); } }, Object.entries(E.CHART_KINDS).map(([k, l]) => h("option", { value: k, selected: k === data.type || null }, l)));
    const title = h("input", { type: "text", value: data.title || "", placeholder: "（なし）", "aria-label": "グラフのタイトル", oninput: () => { data.title = title.value; draw(); } });
    const unit = h("input", { type: "text", value: data.unit || "", placeholder: "例：億円", maxlength: 10, "aria-label": "単位", oninput: () => { data.unit = unit.value; } });
    const draw = () => {
      renderSheet();
      kindHint.textContent = CHART_HINTS[data.type] || "";
      kindHint.hidden = !CHART_HINTS[data.type];
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
    const gappy = () => ["boxplot", "histogram"].includes(data.type);
    function renderSheet() {
      const shown = single() ? data.series.slice(0, 1) : data.series;
      const head = h("tr", {}, h("th", {}, ""), shown.map((s, j) => h("th", {}, h("input", { type: "text", value: s.name, "aria-label": `系列${j + 1}の名前`, oninput: (event) => { data.series[j].name = event.target.value; } }),
        !single() && data.series.length > 1 ? h("button", { type: "button", class: "tb-x", title: "この系列を削除", onclick: () => { data.series.splice(j, 1); draw(); } }, "×") : null)));
      const body = data.labels.map((label, i) => h("tr", {},
        h("th", {}, h("input", { type: "text", value: label, "aria-label": `項目${i + 1}`, oninput: (event) => { data.labels[i] = event.target.value; scheduleDraw(); } }),
          data.labels.length > 1 ? h("button", { type: "button", class: "tb-x", title: "この項目を削除", onclick: () => { data.labels.splice(i, 1); for (const s of data.series) s.values.splice(i, 1); draw(); } }, "×") : null),
        shown.map((s, j) => h("td", {}, h("input", { type: "text", inputmode: "decimal", value: s.values[i] == null ? (gappy() ? "" : "0") : String(s.values[i]), "aria-label": `${label}・${s.name}`, oninput: (event) => {
          // 箱ひげ図・ヒストグラム: an empty cell stays empty (a group may hold fewer values than the others).
          const text = String(event.target.value).replace(/[,，]/g, "").trim();
          const v = Number(text);
          data.series[j].values[i] = gappy() && !text ? null : Number.isFinite(v) ? v : 0;
          scheduleDraw();
        } })))));
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
          kindHint,
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
  // 罫線の作成: the pen (its colour from the SEJ's line colours, its width in points) and the borders it draws.
  const PEN_WIDTHS = [[1, "0.5 pt"], [2, "1 pt"], [3, "1.5 pt"], [4.5, "2.25 pt"], [6, "3 pt"], [9, "4.5 pt"], [12, "6 pt"]];
  const pen = { c: "#1f3864", w: 2 };
  function bordersMenu() {
    return menu([{ head: `罫線（ペン：${PEN_WIDTHS.find(([w]) => w === pen.w)?.[1] || ""}・${E.PALETTE.line.find(([c]) => c === pen.c)?.[1] || pen.c}）` },
      ...ops.TABLE_BORDERS.map(([kind, label]) => ({ label, run: () => change((o, t) => ops.tableBorders(o, t.r0, t.c0, t.r1, t.c1, kind, pen)) }))]);
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
      group("罫線の作成",
        col(drop("weight", "ペンの太さ", "罫線を引くペンの太さ", () => menu([{ head: "ペンの太さ" }, ...PEN_WIDTHS.map(([w, label]) => ({ label, on: pen.w === w, run: () => { pen.w = w; } }))]), { enabled: isTable, keep: true }),
          drop("outline", "ペンの色", "罫線を引くペンの色（SEJの線の色）", () => colors(E.PALETTE.line, pen.c, (c) => { if (c !== "none") pen.c = c; }, { custom: false }), { enabled: isTable, keep: true, swatch: () => pen.c })),
        drop("borders", "罫線", "選んだセル（なければ表全体）に罫線を引く・消す：下・上・左・右・枠なし・格子・外枠・内側（ペンの色と太さで）", () => bordersMenu(), { big: true, enabled: isTable, keep: true })),
    ];
  }
  // セルの余白 (PowerPoint's cell margins): 標準 is the style's own; the others set each cell's padding (cm).
  const CELL_MARGINS = [["標準", null], ["なし", [0, 0, 0, 0]], ["狭い", [0.13, 0.13, 0.13, 0.13]], ["広い", [0.38, 0.38, 0.38, 0.38]]];
  function setMargins(cm) {
    change((o, x) => ops.tableCells(o, x.r0, x.c0, x.r1, x.c1, { pad: cm ? cm.map((v) => ops.fromCm(Math.max(0, Number(v) || 0))) : undefined }));
  }
  function marginsMenu() {
    const x = target();
    const now = x ? x.o.cells[x.r0]?.[x.c0]?.pad || null : null;
    const same = (cm) => (cm ? Boolean(now) && now.every((v, i) => Math.abs(v - ops.fromCm(cm[i])) < 0.5) : !now);
    return menu([
      { head: "セルの余白" },
      ...CELL_MARGINS.map(([label, cm]) => ({ label: cm ? `${label}（上下左右 ${cm[0]} cm）` : "標準（表のスタイルどおり）", on: same(cm), run: () => setMargins(cm) })),
      "-",
      { label: "ユーザー設定の余白…", run: async () => {
        const cur = (now || [7, 14, 7, 14]).map((v) => ops.toCm(v));
        const answer = await app.ask("セルの余白", "上・右・下・左（cm）を空白で区切って（例：0.1 0.25 0.1 0.25）", cur.join(" "));
        if (answer == null) return;
        const values = String(answer).trim().split(/[\s,，、]+/).map(Number).filter((v) => Number.isFinite(v) && v >= 0);
        if (!values.length) return;
        const [t, r = t, b = t, l = r] = values;
        setMargins([t, r, b, l].map((v) => Math.min(v, 5)));
      } },
    ]);
  }
  /** セルのサイズ: the rows' height (or the columns' width) in cm, the table growing or shrinking to fit. */
  async function cellSize(axis) {
    const x = target();
    if (!x) return;
    const [a, b] = axis === "rows" ? (x.cells ? [x.r0, x.r1] : [0, x.o.rows.length - 1]) : (x.cells ? [x.c0, x.c1] : [0, x.o.cols.length - 1]);
    const now = ops.toCm((axis === "rows" ? x.o.rows[a] * x.o.h : x.o.cols[a] * x.o.w));
    const answer = await app.ask(axis === "rows" ? "行の高さ" : "列の幅", `${axis === "rows" ? "高さ" : "幅"}（cm）`, String(now));
    if (answer == null) return;
    const cm = Number(String(answer).replace(/[,，cm\s]/g, ""));
    if (!Number.isFinite(cm) || cm <= 0) { app.toast("0より大きい数字を入れてください"); return; }
    change((o) => ops.tableSetSize(o, axis, a, b, ops.fromCm(cm)));
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
        col(btn("size", "高さ…", "選んだ行（なければ全部）の高さ（cm）", () => cellSize("rows"), { enabled: isTable, keep: true }),
          btn("size", "幅…", "選んだ列（なければ全部）の幅（cm）", () => cellSize("cols"), { enabled: isTable, keep: true })),
        col(btn("distV", "高さを揃える", "選んだ行（なければ全部）の高さを同じに", () => change((o, x) => ops.tableDistribute(o, "rows", x.cells ? x.r0 : 0, x.cells ? x.r1 : Infinity)), { enabled: isTable , keep: true }),
          btn("distH", "幅を揃える", "選んだ列（なければ全部）の幅を同じに", () => change((o, x) => ops.tableDistribute(o, "cols", x.cells ? x.c0 : 0, x.cells ? x.c1 : Infinity)), { enabled: isTable , keep: true }))),
      group("配置",
        row(btn("textLeft", "", "左揃え", () => editor.textFormat("align", "left"), { enabled: isTable, keep: true }), btn("textCenter", "", "中央揃え", () => editor.textFormat("align", "center"), { enabled: isTable, keep: true }), btn("textRight", "", "右揃え", () => editor.textFormat("align", "right"), { enabled: isTable, keep: true }), btn("textDistributed", "", "均等割り付け", () => editor.textFormat("align", "distributed"), { enabled: isTable, keep: true }), drop("cellMargin", "", "セルの余白（標準・なし・狭い・広い・ユーザー設定）", () => marginsMenu(), { enabled: isTable, keep: true }),
          btn("vtext", "", "文字列の方向（セルを縦書きに・もう一度で横書き）", () => change((o, x) => { const on = !o.cells[x.r0]?.[x.c0]?.vertical; return ops.tableCells(o, x.r0, x.c0, x.r1, x.c1, { vertical: on || undefined }); }), { enabled: isTable, keep: true, pressed: () => { const x = target(); return Boolean(x?.o.cells[x.r0]?.[x.c0]?.vertical); } })),
        row(btn("valignTop", "", "上揃え", () => editor.textFormat("valign", "top"), { enabled: isTable, keep: true }), btn("valignMiddle", "", "上下中央揃え", () => editor.textFormat("valign", "middle"), { enabled: isTable, keep: true }), btn("valignBottom", "", "下揃え", () => editor.textFormat("valign", "bottom"), { enabled: isTable, keep: true }))),
    ];
  }
  /** グラフ要素を追加: data labels, the legend, gridlines (chart.opts). */
  function setOpts(patch) {
    const o = chart();
    if (!o) return;
    const opts = { ...(o.chart.opts || {}), ...patch };
    for (const [k, v] of Object.entries(opts)) if (v == null || v === "" || (k === "labels" && v === true) || (k === "grid" && v === true) || (k === "legend" && v === "top") || (k === "trend" && v === false)) delete opts[k];
    editor.commit(editor.objects().map((x) => (x.id === o.id ? { ...x, chart: { ...x.chart, opts: Object.keys(opts).length ? opts : undefined } } : x)), { select: [o.id] });
  }
  function elementsMenu() {
    const opts = chart()?.chart.opts || {};
    return menu([
      { head: "データ ラベル" },
      { label: "表示する", on: opts.labels !== false, run: () => setOpts({ labels: true }) },
      { label: "なし", on: opts.labels === false, run: () => setOpts({ labels: false }) },
      "-", { head: "凡例（系列が2つ以上のとき）" },
      ...[["top", "上"], ["bottom", "下"], ["right", "右"], ["none", "なし"]].map(([v, l]) => ({ label: l, on: (opts.legend || "top") === v, run: () => setOpts({ legend: v }) })),
      "-", { head: "目盛線" },
      { label: "表示する", on: opts.grid !== false, run: () => setOpts({ grid: true }) },
      { label: "なし", on: opts.grid === false, run: () => setOpts({ grid: false }) },
      "-", { head: "データ テーブル（グラフの下に値の表）" },
      { label: "表示する", on: opts.table === true, disabled: !E.TABLE_CHARTS.has(chart()?.chart.type), title: "縦棒・横軸に項目のあるグラフで使えます", run: () => setOpts({ table: true }) },
      { label: "なし", on: !opts.table, run: () => setOpts({ table: undefined }) },
      "-", { head: "誤差範囲（縦棒・折れ線）" },
      { label: opts.errorBars ? `誤差範囲（${opts.errorBars.type === "percent" ? `±${opts.errorBars.amount}%` : `±${opts.errorBars.amount}`}）を変える…` : "誤差範囲を付ける…", disabled: !ERROR_CHARTS.has(chart()?.chart.type), title: "縦棒・集合縦棒・折れ線・複合で使えます。固定値かパーセンテージ", run: () => errorBars() },
      { label: "誤差範囲をなくす", disabled: !opts.errorBars, run: () => setOpts({ errorBars: undefined }) },
      "-", { head: "数値の書式" },
      { label: opts.numFmt ? `数値の書式（${numFmtWords(opts.numFmt)}）…` : "数値の書式（桁数・表示単位・記号）…", run: () => numberFormat() },
      { label: "数値の書式をもとに戻す", disabled: !opts.numFmt, run: () => setOpts({ numFmt: undefined }) },
      "-", { head: "第2軸（複合グラフ）" },
      { label: "折れ線を第2軸にする（右側に別の目盛り）", on: opts.axis2 === true, disabled: chart()?.chart.type !== "combo" || (chart()?.chart.series.length || 0) < 2, title: "複合（棒と折れ線）で系列が2つあるときに使えます", run: () => setOpts({ axis2: opts.axis2 === true ? undefined : true }) },
      "-", { head: "軸ラベル・近似曲線" },
      { label: opts.axisX || opts.axisY ? `軸ラベル（${[opts.axisX, opts.axisY].filter(Boolean).join("・")}）…` : "軸ラベル…", run: () => axisTitles() },
      { label: "近似曲線（線形）", on: opts.trend === "linear", disabled: !TREND_CHARTS.has(chart()?.chart.type), title: "縦棒・折れ線・散布図で使えます", run: () => setOpts({ trend: opts.trend === "linear" ? false : "linear" }) },
      { label: opts.axisMin != null || opts.axisMax != null ? `軸の書式（${opts.axisMin ?? "自動"} 〜 ${opts.axisMax ?? "自動"}）…` : "軸の書式（最小値・最大値）…", disabled: !BOUND_CHARTS.has(chart()?.chart.type), title: "縦棒・集合縦棒・折れ線・面・散布図で使えます（空にすると自動）", run: () => axisFormat() },
    ]);
  }
  /** グラフ フィルター: a series or a category shown or hidden (its data stays; one of each always shows). */
  function filterMenu() {
    const c = chart()?.chart;
    if (!c) return menu([]);
    const hidden = (key) => new Set(c.opts?.[key] || []);
    const toggle = (key, i, count) => {
      const set = hidden(key);
      if (set.has(i)) set.delete(i);
      else if (set.size + 1 >= count) { app.toast("少なくとも1つは表示します"); return; } else set.add(i);
      setOpts({ [key]: set.size ? [...set].sort((a, b) => a - b) : undefined });
    };
    const hs = hidden("hideSeries");
    const hl = hidden("hideLabels");
    return menu([
      { head: "系列（チェックのあるものを表示）" },
      ...c.series.map((ser, i) => ({ label: ser.name || `系列 ${i + 1}`, on: !hs.has(i), run: () => toggle("hideSeries", i, c.series.length) })),
      "-", { head: "項目（チェックのあるものを表示）" },
      ...c.labels.map((label, i) => ({ label: label || `項目 ${i + 1}`, on: !hl.has(i), run: () => toggle("hideLabels", i, c.labels.length) })),
      "-", { label: "すべて表示", disabled: !hs.size && !hl.size, run: () => setOpts({ hideSeries: undefined, hideLabels: undefined }) },
    ]);
  }
  const TREND_CHARTS = new Set(["bar", "line", "multi-line", "scatter"]);
  // 軸の書式: the charts whose value axis takes its own minimum and maximum (bars keep their zero line).
  const ERROR_CHARTS = new Set(["bar", "combo", "clustered-bar", "line", "multi-line"]);
  const BOUND_CHARTS = new Set(["bar", "combo", "clustered-bar", "line", "multi-line", "area", "scatter"]);
  async function axisFormat() {
    const o = chart();
    if (!o) return;
    const opts = o.chart.opts || {};
    const bars = ["bar", "combo", "clustered-bar"].includes(o.chart.type);
    const read = (text) => { const t = String(text ?? "").replace(/[,，\s]/g, ""); if (!t) return null; const v = Number(t); return Number.isFinite(v) ? v : undefined; };
    let min = null;
    if (!bars) {
      const answer = await app.ask("軸の書式（最小値）", "縦軸の最小値（空にすると自動）", opts.axisMin ?? "");
      if (answer == null) return;
      min = read(answer);
      if (min === undefined) { app.toast("数字を入れてください"); return; }
    }
    const answer = await app.ask("軸の書式（最大値）", bars ? "縦軸の最大値（空にすると自動。縦棒は0から）" : "縦軸の最大値（空にすると自動）", opts.axisMax ?? "");
    if (answer == null) return;
    const max = read(answer);
    if (max === undefined) { app.toast("数字を入れてください"); return; }
    if (max != null && max <= (min ?? (bars ? 0 : -Infinity))) { app.toast("最大値は最小値より大きくしてください"); return; }
    setOpts({ axisMin: min, axisMax: max });
  }
  /** 軸ラベル: the titles of the value axis (縦) and the category axis (横). */
  /** 誤差範囲: ± a fixed amount, or ± a share of each value. */
  async function errorBars() {
    const eb = chart()?.chart.opts?.errorBars;
    const kind = await app.ask("誤差範囲の種類", "1＝固定値（例：±5）、2＝パーセンテージ（例：±10%）", eb?.type === "percent" ? "2" : "1");
    if (kind == null) return;
    const percent = kind.trim() === "2";
    const answer = await app.ask(percent ? "誤差範囲（パーセンテージ）" : "誤差範囲（固定値）", percent ? "値の何％を上下に出すか（1〜100）" : "上下に出す大きさ（0より大きい数）", eb?.type === (percent ? "percent" : "fixed") ? eb.amount : "");
    if (answer == null) return;
    const amount = Number(String(answer).replace(/[,，%％\s]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0 || (percent && amount > 100)) { app.toast(percent ? "1〜100の数で入れてください" : "0より大きい数で入れてください"); return; }
    setOpts({ errorBars: { type: percent ? "percent" : "fixed", amount } });
  }
  const UNIT_CHOICES = [[1, "なし"], [1000, "千"], [10000, "万"], [1000000, "百万"], [100000000, "億"]];
  const numFmtWords = (nf) => [Number.isInteger(nf.decimals) ? `小数${nf.decimals}桁` : "", nf.scale ? `${(UNIT_CHOICES.find(([v]) => v === nf.scale) || [])[1] || ""}単位` : "", nf.prefix ? `先頭「${nf.prefix}」` : "", nf.suffix ? `末尾「${nf.suffix}」` : ""].filter(Boolean).join("・");
  /** 数値の書式: decimals, a display unit and signs for the data labels and tips (the axis takes the unit and decimals). */
  function numberFormat() {
    const cur = chart()?.chart.opts?.numFmt || {};
    const select = (label, choices, value) => h("label", { class: "field" }, h("span", {}, label), h("select", { name: label, "aria-label": label }, choices.map(([v, l]) => h("option", { value: String(v), selected: String(v) === String(value) || null }, l))));
    const text = (label, value, max, placeholder) => h("label", { class: "field" }, h("span", {}, label), h("input", { type: "text", name: label, "aria-label": label, value: value || "", maxlength: String(max), placeholder }));
    const decimals = select("小数点以下の桁数", [["", "自動"], [0, "0桁"], [1, "1桁"], [2, "2桁"], [3, "3桁"], [4, "4桁"]], cur.decimals ?? "");
    const scale = select("表示単位", UNIT_CHOICES, cur.scale || 1);
    const prefix = text("数値の前の記号", cur.prefix, 4, "例：¥");
    const suffix = text("数値の後ろの記号", cur.suffix, 6, "例：円、%、件");
    const dialog = h("dialog", { class: "nf-dialog", "aria-label": "数値の書式" },
      h("div", { class: "dialog-head" }, h("h3", {}, "数値の書式"), h("button", { class: "btn btn-ghost btn-icon", type: "button", "aria-label": "閉じる", onclick: () => dialog.close() }, "✕")),
      h("div", { class: "dialog-body sh-form-col" }, decimals, scale, prefix, suffix, h("p", { class: "hint" }, "データ ラベル・ポイントの説明・データ テーブルには全部が、軸の目盛りには桁数と表示単位が付きます。例：表示単位「万」、後ろの記号「円」で 12,000 → 1.2万円。")),
      h("div", { class: "dialog-foot" }, h("button", { type: "button", class: "btn btn-ghost", onclick: () => dialog.close() }, "キャンセル"),
        h("button", { type: "button", class: "btn btn-primary nf-ok", onclick: () => {
          const v = (label) => dialog.querySelector(`[name="${label}"]`).value;
          dialog.close();
          setOpts({ numFmt: { decimals: v("小数点以下の桁数") === "" ? undefined : Number(v("小数点以下の桁数")), scale: Number(v("表示単位")) > 1 ? Number(v("表示単位")) : undefined, prefix: v("数値の前の記号").trim() || undefined, suffix: v("数値の後ろの記号").trim() || undefined } });
        } }, "OK")));
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove());
    dialog.showModal();
  }
  async function axisTitles() {
    const opts = chart()?.chart.opts || {};
    const x = await app.ask("軸ラベル（横軸）", "横軸の名前（空にすると表示しません）", opts.axisX || "");
    if (x == null) return;
    const y = await app.ask("軸ラベル（縦軸）", "縦軸の名前（空にすると表示しません）", opts.axisY || "");
    if (y == null) return;
    setOpts({ axisX: x.trim() || null, axisY: y.trim() || null });
  }
  /** 行/列の切り替え: the labels become the series and the series the labels. */
  function transpose() {
    const o = chart();
    if (!o) return;
    const c = o.chart;
    const labels = c.series.map((s) => s.name);
    const series = c.labels.map((label, i) => ({ name: label, values: c.series.map((s) => s.values[i] ?? 0) }));
    if (series.length > E.CHART_MAX_SERIES) { app.toast(`系列は${E.CHART_MAX_SERIES}個までです（項目を減らしてから入れ替えてください）`); return; }
    editor.commit(editor.objects().map((x) => (x.id === o.id ? { ...x, chart: { ...x.chart, labels, series } } : x)), { select: [o.id] });
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
      group("種類", drop("chartBar", "グラフの種類|の変更", "縦棒・積み上げ・折れ線・面・円・ドーナツ・散布図・レーダー・ウォーターフォール・じょうご・複合", () => chartPicker(setKind), { big: true, enabled: isChart })),
      group("データ", btn("table", "データの|編集", "項目と値を表で直す（Excelから貼り付けもできます）", () => { const o = chart(); if (o) editChart(o.id); }, { big: true, enabled: isChart }),
        // A chart brought over from PowerPoint keeps its formatting until it is reset to the studio's look.
        btn("reset", "書式を|リセット", "PowerPointから取り込んだグラフの書式（色・ラベル・軸・凡例）を外し、スタジオのグラフの描き方にします", resetStyle, { big: true, enabled: () => Boolean(chart()?.chart.style) }),
        drop("eye", "グラフ|フィルター", "グラフ フィルター：系列と項目を表示する／しない（データは残ります）", () => filterMenu(), { big: true, enabled: () => Boolean(chart()) && !chart().chart.style })),
      group("グラフのレイアウト",
        drop("layout", "クイック|レイアウト", "グラフ要素の組み合わせ（データ ラベル・凡例の位置・目盛線・軸ラベル）をまとめて変える", () => quickLayouts(), { big: true, enabled: isChart })),
      group("グラフ要素",
        drop("plus", "グラフ要素|を追加", "データ ラベル・凡例・目盛線", () => elementsMenu(), { big: true, enabled: isChart }),
        col(btn("textbox", "タイトル…", "グラフの上に出す見出し", () => ask("title", "グラフのタイトル", "空にすると消えます"), { enabled: isChart }), btn("font", "単位…", "値の単位（例：億円）", () => ask("unit", "値の単位", "例：億円・%"), { enabled: isChart }),
          btn("rotate", "行/列の切り替え", "項目と系列を入れ替える（横軸の項目が凡例に、凡例が横軸に）", () => transpose(), { enabled: () => Boolean(chart()) && !chart().chart.style }))),
      group("グラフ スタイル",
        drop("fill", "色の|変更", "グラフの色（SEJの配色・青・グレー・茶。どれもSEJの色だけ）", () => colorSets(), { big: true, enabled: () => Boolean(chart()) && !chart().chart.style })),
    ];
  }
  /** クイック レイアウト: the chart's elements at once, each shown as a small picture of where they go. */
  function quickLayouts() {
    const now = chart() ? E.chartLayoutOf(chart().chart) : "";
    const apply = (key) => { const o = chart(); if (o) editor.commit(editor.objects().map((x) => (x.id === o.id ? { ...x, chart: E.applyChartLayout(x.chart, key) } : x)), { select: [o.id] }); };
    const pic = (l) => {
      const box = h("span", { class: "tb-layout-pic", "aria-hidden": "true" });
      const parts = [];
      if (l.grid) for (const y of [10, 16, 22]) parts.push(`<line x1="${l.axes ? 11 : 6}" x2="${l.legend === "right" ? 40 : 46}" y1="${y}" y2="${y}" stroke="#d9d9d9"/>`);
      const x0 = l.axes ? 13 : 9;
      [[0, 15], [9, 9], [18, 5]].forEach(([dx, y]) => {
        parts.push(`<rect x="${x0 + dx}" y="${y + (l.legend === "top" ? 2 : 0)}" width="6" height="${26 - y - (l.legend === "top" ? 2 : 0) - (l.legend === "bottom" ? 3 : 0)}" fill="#b7c3da"/>`);
        if (l.labels) parts.push(`<rect x="${x0 + dx + 1}" y="${y - 3 + (l.legend === "top" ? 2 : 0)}" width="4" height="2" fill="#1f3864"/>`);
      });
      const legend = { top: '<rect x="16" y="1.5" width="20" height="3" fill="#808080"/>', bottom: '<rect x="16" y="29" width="20" height="3" fill="#808080"/>', right: '<rect x="43" y="10" width="6" height="12" fill="#808080"/>' }[l.legend];
      if (legend) parts.push(legend);
      if (l.axes) parts.push('<rect x="3" y="10" width="2" height="12" fill="#808080"/>', `<rect x="20" y="${l.legend === "bottom" ? 25.5 : 29}" width="14" height="2" fill="#808080"/>`);
      box.innerHTML = `<svg viewBox="0 0 52 34" width="52" height="34">${parts.join("")}</svg>`;
      return box;
    };
    return menu([{ head: "クイック レイアウト" },
      ...Object.entries(E.CHART_LAYOUTS).map(([key, l]) => ({ label: h("span", { class: "tb-layout-row", "data-layout": key }, pic(l), h("span", {}, h("b", {}, l.label), h("small", {}, l.desc))), on: now === key, run: () => apply(key) }))]);
  }
  /** 色の変更: the chart's colour set, each shown with its first colours. */
  function colorSets() {
    const now = chart()?.chart.colors || "";
    const swatches = (vars) => h("span", { class: "tb-color-set" }, ["--c1", "--c2", "--c3", "--c4"].map((k) => h("i", { style: { background: vars[k] } })));
    const theme = { "--c1": "#1f3864", "--c2": "#b7c3da", "--c3": "#d6c9b8", "--c4": "#808080" };
    const set = (colors) => { const o = chart(); if (o) editor.commit(editor.objects().map((x) => (x.id === o.id ? { ...x, chart: { ...x.chart, colors: colors || undefined } } : x)), { select: [o.id] }); };
    return menu([{ head: "色の変更" },
      { label: h("span", { class: "tb-color-row" }, swatches(theme), "SEJの配色（いろいろ）"), on: !now, run: () => set("") },
      ...Object.entries(E.CHART_COLORS).map(([key, def]) => ({ label: h("span", { class: "tb-color-row", "data-colors": key }, swatches(def.vars), `${def.label}（同じ系統）`), on: now === key, run: () => set(key) }))]);
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
