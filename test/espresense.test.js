// -----------------------------------------------------------------------------
// The MQTT format of ESPresense: topics, payloads, the firmware's slug and the
// anonymous ids.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAnonymousId, parseMessage, slugify, subscriptions } from '../src/espresense.js';
import { readCapture, reading, telemetry } from './helpers/world.js';

const P = 'espresense';

test('a reading of the firmware is read, with its name and distance', () => {
  assert.deepEqual(
    parseMessage(
      P,
      'espresense/devices/phone:alice/living_room',
      reading('phone:alice', 2.13, { name: 'Alice phone' }),
    ),
    {
      kind: 'reading',
      id: 'phone:alice',
      node: 'living_room',
      distance: 2.13,
      name: 'Alice phone',
    },
  );
});

test('every line of the real companion capture is a reading', () => {
  const capture = readCapture('stationary.jsonp');
  assert.equal(capture.length, 300);
  for (const { topic, payload } of capture) {
    const message = parseMessage(P, topic, payload);
    assert.equal(message?.kind, 'reading', topic);
    assert.equal(message.id, 'phone:test');
    assert.equal(message.name, 'Test Phone');
  }
});

test('node status, telemetry and name; companion status and rooms', () => {
  assert.deepEqual(parseMessage(P, 'espresense/rooms/kitchen/status', 'offline'), {
    kind: 'node_status',
    node: 'kitchen',
    online: false,
  });
  assert.deepEqual(parseMessage(P, 'espresense/rooms/kitchen/telemetry', telemetry()), {
    kind: 'telemetry',
    node: 'kitchen',
  });
  assert.deepEqual(parseMessage(P, 'espresense/rooms/kitchen/name', 'Kitchen'), {
    kind: 'node_name',
    node: 'kitchen',
    name: 'Kitchen',
  });
  assert.deepEqual(parseMessage(P, 'espresense/companion/status', 'online'), {
    kind: 'companion_status',
    online: true,
  });
  assert.deepEqual(parseMessage(P, 'espresense/companion/phone:alice', 'Living Room'), {
    kind: 'companion_state',
    id: 'phone:alice',
    room: 'Living Room',
  });
  assert.deepEqual(parseMessage(P, 'espresense/companion/phone:alice', ''), {
    kind: 'companion_clear',
    id: 'phone:alice',
  });
});

test('what is not ours, or malformed, is ignored', () => {
  for (const [topic, payload] of [
    ['other/devices/phone:a/kitchen', reading('phone:a', 1)],
    ['espresense/devices/phone:a/kitchen', 'not json'],
    ['espresense/devices/phone:a/kitchen', JSON.stringify({ id: 'phone:a' })],
    ['espresense/devices/phone:a/kitchen', JSON.stringify({ distance: -1 })],
    // A buffered sensor report: one more level.
    ['espresense/devices/phone:a/kitchen/report', reading('phone:a', 1)],
    ['espresense/rooms/kitchen/max_distance', '16'],
    ['espresense/rooms/kitchen/status', 'maybe'],
    ['espresense/companion/telemetry', '{"ip":"192.0.2.5"}'],
    ['espresense/companion/phone:a/attributes', '{"x":1}'],
    ['espresense/settings/phone:a/config', '{"id":"phone:a"}'],
  ]) {
    assert.equal(parseMessage(P, topic, payload), null, topic);
  }
});

test('the prefix is configurable', () => {
  assert.equal(parseMessage('home/ble', 'home/ble/rooms/hall/status', 'online').node, 'hall');
  assert.deepEqual(subscriptions('home/ble'), [
    'home/ble/devices/+/+',
    'home/ble/rooms/+/status',
    'home/ble/rooms/+/telemetry',
    'home/ble/rooms/+/name',
    'home/ble/companion/+',
  ]);
});

test('slugify gives the node id the firmware derives from a room name', () => {
  assert.equal(slugify('Living Room'), 'living_room');
  assert.equal(slugify("  Kid's room!"), 'kid_s_room');
  assert.equal(slugify('Séjour'), 's_jour'); // the firmware sees two non-alphanumeric bytes
  assert.equal(slugify('bed_room_2'), 'bed_room_2');
});

test('bare MACs and advertisement fingerprints are anonymous, aliases and beacons are not', () => {
  for (const id of [
    '0a1b2c3d4e5f',
    'md:004c:12',
    'ad:fe9f',
    'sd:0xfd6f',
    'exp:20',
    'msft:cdp:0a09',
  ]) {
    assert.equal(isAnonymousId(id), true, id);
  }
  for (const id of [
    'phone:alice',
    'iBeacon:e2c56db5-dffb-48d2-b060-d0f5a71096e0-1-1',
    'apple:iphone13-2',
    'irk:00112233445566778899aabbccddeeff',
    'tile:0a1b2c3d4e5f',
    'known:0a1b2c3d4e5f',
  ]) {
    assert.equal(isAnonymousId(id), false, id);
  }
});
