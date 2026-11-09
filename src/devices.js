// -----------------------------------------------------------------------------
// ESPresense -> Gladys devices.
//
// - One "tracked" device per ESPresense device id the user adds (`phone:alice`,
//   `iBeacon:…`, `apple:…`). The id is the one the firmware publishes, stable
//   as long as the alias or the beacon is: percent-encoded in the external id
//   (it holds ":").
//     room       text/text, the room name or "Away";
//     present    presence-sensor/binary, in a room or not (scenes, history);
//     presence   presence-sensor/push, a "seen" ping the core's "Check user
//                presence" scene action reads, as for the Bluetooth presence;
//     distance   distance-sensor/decimal in m, to the nearest node.
// - One "room" device per ESPresense node (its id is the room slug), or per
//   room of the companion:
//     occupied     presence-sensor/binary, at least one tracked device in it;
//     count        counter-sensor/integer, tracked devices in it;
//     node_online  input/binary, the node's status (LWT); absent for a room
//                  only the companion knows.
// Only the devices added in Gladys count in the rooms. Pushed, never polled.
// Feature keys are forever: never renamed.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPE,
  DEVICE_FEATURE_UNITS as UNIT,
} from '@gladysassistant/integration-sdk';
import { FEATURE_NAMES, pick } from './texts.js';

export const TRACKED_TYPE = 'tracked';
export const ROOM_TYPE = 'room';

export const MAX_DISTANCE_M = 50;
export const MAX_COUNT = 100;

const part = (text) => encodeURIComponent(text).replace(/\./g, '%2E');

export const trackedIds = (gladys, id) => gladys.externalIds(TRACKED_TYPE, part(id));
export const roomIds = (gladys, key) => gladys.externalIds(ROOM_TYPE, part(key));

/** The ESPresense id of a tracked device external id, the room key of a room one. */
export function platformIdOf(gladys, externalId, type) {
  const prefix = gladys.externalIds(type, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const rest = externalId.slice(prefix.length);
  if (rest === '' || rest.includes(':')) {
    return null;
  }
  try {
    return decodeURIComponent(rest);
  } catch {
    return null;
  }
}

/** The feature key of a feature external id (`...:room:salon:occupied` -> `occupied`). */
export const featureKeyOf = (externalId) => externalId.slice(externalId.lastIndexOf(':') + 1);

function featureMaker(ids, language) {
  const names = pick(FEATURE_NAMES, language);
  return (key, fields) => ({
    name: names[key],
    external_id: ids.feature(key),
    selector: ids.feature(key),
    read_only: true,
    has_feedback: false,
    ...fields,
  });
}

/**
 * @param {object} gladys
 * @param {{ id: string, name: string }} device
 * @param {string} language
 */
export function buildTrackedDevice(gladys, device, language) {
  const ids = trackedIds(gladys, device.id);
  const feature = featureMaker(ids, language);
  return {
    name: device.name || device.id,
    external_id: ids.device,
    selector: ids.device,
    model: 'ESPresense',
    should_poll: false,
    params: [{ name: 'espresense_id', value: device.id }],
    features: [
      feature('room', { category: CAT.TEXT, type: TYPE.TEXT.TEXT, min: 0, max: 0 }),
      feature('present', {
        category: CAT.PRESENCE_SENSOR,
        type: TYPE.SENSOR.BINARY,
        min: 0,
        max: 1,
      }),
      feature('presence', {
        category: CAT.PRESENCE_SENSOR,
        type: TYPE.SENSOR.PUSH,
        min: 0,
        max: 1,
      }),
      feature('distance', {
        category: CAT.DISTANCE_SENSOR,
        type: TYPE.SENSOR.DECIMAL,
        unit: UNIT.M,
        min: 0,
        max: MAX_DISTANCE_M,
      }),
    ],
  };
}

/**
 * @param {object} gladys
 * @param {{ key: string, name: string, online: boolean|null, node: boolean }} room
 *   `node`: an ESPresense node reports for this room
 * @param {string} language
 */
export function buildRoomDevice(gladys, room, language) {
  const ids = roomIds(gladys, room.key);
  const feature = featureMaker(ids, language);
  const features = [
    feature('occupied', {
      category: CAT.PRESENCE_SENSOR,
      type: TYPE.SENSOR.BINARY,
      min: 0,
      max: 1,
    }),
    feature('count', {
      category: CAT.COUNTER_SENSOR,
      type: TYPE.SENSOR.INTEGER,
      min: 0,
      max: MAX_COUNT,
    }),
  ];
  if (room.node) {
    features.push(
      feature('node_online', { category: CAT.INPUT, type: TYPE.SENSOR.BINARY, min: 0, max: 1 }),
    );
  }
  return {
    name: room.name,
    external_id: ids.device,
    selector: ids.device,
    model: room.node ? 'ESPresense node' : 'ESPresense-companion room',
    should_poll: false,
    params: [{ name: 'espresense_room', value: room.key }],
    features,
  };
}

/** One decimal: what a BLE distance is worth. */
export const roundDistance = (distance) =>
  Math.min(MAX_DISTANCE_M, Math.round(Math.max(0, distance) * 10) / 10);
