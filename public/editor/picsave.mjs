// 図として保存 (PowerPoint's Save as Picture, on the right-click menu): one object as a file of its own. A picture
// is drawn as it shows on the slide (its trimming, adjustments, shape and outline) into a PNG or JPEG; any other object
// (a shape with its text, a chart, an icon, a line, SmartArt…) becomes an SVG that holds it as drawn — its styles
// written into it — or a PNG made from that SVG. A turned object keeps its turn, in a box just big enough.

/** The box a w × h object turned by deg degrees needs (its middle stays in the middle). */
export function rotatedBox(w, h, deg = 0) {
  const a = (((Number(deg) || 0) % 360) * Math.PI) / 180;
  const [c, s] = [Math.abs(Math.cos(a)), Math.abs(Math.sin(a))];
  return { w: Math.round((w * c + h * s) * 100) / 100, h: Math.round((w * s + h * c) * 100) / 100 };
}

/** A file name from the object's name ("図 3.png"), without the characters files cannot have. */
export function pictureFileName(name, ext) {
  const base = String(name || "図").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 80) || "図";
  return `${base}.${ext}`;
}

// What an element's look depends on, written into the copy (SVG parts and the HTML of text boxes).
const SVG_PROPS = ["fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "font-family", "font-size", "font-weight", "font-style", "text-anchor", "dominant-baseline", "letter-spacing", "visibility", "display"];
const HTML_PROPS = ["display", "position", "left", "top", "right", "bottom", "width", "height", "box-sizing", "margin", "padding", "color", "background-color", "font-family", "font-size", "font-weight", "font-style", "font-variant", "line-height", "letter-spacing", "text-align", "text-align-last", "text-indent", "text-transform", "text-decoration-line", "text-decoration-style", "text-decoration-color", "text-decoration-thickness", "white-space", "word-break", "overflow-wrap", "vertical-align", "list-style-type", "list-style-position", "writing-mode", "flex-direction", "justify-content", "align-items", "gap", "border-collapse", "border-top", "border-right", "border-bottom", "border-left", "border-radius", "column-count", "column-gap", "opacity", "transform", "transform-origin", "clip-path", "object-fit", "overflow", "visibility", "z-index"];

export function createPictureSaver(app) {
  const { h } = app;

  /** Copy the computed look of every element of `src` onto the same element of `copy` (both trees alike). */
  function inlineStyles(src, copy) {
    const walk = (a, b) => {
      if (a.nodeType !== 1) return;
      const cs = getComputedStyle(a);
      const props = a instanceof SVGElement ? SVG_PROPS : HTML_PROPS;
      const text = props.map((p) => { const v = cs.getPropertyValue(p); return v ? `${p}:${v}` : ""; }).filter(Boolean).join(";");
      if (text) b.setAttribute("style", text);
      b.removeAttribute("class");
      const [ac, bc] = [a.children, b.children];
      for (let i = 0; i < ac.length && i < bc.length; i += 1) walk(ac[i], bc[i]);
    };
    walk(src, copy);
  }

  /** blob: pictures inside the copy as data URLs (a picture made from an SVG cannot reach blob: addresses). */
  async function embedBlobs(root) {
    const toData = async (url) => {
      const blob = await (await fetch(url)).blob();
      return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => resolve(url); r.readAsDataURL(blob); });
    };
    for (const el of root.querySelectorAll("img[src^='blob:'], image")) {
      const attr = el.tagName.toLowerCase() === "img" ? "src" : el.hasAttribute("href") ? "href" : "xlink:href";
      const url = el.getAttribute(attr) || "";
      if (url.startsWith("blob:")) { try { el.setAttribute(attr, await toData(url)); } catch { /* left as it is */ } }
    }
  }

  /** The object as a standalone SVG document (text), turned as on the slide. */
  async function svgOf(o, node) {
    const turn = o.kind === "line" ? 0 : o.rot || 0;
    const box = node.dataset.bbox ? node.dataset.bbox.split(",").map(Number) : [o.x, o.y, o.w, o.h];
    const [w, hh] = [box[2], box[3]];
    const out = rotatedBox(w, hh, turn);
    const copy = node.cloneNode(true);
    inlineStyles(node, copy);
    copy.style.position = "absolute";
    copy.style.left = `${(out.w - w) / 2}px`;
    copy.style.top = `${(out.h - hh) / 2}px`;
    copy.style.margin = "0";
    for (const el of copy.querySelectorAll("[contenteditable]")) el.removeAttribute("contenteditable");
    await embedBlobs(copy);
    const holder = document.createElement("div");
    holder.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    holder.setAttribute("style", `position:relative;width:${out.w}px;height:${out.h}px;overflow:visible`);
    holder.append(copy);
    const xml = new XMLSerializer().serializeToString(holder);
    return { text: `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${out.w}" height="${out.h}" viewBox="0 0 ${out.w} ${out.h}"><foreignObject x="0" y="0" width="${out.w}" height="${out.h}">${xml}</foreignObject></svg>`, w: out.w, h: out.h };
  }

  /** A canvas as a PNG or JPEG blob (JPEG on white). */
  const blobOf = (canvas, type) => new Promise((resolve, reject) => { try { canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("empty"))), type, 0.92); } catch (error) { reject(error); } });
  const loadImage = (url) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error("load")); img.src = url; });

  /** An SVG drawn into a PNG/JPEG at twice its size (crisper than the slide's pixels). */
  async function rasterize({ text, w, h: hh }, type) {
    const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`);
    const k = Math.min(2, 8000 / Math.max(w, hh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * k));
    canvas.height = Math.max(1, Math.round(hh * k));
    const g = canvas.getContext("2d");
    if (type === "image/jpeg") { g.fillStyle = "#ffffff"; g.fillRect(0, 0, canvas.width, canvas.height); }
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return blobOf(canvas, type);
  }

  /** A picture as it shows: its own pixels, trimmed, with its adjustments, cut to its shape, outlined, turned. */
  async function pictureBlob(o, node, type) {
    const shown = node.querySelector(".hs-obj-img img");
    if (!shown) throw new Error("no picture");
    const img = shown.complete && shown.naturalWidth ? shown : await loadImage(shown.src);
    const crop = o.crop || { l: 0, t: 0, r: 0, b: 0 };
    const sw = img.naturalWidth * (1 - crop.l - crop.r);
    const sh = img.naturalHeight * (1 - crop.t - crop.b);
    // The outline (図の枠線) as drawn on the slide; half of it lies outside the frame, so the picture is that much bigger.
    const outline = [...node.querySelectorAll(".hs-obj-geom path")].map((p) => ({ d: p.getAttribute("d"), color: p.getAttribute("stroke"), width: Number(p.getAttribute("stroke-width")) || 0, dash: String(p.getAttribute("stroke-dasharray") || "").split(/[\s,]+/).map(Number).filter((n) => n > 0) })).filter((l) => l.d && l.color && l.color !== "none" && l.width > 0);
    const m = outline.reduce((a, l) => Math.max(a, l.width / 2), 0);
    // As many pixels as the picture has across its frame (at most 4000).
    const k = Math.min(4000 / Math.max(o.w + 2 * m, o.h + 2 * m), Math.max(1, sw / o.w));
    const out = rotatedBox(o.w + 2 * m, o.h + 2 * m, o.rot || 0);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(out.w * k));
    canvas.height = Math.max(1, Math.round(out.h * k));
    const g = canvas.getContext("2d");
    if (type === "image/jpeg") { g.fillStyle = "#ffffff"; g.fillRect(0, 0, canvas.width, canvas.height); }
    g.scale(k, k);
    g.translate(out.w / 2, out.h / 2);
    g.rotate(((o.rot || 0) * Math.PI) / 180);
    g.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
    g.translate(-o.w / 2, -o.h / 2);
    if (o.opacity != null) g.globalAlpha = o.opacity;
    g.save();
    if (o.mask) {
      const geo = app.E.geometry(o.mask, o.w, o.h, o.adj);
      g.clip(new Path2D(geo.paths.join(" ")), geo.rule === "evenodd" ? "evenodd" : "nonzero");
    }
    const filter = getComputedStyle(shown).filter;
    if (filter && filter !== "none") g.filter = filter;
    if (o.crop) g.drawImage(img, img.naturalWidth * crop.l, img.naturalHeight * crop.t, sw, sh, 0, 0, o.w, o.h);
    else if (o.fit === "cover" || o.fit === "contain") {
      const scale = (o.fit === "cover" ? Math.max : Math.min)(o.w / img.naturalWidth, o.h / img.naturalHeight);
      const [dw, dh] = [img.naturalWidth * scale, img.naturalHeight * scale];
      g.drawImage(img, (o.w - dw) / 2, (o.h - dh) / 2, dw, dh);
    } else g.drawImage(img, 0, 0, o.w, o.h);
    g.restore();
    for (const l of outline) {
      g.lineWidth = l.width;
      g.strokeStyle = l.color;
      g.setLineDash(l.dash);
      g.stroke(new Path2D(l.d));
    }
    return blobOf(canvas, type);
  }

  async function write(o, format) {
    const node = document.querySelector(`#stageBody .hs-obj[data-el="${CSS.escape(o.id)}"]`);
    if (!node) { app.toast("スライド上にこのオブジェクトが見つかりません"); return; }
    const name = app.E.objectName(o, app.editorObjects().indexOf(o));
    try {
      if (o.kind === "image") {
        const type = format === "jpeg" ? "image/jpeg" : "image/png";
        app.download(await pictureBlob(o, node, type), pictureFileName(name, format === "jpeg" ? "jpg" : "png"));
      } else {
        const svg = await svgOf(o, node);
        if (format === "svg") app.download(new Blob([svg.text], { type: "image/svg+xml" }), pictureFileName(name, "svg"));
        else app.download(await rasterize(svg, format === "jpeg" ? "image/jpeg" : "image/png"), pictureFileName(name, format === "jpeg" ? "jpg" : "png"));
      }
      app.toast(`「${name}」を図として保存しました`);
    } catch (error) {
      app.toast(o.kind === "image" ? "この画像は図として保存できません（ほかのサイトの画像はブラウザが書き出しを許しません）" : `図として保存できませんでした（${error.message || error}）。SVG ならたいてい保存できます`);
    }
  }

  /** The 図として保存 dialog: the file's kind, then the browser's download. */
  function open(id) {
    const o = app.editorObjects().find((x) => x.id === id);
    if (!o) return;
    const picture = o.kind === "image";
    const choices = picture ? [["png", "PNG（透過を保つ）"], ["jpeg", "JPEG（軽い）"]] : [["png", "PNG（画像）"], ["svg", "SVG（拡大しても粗くならない）"], ["jpeg", "JPEG（軽い）"]];
    const format = h("select", { "aria-label": "ファイルの種類", class: "ps-format" }, choices.map(([v, l]) => h("option", { value: v }, l)));
    const dialog = h("dialog", { class: "ps-dialog", "aria-label": "図として保存" },
      h("div", { class: "dialog-head" }, h("h3", {}, "図として保存"), h("button", { class: "btn btn-ghost btn-icon", type: "button", "aria-label": "閉じる", onclick: () => dialog.close() }, "✕")),
      h("div", { class: "dialog-body sh-form-col" },
        h("label", { class: "sh-inline" }, "ファイルの種類 ", format),
        h("p", { class: "hint" }, picture ? "トリミング・明るさなどの修整・図形での切り抜き・回転を、スライドに見えるとおりに入れます。" : "スライドに見えるとおりの形・文字・色で保存します（回転もそのまま）。")),
      h("div", { class: "dialog-foot" }, h("button", { type: "button", class: "btn btn-ghost", onclick: () => dialog.close() }, "キャンセル"),
        h("button", { type: "button", class: "btn btn-primary ps-go", onclick: () => { const f = format.value; dialog.close(); write(o, f); } }, "保存")));
    document.body.append(dialog);
    dialog.addEventListener("close", () => dialog.remove());
    dialog.showModal();
  }

  return { open, write };
}
