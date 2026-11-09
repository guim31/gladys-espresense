// -----------------------------------------------------------------------------
// The "ESPresense rooms" dashboard widget: one line per room added in Gladys,
// with who is in it.
//
// Content budget of the core: one `status` list of 10 lines at most (the
// occupied rooms first). A line: the room name given in Gladys, the names of
// the tracked devices in it (as named in Gladys), or "Empty" / "Node offline".
// Pre-localized from the viewer's `language` (the core caches the content
// per settings, language and units).
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { isConfigured } from './config.js';
import { WIDGET_KEY } from './hub.js';
import { pick } from './texts.js';

export const WIDGET = {
  ROOMS: WIDGET_KEY,
};

export const CONTENT_TTL_SECONDS = 30;
export const MAX_LINES = 10;
const MAX_VALUE = 40;

export const TEXT = {
  en: {
    notConfigured: 'Enter the address of the MQTT broker in the integration configuration.',
    noRoom: 'Add the rooms to Gladys first (Discovery tab of the integration).',
    allEmpty: 'Nobody in the rooms.',
    empty: 'Empty',
    offline: 'Node offline',
  },
  fr: {
    notConfigured: "Saisissez l'adresse du broker MQTT dans la configuration de l'intégration.",
    noRoom: "Ajoutez d'abord les pièces à Gladys (onglet Découverte de l'intégration).",
    allEmpty: 'Personne dans les pièces.',
    empty: 'Vide',
    offline: 'Nœud hors ligne',
  },
  de: {
    notConfigured: 'Gib die Adresse des MQTT-Brokers in der Konfiguration der Integration ein.',
    noRoom: 'Füge die Räume zuerst zu Gladys hinzu (Tab „Erkennung“ der Integration).',
    allEmpty: 'Niemand in den Räumen.',
    empty: 'Leer',
    offline: 'Knoten offline',
  },
  es: {
    notConfigured: 'Introduzca la dirección del broker MQTT en la configuración de la integración.',
    noRoom: 'Añada primero las habitaciones a Gladys (pestaña Descubrimiento de la integración).',
    allEmpty: 'Nadie en las habitaciones.',
    empty: 'Vacía',
    offline: 'Nodo fuera de línea',
  },
};

const textContent = (text) => ({
  ttl_seconds: CONTENT_TTL_SECONDS,
  components: [{ type: 'text', variant: 'body', text }],
});

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Pure builder of the widget content.
 * @param {object} input
 * @param {{ name: string, occupants: string[], online: boolean|null }[]} input.rooms
 * @param {boolean} input.hideEmpty
 * @param {string} input.language
 */
export function buildRoomsContent({ rooms, hideEmpty, language }) {
  const text = pick(TEXT, language);
  const lines = [...rooms]
    .filter((room) => !hideEmpty || room.occupants.length > 0)
    .sort(
      (a, b) =>
        Number(b.occupants.length > 0) - Number(a.occupants.length > 0) ||
        a.name.localeCompare(b.name, language),
    )
    .slice(0, MAX_LINES)
    .map((room) => {
      if (room.occupants.length > 0) {
        return {
          label: clip(room.name, 40),
          value: clip(room.occupants.join(', '), MAX_VALUE),
          icon: 'users',
          color: WIDGET_COLORS.SUCCESS,
        };
      }
      const offline = room.online === false;
      return {
        label: clip(room.name, 40),
        value: offline ? text.offline : text.empty,
        icon: offline ? 'wifi-off' : 'home',
        color: offline ? WIDGET_COLORS.DANGER : WIDGET_COLORS.NEUTRAL,
      };
    });
  if (lines.length === 0) {
    return textContent(text.allEmpty);
  }
  return { ttl_seconds: CONTENT_TTL_SECONDS, components: [{ type: 'status', items: lines }] };
}

/**
 * The onWidgetGet handler of the rooms widget.
 * @param {import('./hub.js').Hub} hub
 * @param {{ settings?: object, language?: string }} request
 */
export function getRoomsWidget(hub, { settings = {}, language = 'en' } = {}) {
  const text = pick(TEXT, language);
  if (!isConfigured(hub.config)) {
    return textContent(text.notConfigured);
  }
  const added = hub.addedRooms();
  if (added.length === 0) {
    return textContent(text.noRoom);
  }
  const occupants = hub.occupants ?? new Map();
  const rooms = added.map(({ key, device }) => ({
    name: device.name || key,
    occupants: (occupants.get(key) ?? []).map((d) => d.name || '?'),
    online: hub.tracker.rooms.get(key)?.online ?? null,
  }));
  const hideEmpty = settings.hide_empty === true || settings.hide_empty === 'true';
  return buildRoomsContent({ rooms, hideEmpty, language });
}
