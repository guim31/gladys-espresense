// -----------------------------------------------------------------------------
// The MQTT format of ESPresense, as the firmware (main/main.cpp,
// main/BleFingerprint.cpp) and ESPresense-companion (Services/Mqtt/MqttTopics.cs,
// Models/DeviceReport.cs) publish it. `<prefix>` is `espresense`:
//
//   <prefix>/devices/<device id>/<node>   JSON { id, name?, distance, rssi, ... }
//                                         a node heard a device (QoS 0, not
//                                         retained, every few seconds)
//   <prefix>/rooms/<node>/status          "online" / "offline" (retained, LWT)
//   <prefix>/rooms/<node>/telemetry       JSON { ip, uptime, ver, count, ... }
//   <prefix>/rooms/<node>/name            the room name as typed (retained)
//   <prefix>/companion/status             "online" / "offline" (retained, LWT)
//   <prefix>/companion/<device id>        the room the companion computed, by
//                                         its name, or "not_home" (retained)
//
// The node id is the room name "slugified" by the firmware: lower case, every
// run of other characters than [a-z0-9_] turned into one "_", trimmed. The
// companion names its rooms as typed in its config.yaml: the same slug brings
// both to one room.
// -----------------------------------------------------------------------------

export const NOT_HOME = 'not_home';

/** The firmware's slugify() (components/utils/string_utils.cpp). */
export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Ids that change with the MAC rotation or are shared by a whole model:
// a bare MAC, and the fingerprints built from advertisement contents.
const ANONYMOUS = /^(?:[0-9a-f]{12}|(?:ad|md|sd|exp|smarttag|msft):.*)$/i;

/** An id nobody can follow over time (hidden from the Discovery by default). */
export const isAnonymousId = (id) => ANONYMOUS.test(id);

const finite = (value) => {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
};

function json(payload) {
  try {
    const value = JSON.parse(payload.toString());
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** The topics to subscribe to, under one prefix. */
export function subscriptions(prefix) {
  return [
    `${prefix}/devices/+/+`,
    `${prefix}/rooms/+/status`,
    `${prefix}/rooms/+/telemetry`,
    `${prefix}/rooms/+/name`,
    `${prefix}/companion/+`,
  ];
}

const MAX_ID_LENGTH = 200;
const MAX_NAME_LENGTH = 100;

/**
 * One MQTT message, read.
 * @param {string} prefix
 * @param {string} topic
 * @param {Buffer|string} payload
 * @returns {object|null} null for anything else (and for malformed messages)
 */
export function parseMessage(prefix, topic, payload) {
  if (!topic.startsWith(`${prefix}/`)) {
    return null;
  }
  const parts = topic.slice(prefix.length + 1).split('/');
  const [section, id, leaf] = parts;
  if (!id || id.length > MAX_ID_LENGTH) {
    return null;
  }
  if (section === 'devices' && parts.length === 3 && leaf) {
    // A buffered sensor report (devices/<id>/<node>/<report>) has 4 parts.
    const body = json(payload);
    const distance = finite(body?.distance);
    if (distance === null || distance < 0) {
      return null;
    }
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, MAX_NAME_LENGTH) : '';
    return { kind: 'reading', id, node: leaf, distance, name };
  }
  if (section === 'rooms' && parts.length === 3) {
    const text = payload.toString().trim();
    if (leaf === 'status' && (text === 'online' || text === 'offline')) {
      return { kind: 'node_status', node: id, online: text === 'online' };
    }
    if (leaf === 'telemetry' && json(payload)) {
      return { kind: 'telemetry', node: id };
    }
    if (leaf === 'name' && text !== '') {
      return { kind: 'node_name', node: id, name: text.slice(0, MAX_NAME_LENGTH) };
    }
    return null;
  }
  if (section === 'companion' && parts.length === 2) {
    const text = payload.toString().trim();
    if (id === 'status') {
      return text === 'online' || text === 'offline'
        ? { kind: 'companion_status', online: text === 'online' }
        : null;
    }
    if (id === 'telemetry' || text === '') {
      // An empty retained payload clears a forgotten device.
      return text === '' && id !== 'telemetry' ? { kind: 'companion_clear', id } : null;
    }
    return { kind: 'companion_state', id, room: text.slice(0, MAX_NAME_LENGTH) };
  }
  return null;
}
