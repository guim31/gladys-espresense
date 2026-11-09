// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and a fake broker
// carrying messages in the exact format of the firmware and of the companion:
// discovery, states, presence pings, the trigger, the action, the scene action
// and the widget.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildTrackedDevice, roomIds, trackedIds } from '../src/devices.js';
import {
  BROKER_URL,
  addDiscovered,
  announceNodes,
  createWorld,
  flush,
  lastState,
  reading,
} from './helpers/world.js';

const SECOND = 1000;

/** Advance the clock by steps of the tick, letting each tick finish. */
async function advance(t, ms, step = 2 * SECOND) {
  let elapsed = 0;
  do {
    const now = Math.min(step, ms - elapsed);
    t.mock.timers.tick(now);
    await flush();
    elapsed += now;
  } while (elapsed < ms);
}

/** Alice's phone heard by the nodes, at these distances. */
function hear(world, distances, id = 'phone:alice') {
  for (const [node, distance] of Object.entries(distances)) {
    world.broker.send(
      `espresense/devices/${id}/${node}`,
      reading(id, distance, { name: id === 'phone:alice' ? 'Alice phone' : undefined }),
    );
  }
}

/** Two nodes, Alice's phone, both rooms and the phone added to Gladys. */
async function addedWorld(t, options = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const world = await createWorld(options);
  t.after(() => world.app.stop());
  world.broker.accept();
  announceNodes(world);
  hear(world, { living_room: 1.2, kitchen: 4.5 });
  await advance(t, 0);
  await flush();
  const { gladys } = world;
  for (const id of [
    roomIds(gladys, 'living_room').device,
    roomIds(gladys, 'kitchen').device,
    trackedIds(gladys, 'phone:alice').device,
  ]) {
    await addDiscovered(world, id);
  }
  await advance(t, 2 * SECOND);
  return world;
}

const phone = (world, key) => trackedIds(world.gladys, 'phone:alice').feature(key);
const room = (world, key, feature) => roomIds(world.gladys, key).feature(feature);

test('not configured: the integration says so, and connects to nothing', async () => {
  const world = await createWorld({ config: {} });
  try {
    assert.equal(world.broker.clients.length, 0);
    assert.equal(world.gladys.fake.connectionStatus.connected, false);
    assert.equal(world.gladys.fake.connectionStatus.message.fr.includes('broker MQTT'), true);
  } finally {
    world.app.stop();
  }
});

test('the client subscribes to the ESPresense topics, with the credentials apart', async () => {
  const world = await createWorld({
    config: { broker_url: 'mqtt://bob:s3cret@broker.example', topic_prefix: 'home/ble/' },
  });
  try {
    const [{ url, options }] = world.broker.connections;
    assert.equal(url, 'mqtt://broker.example');
    assert.equal(options.username, 'bob');
    assert.equal(options.password, 's3cret');
    world.broker.accept();
    await flush();
    assert.deepEqual(world.broker.client.subscriptions, [
      'home/ble/devices/+/+',
      'home/ble/rooms/+/status',
      'home/ble/rooms/+/telemetry',
      'home/ble/rooms/+/name',
      'home/ble/companion/+',
    ]);
    assert.equal(world.gladys.fake.connectionStatus.connected, true);
  } finally {
    world.app.stop();
  }
});

