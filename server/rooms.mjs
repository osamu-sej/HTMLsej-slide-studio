// 共同編集 (co-editing): a shared copy of a deck that several browsers edit at once. A room is created from a deck and
// reached by an unguessable link; each browser listens to a stream of events (Server-Sent Events) and posts its
// changes as small operations: one slide replaced (by its sid), the order of the slides, or the deck's own settings.
// The server keeps the latest deck and passes every change on; browsers merge what arrives with what they are
// typing. Pictures, videos and sounds kept in a browser travel through the room (media by id). Rooms live in memory
// and are forgotten after a while without anyone in them; a browser that still has the deck can bring one back.

import { randomBytes } from "node:crypto";

const ID = /^[A-Za-z0-9_-]{16,40}$/;
const CLIENT = /^[A-Za-z0-9_-]{4,40}$/;
const MEDIA_ID = /^[A-Za-z0-9_-]{1,64}$/;
const COLORS = ["#2b6be0", "#c2410c", "#0f766e", "#7c3aed", "#b45309", "#be185d", "#15803d", "#4338ca", "#a16207", "#0e7490"];

export const isRoomId = (id) => ID.test(String(id || ""));
export const newRoomId = () => randomBytes(18).toString("base64url");
const clean = (text, max) => String(text ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);

export function createRooms({ maxRooms = 60, maxDeckBytes = 20_000_000, maxMediaBytes = 300_000_000, idleMs = 12 * 3600_000, now = () => Date.now() } = {}) {
  const rooms = new Map();

  function validDeck(deck) {
    if (!deck || typeof deck !== "object" || !Array.isArray(deck.slides) || !deck.slides.length || deck.slides.length > 500) throw new Error("資料が読めません");
    const size = Buffer.byteLength(JSON.stringify(deck));
    if (size > maxDeckBytes) throw new Error("資料が大きすぎて共有できません（20MBまで）");
    // Every slide needs its id: changes are sent slide by slide.
    const seen = new Set();
    for (const slide of deck.slides) {
      if (!slide || typeof slide !== "object" || typeof slide.sid !== "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(slide.sid) || seen.has(slide.sid)) throw new Error("スライドのIDがそろっていません");
      seen.add(slide.sid);
    }
    return deck;
  }

  /** A new room for a deck (or, `id` given, the same room brought back after the server forgot it). */
  function create(deck, { id = null } = {}) {
    sweep();
    if (id && rooms.has(id)) return rooms.get(id);
    if (rooms.size >= maxRooms) throw new Error("共同編集の部屋がいっぱいです。しばらくしてからもう一度どうぞ");
    const room = { id: id && isRoomId(id) ? id : newRoomId(), deck: validDeck(structuredClone(deck)), version: 1, clients: new Map(), media: new Map(), mediaBytes: 0, touched: now(), createdAt: now() };
    rooms.set(room.id, room);
    return room;
  }
  const get = (id) => (isRoomId(id) ? rooms.get(id) || null : null);

  function people(room) {
    return [...room.clients.values()].map(({ id, name, uid, color, slide, sel, at }) => ({ id, name, uid, color, slide, sel, at }));
  }
  function send(client, event, data) {
    try { client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* gone */ }
  }
  function broadcast(room, event, data, except = null) {
    for (const client of room.clients.values()) if (client.id !== except) send(client, event, data);
  }

  /** A browser joins: it gets the deck and who is there; the others learn it came. */
  function join(room, res, { client, name, uid }) {
    if (!CLIENT.test(String(client || ""))) throw new Error("bad client");
    const old = room.clients.get(client);
    if (old && old.res !== res) { try { old.res.end(); } catch { /* closed */ } }
    const used = new Set([...room.clients.values()].map((c) => c.color));
    const color = old?.color || COLORS.find((c) => !used.has(c)) || COLORS[room.clients.size % COLORS.length];
    const entry = { id: client, res, name: clean(name, 40) || "名前なし", uid: clean(uid, 24), color, slide: old?.slide || null, sel: old?.sel || [], at: now() };
    room.clients.set(client, entry);
    room.touched = now();
    send(entry, "snapshot", { deck: room.deck, version: room.version, people: people(room), you: { id: client, color } });
    broadcast(room, "people", { people: people(room) }, client);
    return entry;
  }
  function leave(room, client, res = null) {
    const entry = room.clients.get(client);
    if (!entry || (res && entry.res !== res)) return;
    room.clients.delete(client);
    room.touched = now();
    broadcast(room, "people", { people: people(room) });
  }

  /** Apply a browser's changes to the room's deck; everyone else hears them. */
  function apply(room, client, ops) {
    if (!Array.isArray(ops) || !ops.length || ops.length > 600) throw new Error("変更が読めません");
    const deck = room.deck;
    const applied = [];
    for (const op of ops) {
      if (op?.t === "slide" && op.slide && typeof op.slide === "object" && op.slide.sid === op.sid) {
        const i = deck.slides.findIndex((s) => s.sid === op.sid);
        if (i >= 0) deck.slides[i] = op.slide;
        else if (Number.isInteger(op.at)) deck.slides.splice(Math.max(0, Math.min(deck.slides.length, op.at)), 0, op.slide);
        else continue;
        applied.push(op);
      } else if (op?.t === "order" && Array.isArray(op.sids)) {
        const bySid = new Map(deck.slides.map((s) => [s.sid, s]));
        for (const s of Array.isArray(op.add) ? op.add : []) if (s && typeof s.sid === "string") bySid.set(s.sid, s);
        const next = op.sids.map((sid) => bySid.get(sid)).filter(Boolean);
        if (!next.length || next.length > 500 || new Set(op.sids).size !== op.sids.length) continue;
        deck.slides = next;
        applied.push(op);
      } else if (op?.t === "deck" && op.meta && typeof op.meta === "object") {
        for (const [key, value] of Object.entries(op.meta)) {
          if (key === "slides") continue;
          if (value === null) delete deck[key]; else deck[key] = value;
        }
        applied.push(op);
      }
    }
    if (!applied.length) return room.version;
    if (Buffer.byteLength(JSON.stringify(deck)) > maxDeckBytes) throw new Error("資料が大きすぎます");
    room.version += 1;
    room.touched = now();
    broadcast(room, "ops", { client, version: room.version, ops: applied }, client);
    return room.version;
  }

  /** Where someone is: the slide they are on and what they have selected (drawn in their colour for the others). */
  function presence(room, client, { slide, sel, name } = {}) {
    const entry = room.clients.get(client);
    if (!entry) return;
    entry.slide = typeof slide === "string" ? slide.slice(0, 32) : null;
    entry.sel = Array.isArray(sel) ? sel.filter((x) => typeof x === "string").slice(0, 50).map((x) => x.slice(0, 40)) : [];
    if (name) entry.name = clean(name, 40) || entry.name;
    entry.at = now();
    broadcast(room, "presence", { id: client, name: entry.name, color: entry.color, slide: entry.slide, sel: entry.sel }, client);
  }

  function putMedia(room, mid, type, body) {
    if (!MEDIA_ID.test(mid)) throw new Error("bad media id");
    if (room.media.has(mid)) return;
    if (room.mediaBytes + body.length > maxMediaBytes) throw new Error("共有できるファイルの量を超えました");
    room.media.set(mid, { type: clean(type, 100) || "application/octet-stream", body });
    room.mediaBytes += body.length;
    room.touched = now();
  }
  const getMedia = (room, mid) => room.media.get(mid) || null;

  /** Rooms nobody has used for a while are forgotten. */
  function sweep() {
    for (const [id, room] of rooms) if (!room.clients.size && now() - room.touched > idleMs) rooms.delete(id);
  }
  function heartbeat() {
    for (const room of rooms.values()) for (const client of room.clients.values()) { try { client.res.write(": ping\n\n"); } catch { /* gone */ } }
    sweep();
  }

  /** The server is stopping: end every stream (the browsers reconnect and bring their rooms back). */
  function closeAll() {
    for (const room of rooms.values()) for (const client of room.clients.values()) { try { client.res.end(); } catch { /* gone */ } }
  }

  return { create, get, join, leave, apply, presence, putMedia, getMedia, people, sweep, heartbeat, closeAll, rooms };
}
