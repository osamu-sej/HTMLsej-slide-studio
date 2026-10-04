// Operations on a slide's objects (slide.elements), PowerPoint style: new objects, moving, resizing a rotated box,
// snapping to guides, aligning, distributing, grouping, ordering, duplicating, and formatting the text inside.
// Plain data in, plain data out (rich text helpers use the page's DOM through the engine).

export const W = 1920;
export const H = 1080;
export const PX_PER_CM = 144 / 2.54;
export const PX_PER_PT = 2;

const clone = (value) => JSON.parse(JSON.stringify(value));
const rad = (deg) => (deg * Math.PI) / 180;
const round2 = (n) => Math.round(n * 100) / 100;

/** Guides on an SEJ page: the safe area of the content master (left 0.5in, body 1.12–6.62in) and the middle. */
export const SEJ_GUIDES = { x: [72, 960, 1764], y: [161, 540, 953] };

// ---------------------------------------------------------------- new objects

// What a click (without dragging) inserts, by shape: PowerPoint-like proportions in slide pixels.
const TALL = new Set(["upArrow", "downArrow", "upDownArrow", "leftBracket", "rightBracket", "leftBrace", "rightBrace", "downArrowCallout"]);
const WIDE = new Set(["rightArrow", "leftArrow", "leftRightArrow", "homePlate", "chevron", "notchedRightArrow", "stripedRightArrow", "rightArrowCallout", "wave", "doubleWave", "flowTerminator", "flowPunchedTape", "flowDocument", "flowMultidocument", "flowProcess", "flowAlternate", "flowData", "flowPredefined", "flowPreparation", "flowManualInput", "flowManualOperation", "flowStoredData", "flowDisplay", "flowDirectAccess", "rect", "roundRect", "snip1Rect", "snip2SameRect", "snip2DiagRect", "round1Rect", "round2SameRect", "round2DiagRect", "parallelogram", "trapezoid", "wedgeRectCallout", "wedgeRoundRectCallout", "wedgeEllipseCallout", "cloudCallout", "lineCallout", "bracketPair", "bracePair", "plaque", "foldedCorner", "bevel"]);
export function defaultSize(shape) {
  if (TALL.has(shape)) return [144, 288];
  if (WIDE.has(shape)) return [360, 200];
  return [240, 240];
}