test('the Discovery offers the rooms and the named devices, not the anonymous ones', async () => {
  const world = await createWorld();
  try {
    world.broker.accept();
    announceNodes(world);
    hear(world, { living_room: 1.2 });
    hear(world, { kitchen: 2 }, 'md:004c:12');
    hear(world, { kitchen: 3 }, '0a1b2c3d4e5f');
    hear(world, { kitchen: 3 }, 'iBeacon:e2c56db5-dffb-48d2-b060-d0f5a71096e0-1-1');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await flush();
    const names = world.gladys.fake.discoveredDevices.map((d) => d.name);
    assert.deepEqual(names, [
      'Kitchen',
      'Living Room',
      'iBeacon:e2c56db5-dffb-48d2-b060-d0f5a71096e0-1-1',
      'Alice phone',
    ]);
    const [kitchen] = world.gladys.fake.discoveredDevices;
    assert.deepEqual(
      kitchen.features.map((f) => f.name),
      ['Occupée', 'Appareils dans la pièce', 'Nœud en ligne'],
    );
    // "Show anonymous devices": offered too.
    await world.gladys.fake.configUpdated({ broker_url: BROKER_URL, show_anonymous: true });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await flush();
    assert.equal(world.gladys.fake.discoveredDevices.length, 6);
    assert.equal(world.broker.clients.length, 1, 'same broker: no reconnection');
  } finally {
    world.app.stop();
  }
});

test('an added phone is placed in the nearest room, the rooms counted', async (t) => {
  const world = await addedWorld(t);
  assert.equal(lastState(world, phone(world, 'room')), 'Living Room');
  assert.equal(lastState(world, phone(world, 'present')), 1);
  assert.equal(lastState(world, phone(world, 'distance')), 1.2);
  assert.equal(lastState(world, phone(world, 'presence')), 1);
  assert.equal(lastState(world, room(world, 'living_room', 'occupied')), 1);
  assert.equal(lastState(world, room(world, 'living_room', 'count')), 1);
  assert.equal(lastState(world, room(world, 'kitchen', 'occupied')), 0);
  assert.equal(lastState(world, room(world, 'kitchen', 'node_online')), 1);
});

test('moving to another room fires entered_room with the room device', async (t) => {
  const world = await addedWorld(t);
  hear(world, { living_room: 4, kitchen: 0.8 });
  await advance(t, 2 * SECOND);
  assert.equal(lastState(world, phone(world, 'room')), 'Kitchen');
  assert.equal(lastState(world, room(world, 'kitchen', 'occupied')), 1);
  assert.equal(lastState(world, room(world, 'living_room', 'occupied')), 0);
  const events = world.gladys.fake.sceneEvents.filter((e) => e.key === 'entered_room');
  assert.deepEqual(events, [
    {
      key: 'entered_room',
      data: {
        device: trackedIds(world.gladys, 'phone:alice').device,
        room: roomIds(world.gladys, 'kitchen').device,
        device_name: 'Alice phone',
        room_name: 'Kitchen',
      },
    },
  ]);
  // Half-way back: within the margin, it stays in the kitchen.
  hear(world, { living_room: 1.2, kitchen: 1.6 });
  await advance(t, 2 * SECOND);
  assert.equal(lastState(world, phone(world, 'room')), 'Kitchen');
});

test('heard by nobody, the phone is away after the delay, and nothing fires', async (t) => {
  const world = await addedWorld(t, { config: { broker_url: BROKER_URL, away_after: '60' } });
  await advance(t, 50 * SECOND);
  assert.equal(lastState(world, phone(world, 'present')), 1);
  await advance(t, 12 * SECOND);
  assert.equal(lastState(world, phone(world, 'present')), 0);
  assert.equal(lastState(world, phone(world, 'room')), 'Absent');
  assert.equal(lastState(world, room(world, 'living_room', 'count')), 0);
  assert.deepEqual(world.gladys.fake.sceneEvents, []);
  // Back: entered_room fires.
  hear(world, { living_room: 1 });
  await advance(t, 2 * SECOND);
  assert.equal(world.gladys.fake.sceneEvents.length, 1);
});

test('the presence ping repeats every 5 minutes while the phone is in a room', async (t) => {
  const world = await addedWorld(t);
  const pings = () =>
    world.gladys.fake.states.filter(
      (s) => s.device_feature_external_id === phone(world, 'presence'),
    ).length;
  assert.equal(pings(), 1);
  for (let i = 0; i < 10; i += 1) {
    hear(world, { living_room: 1.2 });
    await advance(t, 30 * SECOND);
  }
  assert.equal(pings(), 2);
});

