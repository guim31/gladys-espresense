// -----------------------------------------------------------------------------
// What the nodes heard, and where each device is. Pure: the clock is passed in.
//
// Room of a device, from the nodes (no companion):
//   - a reading counts while it is fresh (READING_FRESH_MS) and under the
//     maximum distance;
//   - the device moves to the nearest node, but leaves the room it is in only
//     for a node closer by more than the hysteresis, or when its room no
//     longer hears it under the maximum distance;
//   - with no valid reading at all, it keeps its room for the away delay, then
//     it is in no room (away).
// With ESPresense-companion online, the room it publishes wins: it already
// trilaterates and debounces. Its room names are brought to node ids by the
// firmware's slug.
// -----------------------------------------------------------------------------

import { NOT_HOME, slugify } from './espresense.js';

export const READING_FRESH_MS = 30_000;
// A device nobody heard for that long is forgotten (memory bound).
export const FORGET_AFTER_MS = 30 * 60_000;
export const MAX_DEVICES = 500;

export class Tracker {
  constructor() {
    /** @type {Map<string, object>} device id -> device */
    this.devices = new Map();
    /** @type {Map<string, object>} room key (node id) -> room */
    this.rooms = new Map();
    /** true / false from its status topic, null before any */
    this.companionOnline = null;
  }

  room(key, now) {
    let room = this.rooms.get(key);
    if (!room) {
      room = { key, name: key, named: false, online: null, lastSeen: now };
      this.rooms.set(key, room);
    }
    return room;
  }

  device(id, now) {
    let device = this.devices.get(id);
    if (!device) {
      if (this.devices.size >= MAX_DEVICES) {
        this.#forgetOldest();
      }
      device = {
        id,
        name: '',
        readings: new Map(),
        room: null,
        roomSince: null,
        lastValidAt: null,
        companionRoom: undefined,
        firstSeen: now,
        lastSeen: now,
      };
      this.devices.set(id, device);
    }
    return device;
  }

  #forgetOldest() {
    let oldest = null;
    for (const device of this.devices.values()) {
      if (!oldest || device.lastSeen < oldest.lastSeen) {
        oldest = device;
      }
    }
    this.devices.delete(oldest.id);
  }

  /** @param {object} message from parseMessage */
  apply(message, now) {
    switch (message.kind) {
      case 'reading': {
        const device = this.device(message.id, now);
        device.lastSeen = now;
        if (message.name) {
          device.name = message.name;
        }
        device.readings.set(message.node, { distance: message.distance, at: now });
        const room = this.room(message.node, now);
        room.lastSeen = now;
        if (room.online === null) {
          room.online = true;
        }
        return;
      }
      case 'node_status':
        this.room(message.node, now).online = message.online;
        if (!message.online) {
          // A node gone (its last will) hears nobody: its last readings go
          // with it, rather than holding a device in its room for 30 s.
          for (const device of this.devices.values()) {
            device.readings.delete(message.node);
          }
        }
        return;
      case 'telemetry': {
        const room = this.room(message.node, now);
        room.lastSeen = now;
        if (room.online === null) {
          room.online = true;
        }
        return;
      }
      case 'node_name': {
        const room = this.room(message.node, now);
        room.name = message.name;
        room.named = true;
        return;
      }
      case 'companion_status':
        this.companionOnline = message.online;
        return;
      case 'companion_state': {
        const device = this.device(message.id, now);
        if (message.room === NOT_HOME) {
          device.companionRoom = null;
          return;
        }
        const key = slugify(message.room);
        if (key === '') {
          return;
        }
        const room = this.room(key, now);
        if (!room.named) {
          room.name = message.room;
        }
        device.companionRoom = key;
        return;
      }
      case 'companion_clear': {
        const device = this.devices.get(message.id);
        if (device) {
          device.companionRoom = undefined;
        }
        return;
      }
      default:
    }
  }

  /** The nearest fresh reading of a device, whatever its distance. */
  nearest(device, now) {
    let best = null;
    for (const [node, reading] of device.readings) {
      if (now - reading.at > READING_FRESH_MS) {
        continue;
      }
      if (!best || reading.distance < best.distance) {
        best = { node, distance: reading.distance };
      }
    }
    return best;
  }

  usesCompanion(device, settings) {
    return (
      settings.useCompanion && this.companionOnline !== false && device.companionRoom !== undefined
    );
  }

  /**
   * Decide the room of a device now.
   * @param {string} id
   * @param {number} now
   * @param {{ maxDistance: number, hysteresis: number, awayMs: number, useCompanion: boolean }} settings
   * @returns {{ room: string|null, changed: boolean, distance: number|null }}
   */
  evaluate(id, now, settings) {
    const device = this.devices.get(id);
    if (!device) {
      return { room: null, changed: false, distance: null };
    }
    const nearest = this.nearest(device, now);
    let next;
    if (this.usesCompanion(device, settings)) {
      next = device.companionRoom;
    } else {
      next = this.#fromNodes(device, now, settings);
    }
    const changed = next !== device.room;
    if (changed) {
      device.room = next;
      device.roomSince = now;
    }
    return { room: device.room, changed, distance: nearest ? nearest.distance : null };
  }

  #fromNodes(device, now, { maxDistance, hysteresis, awayMs }) {
    let best = null;
    let current = null;
    let heardAt = null;
    for (const [node, reading] of device.readings) {
      if (now - reading.at > READING_FRESH_MS || reading.distance > maxDistance) {
        continue;
      }
      heardAt = Math.max(heardAt ?? 0, reading.at);
      if (!best || reading.distance < best.distance) {
        best = { node, distance: reading.distance };
      }
      if (node === device.room) {
        current = reading;
      }
    }
    if (best) {
      device.lastValidAt = Math.max(device.lastValidAt ?? 0, heardAt);
      if (current && best.node !== device.room && best.distance + hysteresis >= current.distance) {
        return device.room;
      }
      return best.node;
    }
    // The away delay counts from the last reading under the maximum.
    if (device.room !== null && device.lastValidAt !== null && now - device.lastValidAt < awayMs) {
      return device.room;
    }
    return null;
  }

  /** Drop the stale readings and the devices nobody heard for long. */
  prune(now, keep = () => false) {
    for (const device of this.devices.values()) {
      for (const [node, reading] of device.readings) {
        if (now - reading.at > READING_FRESH_MS) {
          device.readings.delete(node);
        }
      }
      if (now - device.lastSeen > FORGET_AFTER_MS && !keep(device.id)) {
        this.devices.delete(device.id);
      }
    }
  }
}
