// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`).
//
// `where_is` — where a tracked device is now, as a sentence ready for a
// message ("Alice's phone is in the Kitchen (1.2 m).") and as values a scene
// can test: `present`, `room`, `distance`. In the language of the
// configuration (a scene action does not receive the user's). A device in no
// room is an answer, not an error.
// -----------------------------------------------------------------------------

import { pick, WHERE_TEXT } from './texts.js';

export const SCENE_ACTION = {
  WHERE_IS: 'where_is',
};

/**
 * @param {import('./hub.js').Hub} hub
 * @param {{ device?: string }} fields
 */
export function whereIs(hub, fields = {}) {
  const text = pick(WHERE_TEXT, hub.config?.language ?? 'fr');
  const where = hub.whereIs(fields.device);
  const device = (hub.gladys.devices ?? []).find((d) => d.external_id === fields.device);
  if (!where || !device) {
    return { summary: text.unknown, present: false, room: '', distance: 0 };
  }
  const name = device.name || where.id;
  return {
    summary: where.room ? text.inRoom(name, where.room, where.distance) : text.away(name),
    present: where.room !== null,
    room: where.room ?? '',
    distance: where.distance ?? 0,
  };
}
