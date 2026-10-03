// 共同編集 (server/rooms.mjs): rooms by unguessable id, a snapshot on joining, changes passed on, presence, media.
import assert from "node:assert/strict";
import test from "node:test";

import { createRooms, isRoomId } from "../server/rooms.mjs";

/** A fake event stream: what the server wrote, as { event, data } pairs. */
function stream() {
  const events = [];
  return { events, write(chunk) { const m = /^event: (\w+)\ndata: (.*)\n\n$/s.exec(chunk); if (m) events.push({ event: m[1], data: JSON.parse(m[2]) }); }, end() { this.ended = true; } };
}
const deck = () => ({ title: "共有", theme: "sej", slides: [{ type: "title", title: "表紙", sid: "s1" }, { type: "blank", title: "本文", sid: "s2" }, { type: "closing", sid: "s3" }] });

test("a room is made from a deck with slide ids, under an id nobody can guess", () => {
  const rooms = createRooms();
  const room = rooms.create(deck());
  assert.ok(isRoomId(room.id) && room.id.length >= 24);
  assert.notEqual(rooms.create(deck()).id, room.id);
  assert.equal(rooms.get(room.id), room);
  assert.equal(rooms.get("short"), null);
  assert.throws(() => rooms.create({ slides: [{ type: "title" }] }), /ID/);
  assert.throws(() => rooms.create({ slides: [{ sid: "a" }, { sid: "a" }] }), /ID/);
  // A browser that still has the deck brings a forgotten room back under the same link.
  const again = createRooms().create(deck(), { id: room.id });
  assert.equal(again.id, room.id);
});

test("joining gives the deck and who is there; changes go to the others only", () => {
  const rooms = createRooms();
  const room = rooms.create(deck());
  const a = stream();
  const b = stream();
  rooms.join(room, a, { client: "clientA", name: "山田", uid: "u1" });
  rooms.join(room, b, { client: "clientB", name: "佐藤", uid: "u2" });
  assert.equal(a.events[0].event, "snapshot");
  assert.equal(a.events[0].data.deck.slides.length, 3);
  assert.deepEqual(a.events.at(-1).data.people.map((p) => p.name), ["山田", "佐藤"], "A hears that B came");
  assert.notEqual(a.events[0].data.you.color, b.events[0].data.you.color, "each has a colour of their own");
  const version = rooms.apply(room, "clientA", [{ t: "slide", sid: "s2", slide: { type: "blank", title: "直した本文", sid: "s2" } }]);
  assert.equal(version, 2);
  assert.equal(room.deck.slides[1].title, "直した本文");
  const got = b.events.at(-1);
  assert.equal(got.event, "ops");
  assert.equal(got.data.client, "clientA");
  assert.equal(got.data.ops[0].slide.title, "直した本文");
  assert.ok(!a.events.some((e) => e.event === "ops"), "not echoed to the sender");
});

test("slides added, removed and reordered; the deck's own settings; nonsense ignored", () => {
  const rooms = createRooms();
  const room = rooms.create(deck());
  rooms.apply(room, "c1", [{ t: "order", sids: ["s1", "s4", "s3"], add: [{ type: "blank", title: "新しい", sid: "s4" }] }]);
  assert.deepEqual(room.deck.slides.map((s) => s.sid), ["s1", "s4", "s3"], "s4 in, s2 out");
  rooms.apply(room, "c1", [{ t: "deck", meta: { title: "新しい題", transition: null, slides: [] } }]);
  assert.equal(room.deck.title, "新しい題");
  assert.equal(room.deck.slides.length, 3, "slides are not deck settings");
  const before = room.version;
  rooms.apply(room, "c1", [{ t: "order", sids: ["s1", "s1"] }, { t: "slide", sid: "zz", slide: { sid: "other" } }, { t: "unknown" }]);
  assert.equal(room.version, before, "nothing applied, nothing broadcast");
  assert.throws(() => rooms.apply(room, "c1", "x"));
});

test("presence, leaving, media and forgetting empty rooms", () => {
  let clock = 0;
  const rooms = createRooms({ idleMs: 1000, now: () => clock });
  const room = rooms.create(deck());
  const a = stream();
  const b = stream();
  rooms.join(room, a, { client: "clientA", name: "山田" });
  rooms.join(room, b, { client: "clientB", name: "佐藤" });
  rooms.presence(room, "clientA", { slide: "s2", sel: ["o1", 5] });
  assert.deepEqual(b.events.at(-1), { event: "presence", data: { id: "clientA", name: "山田", color: room.clients.get("clientA").color, slide: "s2", sel: ["o1"] } });
  rooms.putMedia(room, "abc123", "audio/webm", Buffer.from("sound"));
  assert.equal(rooms.getMedia(room, "abc123").body.toString(), "sound");
  assert.throws(() => rooms.putMedia(room, "../x", "a", Buffer.from("")));
  rooms.leave(room, "clientA", a);
  assert.deepEqual(b.events.at(-1).data.people.map((p) => p.name), ["佐藤"]);
  rooms.leave(room, "clientB", b);
  clock = 5000;
  rooms.sweep();
  assert.equal(rooms.get(room.id), null, "forgotten after a while with nobody in it");
});
