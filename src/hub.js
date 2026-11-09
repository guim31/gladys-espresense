// -----------------------------------------------------------------------------
// The hub: the MQTT client, the tracker and everything Gladys sees from them —
// discovered devices, states, scene events, presence pings, connection status.
//
// Every TICK_MS the devices added in Gladys are placed in a room (tracker.js),
// the rooms counted, and only the changed states published
// (publishChangedStates, with a heartbeat so a steady value never looks
// stale). A device the integration has not heard since it started is left
// alone for the away delay: a restart must not mark everybody away.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isConfigured, safeUrl } from './config.js';
import {
  ROOM_TYPE,
  TRACKED_TYPE,
  buildRoomDevice,
  buildTrackedDevice,
  platformIdOf,
  roomIds,
  roundDistance,
  trackedIds,
} from './devices.js';
import { isAnonymousId, parseMessage, subscriptions } from './espresense.js';
import { createIssueLog } from './issues.js';
import { createClient } from './mqtt.js';
import { AWAY, CHECK_TEXT, MESSAGES, pick } from './texts.js';
import { Tracker } from './tracker.js';

const logger = createLogger({ name: 'espresense-hub' });

export const WIDGET_KEY = 'rooms';
export const TRIGGER = {
  ENTERED_ROOM: 'entered_room',
};

export const DEFAULT_TIMINGS = {
  tickMs: 2_000,
  // A discovery list that changed is sent again after this quiet time.
  discoveryDelayMs: 5_000,
  // Devices heard in that window are offered in the Discovery tab.
  discoveryWindowMs: 15 * 60_000,
  // The "seen" ping of a present device.
  presenceEveryMs: 5 * 60_000,
  // A steady state is published again after that long.
  heartbeatMs: 6 * 60 * 60_000,
  // The distance follows a move of half a meter at once, smaller ones at
  // this pace: the readings jitter by a few decimeters every second.
  distanceEveryMs: 60_000,
};
export const DISTANCE_STEP_M = 0.5;
export const MAX_DISCOVERED = 100;

export class Hub {
  /**
   * @param {object} options
   * @param {object} options.gladys
   * @param {() => number} [options.now]
   * @param {Function} [options.connectMqtt] test seam: mqtt.connect
   * @param {() => Promise<{ clientId: string }>} options.loadClientId
   * @param {object} [options.timings]
   */
  constructor({ gladys, now = () => Date.now(), connectMqtt, loadClientId, timings = {} }) {
    this.gladys = gladys;
    this.now = now;
    this.connectMqtt = connectMqtt;
    this.loadClientId = loadClientId;
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.issues = createIssueLog(logger);
    this.config = null;
    this.client = null;
    this.tracker = new Tracker();
    this.startedAt = now();
    /** @type {Map<string, object>} tracked id -> what was shown { room, distance, distanceAt, presenceAt } */
    this.shown = new Map();
    this.discoveryKey = '';
    this.discoveryTimer = null;
    this.tickTimer = null;
    this.generation = 0;
  }

  // --- lifecycle --------------------------------------------------------------

  async configure(config) {
    // Any newer configuration, even an empty one, cancels a connection still
    // waiting for its client id.
    const generation = ++this.generation;
    const previous = this.config;
    this.config = config;
    const sameLink =
      previous &&
      previous.broker_url === config.broker_url &&
      previous.username === config.username &&
      previous.password === config.password &&
      previous.tls_insecure === config.tls_insecure &&
      previous.topic_prefix === config.topic_prefix;
    if (sameLink && this.client) {
      // Only thresholds, language or Discovery options changed.
      this.discoveryKey = '';
      this.scheduleDiscovery();
      return;
    }
    this.#stopClient();
    this.tracker = new Tracker();
    this.shown.clear();
    this.startedAt = this.now();
    this.discoveryKey = '';
    this.occupantsKey = undefined;
    this.everConnected = false;
    this.outageSince = null;
    if (!isConfigured(config)) {
      await this.#status(false, MESSAGES.notConfigured);
      return;
    }
    const { clientId } = await this.loadClientId();
    if (generation !== this.generation) {
      return;
    }
    logger.info(`Connecting to the MQTT broker ${safeUrl(config.broker_url)}`);
    this.client = createClient({
      url: config.broker_url,
      username: config.username,
      password: config.password,
      clientId,
      tlsInsecure: config.tls_insecure,
      topics: subscriptions(config.topic_prefix),
      onMessage: (topic, payload) => this.onMessage(topic, payload),
      onState: (state, detail) => this.onLinkState(state, detail),
      ...(this.connectMqtt ? { connect: this.connectMqtt } : {}),
    });
    this.#startTick();
  }

