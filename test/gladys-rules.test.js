// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from messages in
// the exact format of the firmware and of the companion (the real capture of
// the companion tests included), in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BROKER_URL,
  announceNodes,
  createWorld,
  flush,
  readCapture,
  reading,
} from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const LANGUAGES = [undefined, 'en', 'de', 'es'];

function checkDevice(device) {
  const where = device.name;
  // should_poll: true if and only if poll_frequency is provided, in ms.
  if (device.poll_frequency === undefined) {
    assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
  } else {
    assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
    assert.ok(
      table.poll_frequencies_ms.includes(device.poll_frequency),
      `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
    );
  }

  assert.ok(device.features.length > 0, `${where}: no feature`);
  const externalIds = new Set();
  const names = new Set();
  for (const feature of device.features) {
    const at = `${where} / ${feature.name}`;
    const pair = table.pairs[`${feature.category}/${feature.type}`];
    assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
    assert.ok(pair.label_en && pair.label_fr && pair.icon, `${at}: couple without label or icon`);

    assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
    assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
    assert.ok(
      Number.isFinite(feature.min) && Number.isFinite(feature.max),
      `${at}: finite min/max`,
    );
    assert.ok(feature.min <= feature.max, `${at}: min > max`);
    assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
    assert.equal(typeof feature.has_feedback, 'boolean', `${at}: has_feedback must be a boolean`);
    if (feature.unit !== undefined) {
      assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
    }

    assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
    externalIds.add(feature.external_id);
    assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
    names.add(feature.name);
  }
}

for (const language of LANGUAGES) {
  test(`every discovered device follows the Gladys rules (${language ?? 'default language, French'})`, async () => {
    const config = {
      broker_url: BROKER_URL,
      show_anonymous: true,
      ...(language ? { language } : {}),
    };
    const world = await createWorld({ config });
    try {
      world.broker.accept();
      announceNodes(world, { living_room: 'Living Room', kitchen: 'Kitchen', n01: 'Office' });
      for (const { topic, payload } of readCapture('stationary.jsonp')) {
        world.broker.send(topic, payload);
      }
      world.broker.send('espresense/devices/md:004c:12/kitchen', reading('md:004c:12', 3));
      world.broker.send('espresense/companion/status', 'online');
      // A room only the companion knows (no node in it).
      world.broker.send('espresense/companion/phone:test', 'Garden Shed');
      await new Promise((resolve) => setTimeout(resolve, 5));
      await flush();
      const devices = world.gladys.fake.discoveredDevices;
      // 3 announced nodes + n02…n06 from the capture + the companion room; 2 devices.
      assert.equal(devices.length, 11, devices.map((d) => d.name).join(', '));
      for (const device of devices) {
        checkDevice(device);
      }
      const shed = devices.find((d) => d.name === 'Garden Shed');
      assert.equal(shed.features.length, 2, 'no node_online without a node');
    } finally {
      world.app.stop();
    }
  });
}
