// -----------------------------------------------------------------------------
// The room of a device: nearest node, maximum distance, hysteresis, away delay,
// ESPresense-companion first.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage } from '../src/espresense.js';
import { READING_FRESH_MS, Tracker } from '../src/tracker.js';
import { readCapture } from './helpers/world.js';

const SETTINGS = { maxDistance: 5, hysteresis: 1, awayMs: 120_000, useCompanion: true };
const T0 = 1_700_000_000_000;

const read = (tracker, node, distance, at, id = 'phone:a') =>
  tracker.apply({ kind: 'reading', id, node, distance, name: '' }, at);

test('the real capture puts the phone in the room of the nearest node', () => {
  const tracker = new Tracker();
  const capture = readCapture('stationary.jsonp');
  const last = new Map();
  for (const { at, topic, payload } of capture) {
    const message = parseMessage('espresense', topic, payload);
    tracker.apply(message, at);
    last.set(message.node, message.distance);
  }
  const end = capture[capture.length - 1].at;
  const [nearest] = [...last.entries()].sort((a, b) => a[1] - b[1])[0];
  const placed = tracker.evaluate('phone:test', end, { ...SETTINGS, maxDistance: 15 });
  assert.equal(placed.room, nearest);
  assert.equal(placed.distance, last.get(nearest));
});

test('beyond the maximum distance, the device is in no room', () => {
  const tracker = new Tracker();
  read(tracker, 'kitchen', 6.2, T0);
  assert.equal(tracker.evaluate('phone:a', T0, SETTINGS).room, null);
  // The distance is still told, for information.
  assert.equal(tracker.evaluate('phone:a', T0, SETTINGS).distance, 6.2);
});

test('a closer node takes the device only beyond the margin', () => {
  const tracker = new Tracker();
  read(tracker, 'kitchen', 2, T0);
  assert.equal(tracker.evaluate('phone:a', T0, SETTINGS).room, 'kitchen');
  read(tracker, 'hall', 1.5, T0 + 1000);
  let placed = tracker.evaluate('phone:a', T0 + 1000, SETTINGS);
  assert.deepEqual([placed.room, placed.changed], ['kitchen', false]);
  read(tracker, 'hall', 0.9, T0 + 2000);
  placed = tracker.evaluate('phone:a', T0 + 2000, SETTINGS);
  assert.deepEqual([placed.room, placed.changed], ['hall', true]);
});

test('a room that no longer hears the device under the maximum gives it up at once', () => {
  const tracker = new Tracker();
  read(tracker, 'kitchen', 2, T0);
  tracker.evaluate('phone:a', T0, SETTINGS);
  read(tracker, 'kitchen', 7, T0 + 1000);
  read(tracker, 'hall', 4, T0 + 1000);
  assert.equal(tracker.evaluate('phone:a', T0 + 1000, SETTINGS).room, 'hall');
});

test('a node gone offline (its last will) drops its readings at once', () => {
  const tracker = new Tracker();
  read(tracker, 'kitchen', 0.8, T0);
  read(tracker, 'hall', 3, T0);
  assert.equal(tracker.evaluate('phone:a', T0, SETTINGS).room, 'kitchen');
  tracker.apply({ kind: 'node_status', node: 'kitchen', online: false }, T0 + 1000);
  assert.equal(tracker.evaluate('phone:a', T0 + 1000, SETTINGS).room, 'hall');
});

test('heard by nobody, the device keeps its room for the away delay, then is away', () => {
  const tracker = new Tracker();
  read(tracker, 'kitchen', 2, T0);
  tracker.evaluate('phone:a', T0, SETTINGS);
  const later = T0 + READING_FRESH_MS + 1;
  assert.equal(tracker.evaluate('phone:a', later, SETTINGS).room, 'kitchen');
  assert.equal(tracker.evaluate('phone:a', T0 + 119_000, SETTINGS).room, 'kitchen');
  const away = tracker.evaluate('phone:a', T0 + 120_000, SETTINGS);
  assert.deepEqual([away.room, away.changed, away.distance], [null, true, null]);
});

test('the companion room wins while the companion is online, by its slug', () => {
  const tracker = new Tracker();
  tracker.apply({ kind: 'companion_status', online: true }, T0);
  read(tracker, 'kitchen', 1, T0);
  tracker.apply({ kind: 'companion_state', id: 'phone:a', room: 'Living Room' }, T0);
  assert.equal(tracker.evaluate('phone:a', T0, SETTINGS).room, 'living_room');
  assert.equal(tracker.rooms.get('living_room').name, 'Living Room');
  // not_home: away, whatever the nodes say.
  tracker.apply({ kind: 'companion_state', id: 'phone:a', room: 'not_home' }, T0 + 1000);
  assert.equal(tracker.evaluate('phone:a', T0 + 1000, SETTINGS).room, null);
  // The companion goes offline (its LWT): back to the nearest node.
  tracker.apply({ kind: 'companion_status', online: false }, T0 + 2000);
  read(tracker, 'kitchen', 1, T0 + 2000);
  assert.equal(tracker.evaluate('phone:a', T0 + 2000, SETTINGS).room, 'kitchen');
});

test('the companion is ignored when the user turns it off', () => {
  const tracker = new Tracker();
  read(tracker, 'kitchen', 1, T0);
  tracker.apply({ kind: 'companion_state', id: 'phone:a', room: 'Office' }, T0);
  const settings = { ...SETTINGS, useCompanion: false };
  assert.equal(tracker.evaluate('phone:a', T0, settings).room, 'kitchen');
});

test('a node name from its retained topic wins over the companion room name', () => {
  const tracker = new Tracker();
  tracker.apply({ kind: 'node_name', node: 'living_room', name: 'Living room' }, T0);
  tracker.apply({ kind: 'companion_state', id: 'phone:a', room: 'Living Room' }, T0);
  assert.equal(tracker.rooms.get('living_room').name, 'Living room');
});

test('stale readings are dropped, forgotten devices too, the kept ones stay', () => {
  const tracker = new Tracker();
  read(tracker, 'kitchen', 1, T0, 'phone:a');
  read(tracker, 'kitchen', 1, T0, 'phone:b');
  tracker.prune(T0 + 31 * 60_000, (id) => id === 'phone:a');
  assert.deepEqual([...tracker.devices.keys()], ['phone:a']);
  assert.equal(tracker.devices.get('phone:a').readings.size, 0);
});
