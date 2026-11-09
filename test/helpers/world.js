// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake MQTT broker the test
// publishes ESPresense messages on, and the integration wired on top through
// registerHandlers — the same wiring as index.js.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';

// The integration logs its lifecycle; keep the test output readable
// (LOG_LEVEL is read on every log call). LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

export const BROKER_URL = 'mqtt://broker.example:1883';
export const CLIENT_ID = 'gladys-espresense-0a1b2c3d';

/**
 * A `mosquitto_sub -F %j` capture: one JSON object per line. The one here
 * comes from the ESPresense-companion tests (Apache 2.0): six nodes hearing a
 * phone that does not move, for 21 seconds.
 */
export function readCapture(name) {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const row = JSON.parse(line);
      return {
        at: Date.parse(row.tst),
        topic: row.topic,
        payload: typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload),
      };
    });
}

/** A reading as the firmware sends it (BleFingerprint::fill). */
export const reading = (id, distance, { name, mac = '0a0000000001' } = {}) =>
  JSON.stringify({
    mac,
    id,
    ...(name ? { name } : {}),
    'rssi@1m': -59,
    rssi: -70,
    rawRssi: -70,
    distance,
    var: 0.12,
    int: 640,
  });

/** Telemetry as the firmware sends it (main.cpp sendTelemetry), anonymized. */
export const telemetry = (ip = '192.0.2.21') =>
  JSON.stringify({
    ip,
    uptime: 3600,
    reset: 'Power on',
    firm: 'esp32',
    rssi: -55,
    ver: 'v4.1.0',
    count: 2,
    adverts: 1200,
    seen: 310,
    reported: 250,
    freeHeap: 120000,
    maxHeap: 60000,
  });

/** A fake broker: mqtt.connect() returning a client the test drives. */
export function createFakeBroker() {
  const broker = {
    clients: [],
    connections: [],
    grantedQos: 0,
    get client() {
      return broker.clients[broker.clients.length - 1];
    },
    connect(url, options) {
      const client = new EventEmitter();
      client.subscriptions = [];
      client.ended = false;
      client.subscribe = (topics, opts, callback) => {
        const list = [].concat(topics);
        client.subscriptions.push(...list);
        callback?.(
          null,
          list.map((topic) => ({ topic, qos: broker.grantedQos })),
        );
      };
      client.publish = () => {
        throw new Error('the integration never publishes');
      };
      client.end = () => {
        client.ended = true;
      };
      broker.clients.push(client);
      broker.connections.push({ url, options });
      return client;
    },
    accept() {
      broker.client.emit('connect');
    },
    send(topic, payload) {
      broker.client.emit('message', topic, Buffer.from(String(payload)));
    },
    drop() {
      broker.client.emit('close');
      broker.client.emit('offline');
    },
  };
  return broker;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array<object>} [options.devices] devices already created in Gladys
 * @param {object} [options.timings]
 */
export async function createWorld({
  config = { broker_url: BROKER_URL },
  devices = [],
  timings,
} = {}) {
  const broker = createFakeBroker();
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    connectMqtt: broker.connect,
    loadClientId: async () => ({ clientId: CLIENT_ID, persisted: true }),
    timings: { discoveryDelayMs: 0, ...timings },
  });
  await gladys.connect();
  await flush();
  return { gladys, broker, app, hub: app.hub };
}

/** Let the pending promise callbacks and zero-delay timers run. */
export const flush = async () => {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

/** Two rooms with a node each, the way the nodes announce themselves. */
export function announceNodes(world, nodes = { living_room: 'Living Room', kitchen: 'Kitchen' }) {
  for (const [id, name] of Object.entries(nodes)) {
    world.broker.send(`espresense/rooms/${id}/status`, 'online');
    world.broker.send(`espresense/rooms/${id}/name`, name);
    world.broker.send(`espresense/rooms/${id}/telemetry`, telemetry());
  }
}

/** Add the discovered device with that external id, as the user would. */
export async function addDiscovered(world, externalId) {
  const device = world.gladys.fake.discoveredDevices.find((d) => d.external_id === externalId);
  if (!device) {
    throw new Error(`${externalId} was not discovered`);
  }
  await world.gladys.fake.deviceCreated(device);
  await flush();
  return device;
}

/** The last published state of a feature. */
export function lastState(world, featureExternalId) {
  const states = world.gladys.fake.states.filter(
    (s) => s.device_feature_external_id === featureExternalId,
  );
  const last = states[states.length - 1];
  return last === undefined ? undefined : (last.text ?? last.state);
}
