// -----------------------------------------------------------------------------
// Quiet logs: nothing at info level for a normal cycle (readings every second,
// a phone walking between rooms), one line when a failure starts and one when
// it ends, never a password.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomIds, trackedIds } from '../src/devices.js';
import { addDiscovered, announceNodes, createWorld, flush, reading } from './helpers/world.js';

const SECOND = 1000;

/** Capture every log line at the given level and above. */
function captureLogs(t, level = 'debug') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => lines.push(args.map(String).join(' '));
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.mock.method(console, 'warn', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}

async function tick(t, ms) {
  t.mock.timers.tick(ms);
  await flush();
}

async function addedWorld(t, config) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_700_000_000_000 });
  const world = await createWorld(config ? { config } : {});
  t.after(() => world.app.stop());
  world.broker.accept();
  announceNodes(world);
  world.broker.send('espresense/devices/phone:alice/kitchen', reading('phone:alice', 1));
  await tick(t, 0);
  for (const id of [
    roomIds(world.gladys, 'kitchen').device,
    trackedIds(world.gladys, 'phone:alice').device,
  ]) {
    await addDiscovered(world, id);
  }
  return world;
}

test('a normal cycle writes nothing at info level', async (t) => {
  const world = await addedWorld(t);
  const lines = captureLogs(t, 'info');
  for (let i = 1; i <= 60; i += 1) {
    const [near, far] = i % 20 < 10 ? ['kitchen', 'living_room'] : ['living_room', 'kitchen'];
    world.broker.send(`espresense/devices/phone:alice/${near}`, reading('phone:alice', 0.8));
    world.broker.send(`espresense/devices/phone:alice/${far}`, reading('phone:alice', 4));
    world.broker.send('espresense/devices/md:004c:12/kitchen', reading('md:004c:12', 2));
    world.broker.send('espresense/rooms/kitchen/telemetry', '{"uptime":1}');
    await tick(t, 2 * SECOND);
  }
  assert.deepEqual(lines, []);
});

test('a broker outage is told once, its end once, without the password', async (t) => {
  const world = await addedWorld(t, {
    broker_url: 'mqtt://alice:hunter2@broker.example:1883',
  });
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 5; i += 1) {
    world.broker.drop();
    world.broker.client.emit('error', new Error('connect ECONNREFUSED'));
    await tick(t, 15 * SECOND);
  }
  world.broker.accept();
  await flush();
  assert.equal(lines.length, 2, lines.join('\n'));
  assert.match(lines[0], /unreachable/);
  assert.match(lines[1], /Connected to the MQTT broker mqtt:\/\/broker\.example:1883/);
  assert.doesNotMatch(lines.join('\n'), /hunter2|alice:/);
});