  stop() {
    this.generation += 1;
    this.#stopClient();
    clearTimeout(this.discoveryTimer);
    this.discoveryTimer = null;
  }

  #stopClient() {
    this.client?.stop();
    this.client = null;
    clearInterval(this.tickTimer);
    this.tickTimer = null;
  }

  #startTick() {
    clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => {
      this.tick().catch((err) => logger.error(`Update failed: ${err.message}`));
    }, this.timings.tickMs);
    this.tickTimer.unref?.();
  }

  async #status(connected, message) {
    try {
      await this.gladys.setConnectionStatus(connected, message);
    } catch (err) {
      logger.debug(`Connection status not sent (${err.message})`);
    }
  }

  async onLinkState(state, detail) {
    const url = safeUrl(this.config.broker_url);
    if (state === 'connected') {
      if (!this.everConnected) {
        // The startup grace counts from the first connection, not from the
        // configuration: nothing is heard before.
        this.everConnected = true;
        this.startedAt = this.now();
      }
      this.#endOutage();
      logger.info(`Connected to the MQTT broker ${url}`);
      await this.#status(true);
      return;
    }
    this.outageSince ??= this.now();
    logger.warn(`MQTT broker ${url}: ${state} (${detail ?? 'no detail'})`);
    await this.#status(false, state === 'refused' ? MESSAGES.refused : MESSAGES.unreachable);
  }

  /**
   * Back from a broker outage: nobody was heard because nothing was received.
   * The away delay starts again now, so an outage longer than it does not
   * mark everyone away (and fire entered_room for everyone on return).
   */
  #endOutage() {
    if (this.outageSince === null || this.outageSince === undefined) {
      return;
    }
    const now = this.now();
    this.outageSince = null;
    this.startedAt = now;
    for (const device of this.tracker.devices.values()) {
      if (device.lastValidAt !== null) {
        device.lastValidAt = now;
      }
    }
  }

  // --- messages ---------------------------------------------------------------

  onMessage(topic, payload) {
    const message = parseMessage(this.config.topic_prefix, topic, payload);
    if (!message) {
      return;
    }
    const knownRooms = this.tracker.rooms.size;
    const known = message.id ? this.tracker.devices.get(message.id) : null;
    const wasNamed = known?.name ?? '';
    this.tracker.apply(message, this.now());
    const isNewDevice = message.kind === 'reading' && (!known || known.name !== wasNamed);
    if (
      this.tracker.rooms.size !== knownRooms ||
      message.kind === 'node_name' ||
      (isNewDevice && this.#offered(message.id))
    ) {
      this.scheduleDiscovery();
    }
  }

  // --- Gladys devices ---------------------------------------------------------

  /** The ESPresense ids of the tracked devices added in Gladys, with their device. */
  addedTracked() {
    const list = [];
    for (const device of this.gladys.devices ?? []) {
      const id = platformIdOf(this.gladys, device.external_id, TRACKED_TYPE);
      if (id !== null) {
        list.push({ id, device });
      }
    }
    return list;
  }

  /** The room keys of the room devices added in Gladys, with their device. */
  addedRooms() {
    const list = [];
    for (const device of this.gladys.devices ?? []) {
      const key = platformIdOf(this.gladys, device.external_id, ROOM_TYPE);
      if (key !== null) {
        list.push({ key, device });
      }
    }
    return list;
  }

  #offered(id) {
    return this.config.show_anonymous || !isAnonymousId(id);
  }

  discoveredDevices() {
    const now = this.now();
    const language = this.config?.language ?? 'fr';
    const added = new Set(this.addedTracked().map(({ id }) => id));
    const tracked = [...this.tracker.devices.values()]
      .filter(
        (device) =>
          added.has(device.id) ||
          (this.#offered(device.id) && now - device.lastSeen <= this.timings.discoveryWindowMs),
      )
      // Past the cap, the added devices first, then the most recently heard.
      .sort((a, b) => Number(added.has(b.id)) - Number(added.has(a.id)) || b.lastSeen - a.lastSeen)
      .slice(0, MAX_DISCOVERED)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((device) => buildTrackedDevice(this.gladys, device, language));
    const rooms = [...this.tracker.rooms.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((room) =>
        buildRoomDevice(this.gladys, { ...room, node: room.online !== null }, language),
      );
    return [...rooms, ...tracked];
  }

  scheduleDiscovery() {
    if (this.discoveryTimer) {
      return;
    }
    this.discoveryTimer = setTimeout(() => {
      this.discoveryTimer = null;
      this.publishDiscovery().catch(() => {});
    }, this.timings.discoveryDelayMs);
    this.discoveryTimer.unref?.();
  }

  /** The discovered devices; only sent again when the list changed (or forced). */
  async publishDiscovery({ force = false } = {}) {
    if (!this.config) {
      return;
    }
    const devices = this.discoveredDevices();
    const key = JSON.stringify(devices);
    if (!force && key === this.discoveryKey) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discoveryKey = key;
      this.issues.ok('discovery', 'Gladys accepts the discovered devices again');
    } catch (err) {
      this.issues.fail('discovery', `Publishing the discovered devices failed: ${err.message}`);
    }
  }

  // --- states -----------------------------------------------------------------

  #settings() {
    return {
      maxDistance: this.config.max_distance,
      hysteresis: this.config.hysteresis,
      awayMs: this.config.away_after * 1000,
      useCompanion: this.config.use_companion,
    };
  }

  /**
   * Place every added device, count the rooms, publish what changed.
   * @returns {Promise<void>}
   */
  async tick() {
    if (!this.config || !isConfigured(this.config)) {
      return;
    }
    // Without the broker, nothing is heard: keep every state as it is.
    if (this.client?.state !== 'connected') {
      return;
    }
    const now = this.now();
    const settings = this.#settings();
    const language = this.config.language;
    const tracked = this.addedTracked();
    const states = [];
    const events = [];
    const occupants = new Map();
    let pending = false;

    for (const { id, device } of tracked) {
      const known = this.tracker.devices.get(id);
      if (!known && now - this.startedAt < settings.awayMs) {
        pending = true; // not heard since the start yet: wait before saying "away"
        continue;
      }
      const placed = this.tracker.evaluate(id, now, settings);
      const ids = trackedIds(this.gladys, id);
      const room = placed.room === null ? null : this.tracker.rooms.get(placed.room);
      const shown = this.shown.get(id) ?? { room: undefined, distance: null, distanceAt: 0 };
      if (room) {
        occupants.set(room.key, [...(occupants.get(room.key) ?? []), device]);
      }
      if (shown.room !== undefined && shown.room !== placed.room && room) {
        events.push({ device, room });
      }
      if (shown.room !== placed.room && room) {
        shown.presenceAt = undefined; // seen at once on entering a room
      }
      shown.room = placed.room;
      states.push(
        {
          device_feature_external_id: ids.feature('room'),
          text: room ? room.name : AWAY[language],
        },
        { device_feature_external_id: ids.feature('present'), state: room ? 1 : 0 },
      );
      if (placed.distance === null && !room) {
        // Away and heard by nobody: no distance to tell (the last one stays
        // in Gladys, there is no "no value" state).
        shown.distance = null;
      }
      if (placed.distance !== null) {
        const distance = roundDistance(placed.distance);
        if (
          shown.distance === null ||
          Math.abs(distance - shown.distance) >= DISTANCE_STEP_M ||
          (distance !== shown.distance && now - shown.distanceAt >= this.timings.distanceEveryMs)
        ) {
          shown.distance = distance;
          shown.distanceAt = now;
        }
      }
      if (shown.distance !== null) {
        states.push({ device_feature_external_id: ids.feature('distance'), state: shown.distance });
      }
      if (
        room &&
        (shown.presenceAt === undefined || now - shown.presenceAt >= this.timings.presenceEveryMs)
      ) {
        shown.presenceAt = now;
        shown.pingPresence = true;
      }
      this.shown.set(id, shown);
    }

    for (const { key } of this.addedRooms()) {
      const ids = roomIds(this.gladys, key);
      const room = this.tracker.rooms.get(key);
      const count = (occupants.get(key) ?? []).length;
      // A device not placed yet (just after a start) could be in an empty
      // looking room: a room only says "empty" once every device is placed.
      if (!pending || count > 0) {
        states.push(
          { device_feature_external_id: ids.feature('occupied'), state: count > 0 ? 1 : 0 },
          { device_feature_external_id: ids.feature('count'), state: count },
        );
      }
      if (room && room.online !== null) {
        states.push({
          device_feature_external_id: ids.feature('node_online'),
          state: room.online ? 1 : 0,
        });
      }
    }

    this.occupants = occupants;
    await this.#publish(states);
    await this.#pingPresences(tracked);
    for (const event of events) {
      await this.#fireEntered(event);
    }
    if (events.length > 0 || this.#roomsChanged(occupants)) {
      this.requestWidgetRefresh();
    }
    this.tracker.prune(now, (id) => tracked.some((entry) => entry.id === id));
  }

  #roomsChanged(occupants) {
    const key = JSON.stringify(
      [...occupants.entries()].map(([room, list]) => [room, list.map((d) => d.external_id)]).sort(),
    );
    const changed = key !== this.occupantsKey;
    this.occupantsKey = key;
    return changed;
  }

  async #publish(states) {
    // Features not added in Gladys (an old device without node_online…) are
    // filtered out: the core would only drop them.
    const known = new Set(
      (this.gladys.devices ?? []).flatMap((device) =>
        (device.features ?? []).map((feature) => feature.external_id),
      ),
    );
    const kept = states.filter((state) => known.has(state.device_feature_external_id));
    if (kept.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(kept, { heartbeat: this.timings.heartbeatMs });
      this.issues.ok('states', 'Gladys accepts the states again');
    } catch (err) {
      this.issues.fail('states', `Publishing the states failed: ${err.message}`);
    }
  }

  async #pingPresences(tracked) {
    for (const { id } of tracked) {
      const shown = this.shown.get(id);
      if (!shown?.pingPresence) {
        continue;
      }
      shown.pingPresence = false;
      const feature = trackedIds(this.gladys, id).feature('presence');
      const device = tracked.find((entry) => entry.id === id).device;
      if (!(device.features ?? []).some((f) => f.external_id === feature)) {
        continue;
      }
      try {
        await this.gladys.publishState(feature, 1);
      } catch (err) {
        shown.presenceAt = undefined; // try again at the next tick
        this.issues.fail('presence', `Presence ping not sent (${err.message})`);
      }
    }
  }

  async #fireEntered({ device, room }) {
    const roomDevice = this.addedRooms().find((entry) => entry.key === room.key)?.device;
    try {
      await this.gladys.publishSceneEvent(TRIGGER.ENTERED_ROOM, {
        device: device.external_id,
        room: roomIds(this.gladys, room.key).device,
        device_name: device.name ?? '',
        room_name: roomDevice?.name ?? room.name,
      });
      this.issues.ok('scene', 'Gladys accepts the scene events again');
    } catch (err) {
      this.issues.fail('scene', `Firing the scene event failed: ${err.message}`);
    }
  }

  /** Everything again: a device was just added or updated in Gladys. */
  async republish() {
    this.gladys.forgetPublishedStates?.();
    for (const shown of this.shown.values()) {
      shown.presenceAt = undefined;
    }
    await this.tick();
  }

  requestWidgetRefresh() {
    try {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } catch {
      // Fire-and-forget: a refresh lost while disconnected is caught up by the TTL.
    }
  }

  // --- readers for the action, the scene action and the widget ------------------

  /** Where a tracked device is, as last placed. */
  whereIs(externalId) {
    const id = platformIdOf(this.gladys, externalId, TRACKED_TYPE);
    if (id === null) {
      return null;
    }
    const device = this.tracker.devices.get(id);
    const shown = this.shown.get(id);
    const room = device?.room ? this.tracker.rooms.get(device.room) : null;
    const roomDevice = room
      ? this.addedRooms().find((entry) => entry.key === room.key)?.device
      : null;
    return {
      id,
      room: room ? (roomDevice?.name ?? room.name) : null,
      distance: shown?.distance ?? null,
    };
  }

  checkConnection() {
    const text = pick(CHECK_TEXT, this.config?.language);
    if (!isConfigured(this.config)) {
      return text.notConfigured;
    }
    const url = safeUrl(this.config.broker_url);
    const state = this.client?.state ?? null;
    if (state === 'refused') {
      return text.refused;
    }
    if (state === 'unreachable') {
      return text.unreachable;
    }
    if (state !== 'connected') {
      return text.connecting;
    }
    const nodes = [...this.tracker.rooms.values()].filter((room) => room.online !== null);
    if (nodes.length === 0) {
      return text.noNode(url);
    }
    const online = nodes.filter((room) => room.online).length;
    return text.ok(url, nodes.length, online, this.tracker.devices.size);
  }
}