test('the distance follows a real move at once, the jitter slowly', async (t) => {
  const world = await addedWorld(t);
  const distances = () =>
    world.gladys.fake.states
      .filter((s) => s.device_feature_external_id === phone(world, 'distance'))
      .map((s) => s.state);
  hear(world, { living_room: 1.3 });
  await advance(t, 2 * SECOND);
  hear(world, { living_room: 1.4 });
  await advance(t, 2 * SECOND);
  assert.deepEqual(distances(), [1.2]);
  hear(world, { living_room: 2.4 });
  await advance(t, 2 * SECOND);
  assert.deepEqual(distances(), [1.2, 2.4]);
});

test('a node that falls (its LWT) shows offline on its room', async (t) => {
  const world = await addedWorld(t);
  world.broker.send('espresense/rooms/kitchen/status', 'offline');
  await advance(t, 2 * SECOND);
  assert.equal(lastState(world, room(world, 'kitchen', 'node_online')), 0);
});

test('with the companion online, its room wins; offline, the nodes again', async (t) => {
  const world = await addedWorld(t);
  world.broker.send('espresense/companion/status', 'online');
  world.broker.send('espresense/companion/phone:alice', 'Kitchen');
  await advance(t, 2 * SECOND);
  assert.equal(lastState(world, phone(world, 'room')), 'Kitchen');
  world.broker.send('espresense/companion/phone:alice', 'not_home');
  await advance(t, 2 * SECOND);
  assert.equal(lastState(world, phone(world, 'present')), 0);
  world.broker.send('espresense/companion/status', 'offline');
  hear(world, { living_room: 1.2 });
  await advance(t, 2 * SECOND);
  assert.equal(lastState(world, phone(world, 'room')), 'Living Room');
});

test('a restart does not mark an added phone away before the delay', async (t) => {
  const first = await addedWorld(t);
  const devices = first.gladys.devices;
  first.app.stop();
  const world = await createWorld({ devices });
  t.after(() => world.app.stop());
  world.broker.accept();
  await advance(t, 30 * SECOND);
  assert.equal(lastState(world, phone(world, 'present')), undefined);
  hear(world, { living_room: 1.2 });
  await advance(t, 2 * SECOND);
  assert.equal(lastState(world, phone(world, 'present')), 1);
  assert.deepEqual(world.gladys.fake.sceneEvents, [], 'the first placement is not an arrival');
});

test('where_is tells the room in a sentence, and an unknown device politely', async (t) => {
  const world = await addedWorld(t);
  const device = trackedIds(world.gladys, 'phone:alice').device;
  const ack = await world.gladys.fake.sceneAction('where_is', { device });
  assert.deepEqual(ack.data.outputs, {
    summary: 'Alice phone est dans la pièce Living Room (1,2 m).',
    present: true,
    room: 'Living Room',
    distance: 1.2,
  });
  const unknown = await world.gladys.fake.sceneAction('where_is', { device: 'ext:other:x' });
  assert.equal(unknown.data.outputs.present, false);
});

test('check_connection counts the nodes and the devices heard', async (t) => {
  const world = await addedWorld(t);
  const ack = await world.gladys.fake.action('check_connection');
  assert.equal(
    ack.data.message,
    'Connecté à mqtt://broker.example:1883 : 2 nœud(s), 2 en ligne, 1 appareil(s) entendu(s).',
  );
});