let seed = 0;
export function newId() {
  seed += 1;
  return `o${Date.now().toString(36).slice(-5)}${seed.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** A new object of a kind at a box (slide pixels); lines take x1,y1,x2,y2. */
export function makeObject(kind, box, extra = {}) {
  const base = { id: newId(), kind };
  if (kind === "line") return { ...base, x1: round2(box.x1), y1: round2(box.y1), x2: round2(box.x2), y2: round2(box.y2), ...extra };
  return { ...base, x: round2(box.x), y: round2(box.y), w: round2(Math.max(4, box.w)), h: round2(Math.max(4, box.h)), ...extra };
}

// ---------------------------------------------------------------- geometry

export function corners(o) {
  if (o.kind === "line") return [[o.x1, o.y1], [o.x2, o.y2]];
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const a = rad(o.rot || 0);
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([kx, ky]) => {
    const dx = (kx * o.w) / 2;
    const dy = (ky * o.h) / 2;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  });
}

/** The upright box around objects (lines attached to others are measured where they are drawn). */
export function bounds(objects, ends = null) {
  const pts = objects.flatMap((o) => (o.kind === "line" && ends ? ends(o) : corners(o)));
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Is the point inside the (rotated) box of an object? Lines: within `slack` of the line. */
export function hits(o, [px, py], slack = 8) {
  if (o.kind === "line") return distToSegment([px, py], [o.x1, o.y1], [o.x2, o.y2]) <= slack;
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const a = rad(-(o.rot || 0));
  const dx = px - cx;
  const dy = py - cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= o.w / 2 + slack && Math.abs(ly) <= o.h / 2 + slack;
}

export function distToSegment([px, py], [x1, y1], [x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

const HANDLES = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] };
export const HANDLE_NAMES = Object.keys(HANDLES);

/**
 * Resize a (possibly rotated) box by dragging one of its handles to `p` (slide pixels): the opposite side stays
 * put. keepRatio (Shift, or pictures by their corners) keeps the proportions; fromCenter (Ctrl/Alt) grows both
 * ways. Dragging past the opposite side flips the object, as PowerPoint does.
 */
export function resizeBox(o, handle, [px, py], { keepRatio = false, fromCenter = false, min = 4 } = {}) {
  const [hx, hy] = HANDLES[handle];
  const a = rad(o.rot || 0);
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const toWorld = ([lx, ly]) => [lx * c - ly * s, lx * s + ly * c];
  const toLocal = ([wx, wy]) => [wx * c + wy * s, -wx * s + wy * c];
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  const anchorLocal = fromCenter ? [0, 0] : [(-hx * o.w) / 2, (-hy * o.h) / 2];
  const [ax, ay] = toWorld(anchorLocal);
  const anchor = [cx + ax, cy + ay];
  const [dx, dy] = toLocal([px - anchor[0], py - anchor[1]]);
  const k = fromCenter ? 2 : 1;
  let w = hx ? Math.abs(dx) * k : o.w;
  let h = hy ? Math.abs(dy) * k : o.h;
  let flipX = hx && dx * hx < 0;
  let flipY = hy && dy * hy < 0;
  if (keepRatio && o.w > 0 && o.h > 0) {
    const ratio = o.w / o.h;
    if (hx && hy) {
      const scale = Math.max(w / o.w, h / o.h);
      w = o.w * scale;
      h = o.h * scale;
    } else if (hx) h = w / ratio;
    else w = h * ratio;
  }
  w = Math.max(min, w);
  h = Math.max(min, h);
  // The new centre: from the anchor, half the new size towards the dragged side (in the box's own frame).
  const sideX = hx ? (flipX ? -hx : hx) : 0;
  const sideY = hy ? (flipY ? -hy : hy) : 0;
  const centerLocal = fromCenter ? [0, 0] : [hx ? (sideX * w) / 2 : 0, hy ? (sideY * h) / 2 : 0];
  const [ox, oy] = toWorld(centerLocal);
  const center = fromCenter ? [cx, cy] : [anchor[0] + ox, anchor[1] + oy];
  if (!fromCenter && !hx) { const [sx, sy] = toWorld([0, 0]); center[0] += sx; center[1] += sy; }
  const out = { x: round2(center[0] - w / 2), y: round2(center[1] - h / 2), w: round2(w), h: round2(h) };
  if (flipX) out.flipH = !o.flipH;
  if (flipY) out.flipV = !o.flipV;
  return out;
}

/** The angle (degrees) from the centre of a box to a point, with 0 straight up (the rotate handle's rest). */
export function angleTo(o, [px, py], snap = false) {
  const cx = o.x + o.w / 2;
  const cy = o.y + o.h / 2;
  let deg = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90;
  if (snap) deg = Math.round(deg / 15) * 15;
  deg = ((deg + 180) % 360 + 360) % 360 - 180;
  return round2(deg);
}

/** Rotate a point around a centre. */
export function rotatePoint([x, y], [cx, cy], deg) {
  const a = rad(deg);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}

// ---------------------------------------------------------------- snapping (smart guides)

/**
 * Snap a moving box to the edges and centres of the other objects, the slide and the guides. Returns the
 * adjustment and the guide lines to draw. `tolerance` is in slide pixels.
 */
export function snapBox(box, targets, { tolerance = 8, guides = SEJ_GUIDES, grid = 0 } = {}) {
  const xs = [];
  const ys = [];
  const add = (list, value, from, to, kind) => list.push({ value, from, to, kind });
  for (const t of targets) {
    for (const v of [t.x, t.x + t.w / 2, t.x + t.w]) add(xs, v, t.y, t.y + t.h, "object");
    for (const v of [t.y, t.y + t.h / 2, t.y + t.h]) add(ys, v, t.x, t.x + t.w, "object");
  }
  for (const v of [0, W / 2, W]) add(xs, v, 0, H, "slide");
  for (const v of [0, H / 2, H]) add(ys, v, 0, W, "slide");
  for (const v of guides?.x ?? []) add(xs, v, 0, H, "guide");
  for (const v of guides?.y ?? []) add(ys, v, 0, W, "guide");
  const best = (edges, cands) => {
    let found = null;
    for (const edge of edges) {
      for (const cand of cands) {
        const d = cand.value - edge;
        if (Math.abs(d) <= tolerance && (!found || Math.abs(d) < Math.abs(found.d) - 0.01)) found = { d, cand, edge };
      }
    }
    return found;
  };
  const sx = best([box.x, box.x + box.w / 2, box.x + box.w], xs);
  const sy = best([box.y, box.y + box.h / 2, box.y + box.h], ys);
  let dx = sx ? sx.d : 0;
  let dy = sy ? sy.d : 0;
  if (grid > 0) {
    if (!sx) dx = Math.round(box.x / grid) * grid - box.x;
    if (!sy) dy = Math.round(box.y / grid) * grid - box.y;
  }
  const lines = [];
  const moved = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
  if (sx) {
    const v = sx.cand.value;
    const same = xs.filter((c) => Math.abs(c.value - v) < 0.5);
    const lo = Math.min(moved.y, ...same.map((c) => c.from));
    const hi = Math.max(moved.y + moved.h, ...same.map((c) => c.to));
    lines.push({ axis: "x", at: v, from: lo, to: hi, kind: sx.cand.kind });
  }
  if (sy) {
    const v = sy.cand.value;
    const same = ys.filter((c) => Math.abs(c.value - v) < 0.5);
    const lo = Math.min(moved.x, ...same.map((c) => c.from));
    const hi = Math.max(moved.x + moved.w, ...same.map((c) => c.to));
    lines.push({ axis: "y", at: v, from: lo, to: hi, kind: sy.cand.kind });
  }
  // Equal spacing: the gap to the neighbour on one side matches the gap on the other side.
  if (!sx) {
    const row = targets.filter((t) => t.y < moved.y + moved.h && t.y + t.h > moved.y);
    const left = row.filter((t) => t.x + t.w <= box.x + tolerance).sort((a, b) => b.x + b.w - (a.x + a.w))[0];
    const right = row.filter((t) => t.x >= box.x + box.w - tolerance).sort((a, b) => a.x - b.x)[0];
    if (left && right) {
      const target = (left.x + left.w + right.x - box.w) / 2;
      if (Math.abs(target - box.x) <= tolerance) {
        dx = target - box.x;
        const y = moved.y + moved.h / 2;
        lines.push({ axis: "gap", from: left.x + left.w, to: target, at: y }, { axis: "gap", from: target + box.w, to: right.x, at: y });
      }
    }
  }
  if (!sy) {
    const col = targets.filter((t) => t.x < moved.x + moved.w && t.x + t.w > moved.x);
    const above = col.filter((t) => t.y + t.h <= box.y + tolerance).sort((a, b) => b.y + b.h - (a.y + a.h))[0];
    const below = col.filter((t) => t.y >= box.y + box.h - tolerance).sort((a, b) => a.y - b.y)[0];
    if (above && below) {
      const target = (above.y + above.h + below.y - box.h) / 2;
      if (Math.abs(target - box.y) <= tolerance) {
        dy = target - box.y;
        const x = moved.x + moved.w / 2;
        lines.push({ axis: "vgap", from: above.y + above.h, to: target, at: x }, { axis: "vgap", from: target + box.h, to: below.y, at: x });
      }
    }
  }
  return { dx: round2(dx), dy: round2(dy), lines };
}

/** Snap one value (an edge being resized) to nearby edges. */
export function snapValue(value, cands, tolerance) {
  let best = null;
  for (const c of cands) if (Math.abs(c - value) <= tolerance && (best == null || Math.abs(c - value) < Math.abs(best - value))) best = c;
  return best;
}

// ---------------------------------------------------------------- selection and groups

/** Selecting one member of a group selects the whole group. */
export function withGroups(list, ids) {
  const set = new Set(ids);
  const groups = new Set(list.filter((o) => set.has(o.id) && o.group).map((o) => o.group));
  return list.filter((o) => set.has(o.id) || (o.group && groups.has(o.group))).map((o) => o.id);
}

export function group(list, ids) {
  if (ids.length < 2) return list;
  const g = `g${newId().slice(1)}`;
  const set = new Set(ids);
  // A group draws together: its members move to the front-most member's place, in their order.
  const members = list.filter((o) => set.has(o.id)).map((o) => ({ ...o, group: g }));
  const last = Math.max(...list.map((o, i) => (set.has(o.id) ? i : -1)));
  const out = [];
  list.forEach((o, i) => {
    if (!set.has(o.id)) out.push(o);
    if (i === last) out.push(...members);
  });
  return out;
}

export function ungroup(list, ids) {
  const set = new Set(ids);
  const groups = new Set(list.filter((o) => set.has(o.id) && o.group).map((o) => o.group));
  return list.map((o) => (o.group && groups.has(o.group) ? (({ group: _, ...rest }) => rest)(o) : o));
}

// ---------------------------------------------------------------- order

/** Bring to front / send to back / one step forward / one step backward (PowerPoint's 前面へ・背面へ). */
export function reorder(list, ids, how) {
  const set = new Set(ids);
  const chosen = list.filter((o) => set.has(o.id));
  const rest = list.filter((o) => !set.has(o.id));
  if (!chosen.length) return list;
  if (how === "front") return [...rest, ...chosen];
  if (how === "back") return [...chosen, ...rest];
  const out = [...list];
  if (how === "forward") {
    for (let i = out.length - 2; i >= 0; i -= 1) {
      if (set.has(out[i].id) && !set.has(out[i + 1].id)) [out[i], out[i + 1]] = [out[i + 1], out[i]];
    }
  } else if (how === "backward") {
    for (let i = 1; i < out.length; i += 1) {
      if (set.has(out[i].id) && !set.has(out[i - 1].id)) [out[i], out[i - 1]] = [out[i - 1], out[i]];
    }
  }
  return out;
}

/** Move one object to a place in the drawing order (the selection pane's drag and drop). */
export function moveTo(list, id, index) {
  const from = list.findIndex((o) => o.id === id);
  if (from < 0) return list;
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, index)), 0, item);
  return out;
}

// ---------------------------------------------------------------- moving, aligning, distributing

function translate(o, dx, dy) {
  if (o.kind === "line") {
    const out = { ...o, x1: round2(o.x1 + dx), y1: round2(o.y1 + dy), x2: round2(o.x2 + dx), y2: round2(o.y2 + dy) };
    // A connector moved on its own lets go of the objects it was attached to.
    delete out.from;
    delete out.to;
    return out;
  }
  return { ...o, x: round2(o.x + dx), y: round2(o.y + dy) };
}

export function moveBy(list, ids, dx, dy) {
  const set = new Set(ids);
  return list.map((o) => (set.has(o.id) ? translate(o, dx, dy) : o));
}

/**
 * Align the selection (PowerPoint's 配置): left / center / right / top / middle / bottom, to the selection's
 * own box (two or more objects) or to the slide.
 */
export function align(list, ids, how, { toSlide = false, ends = null } = {}) {
  const set = new Set(ids);
  const chosen = list.filter((o) => set.has(o.id));
  if (!chosen.length) return list;
  const area = toSlide || chosen.length === 1 ? { x: 0, y: 0, w: W, h: H } : bounds(chosen, ends);
  // A group aligns as one block.
  const units = new Map();
  for (const o of chosen) {
    const key = o.group || o.id;
    if (!units.has(key)) units.set(key, []);
    units.get(key).push(o);
  }
  let out = list;
  for (const members of units.values()) {
    const b = bounds(members, ends);
    let dx = 0;
    let dy = 0;
    if (how === "left") dx = area.x - b.x;
    if (how === "center") dx = area.x + area.w / 2 - (b.x + b.w / 2);
    if (how === "right") dx = area.x + area.w - (b.x + b.w);
    if (how === "top") dy = area.y - b.y;
    if (how === "middle") dy = area.y + area.h / 2 - (b.y + b.h / 2);
    if (how === "bottom") dy = area.y + area.h - (b.y + b.h);
    out = moveBy(out, members.map((o) => o.id), dx, dy);
  }
  return out;
}

/** Equal gaps between three or more objects (左右に整列 / 上下に整列). */
export function distribute(list, ids, axis, { ends = null } = {}) {
  const set = new Set(ids);
  const units = new Map();
  for (const o of list.filter((item) => set.has(item.id))) {
    const key = o.group || o.id;
    if (!units.has(key)) units.set(key, []);
    units.get(key).push(o);
  }
  const blocks = [...units.values()].map((members) => ({ members, b: bounds(members, ends) }));
  if (blocks.length < 3) return list;
  const pos = axis === "x" ? (b) => b.x : (b) => b.y;
  const size = axis === "x" ? (b) => b.w : (b) => b.h;
  blocks.sort((p, q) => pos(p.b) - pos(q.b));
  const first = blocks[0].b;
  const last = blocks[blocks.length - 1].b;
  const span = pos(last) + size(last) - pos(first);
  const used = blocks.reduce((sum, block) => sum + size(block.b), 0);
  const gap = (span - used) / (blocks.length - 1);
  let at = pos(first);
  let out = list;
  for (const block of blocks) {
    const d = at - pos(block.b);
    out = moveBy(out, block.members.map((o) => o.id), axis === "x" ? d : 0, axis === "x" ? 0 : d);
    at += size(block.b) + gap;
  }
  return out;
}

/** Rotate the selection by a number of degrees (a group turns about its own centre). */
export function rotateBy(list, ids, deg) {
  const set = new Set(ids);
  const chosen = list.filter((o) => set.has(o.id));
  const center = (() => { const b = bounds(chosen); return [b.x + b.w / 2, b.y + b.h / 2]; })();
  const grouped = chosen.length > 1 && chosen.every((o) => o.group && o.group === chosen[0].group);
  return list.map((o) => {
    if (!set.has(o.id)) return o;
    if (o.kind === "line") {
      const c = grouped ? center : [(o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2];
      const [x1, y1] = rotatePoint([o.x1, o.y1], c, deg);
      const [x2, y2] = rotatePoint([o.x2, o.y2], c, deg);
      const out = { ...o, x1: round2(x1), y1: round2(y1), x2: round2(x2), y2: round2(y2) };
      delete out.from;
      delete out.to;
      return out;
    }
    const rot = normAngle((o.rot || 0) + deg);
    if (!grouped) return { ...o, rot };
    const [cx, cy] = rotatePoint([o.x + o.w / 2, o.y + o.h / 2], center, deg);
    return { ...o, rot, x: round2(cx - o.w / 2), y: round2(cy - o.h / 2) };
  });
}

export const normAngle = (deg) => round2((((deg + 180) % 360) + 360) % 360 - 180);

/** Flip left-right or upside down (a group flips about its own centre). */
export function flip(list, ids, axis) {
  const set = new Set(ids);
  const chosen = list.filter((o) => set.has(o.id));
  const b = bounds(chosen);
  const grouped = chosen.length > 1;
  return list.map((o) => {
    if (!set.has(o.id)) return o;
    if (o.kind === "line") {
      const mirror = (x, y) => (axis === "x" ? [b.x + b.w - (x - b.x), y] : [x, b.y + b.h - (y - b.y)]);
      const ends = grouped ? [mirror(o.x1, o.y1), mirror(o.x2, o.y2)] : axis === "x" ? [[o.x2, o.y1], [o.x1, o.y2]] : [[o.x1, o.y2], [o.x2, o.y1]];
      return { ...o, x1: round2(ends[0][0]), y1: round2(ends[0][1]), x2: round2(ends[1][0]), y2: round2(ends[1][1]) };
    }
    const out = { ...o };
    if (axis === "x") { out.flipH = !o.flipH; if (o.rot) out.rot = normAngle(-o.rot); }
    else { out.flipV = !o.flipV; if (o.rot) out.rot = normAngle(-o.rot); }
    if (!out.flipH) delete out.flipH;
    if (!out.flipV) delete out.flipV;
    if (!out.rot) delete out.rot;
    if (grouped) {
      if (axis === "x") out.x = round2(b.x + b.w - (o.x + o.w - b.x));
      else out.y = round2(b.y + b.h - (o.y + o.h - b.y));
    }
    return out;
  });
}

/** Copies of the selection with new ids (and new groups), shifted by `offset`. */
export function duplicate(list, ids, offset = 24) {
  const set = new Set(ids);
  const groupMap = new Map();
  const idMap = new Map();
  const copies = list.filter((o) => set.has(o.id)).map((o) => {
    const copy = translate(clone(o), offset, offset);
    copy.id = newId();
    idMap.set(o.id, copy.id);
    if (o.group) {
      if (!groupMap.has(o.group)) groupMap.set(o.group, `g${newId().slice(1)}`);
      copy.group = groupMap.get(o.group);
    }
    delete copy.name;
    return copy;
  });
  // Connectors copied with both ends keep them, on the copies.
  for (const [i, o] of list.filter((item) => set.has(item.id)).entries()) {
    if (o.kind !== "line") continue;
    for (const end of ["from", "to"]) if (o[end] && idMap.has(o[end].id)) copies[i][end] = { ...o[end], id: idMap.get(o[end].id) };
  }
  return { list: [...list, ...copies], ids: copies.map((o) => o.id), idMap, groupMap };
}

/** Objects copied from elsewhere (the clipboard), with new ids, placed at an offset. */
export function paste(list, objects, offset = 0) {
  const fake = [...objects];
  const { list: merged, ids, idMap, groupMap } = duplicate(fake, fake.map((o) => o.id), offset);
  const added = merged.slice(fake.length);
  return { list: [...list, ...added], ids, idMap, groupMap };
}

/** Remove objects; connectors that pointed at them stay where they were drawn. */
export function remove(list, ids, ends = null) {
  const set = new Set(ids);
  return list.filter((o) => !set.has(o.id)).map((o) => {
    if (o.kind !== "line" || !((o.from && set.has(o.from.id)) || (o.to && set.has(o.to.id)))) return o;
    const out = { ...o };
    if (ends) {
      const [[x1, y1], [x2, y2]] = ends(o);
      Object.assign(out, { x1: round2(x1), y1: round2(y1), x2: round2(x2), y2: round2(y2) });
    }
    if (o.from && set.has(o.from.id)) delete out.from;
    if (o.to && set.has(o.to.id)) delete out.to;
    return out;
  });
}

/** Apply settings to the selection (a function gets each object and returns its changes). */
export function update(list, ids, patch) {
  const set = new Set(ids);
  return list.map((o) => {
    if (!set.has(o.id)) return o;
    const changes = typeof patch === "function" ? patch(o) : patch;
    if (!changes) return o;
    const out = { ...o, ...changes };
    for (const [key, value] of Object.entries(changes)) if (value === undefined || value === null) delete out[key];
    return out;
  });
}

// ---------------------------------------------------------------- text formatting (whole objects)

/**
 * Remove one kind of inline formatting from rich text, so a setting made for the whole object shows everywhere
 * (as PowerPoint does when a shape, not a word, is selected). kind: bold, italic, underline, strike, color,
 * size, highlight, align.
 */
export function clearInline(E, html, kind) {
  if (!html) return html;
  const box = document.createElement("div");
  box.append(E.richFragment(html));
  const unwrap = (el) => el.replaceWith(...el.childNodes);
  const tags = { bold: "b", italic: "i", underline: "u", strike: "s" }[kind];
  if (tags) for (const el of [...box.querySelectorAll(tags)]) unwrap(el);
  const props = { bold: ["font-weight"], italic: ["font-style"], underline: ["text-decoration"], strike: ["text-decoration"], color: ["color"], size: ["font-size"], highlight: ["background-color"] }[kind] ?? [];
  for (const el of [...box.querySelectorAll("span")]) {
    for (const prop of props) el.style.removeProperty(prop);
    if (!el.getAttribute("style")?.trim()) unwrap(el);
  }
  if (kind === "align") for (const el of box.querySelectorAll("p, li, div")) el.removeAttribute("style");
  return E.sanitizeRich(box.innerHTML);
}

/** Turn every paragraph into a bulleted or numbered list, or every list back into paragraphs. */
export function setList(E, html, type, style = null) {
  const box = document.createElement("div");
  box.append(E.richFragment(html || "<p><br></p>"));
  const lines = [];
  const collect = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeName === "P") lines.push(child.innerHTML);
      else if (child.nodeName === "UL" || child.nodeName === "OL") for (const li of child.children) { const copy = li.cloneNode(true); copy.querySelectorAll("ul, ol").forEach((n) => n.remove()); lines.push(copy.innerHTML); for (const sub of li.children) if (sub.nodeName === "UL" || sub.nodeName === "OL") collect({ childNodes: [sub] }); }
    }
  };
  collect(box);
  if (!type) return E.sanitizeRich(lines.map((line) => `<p>${line || "<br>"}</p>`).join(""));
  const tag = type === "number" ? "ol" : "ul";
  const kept = style && E.LIST_STYLES?.[tag]?.[style] ? ` data-style="${style}"` : "";
  return E.sanitizeRich(`<${tag}${kept}>${lines.map((line) => `<li>${line || "<br>"}</li>`).join("")}</${tag}>`);
}

/** The list's marker (箇条書き・段落番号の種類): its data-style, or the plain one. */
export function listStyleOf(html) {
  const m = String(html || "").match(/^<(ul|ol)(?: data-style="([\w-]+)")?>/);
  return m ? m[2] || (m[1] === "ul" ? "disc" : "decimal") : null;
}

/** Which list the text is (all bullets / all numbers / none). */
export function listOf(html) {
  const text = String(html || "");
  if (/^<ul[ >]/.test(text) && !/<p[ >]/.test(text)) return "bullet";
  if (/^<ol[ >]/.test(text) && !/<p[ >]/.test(text)) return "number";
  return null;
}

// ---------------------------------------------------------------- units

export const toCm = (px) => Math.round((px / PX_PER_CM) * 100) / 100;
export const fromCm = (cm) => round2(Number(cm) * PX_PER_CM);
export const toPt = (px) => Math.round((px / PX_PER_PT) * 10) / 10;
export const fromPt = (pt) => round2(Number(pt) * PX_PER_PT);

// ---------------------------------------------------------------- animations (slide.timeline, engine/animate.js)

/**
 * Keep a slide's animations in step with its objects: animations of deleted objects go, a group's animation
 * becomes one per former member when the group is undone (the first keeps its start, the rest play with it),
 * and a trigger that is gone leaves its animations to play on the slide's clicks.
 */
export function reconcileTimeline(timeline, before, after) {
  if (!Array.isArray(timeline) || !timeline.length) return timeline;
  const ids = new Set(after.map((o) => o.id));
  const groups = new Set(after.map((o) => o.group).filter(Boolean));
  const out = [];
  for (const e of timeline) {
    if (!e || typeof e.el !== "string") continue;
    let entries = [e];
    if (e.el.startsWith("grp:") && !groups.has(e.el.slice(4))) {
      const members = before.filter((o) => o.group === e.el.slice(4) && ids.has(o.id));
      entries = members.map((o, i) => ({ ...e, id: i ? `${e.id}-${i}`.slice(0, 32) : e.id, el: o.id, ...(i ? { start: "with", delay: e.delay || 0 } : {}) }));
    } else if (!e.el.startsWith("@") && !e.el.startsWith("grp:") && !ids.has(e.el)) entries = [];
    for (const entry of entries) {
      if (entry.trigger && !ids.has(entry.trigger)) { const { trigger: _, ...rest } = entry; out.push(rest); } else out.push(entry);
    }
  }
  return out;
}

/** Move animations up or down the list (PowerPoint's 順番を前にする / 後にする). */
export function moveAnimations(timeline, ids, step) {
  const list = [...timeline];
  const set = new Set(ids);
  const order = step < 0 ? list.map((_, i) => i) : list.map((_, i) => list.length - 1 - i);
  for (const i of order) {
    if (!set.has(list[i].id)) continue;
    const j = i + (step < 0 ? -1 : 1);
    if (j < 0 || j >= list.length || set.has(list[j].id)) continue;
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// ---------------------------------------------------------------- tables (kind "table")
// A table is edited as a grid where every position points at the cell that covers it, so a merged cell is one
// object in several positions: inserting, deleting, merging and splitting then keep merges right by themselves.

const copyCell = (cell) => JSON.parse(JSON.stringify(cell || {}));
function expand(cells) {
  const grid = cells.map((row) => row.map(() => null));
  cells.forEach((row, r) => row.forEach((cell, c) => {
    if (cell.merged || grid[r][c]) return;
    const own = copyCell(cell);
    delete own.rs; delete own.cs; delete own.merged;
    for (let i = r; i < Math.min(cells.length, r + (cell.rs || 1)); i += 1) for (let j = c; j < Math.min(row.length, c + (cell.cs || 1)); j += 1) grid[i][j] = own;
  }));
  return grid.map((row) => row.map((cell) => cell || {}));
}
function collapse(grid) {
  const done = new Set();
  return grid.map((row, r) => row.map((cell, c) => {
    if (done.has(cell)) return { merged: true };
    done.add(cell);
    let rs = 1;
    let cs = 1;
    while (r + rs < grid.length && grid[r + rs][c] === cell) rs += 1;
    while (c + cs < row.length && row[c + cs] === cell) cs += 1;
    const out = copyCell(cell);
    if (rs > 1) out.rs = rs;
    if (cs > 1) out.cs = cs;
    return out;
  }));
}
/** The cell (top-left of a merge) that covers row r, column c. */
export function tableOrigin(o, r, c) {
  const grid = expand(o.cells);
  const cell = grid[r]?.[c];
  for (let i = 0; i < grid.length; i += 1) for (let j = 0; j < grid[i].length; j += 1) if (grid[i][j] === cell) return [i, j];
  return [r, c];
}
const px = (shares, total) => shares.map((f) => f * total);
const toShares = (values) => { const sum = values.reduce((a, b) => a + b, 0) || 1; return values.map((v) => Math.round((v / sum) * 100000) / 100000); };

/** A new table: rows × cols of empty cells (the first row is its header). */
export function makeTable(rows, cols, box) {
  return { kind: "table", ...box, cells: Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({}))), cols: Array.from({ length: cols }, () => 1 / cols), rows: Array.from({ length: rows }, () => 1 / rows) };
}
/** Insert a row before `at` (a merge crossing that line grows over the new row); the table grows by one row. */
export function tableInsertRow(o, at) {
  const grid = expand(o.cells);
  at = Math.max(0, Math.min(grid.length, at));
  const row = grid[0].map((_, c) => (at > 0 && at < grid.length && grid[at - 1][c] === grid[at][c] ? grid[at][c] : {}));
  grid.splice(at, 0, row);
  const heights = px(o.rows, o.h);
  const added = heights[Math.min(at, heights.length - 1)] || o.h / heights.length;
  heights.splice(at, 0, added);
  return { ...o, cells: collapse(grid), rows: toShares(heights), h: o.h + added };
}
/** Insert a column before `at`; the table grows by that column's width. */
export function tableInsertCol(o, at) {
  const grid = expand(o.cells);
  at = Math.max(0, Math.min(grid[0].length, at));
  grid.forEach((row) => row.splice(at, 0, at > 0 && at < row.length && row[at - 1] === row[at] ? row[at] : {}));
  const widths = px(o.cols, o.w);
  const added = widths[Math.min(at, widths.length - 1)] || o.w / widths.length;
  widths.splice(at, 0, added);
  return { ...o, cells: collapse(grid), cols: toShares(widths), w: o.w + added };
}
/** Delete rows r0…r1 (the table shrinks); null when nothing would be left. */
export function tableDeleteRows(o, r0, r1) {
  const [a, b] = [Math.min(r0, r1), Math.max(r0, r1)];
  if (b - a + 1 >= o.cells.length) return null;
  const grid = expand(o.cells).filter((_, r) => r < a || r > b);
  const heights = px(o.rows, o.h);
  const removed = heights.slice(a, b + 1).reduce((s, v) => s + v, 0);
  return { ...o, cells: collapse(grid), rows: toShares(heights.filter((_, r) => r < a || r > b)), h: Math.max(20, o.h - removed) };
}
/** Delete columns c0…c1 (the table narrows); null when nothing would be left. */
export function tableDeleteCols(o, c0, c1) {
  const [a, b] = [Math.min(c0, c1), Math.max(c0, c1)];
  if (b - a + 1 >= o.cells[0].length) return null;
  const grid = expand(o.cells).map((row) => row.filter((_, c) => c < a || c > b));
  const widths = px(o.cols, o.w);
  const removed = widths.slice(a, b + 1).reduce((s, v) => s + v, 0);
  return { ...o, cells: collapse(grid), cols: toShares(widths.filter((_, c) => c < a || c > b)), w: Math.max(20, o.w - removed) };
}
/** Merge a block of cells into one (the words of each come along, one paragraph after another). */
export function tableMerge(o, r0, c0, r1, c1) {
  const grid = expand(o.cells);
  const [ra, rb, ca, cb] = [Math.min(r0, r1), Math.max(r0, r1), Math.min(c0, c1), Math.max(c0, c1)];
  // Grow the block to whole merges it cuts through.
  let [top, bottom, left, right] = [ra, rb, ca, cb];
  for (let grew = true; grew;) {
    grew = false;
    const inside = new Set();
    for (let i = top; i <= bottom; i += 1) for (let j = left; j <= right; j += 1) inside.add(grid[i][j]);
    grid.forEach((row, i) => row.forEach((cell, j) => {
      if (!inside.has(cell)) return;
      if (i < top) { top = i; grew = true; } if (i > bottom) { bottom = i; grew = true; }
      if (j < left) { left = j; grew = true; } if (j > right) { right = j; grew = true; }
    }));
  }
  const first = grid[top][left];
  const texts = [];
  const seen = new Set();
  for (let i = top; i <= bottom; i += 1) for (let j = left; j <= right; j += 1) {
    const cell = grid[i][j];
    if (seen.has(cell)) continue;
    seen.add(cell);
    if (cell.text && cell.text.replace(/<[^>]+>/g, "").trim()) texts.push(cell.text);
  }
  const merged = { ...first, ...(texts.length ? { text: texts.join("") } : {}) };
  for (let i = top; i <= bottom; i += 1) for (let j = left; j <= right; j += 1) grid[i][j] = merged;
  return { ...o, cells: collapse(grid) };
}
/** Split a merged cell back into single cells (its words stay in the first). */
export function tableSplit(o, r, c) {
  const grid = expand(o.cells);
  const cell = grid[r]?.[c];
  if (!cell) return o;
  let first = true;
  grid.forEach((row, i) => row.forEach((x, j) => {
    if (x !== cell) return;
    if (first) { first = false; return; }
    grid[i][j] = { ...(cell.fill ? { fill: cell.fill } : {}) };
  }));
  return { ...o, cells: collapse(grid) };
}
/** Settings for a block of cells (fill, colour, bold, alignment…); undefined removes a setting. */
export function tableCells(o, r0, c0, r1, c1, patch) {
  const grid = expand(o.cells);
  const done = new Set();
  for (let i = Math.min(r0, r1); i <= Math.max(r0, r1); i += 1) for (let j = Math.min(c0, c1); j <= Math.max(c0, c1); j += 1) {
    const cell = grid[i]?.[j];
    if (!cell || done.has(cell)) continue;
    done.add(cell);
    const changes = typeof patch === "function" ? patch(cell) : patch;
    for (const [k, v] of Object.entries(changes || {})) { if (v === undefined || v === null) delete cell[k]; else cell[k] = v; }
  }
  return { ...o, cells: collapse(grid) };
}
/** The same height for rows r0…r1, or the same width for columns c0…c1 (高さを揃える・幅を揃える). */
export function tableDistribute(o, axis, a = 0, b = Infinity) {
  const key = axis === "rows" ? "rows" : "cols";
  const list = [...o[key]];
  const [lo, hi] = [Math.max(0, Math.min(a, b)), Math.min(list.length - 1, Math.max(a, b))];
  const share = list.slice(lo, hi + 1).reduce((s, v) => s + v, 0) / (hi - lo + 1);
  for (let i = lo; i <= hi; i += 1) list[i] = share;
  return { ...o, [key]: toShares(list) };
}
/** Move the line between column i and i+1 (or row) by d slide pixels, keeping both at least `min` wide. */
export function tableResizeLine(o, axis, i, d, min = 24) {
  const key = axis === "rows" ? "rows" : "cols";
  const total = key === "rows" ? o.h : o.w;
  const sizes = px(o[key], total);
  if (i < 0 || i >= sizes.length - 1) return o;
  const move = Math.max(min - sizes[i], Math.min(sizes[i + 1] - min, d));
  sizes[i] += move;
  sizes[i + 1] -= move;
  return { ...o, [key]: toShares(sizes) };
}
/** The text of a table as tab-separated lines (and back), for copying cells as text. */
export function tableFromText(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").filter((line, i, all) => line || i < all.length - 1).slice(0, 40);
  const rows = lines.map((line) => line.split("\t").slice(0, 20));
  const cols = Math.max(...rows.map((row) => row.length), 1);
  return rows.map((row) => Array.from({ length: cols }, (_, c) => (row[c] ? { text: `<p>${row[c].replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch])}</p>` } : {})));
}

/** The colour of `list` nearest to `hex` (RGB distance). */
export function nearestColor(hex, list) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = rgb(hex);
  let best = list[0];
  let d = Infinity;
  for (const c of list) { const [x, y, z] = rgb(c); const e = (r - x) ** 2 + (g - y) ** 2 + (b - z) ** 2; if (e < d) { d = e; best = c; } }
  return best;
}

/** 貼り付け先のスタイルを使用: an object's colours moved to the nearest of the SEJ palette (fills, lines, words, markers). */
export function snapToPalette(o, P) {
  const hex = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c);
  const pick = (c, key) => nearestColor(c.toLowerCase(), P[key].map(([x]) => x));
  const out = { ...o };
  if (hex(out.fill)) out.fill = pick(out.fill, "fill");
  if (hex(out.stroke)) out.stroke = pick(out.stroke, "line");
  if (hex(out.color)) out.color = pick(out.color, out.kind === "icon" ? "line" : "text");
  if (out.gradient?.stops) out.gradient = { ...out.gradient, stops: out.gradient.stops.map((s) => (hex(s.color) ? { ...s, color: pick(s.color, "fill") } : s)) };
  if (typeof out.text === "string") {
    out.text = out.text
      .replace(/background-color:\s*(#[0-9a-f]{6})/gi, (_, c) => `background-color: ${pick(c, "highlight")}`)
      .replace(/(^|[^-])color:\s*(#[0-9a-f]{6})/gi, (_, pre, c) => `${pre}color: ${pick(c, "text")}`);
  }
  return out;
}
