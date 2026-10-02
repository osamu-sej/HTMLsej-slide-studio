/*
 * HTML SEJ Slide Studio — objects placed on a slide by hand, the PowerPoint way: shapes (with text in them),
 * text boxes, pictures, lines and arrows, icons, videos and Lottie animations. Loaded after engine.js and before
 * motion.js; exported presentations carry it too, so it has no dependencies.
 *
 * A slide's objects are `slide.elements`, in drawing order (the last one is in front), measured in slide pixels
 * (1920 × 1080, the template's 13.333 × 7.5 in at 144 px per inch): a point is 2 px, a centimetre 56.69 px.
 * The AI never writes them; people do, in the studio's editor (public/editor.mjs).
 */
(function (root) {
  "use strict";
  const E = root.SlideEngine;
  if (!E) throw new Error("engine.js must load before objects.js");
  const { h, s, W, H } = E;

  const PX_PER_PT = 2;
  const PX_PER_CM = 144 / 2.54;

  // ---------------------------------------------------------------- the SEJ palette
  // Text is black, navy or grey (never white); fills are pale blue, grey or pale brown (navy only on marks that
  // carry no text); no shadows. The editor offers these colours; the brand check reports anything else.
  const PALETTE = {
    text: [["#1a1a1a", "黒"], ["#1f3864", "濃紺"], ["#808080", "グレー"]],
    fill: [["#ffffff", "白"], ["#f1f5fb", "淡青（ごく薄い）"], ["#dce4f2", "淡青"], ["#b7c3da", "青灰"], ["#f2f2f2", "グレー（薄い）"], ["#d9d9d9", "グレー"],
      ["#f5f0ea", "淡茶（薄い）"], ["#d6c9b8", "淡茶"], ["#1f3864", "濃紺（文字を載せない）"], ["#808080", "濃いグレー（文字を載せない）"]],
    line: [["#1f3864", "濃紺"], ["#1a1a1a", "黒"], ["#808080", "グレー"], ["#d9d9d9", "薄いグレー"], ["#b7c3da", "青灰"], ["#d6c9b8", "淡茶"], ["#ffffff", "白"]],
    highlight: [["#dce4f2", "淡青のマーカー"], ["#f5f0ea", "淡茶のマーカー"]],
  };
  const BRAND_FILLS = new Set(PALETTE.fill.map(([c]) => c.slice(1)));
  const BRAND_LINES = new Set(PALETTE.line.map(([c]) => c.slice(1)));
  const FONTS = {
    body: ["Meiryo UI（SEJ標準）", 'var(--font-body)'],
    ud: ["BIZ UDPゴシック", '"BIZ UDPGothic", "Meiryo UI", sans-serif'],
    kyokasho: ["UD デジタル 教科書体", '"UD デジタル 教科書体 NP-R", "UD Digi Kyokasho NP-R", "Klee One", "BIZ UDPGothic", serif'],
  };

  // ---------------------------------------------------------------- geometry helpers

  const r2 = (n) => Math.round(n * 100) / 100;
  const P = (x, y) => `${r2(x)} ${r2(y)}`;
  const poly = (points) => `M${points.map(([x, y]) => P(x, y)).join(" L")} Z`;
  const rad = (deg) => (deg * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const mod = (a, n) => ((a % n) + n) % n;
  const on = (cx, cy, rx, ry, a) => [cx + rx * Math.cos(rad(a)), cy + ry * Math.sin(rad(a))];

  /** An elliptical arc to angle a1 from a0 (degrees, increasing = clockwise on screen), from the current point. */
  function arcTo(cx, cy, rx, ry, a0, a1) {
    const sweep = a1 >= a0 ? 1 : 0;
    const span = Math.abs(a1 - a0);
    if (span >= 359.99) {
      const mid = on(cx, cy, rx, ry, a0 + (a1 - a0) / 2);
      const end = on(cx, cy, rx, ry, a1);
      return `A${r2(rx)} ${r2(ry)} 0 0 ${sweep} ${P(...mid)} A${r2(rx)} ${r2(ry)} 0 0 ${sweep} ${P(...end)}`;
    }
    return `A${r2(rx)} ${r2(ry)} 0 ${span > 180 ? 1 : 0} ${sweep} ${P(...on(cx, cy, rx, ry, a1))}`;
  }
  /** The clockwise end angle for a sweep from a0 to a1 (a1 after a0, going clockwise). */
  const cw = (a0, a1) => a0 + (mod(a1 - a0, 360) || 360);
  function ellipse(cx, cy, rx, ry) {
    return `M${P(...on(cx, cy, rx, ry, 0))} ${arcTo(cx, cy, rx, ry, 0, 360)} Z`;
  }
  /** A rectangle with its own radius at each corner: [top-left, top-right, bottom-right, bottom-left]. */
  function rrect(x, y, w, hh, radii) {
    const [a, b, c, d] = radii.map((r) => clamp(r, 0, Math.min(w, hh) / 2));
    const arc = (r, tx, ty) => (r ? `A${r2(r)} ${r2(r)} 0 0 1 ${P(tx, ty)}` : `L${P(tx, ty)}`);
    return `M${P(x + a, y)} L${P(x + w - b, y)} ${arc(b, x + w, y + b)} L${P(x + w, y + hh - c)} ${arc(c, x + w - c, y + hh)} L${P(x + d, y + hh)} ${arc(d, x, y + hh - d)} L${P(x, y + a)} ${arc(a, x + a, y)} Z`;
  }
  /** Points of a polygon given in unit space, stretched to fill the box (PowerPoint's regular shapes touch every edge). */
  function fitted(points, w, hh) {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return points.map(([x, y]) => [((x - x0) / (x1 - x0 || 1)) * w, ((y - y0) / (y1 - y0 || 1)) * hh]);
  }
  const regular = (n, w, hh) => fitted(Array.from({ length: n }, (_, k) => on(0, 0, 1, 1, -90 + (k * 360) / n)), w, hh);
  function starUnit(n, inner) {
    const pts = [];
    for (let k = 0; k < n; k += 1) {
      pts.push(on(0, 0, 1, 1, -90 + (k * 360) / n), on(0, 0, inner, inner, -90 + ((k + 0.5) * 360) / n));
    }
    return pts;
  }
  /** Maps unit-space points into the box the same way fitted() maps the outer points. */
  function fitTransform(outer, w, hh) {
    const xs = outer.map((p) => p[0]);
    const ys = outer.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return {
      to: ([x, y]) => [((x - x0) / (x1 - x0 || 1)) * w, ((y - y0) / (y1 - y0 || 1)) * hh],
      from: ([x, y]) => [x0 + (x / (w || 1)) * (x1 - x0), y0 + (y / (hh || 1)) * (y1 - y0)],
    };
  }
  const scale21600 = (points, w, hh) => points.map(([x, y]) => [(x / 21600) * w, (y / 21600) * hh]);
  const flipX = (points, w) => points.map(([x, y]) => [w - x, y]);
  const flipY = (points, hh) => points.map(([x, y]) => [x, hh - y]);
  const swap = (points) => points.map(([x, y]) => [y, x]);

  // ---------------------------------------------------------------- shapes
  // Each shape: label (PowerPoint's name), d(w, h, adj) → an SVG path (or several, drawn in order), its
  // adjustments (adj: defaults, lim: ranges) with handles to drag them, where text goes (text → [l, t, r, b]),
  // extra details (shaded faces, lines) and whether it is an open line (no fill).

  const ss = (w, hh) => Math.min(w, hh);
  const handleX = (pos, set) => ({ pos, set });

  function rightArrow(w, hh, t, hl) {
    const y1 = hh / 2 - t / 2;
    const y2 = hh / 2 + t / 2;
    const x = w - hl;
    return [[0, y1], [x, y1], [x, 0], [w, hh / 2], [x, hh], [x, y2], [0, y2]];
  }
  /** A horizontally defined block arrow turned to any of the four directions. */
  function turned(dir, w, hh, build) {
    if (dir === "right") return build(w, hh);
    if (dir === "left") return flipX(build(w, hh), w);
    if (dir === "down") return swap(build(hh, w));
    return flipY(swap(build(hh, w)), hh);
  }
  const arrowShape = (label, dir) => ({
    label, adj: [0.5, 0.5], lim: [[0.05, 1], [0, 2]],
    d: (w, hh, [a, b]) => poly(turned(dir, w, hh, (ww, hhh) => rightArrow(ww, hhh, a * hhh, Math.min(b * ss(w, hh), ww)))),
    handles: [
      handleX((w, hh, [a, b]) => turned(dir, w, hh, (ww, hhh) => [[ww - Math.min(b * ss(w, hh), ww), 0]])[0],
        (x, y, w, hh, [a]) => [a, (dir === "right" ? w - x : dir === "left" ? x : dir === "down" ? hh - y : y) / ss(w, hh)]),
      handleX((w, hh, [a]) => turned(dir, w, hh, (ww, hhh) => [[0, hhh / 2 - (a * hhh) / 2]])[0],
        (x, y, w, hh, [, b]) => [dir === "right" || dir === "left" ? (hh - 2 * y) / hh : (w - 2 * x) / w, b]),
    ],
    text: (w, hh, [a, b]) => {
      const box = turned(dir, w, hh, (ww, hhh) => [[0, hhh / 2 - (a * hhh) / 2], [ww - Math.min(b * ss(w, hh), ww) * 0.5, hhh / 2 + (a * hhh) / 2]]);
      return [Math.min(box[0][0], box[1][0]), Math.min(box[0][1], box[1][1]), Math.max(box[0][0], box[1][0]), Math.max(box[0][1], box[1][1])];
    },
  });

  function doubleArrow(w, hh, t, hl) {
    hl = Math.min(hl, w / 2);
    const y1 = hh / 2 - t / 2;
    const y2 = hh / 2 + t / 2;
    return [[0, hh / 2], [hl, 0], [hl, y1], [w - hl, y1], [w - hl, 0], [w, hh / 2], [w - hl, hh], [w - hl, y2], [hl, y2], [hl, hh]];
  }

  function noSmoking(w, hh, t) {
    const [cx, cy, rx, ry] = [w / 2, hh / 2, w / 2, hh / 2];
    const r = clamp(1 - 2 * t, 0.05, 0.95);
    const b = Math.min(t, r * 0.9);
    const k = Math.sqrt(r * r - b * b);
    const n = [Math.SQRT1_2, -Math.SQRT1_2];
    const u = [Math.SQRT1_2, Math.SQRT1_2];
    const holes = [1, -1].map((side) => {
      const p1 = [side * b * n[0] + k * u[0], side * b * n[1] + k * u[1]];
      const p2 = [side * b * n[0] - k * u[0], side * b * n[1] - k * u[1]];
      const a1 = deg(Math.atan2(p1[1], p1[0]));
      const a2 = deg(Math.atan2(p2[1], p2[0]));
      const via = side > 0 ? -45 : 135;
      // Go from p1 to p2 the way that passes the middle of the hole.
      const forward = mod(via - a1, 360) < mod(a2 - a1, 360);
      const end = forward ? a1 + mod(a2 - a1, 360) : a1 - mod(a1 - a2, 360);
      return `M${P(cx + p1[0] * rx, cy + p1[1] * ry)} ${arcTo(cx, cy, r * rx, r * ry, a1, end)} Z`;
    });
    return `${ellipse(cx, cy, rx, ry)} ${holes.join(" ")}`;
  }

  // A cloud: puffs (arcs bulging outwards) between points of a smaller ellipse, a little uneven like PowerPoint's.
  const CLOUD = [[-96, 0.5], [-58, 0.58], [-22, 0.52], [12, 0.56], [44, 0.6], [84, 0.54], [118, 0.58], [152, 0.52], [190, 0.6], [228, 0.55]];
  function cloudPath(w, hh) {
    const [cx, cy] = [w / 2, hh / 2];
    const pts = CLOUD.map(([a]) => on(cx, cy, w * 0.36, hh * 0.34, a));
    let d = `M${P(...pts[0])}`;
    for (let k = 0; k < pts.length; k += 1) {
      const [x1, y1] = pts[k];
      const [x2, y2] = pts[(k + 1) % pts.length];
      const r = Math.hypot(x2 - x1, y2 - y1) * CLOUD[k][1];
      d += ` A${r2(r)} ${r2(r)} 0 1 1 ${P(x2, y2)}`;
    }
    return `${d} Z`;
  }

  function wavePath(w, hh, a, periods) {
    const A = a * hh;
    const seg = w / periods;
    let top = `M${P(0, A)}`;
    for (let i = 0; i < periods; i += 1) {
      const x = i * seg;
      top += ` C${P(x + seg / 3, -A)} ${P(x + (2 * seg) / 3, 3 * A)} ${P(x + seg, A)}`;
    }
    let bottom = ` L${P(w, hh - A)}`;
    for (let i = periods - 1; i >= 0; i -= 1) {
      const x = i * seg;
      bottom += ` C${P(x + (2 * seg) / 3, hh + A)} ${P(x + seg / 3, hh - 3 * A)} ${P(x, hh - A)}`;
    }
    return `${top}${bottom} Z`;
  }

  /** Callouts: a box with a tail whose tip is at (w/2 + ax·w, h/2 + ay·h). */
  function wedgeTip(w, hh, [ax, ay]) { return [w / 2 + ax * w, hh / 2 + ay * hh]; }
  function wedgeRect(w, hh, adj, r = 0) {
    const [tx, ty] = wedgeTip(w, hh, adj);
    const inside = tx > 0 && tx < w && ty > 0 && ty < hh;
    if (inside) return r ? rrect(0, 0, w, hh, [r, r, r, r]) : poly([[0, 0], [w, 0], [w, hh], [0, hh]]);
    const vertical = Math.abs(ty - hh / 2) / hh >= Math.abs(tx - w / 2) / w;
    const bw = (vertical ? w : hh) * 0.12;
    if (vertical) {
      const base = clamp(w / 2 + (tx - w / 2) * 0.5, r + bw, w - r - bw);
      const y = ty > hh / 2 ? hh : 0;
      const pts = y ? [[base + bw, hh], [tx, ty], [base - bw, hh]] : [[base - bw, 0], [tx, ty], [base + bw, 0]];
      return y
        ? `M${P(r, 0)} L${P(w - r, 0)} ${r ? `A${r} ${r} 0 0 1 ${P(w, r)}` : ""} L${P(w, hh - r)} ${r ? `A${r} ${r} 0 0 1 ${P(w - r, hh)}` : ""} L${pts.map(([x, yy]) => P(x, yy)).join(" L")} L${P(r, hh)} ${r ? `A${r} ${r} 0 0 1 ${P(0, hh - r)}` : ""} L${P(0, r)} ${r ? `A${r} ${r} 0 0 1 ${P(r, 0)}` : ""} Z`
        : `M${P(r, 0)} L${pts.map(([x, yy]) => P(x, yy)).join(" L")} L${P(w - r, 0)} ${r ? `A${r} ${r} 0 0 1 ${P(w, r)}` : ""} L${P(w, hh - r)} ${r ? `A${r} ${r} 0 0 1 ${P(w - r, hh)}` : ""} L${P(r, hh)} ${r ? `A${r} ${r} 0 0 1 ${P(0, hh - r)}` : ""} L${P(0, r)} ${r ? `A${r} ${r} 0 0 1 ${P(r, 0)}` : ""} Z`;
    }
    const base = clamp(hh / 2 + (ty - hh / 2) * 0.5, r + bw, hh - r - bw);
    const x = tx > w / 2 ? w : 0;
    return x
      ? `M${P(r, 0)} L${P(w - r, 0)} ${r ? `A${r} ${r} 0 0 1 ${P(w, r)}` : ""} L${P(w, base - bw)} L${P(tx, ty)} L${P(w, base + bw)} L${P(w, hh - r)} ${r ? `A${r} ${r} 0 0 1 ${P(w - r, hh)}` : ""} L${P(r, hh)} ${r ? `A${r} ${r} 0 0 1 ${P(0, hh - r)}` : ""} L${P(0, r)} ${r ? `A${r} ${r} 0 0 1 ${P(r, 0)}` : ""} Z`
      : `M${P(r, 0)} L${P(w - r, 0)} ${r ? `A${r} ${r} 0 0 1 ${P(w, r)}` : ""} L${P(w, hh - r)} ${r ? `A${r} ${r} 0 0 1 ${P(w - r, hh)}` : ""} L${P(r, hh)} ${r ? `A${r} ${r} 0 0 1 ${P(0, hh - r)}` : ""} L${P(0, base + bw)} L${P(tx, ty)} L${P(0, base - bw)} L${P(0, r)} ${r ? `A${r} ${r} 0 0 1 ${P(r, 0)}` : ""} Z`;
  }
  const tailHandle = handleX((w, hh, adj) => wedgeTip(w, hh, adj), (x, y, w, hh) => [(x - w / 2) / w, (y - hh / 2) / hh]);

  const EXPLOSION1 = [[10800, 5800], [14522, 0], [14155, 5325], [18380, 4457], [16702, 7315], [21097, 8137], [17607, 10475], [21600, 13290], [16837, 12942], [18145, 18095], [14020, 14457], [13247, 19737], [10532, 14935], [8485, 21600], [7715, 15627], [4762, 17617], [5667, 13937], [135, 14587], [3722, 11775], [0, 8615], [4627, 7617], [370, 2295], [7312, 6320], [8352, 2295]];
  const EXPLOSION2 = [[11462, 4342], [14790, 0], [14525, 5777], [18007, 3172], [16380, 6532], [21600, 6645], [16985, 9402], [18270, 11290], [16380, 12310], [18877, 15632], [14640, 14350], [14942, 17370], [12180, 15935], [11612, 18842], [9872, 17370], [8700, 19712], [7527, 18125], [4917, 21600], [4805, 18240], [1285, 17825], [3330, 15370], [0, 12877], [3935, 11592], [1172, 8270], [5372, 7817], [4502, 3625], [8550, 6382], [9722, 1887]];
  const LIGHTNING = [[8458, 0], [12079, 5596], [10838, 6022], [15468, 10627], [14280, 11148], [21600, 21600], [10900, 13190], [12124, 12620], [5976, 7955], [7172, 7451], [0, 3890]];

  function starShape(label, n, inner) {
    return {
      label, adj: [inner], lim: [[0.05, 0.95]],
      d: (w, hh, [a]) => {
        const pts = starUnit(n, a);
        const fit = fitTransform(pts.filter((_, i) => i % 2 === 0), w, hh);
        return poly(pts.map(fit.to));
      },
      handles: [handleX((w, hh, [a]) => {
        const pts = starUnit(n, a);
        return fitTransform(pts.filter((_, i) => i % 2 === 0), w, hh).to(pts[1]);
      }, (x, y, w, hh, [a]) => {
        const pts = starUnit(n, a);
        const [ux, uy] = fitTransform(pts.filter((_, i) => i % 2 === 0), w, hh).from([x, y]);
        return [clamp(Math.hypot(ux, uy), 0.05, 0.95)];
      })],
      text: (w, hh, [a]) => [w * (0.5 - a * 0.36), hh * (0.5 - a * 0.36), w * (0.5 + a * 0.36), hh * (0.5 + a * 0.36)],
    };
  }

  const SHAPES = {
    // ---- 四角形
    rect: { label: "正方形/長方形", d: (w, hh) => poly([[0, 0], [w, 0], [w, hh], [0, hh]]) },
    roundRect: {
      label: "四角形: 角を丸くする", adj: [0.1667], lim: [[0, 0.5]],
      d: (w, hh, [a]) => rrect(0, 0, w, hh, Array(4).fill(a * ss(w, hh))),
      handles: [handleX((w, hh, [a]) => [a * ss(w, hh), 0], (x, y, w, hh) => [x / ss(w, hh)])],
      text: (w, hh, [a]) => { const i = a * ss(w, hh) * 0.29; return [i, i, w - i, hh - i]; },
    },
    snip1Rect: {
      label: "四角形: 1つの角を切り取る", adj: [0.1667], lim: [[0, 0.5]],
      d: (w, hh, [a]) => { const c = a * ss(w, hh); return poly([[0, 0], [w - c, 0], [w, c], [w, hh], [0, hh]]); },
      handles: [handleX((w, hh, [a]) => [w - a * ss(w, hh), 0], (x, y, w, hh) => [(w - x) / ss(w, hh)])],
    },
    snip2SameRect: {
      label: "四角形: 上の2つの角を切り取る", adj: [0.1667], lim: [[0, 0.5]],
      d: (w, hh, [a]) => { const c = a * ss(w, hh); return poly([[c, 0], [w - c, 0], [w, c], [w, hh], [0, hh], [0, c]]); },
      handles: [handleX((w, hh, [a]) => [w - a * ss(w, hh), 0], (x, y, w, hh) => [(w - x) / ss(w, hh)])],
    },
    snip2DiagRect: {
      label: "四角形: 対角を切り取る", adj: [0.1667], lim: [[0, 0.5]],
      d: (w, hh, [a]) => { const c = a * ss(w, hh); return poly([[c, 0], [w, 0], [w, hh - c], [w - c, hh], [0, hh], [0, c]]); },
      handles: [handleX((w, hh, [a]) => [a * ss(w, hh), 0], (x, y, w, hh) => [x / ss(w, hh)])],
    },
    round1Rect: {
      label: "四角形: 1つの角を丸める", adj: [0.1667], lim: [[0, 0.5]],
      d: (w, hh, [a]) => rrect(0, 0, w, hh, [0, a * ss(w, hh), 0, 0]),
      handles: [handleX((w, hh, [a]) => [w - a * ss(w, hh), 0], (x, y, w, hh) => [(w - x) / ss(w, hh)])],
    },
    round2SameRect: {
      label: "四角形: 上の2つの角を丸める", adj: [0.1667], lim: [[0, 0.5]],
      d: (w, hh, [a]) => { const r = a * ss(w, hh); return rrect(0, 0, w, hh, [r, r, 0, 0]); },
      handles: [handleX((w, hh, [a]) => [w - a * ss(w, hh), 0], (x, y, w, hh) => [(w - x) / ss(w, hh)])],
    },
    round2DiagRect: {
      label: "四角形: 対角を丸める", adj: [0.1667], lim: [[0, 0.5]],
      d: (w, hh, [a]) => { const r = a * ss(w, hh); return rrect(0, 0, w, hh, [r, 0, r, 0]); },
      handles: [handleX((w, hh, [a]) => [a * ss(w, hh), 0], (x, y, w, hh) => [x / ss(w, hh)])],
    },

    // ---- 基本図形
    ellipse: { label: "楕円", d: (w, hh) => ellipse(w / 2, hh / 2, w / 2, hh / 2), text: (w, hh) => [w * 0.146, hh * 0.146, w * 0.854, hh * 0.854] },
    triangle: {
      label: "二等辺三角形", adj: [0.5], lim: [[0, 1]],
      d: (w, hh, [a]) => poly([[a * w, 0], [w, hh], [0, hh]]),
      handles: [handleX((w, hh, [a]) => [a * w, 0], (x, y, w) => [x / w])],
      text: (w, hh, [a]) => [(a * w) / 2, hh / 2, (a * w + w) / 2, hh],
    },
    rtTriangle: { label: "直角三角形", d: (w, hh) => poly([[0, 0], [w, hh], [0, hh]]), text: (w, hh) => [w / 12, (7 * hh) / 12, (7 * w) / 12, (11 * hh) / 12] },
    parallelogram: {
      label: "平行四辺形", adj: [0.25], lim: [[0, 1]],
      d: (w, hh, [a]) => { const o = Math.min(a * ss(w, hh), w); return poly([[o, 0], [w, 0], [w - o, hh], [0, hh]]); },
      handles: [handleX((w, hh, [a]) => [Math.min(a * ss(w, hh), w), 0], (x, y, w, hh) => [x / ss(w, hh)])],
      text: (w, hh, [a]) => { const o = Math.min(a * ss(w, hh), w) * 0.6; return [o, 0, w - o, hh]; },
    },
    trapezoid: {
      label: "台形", adj: [0.25], lim: [[0, 0.5]],
      d: (w, hh, [a]) => { const o = Math.min(a * ss(w, hh), w / 2); return poly([[o, 0], [w - o, 0], [w, hh], [0, hh]]); },
      handles: [handleX((w, hh, [a]) => [Math.min(a * ss(w, hh), w / 2), 0], (x, y, w, hh) => [x / ss(w, hh)])],
      text: (w, hh, [a]) => { const o = Math.min(a * ss(w, hh), w / 2) * 0.66; return [o, 0, w - o, hh]; },
    },
    diamond: { label: "ひし形", d: (w, hh) => poly([[w / 2, 0], [w, hh / 2], [w / 2, hh], [0, hh / 2]]), text: (w, hh) => [w / 4, hh / 4, (3 * w) / 4, (3 * hh) / 4] },
    pentagon: { label: "五角形", d: (w, hh) => poly(regular(5, w, hh)), text: (w, hh) => [w * 0.19, hh * 0.32, w * 0.81, hh * 0.92] },
    hexagon: {
      label: "六角形", adj: [0.25], lim: [[0, 0.5]],
      d: (w, hh, [a]) => { const o = Math.min(a * ss(w, hh), w / 2); return poly([[o, 0], [w - o, 0], [w, hh / 2], [w - o, hh], [o, hh], [0, hh / 2]]); },
      handles: [handleX((w, hh, [a]) => [Math.min(a * ss(w, hh), w / 2), 0], (x, y, w, hh) => [x / ss(w, hh)])],
      text: (w, hh, [a]) => { const o = Math.min(a * ss(w, hh), w / 2) * 0.6; return [o, hh * 0.1, w - o, hh * 0.9]; },
    },
    heptagon: { label: "七角形", d: (w, hh) => poly(regular(7, w, hh)), text: (w, hh) => [w * 0.15, hh * 0.2, w * 0.85, hh * 0.85] },
    octagon: {
      label: "八角形", adj: [0.2929], lim: [[0, 0.5]],
      d: (w, hh, [a]) => { const c = a * ss(w, hh); return poly([[c, 0], [w - c, 0], [w, c], [w, hh - c], [w - c, hh], [c, hh], [0, hh - c], [0, c]]); },
      handles: [handleX((w, hh, [a]) => [a * ss(w, hh), 0], (x, y, w, hh) => [x / ss(w, hh)])],
      text: (w, hh, [a]) => { const c = (a * ss(w, hh)) / 2; return [c, c, w - c, hh - c]; },
    },
    decagon: { label: "十角形", d: (w, hh) => poly(regular(10, w, hh)), text: (w, hh) => [w * 0.1, hh * 0.1, w * 0.9, hh * 0.9] },
    dodecagon: { label: "十二角形", d: (w, hh) => poly(regular(12, w, hh)), text: (w, hh) => [w * 0.1, hh * 0.1, w * 0.9, hh * 0.9] },
    pie: {
      label: "部分円", adj: [0, 270], lim: [[-360, 720], [-360, 720]],
      d: (w, hh, [a0, a1]) => { const [cx, cy] = [w / 2, hh / 2]; return `M${P(cx, cy)} L${P(...on(cx, cy, cx, cy, a0))} ${arcTo(cx, cy, cx, cy, a0, cw(a0, a1))} Z`; },
      handles: [
        handleX((w, hh, [a0]) => on(w / 2, hh / 2, w / 2, hh / 2, a0), (x, y, w, hh, [, a1]) => [deg(Math.atan2((y - hh / 2) / (hh / 2), (x - w / 2) / (w / 2))), a1]),
        handleX((w, hh, [, a1]) => on(w / 2, hh / 2, w / 2, hh / 2, a1), (x, y, w, hh, [a0]) => [a0, deg(Math.atan2((y - hh / 2) / (hh / 2), (x - w / 2) / (w / 2)))]),
      ],
    },
    chord: {
      label: "弦", adj: [45, 270], lim: [[-360, 720], [-360, 720]],
      d: (w, hh, [a0, a1]) => { const [cx, cy] = [w / 2, hh / 2]; return `M${P(...on(cx, cy, cx, cy, a0))} ${arcTo(cx, cy, cx, cy, a0, cw(a0, a1))} Z`; },
      handles: [
        handleX((w, hh, [a0]) => on(w / 2, hh / 2, w / 2, hh / 2, a0), (x, y, w, hh, [, a1]) => [deg(Math.atan2((y - hh / 2) / (hh / 2), (x - w / 2) / (w / 2))), a1]),
        handleX((w, hh, [, a1]) => on(w / 2, hh / 2, w / 2, hh / 2, a1), (x, y, w, hh, [a0]) => [a0, deg(Math.atan2((y - hh / 2) / (hh / 2), (x - w / 2) / (w / 2)))]),
      ],
    },
    teardrop: {
      label: "涙形", adj: [1], lim: [[0, 2]],
      d: (w, hh, [a]) => {
        const [cx, cy] = [w / 2, hh / 2];
        const tip = [cx + (cx * Math.max(a, Math.SQRT1_2)), cy - (cy * Math.max(a, Math.SQRT1_2))];
        return `M${P(0, cy)} ${arcTo(cx, cy, cx, cy, 180, 270)} L${P(...tip)} L${P(w, cy)} ${arcTo(cx, cy, cx, cy, 0, 90)} ${arcTo(cx, cy, cx, cy, 90, 180)} Z`;
      },
      handles: [handleX((w, hh, [a]) => [w / 2 + (w / 2) * Math.max(a, Math.SQRT1_2), hh / 2 - (hh / 2) * Math.max(a, Math.SQRT1_2)], (x, y, w) => [(x - w / 2) / (w / 2)])],
      text: (w, hh) => [w * 0.146, hh * 0.146, w * 0.854, hh * 0.854],
    },
    frame: {
      label: "フレーム", adj: [0.125], lim: [[0, 0.5]], rule: "evenodd",
      d: (w, hh, [a]) => { const t = a * ss(w, hh); return `${poly([[0, 0], [w, 0], [w, hh], [0, hh]])} ${poly([[t, t], [t, hh - t], [w - t, hh - t], [w - t, t]])}`; },
      handles: [handleX((w, hh, [a]) => [a * ss(w, hh), hh / 2], (x, y, w, hh) => [x / ss(w, hh)])],
      text: (w, hh, [a]) => { const t = a * ss(w, hh); return [t, t, w - t, hh - t]; },
    },
    halfFrame: {
      label: "フレーム（半分）", adj: [0.3333], lim: [[0, 0.5]],
      d: (w, hh, [a]) => { const t = a * ss(w, hh); return poly([[0, 0], [w, 0], [w - t, t], [t, t], [t, hh - t], [0, hh]]); },
      handles: [handleX((w, hh, [a]) => [a * ss(w, hh), hh / 2], (x, y, w, hh) => [x / ss(w, hh)])],
    },
    corner: {
      label: "L 字", adj: [0.5], lim: [[0, 1]],
      d: (w, hh, [a]) => { const t = Math.min(a * ss(w, hh), w, hh); return poly([[0, 0], [t, 0], [t, hh - t], [w, hh - t], [w, hh], [0, hh]]); },
      handles: [handleX((w, hh, [a]) => [Math.min(a * ss(w, hh), w, hh), 0], (x, y, w, hh) => [x / ss(w, hh)])],
    },
    diagStripe: {
      label: "斜め縞", adj: [0.5], lim: [[0, 1]],
      d: (w, hh, [a]) => poly([[0, a * hh], [a * w, 0], [w, 0], [0, hh]]),
      handles: [handleX((w, hh, [a]) => [a * w, 0], (x, y, w) => [x / w])],
    },
    plus: {
      label: "十字形", adj: [0.25], lim: [[0, 0.5]],
      d: (w, hh, [a]) => {
        const c = a * ss(w, hh);
        return poly([[c, 0], [w - c, 0], [w - c, c], [w, c], [w, hh - c], [w - c, hh - c], [w - c, hh], [c, hh], [c, hh - c], [0, hh - c], [0, c], [c, c]]);
      },
      handles: [handleX((w, hh, [a]) => [a * ss(w, hh), 0], (x, y, w, hh) => [x / ss(w, hh)])],
      text: (w, hh, [a]) => { const c = a * ss(w, hh); return [0, c, w, hh - c]; },
    },
    plaque: {
      label: "ブローチ", adj: [0.1667], lim: [[0, 0.5]],
      d: (w, hh, [a]) => {
        const c = a * ss(w, hh);
        return `M${P(c, 0)} L${P(w - c, 0)} A${r2(c)} ${r2(c)} 0 0 0 ${P(w, c)} L${P(w, hh - c)} A${r2(c)} ${r2(c)} 0 0 0 ${P(w - c, hh)} L${P(c, hh)} A${r2(c)} ${r2(c)} 0 0 0 ${P(0, hh - c)} L${P(0, c)} A${r2(c)} ${r2(c)} 0 0 0 ${P(c, 0)} Z`;
      },
      handles: [handleX((w, hh, [a]) => [a * ss(w, hh), 0], (x, y, w, hh) => [x / ss(w, hh)])],
      text: (w, hh, [a]) => { const c = a * ss(w, hh) * 0.72; return [c, c, w - c, hh - c]; },
    },
    can: {
      label: "円柱", adj: [0.25], lim: [[0, 1]],
      d: (w, hh, [a]) => { const ry = Math.min((a * ss(w, hh)) / 2, hh / 2); return `M${P(0, ry)} ${arcTo(w / 2, ry, w / 2, ry, 180, 360)} L${P(w, hh - ry)} ${arcTo(w / 2, hh - ry, w / 2, ry, 0, 180)} Z`; },
      extras: (w, hh, [a]) => { const ry = Math.min((a * ss(w, hh)) / 2, hh / 2); return [{ d: ellipse(w / 2, ry, w / 2, ry), tone: "light" }]; },
      handles: [handleX((w, hh, [a]) => [w / 2, Math.min(a * ss(w, hh), hh)], (x, y, w, hh) => [y / ss(w, hh)])],
      text: (w, hh, [a]) => { const ry = Math.min((a * ss(w, hh)) / 2, hh / 2); return [0, ry * 2, w, hh - ry]; },
    },
    cube: {
      label: "直方体", adj: [0.25], lim: [[0, 1]],
      d: (w, hh, [a]) => { const d = Math.min(a * ss(w, hh), w, hh); return poly([[0, d], [d, 0], [w, 0], [w, hh - d], [w - d, hh], [0, hh]]); },
      extras: (w, hh, [a]) => {
        const d = Math.min(a * ss(w, hh), w, hh);
        return [{ d: poly([[0, d], [d, 0], [w, 0], [w - d, d]]), tone: "light" }, { d: poly([[w - d, d], [w, 0], [w, hh - d], [w - d, hh]]), tone: "dark" }];
      },
      handles: [handleX((w, hh, [a]) => [Math.min(a * ss(w, hh), w), 0], (x, y, w, hh) => [x / ss(w, hh)])],
      text: (w, hh, [a]) => { const d = Math.min(a * ss(w, hh), w, hh); return [0, d, w - d, hh]; },
    },
    bevel: {
      label: "額縁", adj: [0.125], lim: [[0, 0.5]],
      d: (w, hh) => poly([[0, 0], [w, 0], [w, hh], [0, hh]]),
      extras: (w, hh, [a]) => {
        const b = a * ss(w, hh);
        return [
          { d: poly([[0, 0], [w, 0], [w - b, b], [b, b]]), tone: "light" },
          { d: poly([[0, 0], [b, b], [b, hh - b], [0, hh]]), tone: "light" },
          { d: poly([[w, 0], [w, hh], [w - b, hh - b], [w - b, b]]), tone: "dark" },
          { d: poly([[0, hh], [b, hh - b], [w - b, hh - b], [w, hh]]), tone: "dark" },
        ];
      },
      handles: [handleX((w, hh, [a]) => [a * ss(w, hh), hh / 2], (x, y, w, hh) => [x / ss(w, hh)])],
      text: (w, hh, [a]) => { const b = a * ss(w, hh); return [b, b, w - b, hh - b]; },
    },
    donut: {
      label: "ドーナツ", adj: [0.25], lim: [[0, 0.5]], rule: "evenodd",
      d: (w, hh, [a]) => { const t = a * ss(w, hh); return `${ellipse(w / 2, hh / 2, w / 2, hh / 2)} ${ellipse(w / 2, hh / 2, Math.max(0, w / 2 - t), Math.max(0, hh / 2 - t))}`; },
      handles: [handleX((w, hh, [a]) => [a * ss(w, hh), hh / 2], (x, y, w, hh) => [x / ss(w, hh)])],
    },
    noSmoking: {
      label: "禁止", adj: [0.1875], lim: [[0.02, 0.45]], rule: "evenodd",
      d: (w, hh, [a]) => noSmoking(w, hh, a),
      handles: [handleX((w, hh, [a]) => [a * w, hh / 2], (x, y, w) => [x / w])],
    },
    blockArc: {
      label: "アーチ", adj: [180, 0, 0.25], lim: [[-360, 720], [-360, 720], [0, 0.5]],
      d: (w, hh, [a0, a1, t]) => {
        const [cx, cy] = [w / 2, hh / 2];
        const th = t * ss(w, hh);
        const [rx2, ry2] = [Math.max(1, cx - th), Math.max(1, cy - th)];
        const end = cw(a0, a1);
        return `M${P(...on(cx, cy, cx, cy, a0))} ${arcTo(cx, cy, cx, cy, a0, end)} L${P(...on(cx, cy, rx2, ry2, end))} ${arcTo(cx, cy, rx2, ry2, end, a0)} Z`;
      },
      handles: [
        handleX((w, hh, [a0]) => on(w / 2, hh / 2, w / 2, hh / 2, a0), (x, y, w, hh, [, a1, t]) => [deg(Math.atan2((y - hh / 2) / (hh / 2), (x - w / 2) / (w / 2))), a1, t]),
        handleX((w, hh, [a0, a1, t]) => { const th = t * ss(w, hh); return on(w / 2, hh / 2, w / 2 - th, hh / 2 - th, a1); }, (x, y, w, hh, [a0, , t]) => [a0, deg(Math.atan2((y - hh / 2) / (hh / 2), (x - w / 2) / (w / 2))), t]),
      ],
    },
    foldedCorner: {
      label: "メモ", adj: [0.1667], lim: [[0, 0.5]],
      d: (w, hh, [a]) => { const c = a * ss(w, hh); return poly([[0, 0], [w, 0], [w, hh - c], [w - c, hh], [0, hh]]); },
      extras: (w, hh, [a]) => { const c = a * ss(w, hh); return [{ d: poly([[w - c, hh], [w - 0.8 * c, hh - 0.8 * c], [w, hh - c]]), tone: "dark" }]; },
      handles: [handleX((w, hh, [a]) => [w - a * ss(w, hh), hh], (x, y, w, hh) => [(w - x) / ss(w, hh)])],
    },
    smileyFace: {
      label: "スマイル", adj: [0.0465], lim: [[-0.0465, 0.0465]],
      d: (w, hh) => ellipse(w / 2, hh / 2, w / 2, hh / 2),
      extras: (w, hh, [a]) => [
        { d: `${ellipse(w * 0.35, hh * 0.38, w * 0.06, hh * 0.06)} ${ellipse(w * 0.65, hh * 0.38, w * 0.06, hh * 0.06)}`, tone: "dark" },
        { d: `M${P(w * 0.3, hh * 0.68)} Q${P(w * 0.5, hh * (0.68 + a * 6))} ${P(w * 0.7, hh * 0.68)}`, tone: "line" },
      ],
      handles: [handleX((w, hh, [a]) => [w / 2, hh * (0.68 + a * 3)], (x, y, w, hh) => [(y / hh - 0.68) / 3])],
    },
    heart: {
      label: "ハート",
      d: (w, hh) => `M${P(0.5 * w, 0.22 * hh)} C${P(0.5 * w, 0.05 * hh)} ${P(0.28 * w, -0.02 * hh)} ${P(0.13 * w, 0.08 * hh)} C${P(-0.04 * w, 0.2 * hh)} ${P(0, 0.45 * hh)} ${P(0.12 * w, 0.58 * hh)} L${P(0.5 * w, hh)} L${P(0.88 * w, 0.58 * hh)} C${P(w, 0.45 * hh)} ${P(1.04 * w, 0.2 * hh)} ${P(0.87 * w, 0.08 * hh)} C${P(0.72 * w, -0.02 * hh)} ${P(0.5 * w, 0.05 * hh)} ${P(0.5 * w, 0.22 * hh)} Z`,
      text: (w, hh) => [w * 0.2, hh * 0.18, w * 0.8, hh * 0.68],
    },
    lightningBolt: { label: "稲妻", d: (w, hh) => poly(scale21600(LIGHTNING, w, hh)), text: (w, hh) => [w * 0.33, hh * 0.35, w * 0.6, hh * 0.6] },
    sun: {
      label: "太陽", adj: [0.25], lim: [[0.12, 0.47]],
      d: (w, hh, [a]) => {
        const [cx, cy] = [w / 2, hh / 2];
        const rc = 0.5 - a;
        const rays = Array.from({ length: 8 }, (_, k) => {
          const ang = k * 45;
          const base = rc + 0.06;
          return poly([on(cx, cy, w * base, hh * base, ang - 9), on(cx, cy, w / 2, hh / 2, ang), on(cx, cy, w * base, hh * base, ang + 9)]);
        });
        return `${ellipse(cx, cy, w * rc, hh * rc)} ${rays.join(" ")}`;
      },
      handles: [handleX((w, hh, [a]) => [w / 2 - w * (0.5 - a), hh / 2], (x, y, w) => [0.5 - (w / 2 - x) / w])],
      text: (w, hh, [a]) => { const r = (0.5 - a) * 0.7; return [w * (0.5 - r), hh * (0.5 - r), w * (0.5 + r), hh * (0.5 + r)]; },
    },
    moon: {
      label: "月", adj: [0.5], lim: [[0.05, 0.95]],
      d: (w, hh, [a]) => `M${P(w, 0)} A${r2(w)} ${r2(hh / 2)} 0 0 0 ${P(w, hh)} A${r2(w * (1 - a))} ${r2(hh / 2)} 0 0 1 ${P(w, 0)} Z`,
      handles: [handleX((w, hh, [a]) => [w * a, hh / 2], (x, y, w) => [x / w])],
      text: (w, hh, [a]) => [w * 0.1, hh * 0.3, w * a * 0.9, hh * 0.7],
    },
    cloud: { label: "雲", d: (w, hh) => cloudPath(w, hh), text: (w, hh) => [w * 0.18, hh * 0.22, w * 0.82, hh * 0.78] },
    arc: {
      label: "円弧", adj: [270, 0], lim: [[-360, 720], [-360, 720]], open: true,
      d: (w, hh, [a0, a1]) => `M${P(...on(w / 2, hh / 2, w / 2, hh / 2, a0))} ${arcTo(w / 2, hh / 2, w / 2, hh / 2, a0, cw(a0, a1))}`,
      handles: [
        handleX((w, hh, [a0]) => on(w / 2, hh / 2, w / 2, hh / 2, a0), (x, y, w, hh, [, a1]) => [deg(Math.atan2((y - hh / 2) / (hh / 2), (x - w / 2) / (w / 2))), a1]),
        handleX((w, hh, [, a1]) => on(w / 2, hh / 2, w / 2, hh / 2, a1), (x, y, w, hh, [a0]) => [a0, deg(Math.atan2((y - hh / 2) / (hh / 2), (x - w / 2) / (w / 2)))]),
      ],
    },
    bracketPair: {
      label: "大かっこ", adj: [0.1667], lim: [[0, 0.5]], open: true,
      d: (w, hh, [a]) => { const r = a * ss(w, hh); return `M${P(r, 0)} A${r2(r)} ${r2(r)} 0 0 0 ${P(0, r)} L${P(0, hh - r)} A${r2(r)} ${r2(r)} 0 0 0 ${P(r, hh)} M${P(w - r, 0)} A${r2(r)} ${r2(r)} 0 0 1 ${P(w, r)} L${P(w, hh - r)} A${r2(r)} ${r2(r)} 0 0 1 ${P(w - r, hh)}`; },
      handles: [handleX((w, hh, [a]) => [0, a * ss(w, hh)], (x, y, w, hh) => [y / ss(w, hh)])],
      text: (w, hh, [a]) => { const r = a * ss(w, hh) * 0.3; return [r, r, w - r, hh - r]; },
    },
    bracePair: {
      label: "中かっこ", adj: [0.0833], lim: [[0, 0.25]], open: true,
      d: (w, hh, [a]) => {
        const r = a * ss(w, hh);
        const m = hh / 2;
        const left = `M${P(2 * r, 0)} Q${P(r, 0)} ${P(r, r)} L${P(r, m - r)} Q${P(r, m)} ${P(0, m)} Q${P(r, m)} ${P(r, m + r)} L${P(r, hh - r)} Q${P(r, hh)} ${P(2 * r, hh)}`;
        const right = `M${P(w - 2 * r, 0)} Q${P(w - r, 0)} ${P(w - r, r)} L${P(w - r, m - r)} Q${P(w - r, m)} ${P(w, m)} Q${P(w - r, m)} ${P(w - r, m + r)} L${P(w - r, hh - r)} Q${P(w - r, hh)} ${P(w - 2 * r, hh)}`;
        return `${left} ${right}`;
      },
      handles: [handleX((w, hh, [a]) => [0, a * ss(w, hh)], (x, y, w, hh) => [y / ss(w, hh)])],
      text: (w, hh, [a]) => { const r = a * ss(w, hh) * 2; return [r, 0, w - r, hh]; },
    },
    leftBracket: {
      label: "左大かっこ", adj: [0.0833], lim: [[0, 0.5]], open: true,
      d: (w, hh, [a]) => { const r = Math.min(a * hh, hh / 2); return `M${P(w, 0)} A${r2(w)} ${r2(r)} 0 0 0 ${P(0, r)} L${P(0, hh - r)} A${r2(w)} ${r2(r)} 0 0 0 ${P(w, hh)}`; },
      handles: [handleX((w, hh, [a]) => [0, Math.min(a * hh, hh / 2)], (x, y, w, hh) => [y / hh])],
    },
    rightBracket: {
      label: "右大かっこ", adj: [0.0833], lim: [[0, 0.5]], open: true,
      d: (w, hh, [a]) => { const r = Math.min(a * hh, hh / 2); return `M${P(0, 0)} A${r2(w)} ${r2(r)} 0 0 1 ${P(w, r)} L${P(w, hh - r)} A${r2(w)} ${r2(r)} 0 0 1 ${P(0, hh)}`; },
      handles: [handleX((w, hh, [a]) => [w, Math.min(a * hh, hh / 2)], (x, y, w, hh) => [y / hh])],
    },
    leftBrace: {
      label: "左中かっこ", adj: [0.0833], lim: [[0, 0.25]], open: true,
      d: (w, hh, [a]) => {
        const r = a * hh;
        const m = hh / 2;
        return `M${P(w, 0)} Q${P(w / 2, 0)} ${P(w / 2, r)} L${P(w / 2, m - r)} Q${P(w / 2, m)} ${P(0, m)} Q${P(w / 2, m)} ${P(w / 2, m + r)} L${P(w / 2, hh - r)} Q${P(w / 2, hh)} ${P(w, hh)}`;
      },
      handles: [handleX((w, hh, [a]) => [w / 2, a * hh], (x, y, w, hh) => [y / hh])],
    },
    rightBrace: {
      label: "右中かっこ", adj: [0.0833], lim: [[0, 0.25]], open: true,
      d: (w, hh, [a]) => {
        const r = a * hh;
        const m = hh / 2;
        return `M${P(0, 0)} Q${P(w / 2, 0)} ${P(w / 2, r)} L${P(w / 2, m - r)} Q${P(w / 2, m)} ${P(w, m)} Q${P(w / 2, m)} ${P(w / 2, m + r)} L${P(w / 2, hh - r)} Q${P(w / 2, hh)} ${P(0, hh)}`;
      },
      handles: [handleX((w, hh, [a]) => [w / 2, a * hh], (x, y, w, hh) => [y / hh])],
    },

    // ---- ブロック矢印
    rightArrow: arrowShape("矢印: 右", "right"),
    leftArrow: arrowShape("矢印: 左", "left"),
    upArrow: arrowShape("矢印: 上", "up"),
    downArrow: arrowShape("矢印: 下", "down"),
    leftRightArrow: {
      label: "矢印: 左右", adj: [0.5, 0.5], lim: [[0.05, 1], [0, 1]],
      d: (w, hh, [a, b]) => poly(doubleArrow(w, hh, a * hh, b * ss(w, hh))),
      handles: [handleX((w, hh, [, b]) => [Math.min(b * ss(w, hh), w / 2), 0], (x, y, w, hh, [a]) => [a, x / ss(w, hh)]), handleX((w, hh, [a]) => [w / 2, hh / 2 - (a * hh) / 2], (x, y, w, hh, [, b]) => [(hh - 2 * y) / hh, b])],
      text: (w, hh, [a, b]) => [Math.min(b * ss(w, hh), w / 2) * 0.5, hh / 2 - (a * hh) / 2, w - Math.min(b * ss(w, hh), w / 2) * 0.5, hh / 2 + (a * hh) / 2],
    },
    upDownArrow: {
      label: "矢印: 上下", adj: [0.5, 0.5], lim: [[0.05, 1], [0, 1]],
      d: (w, hh, [a, b]) => poly(swap(doubleArrow(hh, w, a * w, b * ss(w, hh)))),
      handles: [handleX((w, hh, [, b]) => [0, Math.min(b * ss(w, hh), hh / 2)], (x, y, w, hh, [a]) => [a, y / ss(w, hh)]), handleX((w, hh, [a]) => [w / 2 - (a * w) / 2, hh / 2], (x, y, w, hh, [, b]) => [(w - 2 * x) / w, b])],
      text: (w, hh, [a, b]) => [w / 2 - (a * w) / 2, Math.min(b * ss(w, hh), hh / 2) * 0.5, w / 2 + (a * w) / 2, hh - Math.min(b * ss(w, hh), hh / 2) * 0.5],
    },
    quadArrow: {
      label: "矢印: 四方向", adj: [0.225, 0.225, 0.225], lim: [[0.02, 0.5], [0.02, 0.5], [0.02, 0.5]],
      d: (w, hh, [a, b, c]) => {
        const m = ss(w, hh);
        const [cx, cy] = [w / 2, hh / 2];
        const t = (a * m) / 2;
        const hw = Math.max(t, b * m);
        const hl = Math.min(c * m, w / 2 - t, hh / 2 - t);
        return poly([[0, cy], [hl, cy - hw], [hl, cy - t], [cx - t, cy - t], [cx - t, hl], [cx - hw, hl], [cx, 0], [cx + hw, hl], [cx + t, hl], [cx + t, cy - t], [w - hl, cy - t], [w - hl, cy - hw], [w, cy],
          [w - hl, cy + hw], [w - hl, cy + t], [cx + t, cy + t], [cx + t, hh - hl], [cx + hw, hh - hl], [cx, hh], [cx - hw, hh - hl], [cx - t, hh - hl], [cx - t, cy + t], [hl, cy + t], [hl, cy + hw]]);
      },
      handles: [handleX((w, hh, [, , c]) => [Math.min(c * ss(w, hh), w / 2), hh / 2], (x, y, w, hh, [a, b]) => [a, b, x / ss(w, hh)])],
    },
    bentArrow: {
      label: "矢印: 折線", adj: [0.25, 0.25, 0.25], lim: [[0.02, 0.5], [0.02, 0.5], [0.02, 0.5]],
      d: (w, hh, [a, b, c]) => {
        const m = ss(w, hh);
        const t = a * m;
        const hh2 = Math.max(t / 2, b * m);
        const hl = Math.min(c * m, w - t);
        const yTop = hh2 - t / 2;
        const yBot = hh2 + t / 2;
        const r = Math.min(t, hh - yTop, w - hl);
        return `M${P(0, hh)} L${P(0, yTop + r)} A${r2(r)} ${r2(r)} 0 0 1 ${P(r, yTop)} L${P(w - hl, yTop)} L${P(w - hl, 0)} L${P(w, hh2)} L${P(w - hl, 2 * hh2)} L${P(w - hl, yBot)} L${P(t, yBot)} L${P(t, hh)} Z`;
      },
      handles: [handleX((w, hh, [a, b, c]) => [w - Math.min(c * ss(w, hh), w), 0], (x, y, w, hh, [a, b]) => [a, b, (w - x) / ss(w, hh)])],
    },
    uturnArrow: {
      label: "矢印: U ターン", adj: [0.25, 0.25, 0.25], lim: [[0.02, 0.45], [0.02, 0.45], [0.02, 0.6]],
      d: (w, hh, [a, b, c]) => {
        const m = ss(w, hh);
        const t = a * m;
        const hw = Math.max(t / 2 + 1, b * m);
        const hl = Math.min(c * m, hh * 0.6);
        const xc = w - hw;
        const rxo = Math.max(t, (xc + t / 2) / 2);
        const ryo = Math.max(t + 1, Math.min(rxo, (hh - hl) * 0.7));
        const right = 2 * rxo;
        return `M${P(0, hh)} L${P(0, ryo)} A${r2(rxo)} ${r2(ryo)} 0 0 1 ${P(right, ryo)} L${P(right, hh - hl)} L${P(xc + hw, hh - hl)} L${P(xc, hh)} L${P(xc - hw, hh - hl)} L${P(right - t, hh - hl)} L${P(right - t, ryo)} A${r2(Math.max(0, rxo - t))} ${r2(Math.max(0, ryo - t))} 0 0 0 ${P(t, ryo)} L${P(t, hh)} Z`;
      },
      handles: [handleX((w, hh, [a, b, c]) => [w, hh - Math.min(c * ss(w, hh), hh * 0.6)], (x, y, w, hh, [a, b]) => [a, b, (hh - y) / ss(w, hh)])],
    },
    bentUpArrow: {
      label: "矢印: 上向き折線", adj: [0.25, 0.25, 0.25], lim: [[0.02, 0.5], [0.02, 0.5], [0.02, 0.6]],
      d: (w, hh, [a, b, c]) => {
        const m = ss(w, hh);
        const t = a * m;
        const hw = Math.max(t / 2, b * m);
        const hl = Math.min(c * m, hh - t);
        const xc = w - hw;
        return poly([[0, hh - t], [xc - t / 2, hh - t], [xc - t / 2, hl], [w - 2 * hw, hl], [xc, 0], [w, hl], [xc + t / 2, hl], [xc + t / 2, hh], [0, hh]]);
      },
      handles: [handleX((w, hh, [a, b, c]) => [w, Math.min(c * ss(w, hh), hh)], (x, y, w, hh, [a, b]) => [a, b, y / ss(w, hh)])],
    },
    circularArrow: {
      label: "矢印: 環状", adj: [180, 330, 0.125], lim: [[-360, 720], [-360, 720], [0.03, 0.3]],
      d: (w, hh, [a0, a1, t]) => {
        const [cx, cy] = [w / 2, hh / 2];
        const th = t * ss(w, hh);
        const hw = th * 1.1;
        const ro = [cx - hw + th / 2, cy - hw + th / 2];
        const ri = [Math.max(1, ro[0] - th), Math.max(1, ro[1] - th)];
        const rm = [(ro[0] + ri[0]) / 2, (ro[1] + ri[1]) / 2];
        const end = cw(a0, a1);
        const tipAngle = end + deg((hw * 1.4) / Math.max(1, (rm[0] + rm[1]) / 2));
        return `M${P(...on(cx, cy, ro[0], ro[1], a0))} ${arcTo(cx, cy, ro[0], ro[1], a0, end)} L${P(...on(cx, cy, rm[0] + hw, rm[1] + hw, end))} L${P(...on(cx, cy, rm[0], rm[1], tipAngle))} L${P(...on(cx, cy, rm[0] - hw, rm[1] - hw, end))} L${P(...on(cx, cy, ri[0], ri[1], end))} ${arcTo(cx, cy, ri[0], ri[1], end, a0)} Z`;
      },
      handles: [
        handleX((w, hh, [a0, , t]) => on(w / 2, hh / 2, w / 2 - t * ss(w, hh) * 0.6, hh / 2 - t * ss(w, hh) * 0.6, a0), (x, y, w, hh, [, a1, t]) => [deg(Math.atan2((y - hh / 2) / (hh / 2), (x - w / 2) / (w / 2))), a1, t]),
        handleX((w, hh, [, a1, t]) => on(w / 2, hh / 2, w / 2 - t * ss(w, hh) * 0.6, hh / 2 - t * ss(w, hh) * 0.6, a1), (x, y, w, hh, [a0, , t]) => [a0, deg(Math.atan2((y - hh / 2) / (hh / 2), (x - w / 2) / (w / 2))), t]),
      ],
    },
    stripedRightArrow: {
      label: "矢印: ストライプ", adj: [0.5, 0.5], lim: [[0.05, 1], [0, 2]],
      d: (w, hh, [a, b]) => {
        const m = ss(w, hh);
        const t = a * hh;
        const x0 = (5 / 32) * m;
        const arrow = rightArrow(w - x0, hh, t, Math.min(b * m, w - x0)).map(([x, y]) => [x + x0, y]);
        const y1 = hh / 2 - t / 2;
        const y2 = hh / 2 + t / 2;
        return `${poly(arrow)} ${poly([[0, y1], [m / 32, y1], [m / 32, y2], [0, y2]])} ${poly([[m / 16, y1], [m / 8, y1], [m / 8, y2], [m / 16, y2]])}`;
      },
      handles: [handleX((w, hh, [a, b]) => [w - Math.min(b * ss(w, hh), w), 0], (x, y, w, hh, [a]) => [a, (w - x) / ss(w, hh)])],
    },
    notchedRightArrow: {
      label: "矢印: V 字型", adj: [0.5, 0.5], lim: [[0.05, 1], [0, 2]],
      d: (w, hh, [a, b]) => {
        const t = a * hh;
        const hl = Math.min(b * ss(w, hh), w);
        const pts = rightArrow(w, hh, t, hl);
        return poly([...pts, [Math.min(t * 0.5, w - hl), hh / 2]]);
      },
      handles: [handleX((w, hh, [a, b]) => [w - Math.min(b * ss(w, hh), w), 0], (x, y, w, hh, [a]) => [a, (w - x) / ss(w, hh)])],
    },
    homePlate: {
      label: "矢印: 五方向", adj: [0.5], lim: [[0, 2]],
      d: (w, hh, [a]) => { const d = Math.min(a * ss(w, hh), w); return poly([[0, 0], [w - d, 0], [w, hh / 2], [w - d, hh], [0, hh]]); },
      handles: [handleX((w, hh, [a]) => [w - Math.min(a * ss(w, hh), w), 0], (x, y, w, hh) => [(w - x) / ss(w, hh)])],
      text: (w, hh, [a]) => [0, 0, w - Math.min(a * ss(w, hh), w) / 2, hh],
    },
    chevron: {
      label: "矢印: 山形", adj: [0.5], lim: [[0, 2]],
      d: (w, hh, [a]) => { const d = Math.min(a * ss(w, hh), w / 2); return poly([[0, 0], [w - d, 0], [w, hh / 2], [w - d, hh], [0, hh], [d, hh / 2]]); },
      handles: [handleX((w, hh, [a]) => [w - Math.min(a * ss(w, hh), w / 2), 0], (x, y, w, hh) => [(w - x) / ss(w, hh)])],
      text: (w, hh, [a]) => { const d = Math.min(a * ss(w, hh), w / 2); return [d, 0, w - d, hh]; },
    },
    rightArrowCallout: {
      label: "吹き出し: 右矢印", adj: [0.64, 0.25, 0.35, 0.25], lim: [[0.1, 0.95], [0.02, 0.5], [0.02, 0.5], [0.02, 1]],
      d: (w, hh, [bwr, tr, hr, hlr]) => {
        const bw = bwr * w;
        const cy = hh / 2;
        const t = Math.min(tr * hh, hr * hh) * 1;
        const hhh = Math.max(t / 2, hr * hh);
        const hl = Math.min(hlr * ss(w, hh), w - bw);
        return poly([[0, 0], [bw, 0], [bw, cy - t / 2], [w - hl, cy - t / 2], [w - hl, cy - hhh], [w, cy], [w - hl, cy + hhh], [w - hl, cy + t / 2], [bw, cy + t / 2], [bw, hh], [0, hh]]);
      },
      handles: [handleX((w, hh, [bwr]) => [bwr * w, 0], (x, y, w, hh, [, tr, hr, hlr]) => [x / w, tr, hr, hlr])],
      text: (w, hh, [bwr]) => [0, 0, bwr * w, hh],
    },
    downArrowCallout: {
      label: "吹き出し: 下矢印", adj: [0.64, 0.25, 0.35, 0.25], lim: [[0.1, 0.95], [0.02, 0.5], [0.02, 0.5], [0.02, 1]],
      d: (w, hh, [bhr, tr, hr, hlr]) => {
        const bh = bhr * hh;
        const cx = w / 2;
        const t = Math.min(tr * w, hr * w);
        const hww = Math.max(t / 2, hr * w);
        const hl = Math.min(hlr * ss(w, hh), hh - bh);
        return poly([[0, 0], [w, 0], [w, bh], [cx + t / 2, bh], [cx + t / 2, hh - hl], [cx + hww, hh - hl], [cx, hh], [cx - hww, hh - hl], [cx - t / 2, hh - hl], [cx - t / 2, bh], [0, bh]]);
      },
      handles: [handleX((w, hh, [bhr]) => [0, bhr * hh], (x, y, w, hh, [, tr, hr, hlr]) => [y / hh, tr, hr, hlr])],
      text: (w, hh, [bhr]) => [0, 0, w, bhr * hh],
    },

    // ---- 数式図形
    mathPlus: {
      label: "加算記号", adj: [0.235], lim: [[0.02, 0.6]],
      d: (w, hh, [a]) => {
        const m = ss(w, hh);
        const t = (a * m) / 2;
        const g = m * 0.07;
        const [cx, cy] = [w / 2, hh / 2];
        return poly([[g, cy - t], [cx - t, cy - t], [cx - t, g], [cx + t, g], [cx + t, cy - t], [w - g, cy - t], [w - g, cy + t], [cx + t, cy + t], [cx + t, hh - g], [cx - t, hh - g], [cx - t, cy + t], [g, cy + t]]);
      },
    },
    mathMinus: {
      label: "減算記号", adj: [0.235], lim: [[0.02, 0.6]],
      d: (w, hh, [a]) => { const t = (a * ss(w, hh)) / 2; const g = w * 0.07; return poly([[g, hh / 2 - t], [w - g, hh / 2 - t], [w - g, hh / 2 + t], [g, hh / 2 + t]]); },
    },
    mathMultiply: {
      label: "乗算記号", adj: [0.235], lim: [[0.02, 0.5]],
      d: (w, hh, [a]) => {
        const t = a / 2;
        const L = 0.5 * Math.SQRT2 - 0.1;
        const pts = [];
        for (const th of [45, 135, 225, 315]) {
          const end = on(0.5, 0.5, L, L, th);
          const n = [-Math.sin(rad(th)), Math.cos(rad(th))];
          pts.push([end[0] - t * n[0], end[1] - t * n[1]], [end[0] + t * n[0], end[1] + t * n[1]], on(0.5, 0.5, t * Math.SQRT2, t * Math.SQRT2, th + 45));
        }
        return poly(pts.map(([x, y]) => [x * w, y * hh]));
      },
    },
    mathDivide: {
      label: "除算記号", adj: [0.235], lim: [[0.02, 0.4]],
      d: (w, hh, [a]) => {
        const m = ss(w, hh);
        const t = (a * m) / 2;
        const g = w * 0.07;
        const r = t * 1.15;
        return `${poly([[g, hh / 2 - t], [w - g, hh / 2 - t], [w - g, hh / 2 + t], [g, hh / 2 + t]])} ${ellipse(w / 2, hh / 2 - t - r * 2.2, r, r)} ${ellipse(w / 2, hh / 2 + t + r * 2.2, r, r)}`;
      },
    },
    mathEqual: {
      label: "等号", adj: [0.235], lim: [[0.02, 0.4]],
      d: (w, hh, [a]) => {
        const t = (a * ss(w, hh)) / 2;
        const gap = t * 0.9;
        const g = w * 0.07;
        return `${poly([[g, hh / 2 - gap - t * 2], [w - g, hh / 2 - gap - t * 2], [w - g, hh / 2 - gap], [g, hh / 2 - gap]])} ${poly([[g, hh / 2 + gap], [w - g, hh / 2 + gap], [w - g, hh / 2 + gap + t * 2], [g, hh / 2 + gap + t * 2]])}`;
      },
    },
    mathNotEqual: {
      label: "不等号", adj: [0.235], lim: [[0.02, 0.4]],
      d: (w, hh, [a]) => {
        const t = (a * ss(w, hh)) / 2;
        const gap = t * 0.9;
        const g = w * 0.07;
        const s1 = w * 0.06;
        return `${poly([[g, hh / 2 - gap - t * 2], [w - g, hh / 2 - gap - t * 2], [w - g, hh / 2 - gap], [g, hh / 2 - gap]])} ${poly([[g, hh / 2 + gap], [w - g, hh / 2 + gap], [w - g, hh / 2 + gap + t * 2], [g, hh / 2 + gap + t * 2]])} ${poly([[w * 0.62 - s1, hh * 0.08], [w * 0.62 + s1, hh * 0.08], [w * 0.38 + s1, hh * 0.92], [w * 0.38 - s1, hh * 0.92]])}`;
      },
    },

    // ---- フローチャート
    flowProcess: { label: "フローチャート: 処理", d: (w, hh) => poly([[0, 0], [w, 0], [w, hh], [0, hh]]) },
    flowAlternate: { label: "フローチャート: 代替処理", d: (w, hh) => rrect(0, 0, w, hh, Array(4).fill(ss(w, hh) / 6)), text: (w, hh) => { const i = (ss(w, hh) / 6) * 0.29; return [i, i, w - i, hh - i]; } },
    flowDecision: { label: "フローチャート: 判断", d: (w, hh) => poly([[w / 2, 0], [w, hh / 2], [w / 2, hh], [0, hh / 2]]), text: (w, hh) => [w / 4, hh / 4, (3 * w) / 4, (3 * hh) / 4] },
    flowData: { label: "フローチャート: データ", d: (w, hh) => poly([[w / 5, 0], [w, 0], [(4 * w) / 5, hh], [0, hh]]), text: (w, hh) => [w / 5, 0, (4 * w) / 5, hh] },
    flowPredefined: {
      label: "フローチャート: 定義済み処理", d: (w, hh) => poly([[0, 0], [w, 0], [w, hh], [0, hh]]),
      extras: (w, hh) => [{ d: `M${P(w / 8, 0)} L${P(w / 8, hh)} M${P((7 * w) / 8, 0)} L${P((7 * w) / 8, hh)}`, tone: "line" }], text: (w, hh) => [w / 8, 0, (7 * w) / 8, hh],
    },
    flowInternalStorage: {
      label: "フローチャート: 内部記憶", d: (w, hh) => poly([[0, 0], [w, 0], [w, hh], [0, hh]]),
      extras: (w, hh) => [{ d: `M${P(w / 8, 0)} L${P(w / 8, hh)} M${P(0, hh / 8)} L${P(w, hh / 8)}`, tone: "line" }], text: (w, hh) => [w / 8, hh / 8, w, hh],
    },
    flowDocument: {
      label: "フローチャート: 書類",
      d: (w, hh) => `M0 0 L${P(w, 0)} L${P(w, 0.8 * hh)} C${P(0.83 * w, 0.67 * hh)} ${P(0.66 * w, 0.7 * hh)} ${P(0.5 * w, 0.8 * hh)} C${P(0.33 * w, 0.92 * hh)} ${P(0.16 * w, 0.95 * hh)} ${P(0, 0.85 * hh)} Z`,
      text: (w, hh) => [0, 0, w, 0.75 * hh],
    },
    flowMultidocument: {
      label: "フローチャート: 複数書類",
      d: (w, hh) => {
        const doc = (x, y, ww, hhh) => `M${P(x, y)} L${P(x + ww, y)} L${P(x + ww, y + 0.8 * hhh)} C${P(x + 0.83 * ww, y + 0.67 * hhh)} ${P(x + 0.66 * ww, y + 0.7 * hhh)} ${P(x + 0.5 * ww, y + 0.8 * hhh)} C${P(x + 0.33 * ww, y + 0.92 * hhh)} ${P(x + 0.16 * ww, y + 0.95 * hhh)} ${P(x, y + 0.85 * hhh)} Z`;
        return [doc(0.15 * w, 0, 0.85 * w, 0.8 * hh), doc(0.075 * w, 0.1 * hh, 0.85 * w, 0.8 * hh), doc(0, 0.2 * hh, 0.85 * w, 0.8 * hh)];
      },
      text: (w, hh) => [0, 0.2 * hh, 0.85 * w, 0.8 * hh],
    },
    flowTerminator: { label: "フローチャート: 端子", d: (w, hh) => rrect(0, 0, w, hh, Array(4).fill(Math.min(w, hh) / 2)), text: (w, hh) => [Math.min(w, hh) * 0.3, 0, w - Math.min(w, hh) * 0.3, hh] },
    flowPreparation: { label: "フローチャート: 準備", d: (w, hh) => poly([[w / 5, 0], [(4 * w) / 5, 0], [w, hh / 2], [(4 * w) / 5, hh], [w / 5, hh], [0, hh / 2]]), text: (w, hh) => [w / 5, 0, (4 * w) / 5, hh] },
    flowManualInput: { label: "フローチャート: 手操作入力", d: (w, hh) => poly([[0, hh / 5], [w, 0], [w, hh], [0, hh]]), text: (w, hh) => [0, hh / 5, w, hh] },
    flowManualOperation: { label: "フローチャート: 手作業", d: (w, hh) => poly([[0, 0], [w, 0], [(4 * w) / 5, hh], [w / 5, hh]]), text: (w, hh) => [w / 5, 0, (4 * w) / 5, hh] },
    flowConnector: { label: "フローチャート: 結合子", d: (w, hh) => ellipse(w / 2, hh / 2, w / 2, hh / 2), text: (w, hh) => [w * 0.146, hh * 0.146, w * 0.854, hh * 0.854] },
    flowOffpage: { label: "フローチャート: 他ページ結合子", d: (w, hh) => poly([[0, 0], [w, 0], [w, 0.8 * hh], [w / 2, hh], [0, 0.8 * hh]]), text: (w, hh) => [0, 0, w, 0.8 * hh] },
    flowCard: { label: "フローチャート: カード", d: (w, hh) => poly([[w / 5, 0], [w, 0], [w, hh], [0, hh], [0, hh / 5]]), text: (w, hh) => [0, hh / 5, w, hh] },
    flowPunchedTape: { label: "フローチャート: せん孔テープ", d: (w, hh) => wavePath(w, hh, 0.1, 1), text: (w, hh) => [0, hh * 0.2, w, hh * 0.8] },
    flowSummingJunction: {
      label: "フローチャート: 和接合", d: (w, hh) => ellipse(w / 2, hh / 2, w / 2, hh / 2),
      extras: (w, hh) => { const [a, b] = [on(w / 2, hh / 2, w / 2, hh / 2, 225), on(w / 2, hh / 2, w / 2, hh / 2, 45)]; const [c, d] = [on(w / 2, hh / 2, w / 2, hh / 2, 315), on(w / 2, hh / 2, w / 2, hh / 2, 135)]; return [{ d: `M${P(...a)} L${P(...b)} M${P(...c)} L${P(...d)}`, tone: "line" }]; },
    },
    flowOr: { label: "フローチャート: 論理和", d: (w, hh) => ellipse(w / 2, hh / 2, w / 2, hh / 2), extras: (w, hh) => [{ d: `M${P(w / 2, 0)} L${P(w / 2, hh)} M${P(0, hh / 2)} L${P(w, hh / 2)}`, tone: "line" }] },
    flowCollate: { label: "フローチャート: 照合", d: (w, hh) => poly([[0, 0], [w, 0], [0, hh], [w, hh]]) },
    flowSort: { label: "フローチャート: 分類", d: (w, hh) => poly([[w / 2, 0], [w, hh / 2], [w / 2, hh], [0, hh / 2]]), extras: (w, hh) => [{ d: `M${P(0, hh / 2)} L${P(w, hh / 2)}`, tone: "line" }] },
    flowExtract: { label: "フローチャート: 抜き出し", d: (w, hh) => poly([[w / 2, 0], [w, hh], [0, hh]]), text: (w, hh) => [w / 4, hh / 2, (3 * w) / 4, hh] },
    flowMerge: { label: "フローチャート: 組合せ", d: (w, hh) => poly([[0, 0], [w, 0], [w / 2, hh]]), text: (w, hh) => [w / 4, 0, (3 * w) / 4, hh / 2] },
    flowStoredData: {
      label: "フローチャート: 記憶データ",
      d: (w, hh) => `M${P(w / 6, 0)} L${P(w, 0)} A${r2(w / 6)} ${r2(hh / 2)} 0 0 0 ${P(w, hh)} L${P(w / 6, hh)} A${r2(w / 6)} ${r2(hh / 2)} 0 0 1 ${P(w / 6, 0)} Z`,
      text: (w, hh) => [w / 6, 0, (5 * w) / 6, hh],
    },
    flowDelay: { label: "フローチャート: 論理積ゲート", d: (w, hh) => `M0 0 L${P(w / 2, 0)} A${r2(w / 2)} ${r2(hh / 2)} 0 0 1 ${P(w / 2, hh)} L${P(0, hh)} Z`, text: (w, hh) => [0, hh / 7, w * 0.85, hh * 0.86] },
    flowMagneticDisk: {
      label: "フローチャート: 磁気ディスク",
      d: (w, hh) => { const ry = hh / 6; return `M${P(0, ry)} ${arcTo(w / 2, ry, w / 2, ry, 180, 360)} L${P(w, hh - ry)} ${arcTo(w / 2, hh - ry, w / 2, ry, 0, 180)} Z`; },
      extras: (w, hh) => [{ d: `M${P(0, hh / 6)} ${arcTo(w / 2, hh / 6, w / 2, hh / 6, 180, 0)}`, tone: "line" }],
      text: (w, hh) => [0, hh / 3, w, (5 * hh) / 6],
    },
    flowDirectAccess: {
      label: "フローチャート: 直接アクセス記憶",
      d: (w, hh) => { const rx = w / 6; return `M${P(rx, 0)} L${P(w - rx, 0)} ${arcTo(w - rx, hh / 2, rx, hh / 2, -90, 90)} L${P(rx, hh)} ${arcTo(rx, hh / 2, rx, hh / 2, 90, 270)} Z`; },
      extras: (w, hh) => [{ d: `M${P(w - w / 6, 0)} ${arcTo(w - w / 6, hh / 2, w / 6, hh / 2, -90, -270)}`, tone: "line" }],
      text: (w, hh) => [w / 6, 0, (2 * w) / 3, hh],
    },
    flowDisplay: { label: "フローチャート: 表示", d: (w, hh) => `M${P(w / 6, 0)} L${P((5 * w) / 6, 0)} A${r2(w / 6)} ${r2(hh / 2)} 0 0 1 ${P((5 * w) / 6, hh)} L${P(w / 6, hh)} L${P(0, hh / 2)} Z`, text: (w, hh) => [w / 6, 0, (5 * w) / 6, hh] },

    // ---- 星とリボン
    explosion1: { label: "爆発: 8 pt", d: (w, hh) => poly(scale21600(EXPLOSION1, w, hh)), text: (w, hh) => [w * 0.21, hh * 0.29, w * 0.78, hh * 0.7] },
    explosion2: { label: "爆発: 14 pt", d: (w, hh) => poly(scale21600(EXPLOSION2, w, hh)), text: (w, hh) => [w * 0.22, hh * 0.31, w * 0.75, hh * 0.71] },
    star4: starShape("星: 4 pt", 4, 0.25),
    star5: starShape("星: 5 pt", 5, 0.382),
    star6: starShape("星: 6 pt", 6, 0.577),
    star7: starShape("星: 7 pt", 7, 0.69),
    star8: starShape("星: 8 pt", 8, 0.75),
    star10: starShape("星: 10 pt", 10, 0.85),
    star12: starShape("星: 12 pt", 12, 0.75),
    star16: starShape("星: 16 pt", 16, 0.75),
    star24: starShape("星: 24 pt", 24, 0.75),
    star32: starShape("星: 32 pt", 32, 0.75),
    wave: {
      label: "波線", adj: [0.125], lim: [[0, 0.2]],
      d: (w, hh, [a]) => wavePath(w, hh, a, 1),
      handles: [handleX((w, hh, [a]) => [0, a * hh], (x, y, w, hh) => [y / hh])],
      text: (w, hh, [a]) => [0, a * hh * 2, w, hh - a * hh * 2],
    },
    doubleWave: {
      label: "小波", adj: [0.0625], lim: [[0, 0.12]],
      d: (w, hh, [a]) => wavePath(w, hh, a, 2),
      handles: [handleX((w, hh, [a]) => [0, a * hh], (x, y, w, hh) => [y / hh])],
      text: (w, hh, [a]) => [0, a * hh * 2, w, hh - a * hh * 2],
    },

    // ---- 吹き出し
    wedgeRectCallout: { label: "吹き出し: 四角形", adj: [-0.2083, 0.625], lim: [[-3, 3], [-3, 3]], d: (w, hh, adj) => wedgeRect(w, hh, adj), handles: [tailHandle] },
    wedgeRoundRectCallout: { label: "吹き出し: 角を丸めた四角形", adj: [-0.2083, 0.625], lim: [[-3, 3], [-3, 3]], d: (w, hh, adj) => wedgeRect(w, hh, adj, ss(w, hh) / 6), handles: [tailHandle], text: (w, hh) => { const i = (ss(w, hh) / 6) * 0.29; return [i, i, w - i, hh - i]; } },
    wedgeEllipseCallout: {
      label: "吹き出し: 円形", adj: [-0.2083, 0.625], lim: [[-3, 3], [-3, 3]],
      d: (w, hh, adj) => {
        const [cx, cy] = [w / 2, hh / 2];
        const [tx, ty] = wedgeTip(w, hh, adj);
        if (((tx - cx) / cx) ** 2 + ((ty - cy) / cy) ** 2 <= 1) return ellipse(cx, cy, cx, cy);
        const th = deg(Math.atan2((ty - cy) / cy, (tx - cx) / cx));
        return `M${P(...on(cx, cy, cx, cy, th + 12))} ${arcTo(cx, cy, cx, cy, th + 12, th + 348)} L${P(tx, ty)} Z`;
      },
      handles: [tailHandle], text: (w, hh) => [w * 0.146, hh * 0.146, w * 0.854, hh * 0.854],
    },
    cloudCallout: {
      label: "思考の吹き出し: 雲形", adj: [-0.2083, 0.625], lim: [[-3, 3], [-3, 3]],
      d: (w, hh, adj) => {
        const [tx, ty] = wedgeTip(w, hh, adj);
        const [cx, cy] = [w / 2, hh / 2];
        // Thought bubbles grow from the tip towards the edge of the cloud.
        const th = Math.atan2((ty - cy) / cy, (tx - cx) / cx);
        const edge = [cx + Math.cos(th) * cx * 0.92, cy + Math.sin(th) * cy * 0.92];
        const outside = Math.hypot((tx - cx) / cx, (ty - cy) / cy) > 1;
        const bubbles = !outside ? [] : [0, 0.4, 0.75].map((k, i) => {
          const r = ss(w, hh) * (0.035 + i * 0.03);
          return ellipse(tx + (edge[0] - tx) * k, ty + (edge[1] - ty) * k, r, r);
        });
        return `${cloudPath(w, hh)} ${bubbles.join(" ")}`;
      },
      handles: [tailHandle], text: (w, hh) => [w * 0.18, hh * 0.22, w * 0.82, hh * 0.78],
    },
    lineCallout: {
      label: "吹き出し: 線", adj: [-0.38, 1.1], lim: [[-3, 3], [-3, 3]],
      d: (w, hh) => poly([[0, 0], [w, 0], [w, hh], [0, hh]]),
      extras: (w, hh, adj) => { const [tx, ty] = wedgeTip(w, hh, adj); const start = [clamp(tx, 0, w) === tx ? tx : tx < 0 ? 0 : w, ty > hh ? hh : ty < 0 ? 0 : hh / 2]; return [{ d: `M${P(...start)} L${P(tx, ty)}`, tone: "line" }]; },
      handles: [tailHandle],
    },
  };
  for (const [key, shape] of Object.entries(SHAPES)) shape.key = key;

  const SHAPE_GROUPS = [
    ["四角形", ["rect", "roundRect", "snip1Rect", "snip2SameRect", "snip2DiagRect", "round1Rect", "round2SameRect", "round2DiagRect"]],
    ["基本図形", ["ellipse", "triangle", "rtTriangle", "parallelogram", "trapezoid", "diamond", "pentagon", "hexagon", "heptagon", "octagon", "decagon", "dodecagon", "pie", "chord", "teardrop", "frame", "halfFrame", "corner", "diagStripe", "plus", "plaque", "can", "cube", "bevel", "donut", "noSmoking", "blockArc", "foldedCorner", "smileyFace", "heart", "lightningBolt", "sun", "moon", "cloud", "arc", "bracketPair", "bracePair", "leftBracket", "rightBracket", "leftBrace", "rightBrace"]],
    ["ブロック矢印", ["rightArrow", "leftArrow", "upArrow", "downArrow", "leftRightArrow", "upDownArrow", "quadArrow", "bentArrow", "uturnArrow", "bentUpArrow", "circularArrow", "stripedRightArrow", "notchedRightArrow", "homePlate", "chevron", "rightArrowCallout", "downArrowCallout"]],
    ["数式図形", ["mathPlus", "mathMinus", "mathMultiply", "mathDivide", "mathEqual", "mathNotEqual"]],
    ["フローチャート", ["flowProcess", "flowAlternate", "flowDecision", "flowData", "flowPredefined", "flowInternalStorage", "flowDocument", "flowMultidocument", "flowTerminator", "flowPreparation", "flowManualInput", "flowManualOperation", "flowConnector", "flowOffpage", "flowCard", "flowPunchedTape", "flowSummingJunction", "flowOr", "flowCollate", "flowSort", "flowExtract", "flowMerge", "flowStoredData", "flowDelay", "flowMagneticDisk", "flowDirectAccess", "flowDisplay"]],
    ["星とリボン", ["explosion1", "explosion2", "star4", "star5", "star6", "star7", "star8", "star10", "star12", "star16", "star24", "star32", "wave", "doubleWave"]],
    ["吹き出し", ["wedgeRectCallout", "wedgeRoundRectCallout", "wedgeEllipseCallout", "cloudCallout", "lineCallout"]],
  ];

  /** A shape's adjustments, each within its range (defaults for what is missing). */
  function adjOf(shape, adj) {
    const defaults = shape.adj || [];
    return defaults.map((value, i) => {
      const given = Array.isArray(adj) ? Number(adj[i]) : NaN;
      const [lo, hi] = shape.lim?.[i] ?? [-Infinity, Infinity];
      return Number.isFinite(given) ? clamp(given, lo, hi) : value;
    });
  }

  /** The outline of a shape in a w × h box: { paths, extras, text: [l, t, r, b], open, rule }. */
  function geometry(key, w, hh, adj, path = null) {
    if (key === "custom" && Array.isArray(path?.pts) && path.pts.length > 1) return customGeometry(path, Math.max(1, w), Math.max(1, hh));
    const shape = SHAPES[key] || SHAPES.rect;
    const a = adjOf(shape, adj);
    const ww = Math.max(1, w);
    const hhh = Math.max(1, hh);
    const d = shape.d(ww, hhh, a);
    return {
      key: shape.key, paths: Array.isArray(d) ? d : [d], extras: shape.extras ? shape.extras(ww, hhh, a) : [],
      text: shape.text ? shape.text(ww, hhh, a) : [0, 0, ww, hhh], open: Boolean(shape.open), rule: shape.rule || "nonzero", adj: a,
    };
  }

  /**
   * A shape drawn by hand (曲線・フリーフォーム・フリーハンド): its points are fractions of its box, joined by
   * straight lines or a smooth curve through them (Catmull-Rom as cubic Béziers); an open one has no fill.
   */
  function freeformD(path, w, hh) {
    const pts = path.pts.map(([x, y]) => [x * w, y * hh]);
    const n = pts.length;
    const f = (v) => r2(v);
    if (!path.curve || n < 3) return `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(" L")}${path.closed ? " Z" : ""}`;
    const at = (i) => (path.closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    const last = path.closed ? n : n - 1;
    for (let i = 0; i < last; i += 1) {
      const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
      d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return path.closed ? `${d} Z` : d;
  }
  function customGeometry(path, w, hh) {
    return { key: "custom", paths: [freeformD(path, w, hh)], extras: [], text: [0, 0, w, hh], open: !path.closed, rule: "nonzero", adj: [] };
  }

  // ---------------------------------------------------------------- rich text (what people type into shapes and text boxes)
  // Text is kept as a small subset of HTML. Everything is rebuilt from scratch out of an inert <template>, so only
  // known tags and a handful of style properties survive (no scripts, links only to web pages and mail).

  const INLINE = { B: "b", STRONG: "b", I: "i", EM: "i", U: "u", S: "s", STRIKE: "s", DEL: "s", SUB: "sub", SUP: "sup", SPAN: "span", FONT: "span", A: "a" };
  const BLOCKS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "LI"]);
  const ALIGN = new Set(["left", "center", "right", "justify"]);

  function hexColor(value) {
    const text = String(value || "").trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(text)) return text;
    if (/^#[0-9a-f]{3}$/.test(text)) return `#${text.slice(1).split("").map((c) => c + c).join("")}`;
    const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+))?\s*\)$/.exec(text);
    if (m) {
      if (m[4] !== undefined && Number(m[4]) === 0) return null;
      return `#${[m[1], m[2], m[3]].map((v) => clamp(Number(v), 0, 255).toString(16).padStart(2, "0")).join("")}`;
    }
    const named = { black: "#000000", white: "#ffffff", red: "#ff0000", navy: "#000080", gray: "#808080", grey: "#808080" }[text];
    return named || null;
  }
  const FONT_TAG_SIZES = { 1: 20, 2: 26, 3: 32, 4: 36, 5: 48, 6: 64, 7: 96 };
  function pxSize(value) {
    // The editor shows sizes as calc(48px * var(--os, 1)) (the box's shrink factor): the 48px is the size.
    const text = String(value || "").trim().replace(/^calc\(\s*([\d.]+(?:px|pt))\s*\*[^)]*\)\)?$/, "$1");
    const m = /^([\d.]+)(px|pt)?$/.exec(text);
    if (!m) return null;
    const n = Number(m[1]) * (m[2] === "pt" ? PX_PER_PT : 1);
    return Number.isFinite(n) && n > 0 ? clamp(Math.round(n * 10) / 10, 8, 400) : null;
  }

  /** The styles we keep on an inline span. */
  function inlineStyle(el) {
    const out = {};
    const style = el.style;
    const color = hexColor(style?.color || (el.tagName === "FONT" ? el.getAttribute("color") : ""));
    if (color) out.color = color;
    const bg = hexColor(style?.backgroundColor);
    if (bg && bg !== "#ffffff") out["background-color"] = bg;
    const size = pxSize(style?.fontSize) ?? (el.tagName === "FONT" ? FONT_TAG_SIZES[el.getAttribute("size")] ?? null : null);
    if (size) out["font-size"] = `${size}px`;
    const face = String(style?.fontFamily || "").replace(/^['\"]|['\"]$/g, "");
    if (/^[\p{L}\p{N}\s._+\-]{1,100}$/u.test(face)) out["font-family"] = `"${face}"`;
    const weight = String(style?.fontWeight || "");
    if (weight === "bold" || Number(weight) >= 600) out["font-weight"] = "700";
    else if (weight === "normal" || (Number(weight) > 0 && Number(weight) < 600)) out["font-weight"] = "400";
    if (style?.fontStyle === "italic") out["font-style"] = "italic";
    else if (style?.fontStyle === "normal") out["font-style"] = "normal";
    const deco = `${style?.textDecoration || ""} ${style?.textDecorationLine || ""}`;
    const lines = ["underline", "line-through"].filter((word) => deco.includes(word));
    if (lines.length) out["text-decoration"] = lines.join(" ");
    else if (/\bnone\b/.test(deco)) out["text-decoration"] = "none";
    return out;
  }
  const styleText = (style) => Object.entries(style).map(([k, v]) => `${k}: ${v}`).join("; ");

  function cleanInline(src, doc, depth = 0) {
    const out = [];
    for (const node of [...src.childNodes]) {
      if (node.nodeType === 3) { if (node.data) out.push(doc.createTextNode(node.data.replace(/ /g, " "))); continue; }
      if (node.nodeType !== 1 || depth > 12) continue;
      const tag = node.tagName.toUpperCase();
      if (tag === "BR") { out.push(doc.createElement("br")); continue; }
      if (BLOCKS.has(tag) || tag === "UL" || tag === "OL") {
        // A block inside a line: keep its words on a new line.
        if (out.length) out.push(doc.createElement("br"));
        out.push(...cleanInline(node, doc, depth + 1));
        continue;
      }
      if (["SCRIPT", "STYLE", "TEMPLATE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "IMG", "VIDEO", "AUDIO", "CANVAS", "INPUT", "TEXTAREA", "SELECT", "BUTTON", "NOSCRIPT", "TITLE", "META", "LINK"].includes(tag)) continue;
      const mapped = INLINE[tag];
      const children = cleanInline(node, doc, depth + 1);
      if (!mapped) { out.push(...children); continue; }
      if (!children.length) continue;
      if (mapped === "a") {
        const href = String(node.getAttribute("href") || "").trim();
        if (!/^(https?:\/\/|mailto:)/i.test(href)) { out.push(...children); continue; }
        const a = doc.createElement("a");
        a.setAttribute("href", href.slice(0, 2000));
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
        a.append(...children);
        out.push(a);
        continue;
      }
      if (mapped === "span") {
        const style = inlineStyle(node);
        if (!Object.keys(style).length) { out.push(...children); continue; }
        const span = doc.createElement("span");
        span.setAttribute("style", styleText(style));
        span.append(...children);
        out.push(span);
        continue;
      }
      const el = doc.createElement(mapped);
      el.append(...children);
      out.push(el);
    }
    return out;
  }

  function blockAttrs(src, el) {
    const align = String(src.style?.textAlign || src.getAttribute?.("align") || "").toLowerCase();
    if (ALIGN.has(align)) el.setAttribute("style", `text-align: ${align}`);
    const indent = Number(src.getAttribute?.("data-indent"));
    if (Number.isInteger(indent) && indent > 0) el.setAttribute("data-indent", String(Math.min(indent, 4)));
    // A paragraph's own bullet or number ("■", "①", "1."), as PowerPoint draws it (a hanging mark).
    const bullet = String(src.getAttribute?.("data-bullet") || "");
    if (bullet.trim() && /^[^<>"&\s]{1,4}$/u.test(bullet) && el.tagName !== "LI") el.setAttribute("data-bullet", bullet);
  }

  function cleanList(src, doc, depth) {
    const list = doc.createElement(src.tagName.toUpperCase() === "OL" ? "ol" : "ul");
    for (const child of [...src.childNodes]) {
      if (child.nodeType === 1 && ["UL", "OL"].includes(child.tagName.toUpperCase()) && depth < 4) {
        const nested = cleanList(child, doc, depth + 1);
        if (nested.childNodes.length) (list.lastElementChild || list).append(nested);
        continue;
      }
      if (child.nodeType === 1 && child.tagName.toUpperCase() === "LI") {
        const li = doc.createElement("li");
        blockAttrs(child, li);
        const inner = doc.createElement("div");
        for (const sub of [...child.childNodes]) {
          if (sub.nodeType === 1 && ["UL", "OL"].includes(sub.tagName.toUpperCase()) && depth < 4) {
            const nested = cleanList(sub, doc, depth + 1);
            if (nested.childNodes.length) li.append(...cleanInline(inner, doc), nested);
            inner.replaceChildren();
          } else inner.append(sub.cloneNode(true));
        }
        const rest = cleanInline(inner, doc);
        if (rest.length) {
          const first = li.firstChild;
          if (first && first.nodeType === 1 && ["UL", "OL"].includes(first.tagName)) li.append(...rest);
          else li.prepend(...rest);
        }
        if (li.childNodes.length) list.append(li);
        continue;
      }
      const loose = cleanInline({ childNodes: [child] }, doc);
      if (loose.length) { const li = doc.createElement("li"); li.append(...loose); list.append(li); }
    }
    return list;
  }

  /** Any HTML → the rich text we keep (paragraphs, lists, inline marks), as a fragment of new, safe nodes. */
  function richFragment(html) {
    const doc = root.document;
    const frag = doc.createDocumentFragment();
    const tpl = doc.createElement("template");
    tpl.innerHTML = String(html ?? "").slice(0, 1_000_000);
    const source = tpl.content || tpl;
    let para = null;
    const flush = () => { if (para) { frag.append(para); para = null; } };
    const visit = (node, depth = 0) => {
      if (node.nodeType === 1) {
        const tag = node.tagName.toUpperCase();
        if (tag === "UL" || tag === "OL") { flush(); const list = cleanList(node, doc, 0); if (list.childNodes.length) frag.append(list); return; }
        if (BLOCKS.has(tag) && tag !== "LI") {
          // A block that only holds other blocks (Chrome's <div><div>…) is unwrapped.
          if ([...node.childNodes].some((child) => child.nodeType === 1 && (BLOCKS.has(child.tagName.toUpperCase()) || ["UL", "OL"].includes(child.tagName.toUpperCase()))) && depth < 6) {
            flush();
            for (const child of [...node.childNodes]) visit(child, depth + 1);
            flush();
            return;
          }
          flush();
          const p = doc.createElement("p");
          blockAttrs(node, p);
          const kids = cleanInline(node, doc);
          if (/^H[1-6]$/.test(tag) && kids.length) { const b = doc.createElement("b"); b.append(...kids); p.append(b); } else p.append(...kids);
          frag.append(p);
          return;
        }
      }
      // Loose inline content gathers into a paragraph.
      const kids = cleanInline({ childNodes: [node] }, doc);
      if (!kids.length) return;
      if (!para) para = doc.createElement("p");
      for (const kid of kids) {
        if (kid.nodeName === "BR" && para.childNodes.length && para.lastChild?.nodeName !== "BR") { /* a line break inside the paragraph */ }
        para.append(kid);
      }
    };
    for (const node of [...source.childNodes]) visit(node);
    flush();
    // A trailing <br> in a paragraph is how editors keep an empty line open; drop the extra one.
    for (const p of frag.querySelectorAll ? frag.querySelectorAll("p") : []) {
      if (p.lastChild?.nodeName === "BR" && p.childNodes.length > 1) p.lastChild.remove();
    }
    return frag;
  }

  const sanitized = new Map();
  /** The safe, canonical form of rich text (cached). */
  function sanitizeRich(html) {
    const key = String(html ?? "");
    if (sanitized.has(key)) return sanitized.get(key);
    const box = root.document.createElement("div");
    box.append(richFragment(key));
    const out = box.innerHTML;
    if (sanitized.size > 600) sanitized.clear();
    sanitized.set(key, out);
    return out;
  }

  const escapeHtml = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  /** Plain text (lines) → rich text paragraphs. */
  function textToRich(text) {
    return String(text ?? "").split(/\r?\n/).map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`).join("");
  }
  /** Rich text → plain text, a line per paragraph or list item. */
  function richToText(html) {
    const box = root.document.createElement("div");
    box.append(richFragment(html));
    const lines = [];
    const isList = (node) => node.nodeType === 1 && (node.nodeName === "UL" || node.nodeName === "OL");
    const textOf = (el) => {
      let out = "";
      for (const node of el.childNodes) out += node.nodeType === 3 ? node.data : node.nodeName === "BR" ? "\n" : node.nodeType === 1 && !isList(node) ? textOf(node) : "";
      return out;
    };
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 1 && (child.nodeName === "P" || child.nodeName === "LI")) {
          lines.push(textOf(child));
          for (const sub of child.childNodes) if (isList(sub)) walk(sub);
        } else if (child.nodeType === 1) walk(child);
      }
    };
    walk(box);
    return lines.join("\n");
  }

  // ---------------------------------------------------------------- objects: kinds, defaults, normalization

  const KINDS = ["shape", "text", "image", "line", "icon", "video", "lottie", "table", "chart"];
  const KIND_LABELS = { shape: "図形", text: "テキスト ボックス", image: "図", line: "直線", icon: "アイコン", video: "ビデオ", lottie: "アニメーション", table: "表", chart: "グラフ" };
  // Table styles in the SEJ palette: 罫線表 (navy rules above and below, grey lines between rows) and its kin.
  const TABLE_STYLES = { sej: "罫線（SEJ）", rows: "淡い横線", grid: "格子", lines: "横線だけ", plain: "線なし", brown: "淡茶の見出し" };
  const CHART_KINDS = { bar: "縦棒", "clustered-bar": "集合縦棒", "stacked-bar": "積み上げ縦棒", "100-stacked-bar": "100%積み上げ縦棒", line: "折れ線", "multi-line": "折れ線（複数）", donut: "ドーナツ", combo: "複合（棒と折れ線）" };
  const DASHES = {
    solid: ["実線", null], roundDot: ["丸点線", [0, 2]], squareDot: ["角点線", [1, 1]], dash: ["破線", [4, 3]], dashDot: ["一点鎖線", [4, 3, 1, 3]],
    longDash: ["長破線", [8, 3]], longDashDot: ["長鎖線", [8, 3, 1, 3]], longDashDotDot: ["長二点鎖線", [8, 3, 1, 3, 1, 3]],
  };
  const ARROWHEADS = { none: "なし", triangle: "矢印", arrow: "開いた矢印", stealth: "鋭い矢印", diamond: "ひし形", oval: "円" };
  const ROUTES = { straight: "直線", elbow: "カギ線", curve: "曲線" };
  const AUTOFIT = { none: "自動調整なし", shrink: "はみ出す場合だけ自動調整する", grow: "テキストに合わせて図形のサイズを調整する" };
  const FITS = { fill: "図形に合わせる", cover: "トリミングして埋める", contain: "全体を入れる" };

  const DEFAULTS = {
    shape: { shape: "rect", fill: "#dce4f2", stroke: "none", strokeW: 2, fs: 36, color: "#1a1a1a", align: "center", valign: "middle", pad: [7, 14, 7, 14], autofit: "none", lh: 1.35, wrap: true },
    text: { shape: "rect", fill: "none", stroke: "none", strokeW: 2, fs: 40, color: "#1a1a1a", align: "left", valign: "top", pad: [7, 14, 7, 14], autofit: "grow", lh: 1.45, wrap: true },
    image: { fit: "fill", stroke: "none", strokeW: 2 },
    line: { stroke: "#1f3864", strokeW: 4, dash: "solid", head: "none", tail: "none", route: "straight", headSize: 2, tailSize: 2 },
    icon: { color: "#1f3864", strokeW: 1.75 },
    video: { fit: "cover", autoplay: false, loop: false, muted: false },
    lottie: { fit: "contain", autoplay: true, loop: true },
    table: { style: "sej", header: true, banded: true, firstCol: false, lastRow: false, fs: 28, color: "#1a1a1a", lh: 1.35 },
    chart: {},
  };
  /** An object's settings, with its kind's defaults for whatever it does not set. */
  const withDefaults = (o) => ({ ...DEFAULTS[o.kind], ...o });

  const num = (value, lo, hi, fallback = null) => {
    const n = Number(value);
    return Number.isFinite(n) ? clamp(Math.round(n * 100) / 100, lo, hi) : fallback;
  };
  const colorOrNone = (value) => (value === "none" ? "none" : hexColor(value));
  let idSeed = 0;
  const newId = () => `o${Date.now().toString(36).slice(-5)}${(idSeed++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  /** One object, as kept in a deck: unknown fields go, numbers are clamped, text is made safe. Null if unusable. */
  function normalizeObject(raw) {
    if (!raw || typeof raw !== "object" || !KINDS.includes(raw.kind)) return null;
    const o = { id: /^[A-Za-z0-9_-]{1,32}$/.test(raw.id ?? "") ? raw.id : newId(), kind: raw.kind };
    if (typeof raw.name === "string" && raw.name.trim()) o.name = raw.name.trim().slice(0, 60);
    if (o.kind === "line") {
      for (const key of ["x1", "y1", "x2", "y2"]) o[key] = num(raw[key], -W * 2, W * 3, key.startsWith("x") ? (key === "x1" ? 400 : 800) : 540);
      if (ROUTES[raw.route] && raw.route !== "straight") o.route = raw.route;
      for (const end of ["from", "to"]) {
        const ref = raw[end];
        if (ref && typeof ref === "object" && /^[A-Za-z0-9_-]{1,32}$/.test(ref.id ?? "") && Number.isInteger(ref.site) && ref.site >= 0 && ref.site < 8) o[end] = { id: ref.id, site: ref.site };
      }
      if (ARROWHEADS[raw.head] && raw.head !== "none") o.head = raw.head;
      if (ARROWHEADS[raw.tail] && raw.tail !== "none") o.tail = raw.tail;
      for (const key of ["headSize", "tailSize"]) { const v = num(raw[key], 1, 3); if (v != null && v !== 2) o[key] = Math.round(v); }
    } else {
      o.x = num(raw.x, -W * 2, W * 3, 100);
      o.y = num(raw.y, -H * 2, H * 3, 100);
      o.w = num(raw.w, 1, W * 4, 300);
      o.h = num(raw.h, 1, H * 4, 200);
      const rot = num(raw.rot, -3600, 3600, 0);
      if (rot) { const r = mod(rot + 180, 360) - 180; if (r) o.rot = Math.round(r * 100) / 100; }
      if (raw.flipH === true) o.flipH = true;
      if (raw.flipV === true) o.flipV = true;
    }
    const opacity = num(raw.opacity, 0, 1);
    if (opacity != null && opacity < 1) o.opacity = opacity;
    if (raw.shadow && typeof raw.shadow === "object") {
      const color = hexColor(raw.shadow.color);
      if (color) o.shadow = { dx: num(raw.shadow.dx, -500, 500, 0), dy: num(raw.shadow.dy, -500, 500, 0),
        blur: num(raw.shadow.blur, 0, 500, 0), color, opacity: num(raw.shadow.opacity, 0, 1, 1) };
    }
    for (const key of ["locked", "hidden"]) if (raw[key] === true) o[key] = true;
    if (typeof raw.group === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(raw.group)) o.group = raw.group;
    // The layout item an object came from (図形に変換): its "詳しく" card and deep-dive page open from it.
    if (typeof raw.item === "string" && /^[A-Za-z]{1,20}(\[\d{1,2}\])?$/.test(raw.item)) o.item = raw.item;
    // Lines, outlines and fills
    const stroke = colorOrNone(raw.stroke);
    if (stroke) o.stroke = stroke;
    const strokeW = num(raw.strokeW, 0.5, 200);
    if (strokeW != null) o.strokeW = strokeW;
    if (DASHES[raw.dash] && raw.dash !== "solid") o.dash = raw.dash;
    if (["shape", "text"].includes(o.kind)) {
      o.shape = SHAPES[raw.shape] ? raw.shape : "rect";
      // A shape drawn by hand keeps its points (fractions of its box).
      if (raw.shape === "custom" && o.kind === "shape") {
        const pts = (Array.isArray(raw.path?.pts) ? raw.path.pts : []).filter((p) => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))).slice(0, 5000).map(([x, y]) => [Math.round(clamp(Number(x), -1, 2) * 10000) / 10000, Math.round(clamp(Number(y), -1, 2) * 10000) / 10000]);
        if (pts.length > 1) { o.shape = "custom"; o.path = { pts, ...(raw.path.closed ? { closed: true } : {}), ...(raw.path.curve ? { curve: true } : {}) }; }
      }
      if (Array.isArray(raw.adj) && SHAPES[o.shape]?.adj) o.adj = adjOf(SHAPES[o.shape], raw.adj).map((v) => Math.round(v * 10000) / 10000);
      const fill = colorOrNone(raw.fill);
      if (fill) o.fill = fill;
      if (raw.gradient && typeof raw.gradient === "object" && Array.isArray(raw.gradient.stops)) {
        const stops = raw.gradient.stops.slice(0, 100).map((stop) => ({ at: num(stop?.at, 0, 1), color: hexColor(stop?.color), opacity: num(stop?.opacity, 0, 1, 1) }))
          .filter((stop) => stop.at != null && stop.color);
        if (stops.length) o.gradient = { angle: num(raw.gradient.angle, -360, 360, 0), stops };
      }
      const fillOpacity = num(raw.fillOpacity, 0, 1);
      if (fillOpacity != null && fillOpacity < 1) o.fillOpacity = fillOpacity;
    }
    // Text
    if (["shape", "text"].includes(o.kind)) {
      if (typeof raw.text === "string" && raw.text.trim()) {
        const text = sanitizeRich(raw.text);
        if (text.replace(/<[^>]+>/g, "").trim() || /<br>/.test(text)) o.text = text;
      }
      const fs = num(raw.fs, 8, 400);
      if (fs != null) o.fs = fs;
      const color = hexColor(raw.color);
      if (color) o.color = color;
      for (const key of ["bold", "italic", "underline", "strike", "vertical"]) if (typeof raw[key] === "boolean") o[key] = raw[key];
      if (raw.lockRatio === true) o.lockRatio = true;
      if (typeof raw.wrap === "boolean") o.wrap = raw.wrap;
      if (ALIGN.has(raw.align)) o.align = raw.align;
      if (["top", "middle", "bottom"].includes(raw.valign)) o.valign = raw.valign;
      if (FONTS[raw.font] && raw.font !== "body") o.font = raw.font;
      if (typeof raw.fontFace === "string" && /^[\p{L}\p{N}\s._+\-]{1,100}$/u.test(raw.fontFace)) o.fontFace = raw.fontFace;
      const lh = num(raw.lh, 0.8, 4);
      if (lh != null) o.lh = lh;
      const ls = num(raw.ls, -0.2, 1);
      if (ls) o.ls = ls;
      const psp = num(raw.psp, 0, 4);
      if (psp) o.psp = psp;
      if (Array.isArray(raw.pad) && raw.pad.length === 4) o.pad = raw.pad.map((v) => num(v, 0, 400, 0));
      if (AUTOFIT[raw.autofit]) o.autofit = raw.autofit;
    }
    // Pictures, videos, animations
    if (["image", "video", "lottie"].includes(o.kind)) {
      const src = typeof raw.src === "string" ? raw.src.trim() : "";
      if (!/^(data:(image|video|application\/json)|idb:|asset:|https?:\/\/|blob:)/i.test(src) || src.length > 50_000_000) return null;
      o.src = src;
      if (typeof raw.alt === "string" && raw.alt.trim()) o.alt = raw.alt.trim().slice(0, 200);
      if (typeof raw.fileName === "string" && raw.fileName.trim()) o.fileName = raw.fileName.trim().slice(0, 200);
      if (FITS[raw.fit]) o.fit = raw.fit;
      if (o.kind === "image") {
        const crop = raw.crop;
        if (crop && typeof crop === "object") {
          const c = { l: num(crop.l, 0, 0.95, 0), t: num(crop.t, 0, 0.95, 0), r: num(crop.r, 0, 0.95, 0), b: num(crop.b, 0, 0.95, 0) };
          if (c.l + c.r < 0.98 && c.t + c.b < 0.98 && (c.l || c.t || c.r || c.b)) o.crop = c;
        }
        if (SHAPES[raw.mask] && raw.mask !== "rect") o.mask = raw.mask;
        if (Array.isArray(raw.adj) && SHAPES[o.mask]?.adj) o.adj = adjOf(SHAPES[o.mask], raw.adj).map((v) => Math.round(v * 10000) / 10000);
        for (const key of ["bright", "contrast", "sat"]) { const v = num(raw[key], -1, 1); if (v) o[key] = v; }
        if (raw.lockRatio === false) o.lockRatio = false;
        if (raw.gray === true) o.gray = true;
      } else {
        for (const key of ["autoplay", "loop", "muted"]) if (typeof raw[key] === "boolean") o[key] = raw[key];
      }
    }
    if (o.kind === "table") {
      const table = normalizeTable(raw);
      if (!table) return null;
      Object.assign(o, table);
      // The words' size, colour, line spacing and font for the whole table (cells may set their own colour).
      const fs = num(raw.fs, 8, 400);
      if (fs != null) o.fs = fs;
      const color = hexColor(raw.color);
      if (color) o.color = color;
      const lh = num(raw.lh, 0.8, 4);
      if (lh != null) o.lh = lh;
      if (FONTS[raw.font] && raw.font !== "body") o.font = raw.font;
    }
    if (o.kind === "chart") {
      const chartData = normalizeChart(raw.chart);
      if (!chartData) return null;
      o.chart = chartData;
    }
    if (o.kind === "icon") {
      if (!E.icons[raw.icon]) return null;
      o.icon = raw.icon;
      const color = hexColor(raw.color);
      if (color) o.color = color;
    }
    // Clicking the object while presenting
    const action = raw.action;
    if (action && typeof action === "object") {
      if (["next", "prev", "first", "last", "end"].includes(action.type)) o.action = { type: action.type };
      else if (action.type === "slide" && /^[A-Za-z0-9_-]{1,32}$/.test(action.to ?? "")) o.action = { type: "slide", to: action.to };
      else if (action.type === "url" && /^(https?:\/\/|mailto:)/i.test(String(action.href || "").trim())) o.action = { type: "url", href: String(action.href).trim().slice(0, 2000) };
    }
    return o;
  }

  /** Column widths or row heights: n positive shares that add up to 1 (equal when unusable). */
  function shares(list, n) {
    const values = Array.from({ length: n }, (_, i) => Number(Array.isArray(list) ? list[i] : NaN));
    if (!values.every((v) => Number.isFinite(v) && v > 0)) return Array.from({ length: n }, () => Math.round((1 / n) * 100000) / 100000);
    const sum = values.reduce((a, b) => a + b, 0);
    return values.map((v) => Math.round((v / sum) * 100000) / 100000);
  }
  /** A table's cells (rich text, fill, colour, bold, alignment, merged spans), columns and rows, style options. */
  function normalizeTable(raw) {
    const rows = (Array.isArray(raw.cells) ? raw.cells : []).filter(Array.isArray).slice(0, 500);
    if (!rows.length) return null;
    const nCols = clamp(Math.max(...rows.map((row) => row.length), 1), 1, 100);
    const cells = rows.map((row) => Array.from({ length: nCols }, (_, c) => {
      const src = row[c] && typeof row[c] === "object" ? row[c] : {};
      const cell = {};
      if (typeof src.text === "string" && src.text.trim()) { const text = sanitizeRich(src.text); if (text.replace(/<[^>]+>/g, "").trim()) cell.text = text; }
      const fill = hexColor(src.fill);
      if (fill) cell.fill = fill;
      const color = hexColor(src.color);
      if (color) cell.color = color;
      const fs = num(src.fs, 8, 400);
      if (fs != null) cell.fs = fs;
      const lh = num(src.lh, 0.8, 4);
      if (lh != null) cell.lh = lh;
      if (typeof src.fontFace === "string" && /^[\p{L}\p{N}\s._+\-]{1,100}$/u.test(src.fontFace)) cell.fontFace = src.fontFace;
      if (Array.isArray(src.pad) && src.pad.length === 4) cell.pad = src.pad.map((v) => num(v, 0, 400, 0));
      for (const key of ["bold", "italic", "underline", "strike"]) if (src[key] === true) cell[key] = true;
      if (ALIGN.has(src.align)) cell.align = src.align;
      if (["top", "middle", "bottom"].includes(src.valign)) cell.valign = src.valign;
      const rs = Math.round(Number(src.rs) || 1);
      const cs = Math.round(Number(src.cs) || 1);
      if (rs > 1) cell.rs = rs;
      if (cs > 1) cell.cs = cs;
      // Borders a cell draws itself (a table brought over from PowerPoint): { c: colour, w: width } or "none".
      for (const side of ["bt", "br", "bb", "bl"]) {
        const b = src[side];
        if (b === "none") cell[side] = "none";
        else if (b && typeof b === "object" && hexColor(b.c)) cell[side] = { c: hexColor(b.c), w: num(b.w, 0.5, 24, 1) };
      }
      return cell;
    }));
    // Merged cells: a span stays inside the table, the cells it covers are marked, and spans never overlap.
    const covered = cells.map((row) => row.map(() => false));
    cells.forEach((row, r) => row.forEach((cell, c) => {
      if (covered[r][c]) { for (const key of Object.keys(cell)) delete cell[key]; cell.merged = true; return; }
      const rs = clamp(cell.rs || 1, 1, cells.length - r);
      const cs = clamp(cell.cs || 1, 1, nCols - c);
      let fits = true;
      for (let i = r; i < r + rs; i += 1) for (let j = c; j < c + cs; j += 1) if ((i !== r || j !== c) && covered[i][j]) fits = false;
      if (!fits) { delete cell.rs; delete cell.cs; return; }
      if (rs > 1) cell.rs = rs; else delete cell.rs;
      if (cs > 1) cell.cs = cs; else delete cell.cs;
      for (let i = r; i < r + rs; i += 1) for (let j = c; j < c + cs; j += 1) if (i !== r || j !== c) covered[i][j] = true;
    }));
    const out = { cells, cols: shares(raw.cols, nCols), rows: shares(raw.rows, cells.length) };
    if (TABLE_STYLES[raw.style] && raw.style !== "sej") out.style = raw.style;
    for (const key of ["header", "banded", "firstCol", "lastRow"]) if (typeof raw[key] === "boolean") out[key] = raw[key];
    return out;
  }
  // As many categories and series as a PowerPoint chart brought over may carry.
  const CHART_MAX_LABELS = 500;
  const CHART_MAX_SERIES = 100;
  /** A chart's kind, category labels and series (numbers), title and unit. */
  function normalizeChart(raw) {
    if (!raw || typeof raw !== "object") return null;
    const labels = (Array.isArray(raw.labels) ? raw.labels : []).slice(0, CHART_MAX_LABELS).map((label) => String(label ?? "").trim().slice(0, 500));
    const series = (Array.isArray(raw.series) ? raw.series : []).filter((s) => s && typeof s === "object").slice(0, CHART_MAX_SERIES).map((s, i) => ({
      name: String(s.name ?? "").trim().slice(0, 500) || `系列${i + 1}`,
      values: labels.map((_, j) => { const v = Number(Array.isArray(s.values) ? s.values[j] : NaN); return Number.isFinite(v) ? Math.round(clamp(v, -1e12, 1e12) * 10000) / 10000 : 0; }),
    }));
    if (!labels.length || !series.length) return null;
    const out = { type: CHART_KINDS[raw.type] ? raw.type : "bar", labels, series };
    for (const key of ["title", "unit"]) if (typeof raw[key] === "string" && raw[key].trim()) out[key] = raw[key].trim().slice(0, key === "unit" ? 10 : 80);
    const style = normalizeChartStyle(raw.style, labels.length);
    if (style) out.style = style;
    return out;
  }

  // ---------------------------------------------------------------- charts as PowerPoint draws them
  // A chart brought over from PowerPoint keeps its formatting in `chart.style`: the colour of each series and
  // point, gap width and overlap, line widths and markers, data labels (number format, position, font, custom
  // text), axes (labels, lines, scale, gridlines, reversed order), the legend and the plot area. Such a chart is
  // drawn the way PowerPoint draws it rather than with the layouts' look. Sizes are slide pixels.

  const LABEL_POS = new Set(["outEnd", "inEnd", "ctr", "inBase", "t", "b", "l", "r", "bestFit"]);
  const MARKERS = new Set(["none", "circle", "square", "diamond", "triangle", "dash", "dot", "x", "plus", "star"]);
  const SERIES_KINDS = new Set(["bar", "line", "area"]);

  function normalizeChartStyle(raw, categoryCount = CHART_MAX_LABELS) {
    if (!raw || typeof raw !== "object") return null;
    const font = (f) => {
      if (!f || typeof f !== "object") return null;
      const out = {};
      const size = num(f.size, 6, 200);
      if (size != null) out.size = size;
      if (typeof f.bold === "boolean") out.bold = f.bold;
      if (f.italic === true) out.italic = true;
      const color = hexColor(f.color);
      if (color) out.color = color;
      return Object.keys(out).length ? out : null;
    };
    const lineColor = (v) => (v === "none" ? "none" : hexColor(v));
    const fmt = (v) => (typeof v === "string" && v.trim() ? v.slice(0, 60) : null);
    const label = (l) => {
      if (!l || typeof l !== "object") return null;
      const out = {};
      for (const key of ["val", "pct", "cat", "ser"]) if (l[key] === true) out[key] = true;
      if (l.show === false) out.show = false;
      if (LABEL_POS.has(l.pos)) out.pos = l.pos;
      if (fmt(l.format)) out.format = fmt(l.format);
      const f = font(l.font);
      if (f) out.font = f;
      if (Array.isArray(l.runs)) {
        const runs = l.runs.filter((r) => r && typeof r.t === "string").slice(0, 8).map((r) => ({ t: r.t.slice(0, 80), ...(font(r.font) ? { font: font(r.font) } : {}) }));
        if (runs.length) out.runs = runs;
      }
      return Object.keys(out).length ? out : null;
    };
    const st = {};
    if (CHART_KINDS[raw.type]) st.type = raw.type;
    if (raw.dir === "bar" || raw.dir === "col") st.dir = raw.dir;
    if (raw.stack === "stacked" || raw.stack === "percent") st.stack = raw.stack;
    const gap = num(raw.gap, 0, 500);
    if (gap != null) st.gap = gap;
    const overlap = num(raw.overlap, -100, 100);
    if (overlap != null) st.overlap = overlap;
    const hole = num(raw.hole, 0, 90);
    if (hole != null) st.hole = hole;
    const angle = num(raw.angle, 0, 360);
    if (angle != null) st.angle = angle;
    for (const key of ["font", "title"]) { const f = font(raw[key]); if (f) st[key] = f; }
    if (raw.legend && typeof raw.legend === "object" && ["b", "t", "r", "l", "tr"].includes(raw.legend.pos)) {
      st.legend = { pos: raw.legend.pos, ...(font(raw.legend.font) ? { font: font(raw.legend.font) } : {}) };
    }
    for (const key of ["cat", "val"]) {
      const a = raw[key];
      if (!a || typeof a !== "object") continue;
      const out = {};
      if (a.hide === true) out.hide = true;
      if (a.reverse === true) out.reverse = true;
      if (a.edge === true) out.edge = true;
      const f = font(a.font);
      if (f) out.font = f;
      const line = lineColor(a.line);
      if (line) out.line = line;
      const grid = lineColor(a.grid);
      if (grid) out.grid = grid;
      for (const k of ["min", "max", "step"]) { const v = num(a[k], -1e12, 1e12); if (v != null) out[k] = v; }
      if (out.step != null && out.step <= 0) delete out.step;
      if (fmt(a.format)) out.format = fmt(a.format);
      if (Object.keys(out).length) st[key] = out;
    }
    if (raw.plot && typeof raw.plot === "object") {
      const p = { x: num(raw.plot.x, 0, 1), y: num(raw.plot.y, 0, 1), w: num(raw.plot.w, 0.05, 1), h: num(raw.plot.h, 0.05, 1) };
      if (Object.values(p).every((v) => v != null)) st.plot = { ...p, ...(raw.plot.outer === true ? { outer: true } : {}) };
    }
    if (Array.isArray(raw.series)) {
      st.series = raw.series.slice(0, CHART_MAX_SERIES).map((sr) => {
        if (!sr || typeof sr !== "object") return {};
        const out = {};
        if (SERIES_KINDS.has(sr.kind)) out.kind = sr.kind;
        const color = hexColor(sr.color);
        if (color) out.color = color;
        const width = num(sr.width, 0, 60);
        if (width != null) out.width = width;
        if (DASHES[sr.dash] && sr.dash !== "solid") out.dash = sr.dash;
        if (sr.smooth === true) out.smooth = true;
        if (sr.marker && typeof sr.marker === "object") {
          const m = { s: MARKERS.has(sr.marker.s) ? sr.marker.s : "none" };
          const z = num(sr.marker.z, 2, 80);
          if (z != null) m.z = z;
          const mc = hexColor(sr.marker.color);
          if (mc) m.color = mc;
          if (Array.isArray(sr.marker.at)) m.at = sr.marker.at.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < categoryCount).slice(0, categoryCount);
          out.marker = m;
        }
        if (Array.isArray(sr.points)) {
          const pts = sr.points.filter((p) => p && Number.isInteger(p.i) && p.i >= 0 && p.i < categoryCount && hexColor(p.color)).slice(0, categoryCount).map((p) => ({ i: p.i, color: hexColor(p.color) }));
          if (pts.length) out.points = pts;
        }
        const l = label(sr.label);
        if (l) out.label = l;
        if (Array.isArray(sr.pointLabels)) {
          const pls = sr.pointLabels.filter((p) => p && Number.isInteger(p.i) && p.i >= 0 && p.i < categoryCount).slice(0, categoryCount).map((p) => ({ i: p.i, ...(label(p) || {}) }));
          if (pls.length) out.pointLabels = pls;
        }
        return out;
      });
    }
    return Object.keys(st).length ? st : null;
  }

  /** A number in an Excel number format: 0, 0.0, #,##0, 0%, 0.0%, 0"%", "¥"#,##0, [Red] and ; sections, General. */
  function numFormat(value, code) {
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value ?? "");
    const general = (v) => {
      const a = Math.abs(v);
      if (a !== 0 && (a >= 1e11 || a < 1e-9)) return v.toExponential(4).replace(/\.?0+e/, "E");
      return String(Math.round(v * 1e9) / 1e9);
    };
    if (!code || /^general$/i.test(code.trim())) return general(n);
    const sections = [];
    let cur = "";
    let quoted = false;
    for (const ch of code) {
      if (ch === '"') quoted = !quoted;
      if (ch === ";" && !quoted) { sections.push(cur); cur = ""; } else cur += ch;
    }
    sections.push(cur);
    let section = sections[0];
    let neg = n < 0;
    if (n < 0 && sections.length > 1) { section = sections[1]; neg = false; } else if (n === 0 && sections.length > 2) section = sections[2];
    if (/^general$/i.test(section.trim())) return (neg ? "-" : "") + general(Math.abs(n));
    // Split into literal text and the one numeric placeholder block.
    const parts = [];
    let block = null;
    let percent = 0;
    for (let i = 0; i < section.length; i += 1) {
      const ch = section[i];
      if (ch === '"') { const end = section.indexOf('"', i + 1); parts.push({ t: section.slice(i + 1, end < 0 ? undefined : end) }); i = end < 0 ? section.length : end; continue; }
      if (ch === "\\" && i + 1 < section.length) { parts.push({ t: section[i + 1] }); i += 1; continue; }
      if (ch === "[") { const end = section.indexOf("]", i); i = end < 0 ? section.length : end; continue; }
      if (ch === "_" || ch === "*") { i += 1; if (ch === "_") parts.push({ t: " " }); continue; }
      if ("0#?,.".includes(ch) && (block === null || parts.at(-1) === block)) {
        if (block === null) { block = { num: "" }; parts.push(block); }
        block.num += ch;
        continue;
      }
      if (ch === "%") percent += 1;
      if (/[eE]/.test(ch) && block) return (neg ? "-" : "") + general(Math.abs(n));
      parts.push({ t: ch });
    }
    let v = Math.abs(n) * 100 ** percent;
    if (!block) return (neg ? "-" : "") + parts.map((p) => p.t ?? "").join("");
    const [intPart, decPart = ""] = block.num.split(".");
    const scale = (/,+$/.exec(intPart) || [""])[0].length;
    v /= 1000 ** scale;
    const minDec = (decPart.match(/0/g) || []).length;
    const maxDec = (decPart.match(/[0#?]/g) || []).length;
    const grouping = intPart.replace(/,+$/, "").includes(",");
    const minInt = Math.max(1, (intPart.match(/0/g) || []).length);
    let text = v.toLocaleString("en-US", { minimumIntegerDigits: Math.min(21, minInt), minimumFractionDigits: minDec, maximumFractionDigits: maxDec, useGrouping: grouping });
    if (!/0/.test(intPart) && text.startsWith("0") && v < 1 && maxDec) text = text.slice(1);
    block.t = text;
    return (neg && Math.round(v * 10 ** maxDec) !== 0 ? "-" : "") + parts.map((p) => p.t ?? "").join("");
  }

  /** About how wide a text is drawn (CJK full width, Latin about half). */
  function textWidth(text, size) {
    let w = 0;
    for (const ch of String(text)) {
      const c = ch.codePointAt(0);
      w += c < 0x2e80 ? (/[ilIjt.,:;'|!()[\]\s]/.test(ch) ? 0.32 : /[mwMW%@]/.test(ch) ? 0.86 : /[A-Z0-9#$&]/.test(ch) ? 0.62 : 0.54) : c >= 0xff61 && c <= 0xff9f ? 0.5 : 1;
    }
    return w * size;
  }

  /** A label broken into lines no wider than `width` (at most `max` lines). */
  function wrapText(text, size, width, max = 3) {
    const out = [];
    let line = "";
    for (const ch of String(text)) {
      if (line && textWidth(line + ch, size) > width) {
        out.push(line);
        line = ch.trim() ? ch : "";
        if (out.length === max - 1) { line += [...String(text)].slice([...out.join("")].length + 1).join(""); break; }
      } else line += ch;
    }
    if (line) out.push(line);
    if (out.length === max && textWidth(out.at(-1), size) > width) {
      let last = out.at(-1);
      while (last.length > 1 && textWidth(`${last}…`, size) > width) last = last.slice(0, -1);
      out[out.length - 1] = `${last}…`;
    }
    return out;
  }

  /** The value axis PowerPoint picks: 5% headroom, then the smallest round step (1, 2, 5 × 10ⁿ) that gives at most
   *  ten divisions (fewer on a short axis); zero stays in unless the values sit far from it. */
  function valueScale(lo, hi, opt = {}) {
    const fixedMin = opt.min != null;
    const fixedMax = opt.max != null;
    let min = fixedMin ? opt.min : lo >= 0 ? (hi > 0 && (hi - lo) / hi < 1 / 6 ? lo : 0) : lo;
    let max = fixedMax ? opt.max : hi <= 0 && lo < 0 ? 0 : hi;
    if (!fixedMax && max > 0) max += (max - Math.min(min, max)) * 0.05;
    if (!fixedMin && min < 0) min -= (max - min) * 0.05;
    if (max <= min) max = min + 1;
    const most = Math.max(2, Math.min(10, Math.floor(opt.divisions || 10)));
    let step = opt.step;
    if (!step) {
      const range = max - min;
      const exp = 10 ** Math.floor(Math.log10(range / most));
      step = [1, 2, 5, 10, 20].map((m) => m * exp).find((v) => range / v <= most + 1e-9) || 10 * exp;
    }
    if (!fixedMin) min = Math.floor(min / step + 1e-9) * step;
    if (!fixedMax) max = Math.max(min + step, Math.ceil(max / step - 1e-9) * step);
    return { min, max, step };
  }

  /** The chart a PowerPoint deck carried, drawn in SVG with its own formatting (chart.style). */
  function officeChart(c, W0, H0) {
    const st = c.style || {};
    const W = Math.max(60, W0);
    const H = Math.max(40, H0);
    const svg = s("svg", { class: "hs-ochart", viewBox: `0 0 ${r2(W)} ${r2(H)}`, preserveAspectRatio: "none", role: "img", "aria-label": c.title || "グラフ" });
    const base = { size: 24, color: "#595959", ...(st.font || {}) };
    const fontOf = (...fs) => Object.assign({}, base, ...fs.filter(Boolean));
    const textEl = (x, y, str, f, anchor = "start", extra = {}) => s("text", { x: r2(x), y: r2(y), "text-anchor": anchor, fill: f.color, style: { "font-size": `${f.size}px`, "font-weight": f.bold ? 700 : 400, "font-style": f.italic ? "italic" : null }, ...extra }, str);
    const sameType = !st.type || st.type === c.type;
    const sts = (i) => (sameType ? st.series?.[i] : { color: st.series?.[i]?.color }) || {};
    const palette = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];
    const colorOf = (i) => sts(i).color || palette[i % palette.length];
    const pointColor = (si, i) => sts(si).points?.find((p) => p.i === i)?.color || colorOf(si);
    const isPie = c.type === "donut";
    const baseKind = /line/.test(c.type) ? "line" : "bar";
    const kindOf = (i) => sts(i).kind || (c.type === "combo" ? (i === 0 ? "bar" : "line") : baseKind);
    const stack = sameType && st.stack ? st.stack : c.type === "100-stacked-bar" ? "percent" : c.type === "stacked-bar" ? "stacked" : null;
    const horizontal = sameType && st.dir === "bar";
    const n = c.labels.length;
    const pad = 10;
    let box = { x: pad, y: pad, w: W - pad * 2, h: H - pad * 2 };
    // Title
    if (c.title) {
      const f = fontOf({ size: Math.round(base.size * 1.2), bold: true }, st.title);
      svg.append(textEl(W / 2, box.y + f.size, c.title, f, "middle", { class: "hs-ochart-title" }));
      box = { ...box, y: box.y + f.size * 1.5, h: box.h - f.size * 1.5 };
    }
    // Legend
    const legendItems = isPie ? c.labels.map((label, i) => ({ label, color: pointColor(0, i), kind: "bar" })) : c.series.map((sr, i) => ({ label: sr.name, color: colorOf(i), kind: kindOf(i), i }));
    if (st.legend && legendItems.length) {
      const f = fontOf(st.legend.font);
      const sw = f.size * 0.75;
      const itemW = (it) => sw + f.size * 0.4 + textWidth(it.label, f.size) + f.size * 1.1;
      const g = s("g", { class: "hs-ochart-legend" });
      const drawItem = (it, x, y) => {
        if (it.kind === "line") {
          g.append(s("line", { x1: r2(x), x2: r2(x + sw * 1.6), y1: r2(y), y2: r2(y), stroke: it.color, "stroke-width": Math.max(2, sts(it.i).width || 3) }));
          x += sw * 0.6;
        } else g.append(s("rect", { x: r2(x), y: r2(y - sw / 2), width: r2(sw), height: r2(sw), fill: it.color }));
        g.append(textEl(x + sw + f.size * 0.4, y + f.size * 0.36, it.label, f));
      };
      const pos = st.legend.pos;
      if (pos === "b" || pos === "t") {
        const rows = [[]];
        let rowW = 0;
        for (const it of legendItems) {
          const w = itemW(it);
          if (rowW + w > box.w && rows.at(-1).length) { rows.push([]); rowW = 0; }
          rows.at(-1).push(it);
          rowW += w;
        }
        const lh = f.size * 1.5;
        const y0 = pos === "b" ? box.y + box.h - lh * rows.length + lh / 2 : box.y + lh / 2;
        rows.forEach((row, ri) => {
          const total = row.reduce((sum, it) => sum + itemW(it), 0) - f.size * 1.1;
          let x = box.x + (box.w - total) / 2;
          for (const it of row) { drawItem(it, x, y0 + ri * lh); x += itemW(it); }
        });
        box = pos === "b" ? { ...box, h: box.h - lh * rows.length - 4 } : { ...box, y: box.y + lh * rows.length + 4, h: box.h - lh * rows.length - 4 };
      } else {
        const lw = Math.min(box.w * 0.4, Math.max(...legendItems.map(itemW)));
        const lh = f.size * 1.45;
        const total = lh * legendItems.length;
        const x0 = pos === "l" ? box.x : box.x + box.w - lw;
        const y0 = pos === "tr" ? box.y + lh / 2 : box.y + (box.h - total) / 2 + lh / 2;
        legendItems.forEach((it, i) => drawItem(it, x0, y0 + i * lh));
        box = pos === "l" ? { ...box, x: box.x + lw + 8, w: box.w - lw - 8 } : { ...box, w: box.w - lw - 8 };
      }
      svg.append(g);
    }
    const manual = st.plot ? { x: st.plot.x * W, y: st.plot.y * H, w: st.plot.w * W, h: st.plot.h * H } : null;
    if (isPie) {
      pieChart(svg, c, manual || box, { st, sts, pointColor, fontOf, textEl });
      return svg;
    }
    // Values and the value axis
    const valuesOf = (si) => c.series[si].values;
    const barIdx = c.series.map((_, i) => i).filter((i) => kindOf(i) === "bar");
    const lineIdx = c.series.map((_, i) => i).filter((i) => kindOf(i) !== "bar");
    const totals = c.labels.map((_, i) => {
      let pos = 0, neg = 0;
      for (const si of barIdx) { const v = valuesOf(si)[i] || 0; if (v >= 0) pos += v; else neg += v; }
      return { pos, neg };
    });
    const shown = (si, i) => {
      const v = valuesOf(si)[i] || 0;
      if (stack === "percent" && kindOf(si) === "bar") { const t = totals[i].pos - totals[i].neg; return t ? (v / t) * 100 : 0; }
      return v;
    };
    let lo = 0, hi = 0;
    const consider = (v) => { lo = Math.min(lo, v); hi = Math.max(hi, v); };
    let first = true;
    const take = (v) => { if (first) { lo = v; hi = v; first = false; } else consider(v); };
    if (stack && barIdx.length) for (const t of totals) { if (stack === "percent") { take(t.neg ? -100 : 0); take(t.pos ? 100 : 0); } else { take(t.pos); take(t.neg); } }
    else for (const si of barIdx) valuesOf(si).forEach((v) => take(v));
    for (const si of lineIdx) valuesOf(si).forEach((v) => take(v));
    if (first) { lo = 0; hi = 1; }
    if (barIdx.length) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    const va = st.val || {};
    const ca = st.cat || {};
    const valAxisLen = horizontal ? (manual || box).w * 0.7 : (manual || box).h * 0.8;
    const percentAxis = stack === "percent" && !lineIdx.length;
    const scale = valueScale(lo, hi, { min: va.min ?? (percentAxis && lo >= 0 ? 0 : undefined), max: va.max ?? (percentAxis ? (hi > 0 ? 100 : 0) : undefined), step: va.step, divisions: valAxisLen / (fontOf(va.font).size * 1.6) });
    // A 100% stacked chart's axis runs from 0 to 1 in Excel (shown as 0%–100%); ours from 0 to 100.
    const tickText = (v) => (percentAxis ? numFormat(v / 100, va.format || "0%") : numFormat(v, va.format));
    const ticks = [];
    for (let v = scale.min, k = 0; v <= scale.max + scale.step * 1e-6 && k < 60; v += scale.step, k += 1) ticks.push(Math.round(v / scale.step) * scale.step);
    const valFont = fontOf(va.font);
    const catFont = fontOf(ca.font);
    // The plot area: as the chart placed it, or what is left after the axis labels.
    let plot;
    let labelLeft = (manual || box).x;
    if (manual && !st.plot.outer) plot = manual;
    else {
      const area = manual || box;
      labelLeft = area.x;
      const valLabelW = va.hide ? 0 : Math.max(...ticks.map((v) => textWidth(tickText(v), valFont.size))) + 10;
      if (horizontal) {
        const catW = ca.hide ? 0 : Math.min(area.w * 0.5, Math.max(...c.labels.map((l) => textWidth(l, catFont.size)), 0) + 12);
        const valH = va.hide ? 0 : valFont.size * 1.5;
        plot = { x: area.x + catW, y: area.y + (va.hide ? 0 : 0), w: area.w - catW - (va.hide ? 0 : valFont.size), h: area.h - valH };
      } else {
        const slotW = (area.w - valLabelW) / Math.max(1, n);
        const lines = ca.hide ? 0 : Math.max(1, ...c.labels.map((l) => wrapText(l, catFont.size, slotW * 0.92).length));
        plot = { x: area.x + valLabelW, y: area.y + (va.hide ? 4 : valFont.size * 0.6), w: area.w - valLabelW - 6, h: area.h - lines * catFont.size * 1.25 - 8 - (va.hide ? 4 : valFont.size * 0.6) };
      }
    }
    plot.w = Math.max(10, plot.w);
    plot.h = Math.max(10, plot.h);
    // Positions along the value axis and the category axis
    const valLen = horizontal ? plot.w : plot.h;
    const vPos = (v) => {
      const t = (clamp(v, scale.min, scale.max) - scale.min) / (scale.max - scale.min || 1);
      return horizontal ? plot.x + t * valLen : plot.y + plot.h - t * valLen;
    };
    const edge = sameType && ca.edge && !barIdx.length;
    const slot = (horizontal ? plot.h : plot.w) / Math.max(1, edge ? n - 1 || 1 : n);
    // Category i's centre along its axis; PowerPoint draws a bar chart's first category at the bottom.
    const order = (i) => (horizontal ? (ca.reverse ? i : n - 1 - i) : ca.reverse ? n - 1 - i : i);
    const cPos = (i) => (horizontal ? plot.y : plot.x) + (edge ? order(i) * slot : (order(i) + 0.5) * slot);
    const zero = vPos(clamp(0, scale.min, scale.max));
    // Gridlines and axis lines
    const grid = s("g", { class: "hs-ochart-grid" });
    if (va.grid && va.grid !== "none") {
      for (const v of ticks) {
        const p = vPos(v);
        grid.append(horizontal ? s("line", { x1: r2(p), x2: r2(p), y1: r2(plot.y), y2: r2(plot.y + plot.h), stroke: va.grid, "stroke-width": 1.5 }) : s("line", { x1: r2(plot.x), x2: r2(plot.x + plot.w), y1: r2(p), y2: r2(p), stroke: va.grid, "stroke-width": 1.5 }));
      }
    }
    svg.append(grid);
    if (!va.hide) {
      const g = s("g", { class: "hs-ochart-vaxis" });
      const valAtTop = horizontal && ca.reverse;
      for (const v of ticks) {
        const p = vPos(v);
        if (horizontal) g.append(textEl(p, valAtTop ? plot.y - valFont.size * 0.5 : plot.y + plot.h + valFont.size * 1.15, tickText(v), valFont, "middle"));
        else g.append(textEl(plot.x - 8, p + valFont.size * 0.35, tickText(v), valFont, "end"));
      }
      if (va.line && va.line !== "none") g.append(horizontal ? s("line", { x1: r2(plot.x), x2: r2(plot.x + plot.w), y1: r2(valAtTop ? plot.y : plot.y + plot.h), y2: r2(valAtTop ? plot.y : plot.y + plot.h), stroke: va.line, "stroke-width": 1.5 }) : s("line", { x1: r2(plot.x), x2: r2(plot.x), y1: r2(plot.y), y2: r2(plot.y + plot.h), stroke: va.line, "stroke-width": 1.5 }));
      svg.append(g);
    }
    // Bars
    const gap = (sameType ? st.gap : null) ?? 150;
    const overlap = stack ? 100 : (sameType ? st.overlap : null) ?? 0;
    const k = stack ? 1 : Math.max(1, barIdx.length);
    const groupW = slot / (1 + gap / 100);
    const bw = groupW / (k - ((k - 1) * overlap) / 100);
    const labelsLayer = s("g", { class: "hs-ochart-labels" });
    const labelFor = (si, i, value, where) => {
      const ss = sts(si);
      const own = ss.pointLabels?.find((p) => p.i === i);
      const l = { ...(ss.label || {}), ...(own || {}) };
      if (own && own.show === false) return;
      if (!own && (!ss.label || ss.label.show === false)) return;
      if (!l.runs && !l.val && !l.cat && !l.ser && !l.pct) return;
      const f = fontOf(ss.label?.font, own?.font);
      const parts = l.runs ? null : [l.ser ? c.series[si].name : "", l.cat ? c.labels[i] : "", l.val ? numFormat(value, l.format) : ""].filter(Boolean);
      const text = l.runs ? l.runs.map((r) => r.t).join("") : parts.join(", ");
      const width = textWidth(text, Math.max(f.size, ...(l.runs || []).map((r) => r.font?.size || 0)));
      const { x, y, anchor } = where(l.pos, width, f);
      const el = textEl(x, y, l.runs ? "" : text, f, anchor);
      if (l.runs) for (const r of l.runs) { const rf = fontOf(r.font); el.append(s("tspan", { fill: rf.color, style: { "font-size": `${rf.size}px`, "font-weight": rf.bold ? 700 : 400 } }, r.t)); }
      labelsLayer.append(el);
    };
    const bars = s("g", { class: "hs-ochart-bars" });
    const stackBase = c.labels.map(() => ({ pos: 0, neg: 0 }));
    barIdx.forEach((si, bi) => {
      c.labels.forEach((label, i) => {
        const raw = valuesOf(si)[i] || 0;
        const v = shown(si, i);
        let from = 0, to = v;
        if (stack) {
          const b = stackBase[i];
          if (v >= 0) { from = b.pos; to = b.pos + v; b.pos = to; } else { from = b.neg; to = b.neg + v; b.neg = to; }
        }
        const p0 = vPos(from), p1 = vPos(to);
        const off = (slot - groupW) / 2 + (stack ? 0 : bi * bw * (1 - overlap / 100));
        const start = (horizontal ? plot.y : plot.x) + order(i) * slot + off;
        const color = pointColor(si, i);
        const rect = horizontal
          ? { x: Math.min(p0, p1), y: start, width: Math.abs(p1 - p0), height: bw }
          : { x: start, y: Math.min(p0, p1), width: bw, height: Math.abs(p1 - p0) };
        bars.append(s("rect", { class: `hs-obar${horizontal ? " h" : ""}`, x: r2(rect.x), y: r2(rect.y), width: r2(Math.max(0, rect.width)), height: r2(Math.max(0, rect.height)), fill: color, "data-paint": color.startsWith("#") ? color : null, "data-tip": `${label}・${c.series[si].name}：${numFormat(raw, sts(si).label?.format)}`, style: { "--i": String(i) } }));
        labelFor(si, i, raw, (pos, width, f) => {
          const where = pos || (stack ? "ctr" : "outEnd");
          const up = to >= from;
          const mid = start + bw / 2;
          if (horizontal) {
            const end = vPos(to), begin = vPos(from);
            const dir = up ? 1 : -1;
            const x = where === "inEnd" ? end - dir * 6 : where === "ctr" ? (end + begin) / 2 : where === "inBase" ? begin + dir * 6 : end + dir * 6;
            const anchor = where === "ctr" ? "middle" : (where === "inEnd") === up ? "end" : "start";
            return { x, y: mid + f.size * 0.35, anchor };
          }
          const end = vPos(to), begin = vPos(from);
          const dir = up ? -1 : 1;
          const y = where === "inEnd" ? end - dir * (f.size * 1.0) : where === "ctr" ? (end + begin) / 2 + f.size * 0.35 : where === "inBase" ? begin + dir * 6 + (up ? 0 : f.size) : end + dir * 6 + (up ? 0 : f.size * 0.8);
          return { x: mid, y, anchor: "middle" };
        });
      });
    });
    svg.append(bars);
    // Lines and areas
    const lines = s("g", { class: "hs-ochart-lines" });
    for (const si of lineIdx) {
      const ss = sts(si);
      const color = colorOf(si);
      const pts = c.labels.map((_, i) => [cPos(i), vPos(valuesOf(si)[i] || 0)]).map(([a, b]) => (horizontal ? [b, a] : [a, b]));
      if (!pts.length) continue;
      const d = ss.smooth ? smoothPath(pts) : `M${pts.map((p) => P(p[0], p[1])).join(" L")}`;
      if (kindOf(si) === "area") {
        const zx = horizontal ? zero : null;
        const close = horizontal ? ` L${P(zx, pts.at(-1)[1])} L${P(zx, pts[0][1])} Z` : ` L${P(pts.at(-1)[0], zero)} L${P(pts[0][0], zero)} Z`;
        lines.append(s("path", { class: "hs-oarea", d: d + close, fill: color, "data-paint": color.startsWith("#") ? color : null }));
      } else {
        const width = ss.width ?? 4.5;
        const dash = DASHES[ss.dash]?.[1];
        lines.append(s("path", { class: "hs-oline", d, fill: "none", stroke: color, "stroke-width": r2(width), "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": dash ? dash.map((v) => r2(v * width)).join(" ") : null, "data-paint": color.startsWith("#") ? color : null }));
      }
      const m = ss.marker || (c.type === "combo" || kindOf(si) === "area" ? { s: "none" } : { s: "circle", z: 10 });
      pts.forEach(([x, y], i) => {
        const on = m.s !== "none" || m.at?.includes(i);
        if (on) lines.append(marker(m.s === "none" ? "circle" : m.s, x, y, m.z || 10, m.color || color, `${c.labels[i]}・${c.series[si].name}：${numFormat(valuesOf(si)[i] || 0, ss.label?.format)}`));
        labelFor(si, i, valuesOf(si)[i] || 0, (pos, width, f) => {
          const where = pos || "r";
          const r = (m.z || 10) / 2 + 6;
          if (where === "l") return { x: x - r, y: y + f.size * 0.35, anchor: "end" };
          if (where === "t") return { x, y: y - r, anchor: "middle" };
          if (where === "b") return { x, y: y + r + f.size * 0.8, anchor: "middle" };
          if (where === "ctr") return { x, y: y + f.size * 0.35, anchor: "middle" };
          return { x: x + r, y: y + f.size * 0.35, anchor: "start" };
        });
      });
    }
    svg.append(lines);
    // The category axis
    if (!ca.hide) {
      const g = s("g", { class: "hs-ochart-caxis" });
      const line = ca.line || "#d9d9d9";
      if (line !== "none") g.append(horizontal ? s("line", { x1: r2(zero), x2: r2(zero), y1: r2(plot.y), y2: r2(plot.y + plot.h), stroke: line, "stroke-width": 1.5 }) : s("line", { x1: r2(plot.x), x2: r2(plot.x + plot.w), y1: r2(zero), y2: r2(zero), stroke: line, "stroke-width": 1.5 }));
      c.labels.forEach((label, i) => {
        const p = cPos(i);
        if (horizontal) {
          const rows = wrapText(label, catFont.size, Math.max(40, plot.x - labelLeft - 8), 2);
          rows.forEach((row, ri) => g.append(textEl(plot.x - 8, p + catFont.size * 0.35 + (ri - (rows.length - 1) / 2) * catFont.size * 1.2, row, catFont, "end")));
        } else {
          const rows = wrapText(label, catFont.size, slot * 0.92, 3);
          rows.forEach((row, ri) => g.append(textEl(p, plot.y + plot.h + catFont.size * 1.15 + ri * catFont.size * 1.2, row, catFont, "middle")));
        }
      });
      svg.append(g);
    } else if (ca.line && ca.line !== "none") {
      svg.append(horizontal ? s("line", { x1: r2(zero), x2: r2(zero), y1: r2(plot.y), y2: r2(plot.y + plot.h), stroke: ca.line, "stroke-width": 1.5 }) : s("line", { x1: r2(plot.x), x2: r2(plot.x + plot.w), y1: r2(zero), y2: r2(zero), stroke: ca.line, "stroke-width": 1.5 }));
    }
    svg.append(labelsLayer);
    return svg;
  }

  /** A smooth line through the points (Catmull-Rom as cubic Béziers, like Office's smoothed lines). */
  function smoothPath(pts) {
    if (pts.length < 3) return `M${pts.map((p) => P(p[0], p[1])).join(" L")}`;
    let d = `M${P(pts[0][0], pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += ` C${P(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)} ${P(p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)} ${P(p2[0], p2[1])}`;
    }
    return d;
  }

  function marker(kind, x, y, size, color, tip) {
    const r = size / 2;
    const attrs = { class: "hs-omark", fill: color, "data-tip": tip };
    if (kind === "square") return s("rect", { ...attrs, x: r2(x - r), y: r2(y - r), width: r2(size), height: r2(size) });
    if (kind === "diamond") return s("path", { ...attrs, d: `M${P(x, y - r)} L${P(x + r, y)} L${P(x, y + r)} L${P(x - r, y)} Z` });
    if (kind === "triangle") return s("path", { ...attrs, d: `M${P(x, y - r)} L${P(x + r, y + r)} L${P(x - r, y + r)} Z` });
    if (kind === "dash") return s("rect", { ...attrs, x: r2(x - r), y: r2(y - size / 8), width: r2(size), height: r2(size / 4) });
    if (kind === "x" || kind === "plus" || kind === "star") {
      const d = kind === "plus" ? `M${P(x - r, y)} L${P(x + r, y)} M${P(x, y - r)} L${P(x, y + r)}` : `M${P(x - r, y - r)} L${P(x + r, y + r)} M${P(x + r, y - r)} L${P(x - r, y + r)}${kind === "star" ? ` M${P(x, y - r)} L${P(x, y + r)}` : ""}`;
      return s("path", { class: "hs-omark", d, stroke: color, "stroke-width": Math.max(1.5, size / 6), fill: "none", "data-tip": tip });
    }
    return s("circle", { ...attrs, cx: r2(x), cy: r2(y), r: r2(kind === "dot" ? r / 2 : r) });
  }

  function pieChart(svg, c, area, { st, sts, pointColor, fontOf, textEl }) {
    const values = c.series[0].values.map((v) => Math.max(0, v || 0));
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = area.x + area.w / 2;
    const cy = area.y + area.h / 2;
    const R = Math.max(4, Math.min(area.w, area.h) / 2 - 4);
    const hole = (st.type && st.type !== c.type ? 50 : st.hole ?? 50) / 100;
    let a = ((st.angle || 0) - 90) * (Math.PI / 180);
    const g = s("g", { class: "hs-ochart-pie" });
    const labels = s("g", { class: "hs-ochart-labels" });
    const ss = sts(0);
    values.forEach((v, i) => {
      const sweep = (v / total) * Math.PI * 2;
      const a1 = a + sweep;
      const color = pointColor(0, i);
      const large = sweep > Math.PI ? 1 : 0;
      const pt = (r, ang) => P(cx + r * Math.cos(ang), cy + r * Math.sin(ang));
      let d;
      if (sweep >= Math.PI * 2 - 1e-6) d = hole ? `M${pt(R, 0)} A${r2(R)} ${r2(R)} 0 1 1 ${pt(R, Math.PI)} A${r2(R)} ${r2(R)} 0 1 1 ${pt(R, 0)} M${pt(R * hole, 0)} A${r2(R * hole)} ${r2(R * hole)} 0 1 0 ${pt(R * hole, Math.PI)} A${r2(R * hole)} ${r2(R * hole)} 0 1 0 ${pt(R * hole, 0)} Z` : `M${pt(R, 0)} A${r2(R)} ${r2(R)} 0 1 1 ${pt(R, Math.PI)} A${r2(R)} ${r2(R)} 0 1 1 ${pt(R, 0)} Z`;
      else if (hole) d = `M${pt(R, a)} A${r2(R)} ${r2(R)} 0 ${large} 1 ${pt(R, a1)} L${pt(R * hole, a1)} A${r2(R * hole)} ${r2(R * hole)} 0 ${large} 0 ${pt(R * hole, a)} Z`;
      else d = `M${P(cx, cy)} L${pt(R, a)} A${r2(R)} ${r2(R)} 0 ${large} 1 ${pt(R, a1)} Z`;
      if (v > 0) g.append(s("path", { class: "hs-oslice", d, fill: color, "fill-rule": "evenodd", stroke: "#ffffff", "stroke-width": 2, "data-paint": color.startsWith("#") ? color : null, "data-tip": `${c.labels[i]}：${numFormat(c.series[0].values[i], ss.label?.format)}（${Math.round((v / total) * 100)}%）`, style: { "--i": String(i) } }));
      const own = ss.pointLabels?.find((p) => p.i === i);
      const l = { ...(ss.label || {}), ...(own || {}) };
      const show = own ? own.show !== false : ss.label && ss.label.show !== false;
      if (show && v > 0 && (l.runs || l.val || l.pct || l.cat || l.ser)) {
        const f = fontOf(ss.label?.font, own?.font);
        const mid = a + sweep / 2;
        const outside = l.pos === "outEnd";
        const r = outside ? R + f.size * 0.9 : hole ? R * (1 + hole) / 2 : l.pos === "inEnd" ? R * 0.78 : R * 0.62;
        const text = l.runs ? l.runs.map((x) => x.t).join("") : [l.ser ? c.series[0].name : "", l.cat ? c.labels[i] : "", l.val ? numFormat(c.series[0].values[i], l.format) : "", l.pct ? `${Math.round((v / total) * 100)}%` : ""].filter(Boolean).join(l.cat && (l.val || l.pct) ? "\n" : ", ");
        const x = cx + r * Math.cos(mid);
        const y = cy + r * Math.sin(mid);
        const anchor = outside ? (Math.cos(mid) > 0.2 ? "start" : Math.cos(mid) < -0.2 ? "end" : "middle") : "middle";
        const rows = text.split("\n");
        rows.forEach((row, ri) => labels.append(textEl(x, y + f.size * 0.35 + (ri - (rows.length - 1) / 2) * f.size * 1.2, row, f, anchor)));
      }
      a = a1;
    });
    svg.append(g, labels);
  }
  /** The engine's chart spec (as the layouts' charts) for a chart object. */
  function chartSpec(c) {
    const data = { ...(c.title ? { title: c.title } : {}), ...(c.unit ? { unit: c.unit } : {}) };
    const first = c.series[0]?.values || [];
    if (c.type === "stacked-bar" || c.type === "100-stacked-bar") {
      data.barData = c.labels.map((label, i) => ({ label, values: c.series.map((s) => s.values[i] ?? 0) }));
      data.legendLabels = c.series.map((s) => s.name);
    } else if (c.type === "multi-line" || c.type === "clustered-bar") {
      data.xAxisLabels = c.labels;
      data.series = c.series.map((s) => ({ label: s.name, values: s.values }));
    } else if (c.type === "combo") {
      const line = c.series[1]?.values || first;
      data.items = c.labels.map((label, i) => ({ label, barValue: first[i] ?? 0, value: line[i] ?? 0 }));
      data.legendLabels = [c.series[0]?.name, c.series[1]?.name || c.series[0]?.name].filter(Boolean);
    } else data.items = c.labels.map((label, i) => ({ label, value: first[i] ?? 0 }));
    return { chartType: c.type, data };
  }

  /** A slide's objects: the usable ones, ids made unique. */
  function normalizeObjects(list) {
    const seen = new Set();
    const out = [];
    for (const raw of Array.isArray(list) ? list : []) {
      const o = normalizeObject(raw);
      if (!o) continue;
      if (seen.has(o.id)) o.id = newId();
      seen.add(o.id);
      out.push(o);
      if (out.length >= 5000) break;
    }
    // Connectors only stay attached to objects that exist.
    for (const o of out) for (const end of ["from", "to"]) if (o[end] && !seen.has(o[end].id)) delete o[end];
    return out;
  }

  // ---------------------------------------------------------------- where an object is

  /** Corners of an object's box after rotation (slide pixels). */
  function corners(o) {
    if (o.kind === "line") { const [p1, p2] = lineEnds(o); return [p1, p2]; }
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const a = rad(o.rot || 0);
    const [c, sn] = [Math.cos(a), Math.sin(a)];
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([kx, ky]) => {
      const dx = (kx * o.w) / 2;
      const dy = (ky * o.h) / 2;
      return [cx + dx * c - dy * sn, cy + dx * sn + dy * c];
    });
  }
  /** The upright box around an object (what guides and alignment use). */
  function bounds(o, all = null) {
    if (o.kind === "line") {
      const [[x1, y1], [x2, y2]] = lineEnds(o, all);
      return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
    }
    const pts = corners(o);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  /** Where a connector may attach on an object: the middles of its sides (top, right, bottom, left), rotated. */
  function sites(o) {
    const cx = o.x + o.w / 2;
    const cy = o.y + o.h / 2;
    const a = rad(o.rot || 0);
    const [c, sn] = [Math.cos(a), Math.sin(a)];
    return [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([kx, ky]) => {
      const dx = (kx * o.w) / 2;
      const dy = (ky * o.h) / 2;
      return [cx + dx * c - dy * sn, cy + dx * sn + dy * c];
    });
  }
  /** A line's two ends, following the objects it is attached to. */
  function lineEnds(o, all = null) {
    let p1 = [o.x1, o.y1];
    let p2 = [o.x2, o.y2];
    if (all) {
      const at = (ref) => { const target = ref && all.find((other) => other.id === ref.id && other.kind !== "line"); return target ? sites(target)[ref.site % 4] : null; };
      p1 = at(o.from) || p1;
      p2 = at(o.to) || p2;
    }
    return [p1, p2];
  }
  /** The side a connector leaves an attached object from (unit vector), for elbows and curves. */
  function siteDir(ref, all) {
    const target = ref && all?.find((other) => other.id === ref.id);
    if (!target) return null;
    const base = [[0, -1], [1, 0], [0, 1], [-1, 0]][ref.site % 4];
    const a = rad(target.rot || 0);
    return [base[0] * Math.cos(a) - base[1] * Math.sin(a), base[0] * Math.sin(a) + base[1] * Math.cos(a)];
  }

  /** The path a line takes between its ends, and the direction it arrives at each end. */
  function linePath(o, all) {
    const [p1, p2] = lineEnds(o, all);
    const route = o.route || "straight";
    if (route === "elbow") {
      const d1 = siteDir(o.from, all);
      const d2 = siteDir(o.to, all);
      const horizontal = d1 ? Math.abs(d1[0]) > 0.5 : Math.abs(p2[0] - p1[0]) >= Math.abs(p2[1] - p1[1]);
      const pts = horizontal
        ? [p1, [(p1[0] + p2[0]) / 2, p1[1]], [(p1[0] + p2[0]) / 2, p2[1]], p2]
        : [p1, [p1[0], (p1[1] + p2[1]) / 2], [p2[0], (p1[1] + p2[1]) / 2], p2];
      if (d2 && horizontal !== Math.abs(d2[0]) > 0.5) pts.splice(2, 1, horizontal ? [p2[0], p1[1]] : [p1[0], p2[1]]);
      const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.01);
      return { pts: clean, d: `M${clean.map((p) => P(...p)).join(" L")}`, start: clean[1] || p2, end: clean[clean.length - 2] || p1 };
    }
    if (route === "curve") {
      const d1 = siteDir(o.from, all);
      const d2 = siteDir(o.to, all);
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 0.45;
      const horizontal = Math.abs(p2[0] - p1[0]) >= Math.abs(p2[1] - p1[1]);
      const c1 = d1 ? [p1[0] + d1[0] * len, p1[1] + d1[1] * len] : horizontal ? [(p1[0] + p2[0]) / 2, p1[1]] : [p1[0], (p1[1] + p2[1]) / 2];
      const c2 = d2 ? [p2[0] + d2[0] * len, p2[1] + d2[1] * len] : horizontal ? [(p1[0] + p2[0]) / 2, p2[1]] : [p2[0], (p1[1] + p2[1]) / 2];
      return { pts: [p1, p2], d: `M${P(...p1)} C${P(...c1)} ${P(...c2)} ${P(...p2)}`, start: c1, end: c2, ctrl: [c1, c2] };
    }
    return { pts: [p1, p2], d: `M${P(...p1)} L${P(...p2)}`, start: p2, end: p1 };
  }

  /** An arrowhead at `tip`, arriving from `from`. Returns { d, fill, back } (back: how far to pull the line in). */
  function arrowhead(kind, tip, from, sw, size) {
    const len = Math.max(10, sw * (size === 1 ? 2.2 : size === 3 ? 4.4 : 3.2));
    const half = len * 0.55;
    const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
    const [c, sn] = [Math.cos(ang), Math.sin(ang)];
    const at = (along, across) => [tip[0] - along * c - across * sn, tip[1] - along * sn + across * c];
    if (kind === "triangle") return { d: poly([tip, at(len, half), at(len, -half)]), fill: true, back: len * 0.9 };
    if (kind === "stealth") return { d: poly([tip, at(len, half), at(len * 0.65, 0), at(len, -half)]), fill: true, back: len * 0.6 };
    if (kind === "arrow") return { d: `M${P(...at(len, half))} L${P(...tip)} L${P(...at(len, -half))}`, fill: false, back: 0 };
    if (kind === "diamond") return { d: poly([tip, at(len / 2, half * 0.8), at(len, 0), at(len / 2, -half * 0.8)]), fill: true, back: len / 2 };
    if (kind === "oval") { const cx = at(len / 2, 0); return { d: ellipse(cx[0], cx[1], len / 2, len / 2), fill: true, back: len / 2 }; }
    return null;
  }

  // ---------------------------------------------------------------- rendering

  const dashArray = (dash, sw) => {
    const pattern = DASHES[dash]?.[1];
    return pattern ? pattern.map((v) => r2(Math.max(v * sw, v === 0 ? 0.01 : 1))).join(" ") : null;
  };

  /** An object's rich text, with every point size following the box's shrink factor (--os). */
  function textNode(o, scale) {
    const tx = h("div", { class: "hs-obj-tx" });
    const frag = richFragment(o.text || "");
    tx.append(frag);
    for (const el of tx.querySelectorAll("[style*='font-size']")) {
      const size = pxSize(el.style.fontSize);
      if (size) el.style.fontSize = `calc(${size}px * var(--os, 1))`;
    }
    const style = {
      "font-size": `calc(${o.fs}px * var(--os, 1))`, color: o.color, "line-height": String(o.lh), "text-align": o.align,
      "font-weight": o.bold ? "700" : null, "font-style": o.italic ? "italic" : null,
      "text-decoration": [o.underline ? "underline" : "", o.strike ? "line-through" : ""].filter(Boolean).join(" ") || null,
      "letter-spacing": o.ls ? `${o.ls}em` : null, "--psp": o.psp ? `${o.psp}em` : null,
      "font-family": o.fontFace ? `"${o.fontFace}", sans-serif` : o.font ? FONTS[o.font][1] : null, "white-space": o.wrap === false ? "pre" : null,
    };
    for (const [k, v] of Object.entries(style)) if (v != null) tx.style.setProperty(k, String(v));
    if (scale && scale < 1) tx.style.setProperty("--os", String(scale));
    return tx;
  }

  function shapeBody(o, rotEl, scale) {
    const g = geometry(o.shape, o.w, o.h, o.adj, o.path);
    const sw = o.stroke !== "none" ? o.strokeW : 0;
    const fill = g.open ? "none" : o.fill;
    const svg = s("svg", { class: "hs-obj-geom", width: r2(o.w), height: r2(o.h), viewBox: `0 0 ${r2(Math.max(1, o.w))} ${r2(Math.max(1, o.h))}`, overflow: "visible", "aria-hidden": "true" });
    if (o.shadow) {
      const c = o.shadow.color;
      const rgb = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).join(",");
      rotEl.style.filter = `drop-shadow(${o.shadow.dx}px ${o.shadow.dy}px ${o.shadow.blur}px rgba(${rgb},${o.shadow.opacity}))`;
    }
    let paint = fill;
    if (!g.open && o.gradient?.stops?.length) {
      const id = newId();
      const angle = rad(o.gradient.angle || 0);
      const dx = Math.cos(angle) * 50, dy = Math.sin(angle) * 50;
      const grad = s("linearGradient", { id, x1: `${50 - dx}%`, y1: `${50 - dy}%`, x2: `${50 + dx}%`, y2: `${50 + dy}%` });
      for (const stop of o.gradient.stops) grad.append(s("stop", { offset: `${stop.at * 100}%`, "stop-color": stop.color, "stop-opacity": stop.opacity }));
      svg.append(s("defs", {}, grad));
      paint = `url(#${id})`;
    }
    for (const d of g.paths) {
      svg.append(s("path", {
        d, fill: paint === "none" ? "none" : paint, "fill-opacity": fill !== "none" && o.fillOpacity != null ? o.fillOpacity : null, "fill-rule": g.rule,
        stroke: sw ? o.stroke : "none", "stroke-width": sw || null, "stroke-dasharray": sw ? dashArray(o.dash, sw) : null,
        "stroke-linecap": o.dash === "roundDot" ? "round" : null, "stroke-linejoin": "miter", "stroke-miterlimit": 8,
      }));
    }
    for (const extra of g.extras) {
      if (extra.tone === "line") svg.append(s("path", { d: extra.d, fill: "none", stroke: sw ? o.stroke : "rgba(0,0,0,.45)", "stroke-width": sw || 1.5 }));
      else svg.append(s("path", { d: extra.d, fill: fill === "none" ? "none" : extra.tone === "dark" ? "#000000" : "#ffffff", "fill-opacity": extra.tone === "dark" ? 0.12 : 0.35, stroke: sw ? o.stroke : "none", "stroke-width": sw || null }));
    }
    rotEl.append(svg);
    {
      // Every shape has a text box (empty until something is typed in it).
      const [l, t, r, b] = g.text;
      const [pt, pr, pb, pl] = o.pad;
      const box = h("div", { class: ["hs-obj-text", o.vertical ? "is-vertical" : ""], "data-valign": o.valign, style: { left: `${r2(l + pl)}px`, top: `${r2(t + pt)}px`, width: `${r2(Math.max(0, r - l - pl - pr))}px`, height: `${r2(Math.max(0, b - t - pt - pb))}px` } });
      box.append(textNode(o, scale));
      rotEl.append(box);
    }
  }

  /** A table: SEJ-styled rules and fills, each cell's rich text; merged cells span; rows grow with their text. */
  function tableBody(o, rotEl) {
    const classes = ["hs-otable", `ts-${o.style || "sej"}`, o.header !== false ? "has-header" : "", o.banded !== false ? "is-banded" : "", o.firstCol ? "has-first-col" : "", o.lastRow ? "has-last-row" : ""].filter(Boolean);
    const table = h("table", { class: classes, style: { "font-size": `calc(${o.fs}px * var(--os, 1))`, color: o.color, "line-height": String(o.lh), "font-family": o.font ? FONTS[o.font][1] : null } });
    table.append(h("colgroup", {}, o.cols.map((f) => h("col", { style: { width: `${(f * 100).toFixed(3)}%` } }))));
    const body = h("tbody");
    o.cells.forEach((row, r) => {
      const tr = h("tr", { "data-r": String(r), style: { height: `${r2(o.rows[r] * o.h)}px` } });
      row.forEach((cell, c) => {
        if (cell.merged) return;
        const edge = (side) => (cell[side] === "none" ? "none" : cell[side] ? `${cell[side].w}px solid ${cell[side].c}` : null);
        const td = h("td", { "data-r": String(r), "data-c": String(c), rowspan: cell.rs > 1 ? String(cell.rs) : null, colspan: cell.cs > 1 ? String(cell.cs) : null, "data-fill": cell.fill || null,
          style: { background: cell.fill || null, "vertical-align": cell.valign || null, "border-top": edge("bt"), "border-right": edge("br"), "border-bottom": edge("bb"), "border-left": edge("bl"),
            padding: cell.pad ? cell.pad.map((v) => `${v}px`).join(" ") : null } });
        const tx = h("div", { class: "hs-cell-tx", style: { "text-align": cell.align || null, color: cell.color || null, "font-weight": cell.bold ? "700" : null, "font-style": cell.italic ? "italic" : null,
          "font-size": cell.fs ? `calc(${cell.fs}px * var(--os, 1))` : null, "line-height": cell.lh ?? null,
          "font-family": cell.fontFace ? `"${cell.fontFace}", sans-serif` : null,
          "text-decoration": [cell.underline ? "underline" : "", cell.strike ? "line-through" : ""].filter(Boolean).join(" ") || null } });
        tx.append(richFragment(cell.text || ""));
        td.append(tx);
        tr.append(td);
      });
      body.append(tr);
    });
    table.append(body);
    rotEl.append(h("div", { class: "hs-obj-tablebox" }, table));
  }

  /** A chart drawn by the engine's own charts (the same look as the layouts' charts), with an optional title. */
  function chartBody(o, rotEl) {
    if (o.chart.style) {
      rotEl.append(h("div", { class: "hs-obj-chart is-office" }, officeChart(o.chart, o.w, o.h)));
      return;
    }
    const box = h("div", { class: "hs-obj-chart" });
    if (o.chart.title) box.append(h("div", { class: "hs-obj-chart-title" }, o.chart.title));
    const titleH = o.chart.title ? 52 : 0;
    box.append(E.chart(chartSpec(o.chart), { w: Math.max(240, Math.round(o.w)), h: Math.max(140, Math.round(o.h - titleH)), key: `obj:${o.id}` }));
    rotEl.append(box);
  }

  function imageBody(o, rotEl, ctx) {
    const url = E.resolveSrc(o.src, ctx);
    const frame = h("div", { class: "hs-obj-img" });
    if (o.mask) {
      const g = geometry(o.mask, o.w, o.h, o.adj);
      frame.style.clipPath = `path(${g.rule === "evenodd" ? "evenodd, " : ""}'${g.paths.join(" ")}')`;
    }
    if (url) {
      const img = h("img", { src: url, alt: o.alt || "", draggable: "false", decoding: "async" });
      if (o.crop) {
        const { l, t, r, b } = o.crop;
        Object.assign(img.style, { position: "absolute", width: `${(100 / (1 - l - r)).toFixed(4)}%`, height: `${(100 / (1 - t - b)).toFixed(4)}%`, left: `${((-l / (1 - l - r)) * 100).toFixed(4)}%`, top: `${((-t / (1 - t - b)) * 100).toFixed(4)}%`, "max-width": "none" });
      } else img.style.objectFit = o.fit === "cover" ? "cover" : o.fit === "contain" ? "contain" : "fill";
      const filters = [o.bright ? `brightness(${r2(1 + o.bright)})` : "", o.contrast ? `contrast(${r2(1 + o.contrast)})` : "", o.sat ? `saturate(${r2(1 + o.sat)})` : "", o.gray ? "grayscale(1)" : ""].filter(Boolean).join(" ");
      if (filters) img.style.filter = filters;
      frame.append(img);
    } else frame.append(h("span", { class: "hs-obj-missing" }, E.icon("image"), "画像がありません"));
    rotEl.append(frame);
    if (o.stroke !== "none") {
      const g = geometry(o.mask || "rect", o.w, o.h, o.adj);
      const svg = s("svg", { class: "hs-obj-geom", width: r2(o.w), height: r2(o.h), viewBox: `0 0 ${r2(Math.max(1, o.w))} ${r2(Math.max(1, o.h))}`, overflow: "visible", "aria-hidden": "true" });
      for (const d of g.paths) svg.append(s("path", { d, fill: "none", stroke: o.stroke, "stroke-width": o.strokeW, "stroke-dasharray": dashArray(o.dash, o.strokeW) }));
      rotEl.append(svg);
    }
  }

  function lineNode(o, all) {
    const route = linePath(o, all);
    const sw = o.stroke === "none" ? 0 : o.strokeW;
    const xs = route.pts.map((p) => p[0]);
    const ys = route.pts.map((p) => p[1]);
    const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
    const [w, hh] = [Math.max(1, Math.max(...xs) - minX), Math.max(1, Math.max(...ys) - minY)];
    const el = h("div", { class: "hs-obj hs-obj-line", "data-el": o.id, "data-kind": "line", "data-stroke": sw ? o.stroke : "none", "data-bbox": [minX, minY, w, hh].map(r2).join(","), style: { left: `${r2(minX)}px`, top: `${r2(minY)}px`, width: `${r2(w)}px`, height: `${r2(hh)}px` } });
    const svg = s("svg", { class: "hs-obj-geom", width: r2(w), height: r2(hh), viewBox: `${r2(minX)} ${r2(minY)} ${r2(w)} ${r2(hh)}`, overflow: "visible", "aria-hidden": "true" });
    const [p1, p2] = [route.pts[0], route.pts[route.pts.length - 1]];
    // Pull the line in under filled heads so a thick line does not poke through their tips.
    const heads = [];
    const trim = (tip, toward, kind, size) => {
      const head = kind ? arrowhead(kind, tip, toward, sw || 2, size) : null;
      if (!head) return tip;
      heads.push(head);
      const len = Math.hypot(tip[0] - toward[0], tip[1] - toward[1]) || 1;
      const back = Math.min(head.back, len * 0.9);
      return [tip[0] - ((tip[0] - toward[0]) / len) * back, tip[1] - ((tip[1] - toward[1]) / len) * back];
    };
    let d = route.d;
    if (sw && (o.head || o.tail)) {
      const a = trim(p1, route.start, o.head, o.headSize ?? 2);
      const b = trim(p2, route.end, o.tail, o.tailSize ?? 2);
      if (route.ctrl) d = `M${P(...a)} C${P(...route.ctrl[0])} ${P(...route.ctrl[1])} ${P(...b)}`;
      else { const pts = [a, ...route.pts.slice(1, -1), b]; d = `M${pts.map((p) => P(...p)).join(" L")}`; }
    }
    if (sw) {
      svg.append(s("path", { d, fill: "none", stroke: o.stroke, "stroke-width": sw, "stroke-dasharray": dashArray(o.dash, sw), "stroke-linecap": o.dash === "roundDot" ? "round" : "butt", "stroke-linejoin": "round" }));
      for (const head of heads) svg.append(s("path", { d: head.d, fill: head.fill ? o.stroke : "none", stroke: o.stroke, "stroke-width": head.fill ? Math.max(1, sw * 0.4) : sw, "stroke-linejoin": "miter", "stroke-linecap": "round" }));
    }
    const fx = h("div", { class: "hs-obj-fx" });
    const move = h("div", { class: "hs-obj-move" });
    fx.append(svg);
    move.append(fx);
    el.append(move);
    if (o.opacity != null) el.style.opacity = String(o.opacity);
    return el;
  }

  /** One object as HTML: a positioned box → a layer for motion paths → a layer for effects → a rotated body. */
  function objectNode(raw, ctx, all, scale) {
    const o = withDefaults(raw);
    if (o.kind === "line") return lineNode(o, all);
    const el = h("div", {
      class: ["hs-obj", `hs-obj-${o.kind}`], "data-el": o.id, "data-kind": o.kind,
      "data-fill": ["shape", "text"].includes(o.kind) && o.fill !== "none" && !(o.shape === "custom" ? !o.path?.closed : SHAPES[o.shape]?.open) ? o.fill : null,
      "data-stroke": ["shape", "text", "image"].includes(o.kind) && o.stroke !== "none" ? o.stroke : null,
      "data-autofit": o.autofit && o.autofit !== "none" ? o.autofit : null, "data-item": o.item || null,
      "data-bbox": Object.values(bounds(o)).map(r2).join(","),
      style: { left: `${r2(o.x)}px`, top: `${r2(o.y)}px`, width: `${r2(o.w)}px`, height: `${r2(o.h)}px` },
    });
    const move = h("div", { class: "hs-obj-move" });
    const fx = h("div", { class: "hs-obj-fx" });
    const rot = h("div", { class: "hs-obj-rot" });
    if (o.kind === "image" && o.shadow) {
      const c = o.shadow.color;
      const rgb = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)).join(",");
      rot.style.filter = `drop-shadow(${o.shadow.dx}px ${o.shadow.dy}px ${o.shadow.blur}px rgba(${rgb},${o.shadow.opacity}))`;
    }
    const transform = [o.rot ? `rotate(${o.rot}deg)` : "", o.flipH || o.flipV ? `scale(${o.flipH ? -1 : 1}, ${o.flipV ? -1 : 1})` : ""].filter(Boolean).join(" ");
    if (transform) rot.style.transform = transform;
    if (o.kind === "shape" || o.kind === "text") {
      shapeBody(o, rot, scale);
      // A flipped shape keeps its words readable: the text is flipped back.
      const text = rot.querySelector(".hs-obj-text");
      if (text && (o.flipH || o.flipV)) text.style.transform = `scale(${o.flipH ? -1 : 1}, ${o.flipV ? -1 : 1})`;
    } else if (o.kind === "image") imageBody(o, rot, ctx);
    else if (o.kind === "table") tableBody(o, rot);
    else if (o.kind === "chart") chartBody(o, rot);
    else if (o.kind === "icon") {
      const icon = E.icon(o.icon, "hs-obj-icon");
      if (icon) { icon.style.color = o.color; icon.setAttribute("stroke-width", String(o.strokeW)); rot.append(icon); }
    } else if (o.kind === "video" || o.kind === "lottie") {
      const yt = E.youtubeId(o.src);
      const desc = { kind: yt ? "youtube" : o.kind, src: o.src, yt, motion: "none", fit: o.fit === "contain" ? "contain" : "cover", autoplay: o.autoplay !== false, loop: o.loop !== false, muted: o.muted !== false, name: o.fileName || "" };
      if (o.kind === "lottie") desc.fit = o.fit === "cover" ? "cover" : "contain";
      rot.append(E.mediaEl(desc, ctx, "hs-obj-media"));
    }
    fx.append(rot);
    move.append(fx);
    el.append(move);
    if (o.opacity != null) el.style.opacity = String(o.opacity);
    if (o.action && ctx.live) { el.dataset.action = o.action.type; el.title = o.action.type === "url" ? o.action.href : ""; }
    return el;
  }

  /** The slide's objects as one layer above the layout (the SEJ master stays on top of it). */
  function objectLayer(slide, ctx, opts = {}) {
    const list = Array.isArray(slide?.elements) ? slide.elements : [];
    if (!list.length) return null;
    const layer = h("div", { class: "hs-objects" });
    const scales = opts.fit?.objs || {};
    for (const o of list) {
      if (!o || o.hidden || !KINDS.includes(o.kind)) continue;
      try {
        const node = objectNode(o, ctx, list, scales[o.id]);
        if (node) layer.append(node);
      } catch { /* a broken object never takes the slide down */ }
    }
    return layer;
  }

  /** Shrink the text of objects set to "shrink on overflow" until it fits (the slide must be in the document). */
  function fitObjects(slideEl) {
    const out = {};
    for (const el of slideEl.querySelectorAll('.hs-obj[data-autofit="shrink"]')) {
      const box = el.querySelector(".hs-obj-text");
      const tx = box?.querySelector(".hs-obj-tx");
      if (!box || !tx) continue;
      const over = () => tx.scrollHeight > box.clientHeight + 1 || tx.scrollWidth > box.clientWidth + 1;
      let k = 1;
      tx.style.setProperty("--os", "1");
      while (over() && k > 0.3) {
        k = Math.round((k - 0.04) * 100) / 100;
        tx.style.setProperty("--os", String(k));
      }
      if (k < 1) out[el.dataset.el] = k;
    }
    return Object.keys(out).length ? out : null;
  }

  /** What an object says, as plain text (search, the AI's summary, the selection pane). */
  function objectText(o) {
    if (o?.kind === "table") return o.cells.map((row) => row.filter((cell) => !cell.merged).map((cell) => (cell.text ? richToText(cell.text).trim() : "")).join("\t")).join("\n").trim();
    if (o?.kind === "chart") return [o.chart.title, ...o.chart.labels].filter(Boolean).join(" ");
    return o && (o.kind === "shape" || o.kind === "text") && o.text ? richToText(o.text).trim() : "";
  }

  /** The default name PowerPoint would give ("正方形/長方形 3", "テキスト ボックス 2"). */
  function objectName(o, index = 0) {
    if (o.name) return o.name;
    const base = o.kind === "shape" ? (o.shape === "custom" ? "フリーフォーム" : (SHAPES[o.shape]?.label || "図形").replace(/^.*: /, "")) : o.kind === "line" ? (o.head || o.tail ? "矢印" : o.route === "elbow" ? "カギ線コネクタ" : o.route === "curve" ? "曲線コネクタ" : "直線") : KIND_LABELS[o.kind] || "オブジェクト";
    return `${base} ${index + 1}`;
  }

  Object.assign(E, {
    PX_PER_PT, PX_PER_CM, PALETTE, BRAND_FILLS, BRAND_LINES, FONTS, SHAPES, SHAPE_GROUPS, OBJECT_KINDS: KINDS, KIND_LABELS, DASHES, ARROWHEADS, ROUTES, AUTOFIT, FITS, OBJECT_DEFAULTS: DEFAULTS,
    TABLE_STYLES, CHART_KINDS, CHART_MAX_LABELS, CHART_MAX_SERIES, chartSpec, officeChart, numFormat, freeformD,
    geometry, adjOf, sanitizeRich, richFragment, textToRich, richToText, hexColor, normalizeObject, normalizeObjects, withDefaults, newObjectId: newId,
    corners, bounds, sites, lineEnds, linePath, objectLayer, objectNode, fitObjects, objectText, objectName,
  });
})(typeof window !== "undefined" ? window : globalThis);