test('the rooms widget lists who is where, occupied rooms first, valid content', async (t) => {
  const world = await addedWorld(t);
  const renamed = {
    ...world.gladys.devices.find(
      (d) => d.external_id === trackedIds(world.gladys, 'phone:alice').device,
    ),
    name: 'Alice',
  };
  await world.gladys.fake.deviceUpdated(renamed);
  await advance(t, 2 * SECOND);
  const ack = await world.gladys.fake.widgetGet('rooms', { language: 'en' });
  const content = ack.data.content;
  validateWidgetContent(content);
  assert.deepEqual(
    content.components[0].items.map((item) => [item.label, item.value]),
    [
      ['Living Room', 'Alice'],
      ['Kitchen', 'Empty'],
    ],
  );
  const hidden = await world.gladys.fake.widgetGet('rooms', {
    settings: { hide_empty: true },
    language: 'de',
  });
  assert.equal(hidden.data.content.components[0].items.length, 1);
  assert.ok(world.gladys.fake.widgetRefreshes.includes('rooms'));
});

test('the broker refusing the login is told on the integration page', async () => {
  const world = await createWorld();
  try {
    world.broker.client.emit(
      'error',
      Object.assign(new Error('Connection refused: Not authorized'), { code: 5 }),
    );
    await flush();
    assert.equal(world.gladys.fake.connectionStatus.connected, false);
    assert.match(world.gladys.fake.connectionStatus.message.en, /refuses the user name/);
  } finally {
    world.app.stop();
  }
});

test('a broker outage longer than the away delay marks nobody away', async (t) => {
  const world = await addedWorld(t, { config: { broker_url: BROKER_URL, away_after: '60' } });
  world.broker.drop();
  await advance(t, 200 * SECOND);
  assert.equal(lastState(world, phone(world, 'present')), 1);
  world.broker.accept();
  await advance(t, 2 * SECOND);
  hear(world, { living_room: 1.2 });
  await advance(t, 4 * SECOND);
  assert.equal(lastState(world, phone(world, 'present')), 1);
  assert.deepEqual(world.gladys.fake.sceneEvents, []);
});

test('after a restart, the rooms do not look empty before the devices are placed', async (t) => {
  const first = await addedWorld(t);
  const devices = first.gladys.devices;
  first.app.stop();
  const world = await createWorld({ devices });
  t.after(() => world.app.stop());
  world.broker.accept();
  announceNodes(world);
  await advance(t, 4 * SECOND);
  assert.equal(lastState(world, room(world, 'living_room', 'occupied')), undefined);
  hear(world, { living_room: 1.2 });
  await advance(t, 2 * SECOND);
  const occupied = world.gladys.fake.states
    .filter((s) => s.device_feature_external_id === room(world, 'living_room', 'occupied'))
    .map((s) => s.state);
  assert.deepEqual(occupied, [1]);
});

test('an empty configuration saved while connecting cancels that connection', async () => {
  const world = await createWorld({ config: {} });
  try {
    let release;
    world.hub.loadClientId = () => new Promise((resolve) => (release = resolve));
    const pending = world.hub.configure({ ...world.hub.config, broker_url: BROKER_URL });
    await world.hub.configure({ ...world.hub.config, broker_url: '' });
    release({ clientId: 'x' });
    await pending;
    assert.equal(world.hub.client, null);
    assert.equal(world.broker.clients.length, 0);
  } finally {
    world.app.stop();
  }
});

test('after a restart, an occupied room shows at once, an empty one waits', async (t) => {
  const first = await addedWorld(t);
  const devices = [
    ...first.gladys.devices,
    { ...buildTrackedDevice(first.gladys, { id: 'phone:bob', name: 'Bob' }, 'fr') },
  ];
  first.app.stop();
  const world = await createWorld({ devices });
  t.after(() => world.app.stop());
  world.broker.accept();
  announceNodes(world);
  hear(world, { living_room: 1.2 });
  await advance(t, 4 * SECOND);
  assert.equal(lastState(world, room(world, 'living_room', 'occupied')), 1);
  assert.equal(lastState(world, room(world, 'kitchen', 'occupied')), undefined);
  await advance(t, 120 * SECOND);
  assert.equal(lastState(world, room(world, 'kitchen', 'occupied')), 0);
});
