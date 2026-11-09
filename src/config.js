// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with blanks, strings or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// The choices offered by the manifest selects (decimal values cannot go
// through a `number` field: the browser only accepts min + k).
export const MAX_DISTANCE_CHOICES = ['1', '2', '3', '4', '5', '7', '10', '15'];
export const HYSTERESIS_CHOICES = ['0', '0.5', '1', '2'];
export const AWAY_AFTER_CHOICES = ['30', '60', '120', '300', '600'];

export const DEFAULT_CONFIG = {
  broker_url: '',
  username: '',
  password: '',
  tls_insecure: false,
  topic_prefix: 'espresense',
  max_distance: '5',
  hysteresis: '1',
  away_after: '120',
  use_companion: true,
  show_anonymous: false,
  language: 'fr',
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const bool = (value, fallback) =>
  value === true || value === 'true'
    ? true
    : value === false || value === 'false'
      ? false
      : fallback;
const choice = (value, choices, fallback) => {
  const raw = text(String(value ?? ''));
  return choices.includes(raw) ? Number(raw) : Number(fallback);
};

/**
 * The broker address, with its scheme: users type `192.0.2.10`,
 * `192.0.2.10:1883` or a full `mqtt://` / `mqtts://` URL.
 * @returns {string} '' when absent or not a broker URL
 */
export function normalizeBrokerUrl(value) {
  const raw = text(value);
  if (raw === '') {
    return '';
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `mqtt://${raw}`;
  try {
    const url = new URL(withScheme);
    return ['mqtt:', 'mqtts:', 'ws:', 'wss:'].includes(url.protocol) && url.hostname
      ? withScheme
      : '';
  } catch {
    return '';
  }
}

/**
 * The topic prefix of ESPresense (`espresense` unless the firmware was built
 * otherwise or a bridge renames it): no wildcard, no leading or trailing slash.
 */
export function normalizePrefix(value) {
  const raw = text(value).replace(/^\/+|\/+$/g, '');
  return raw === '' || /[#+]/.test(raw) ? DEFAULT_CONFIG.topic_prefix : raw;
}

/**
 * @param {object} [raw] the values received from Gladys
 */
export function normalizeConfig(raw = {}) {
  const source = raw ?? {};
  return {
    broker_url: normalizeBrokerUrl(source.broker_url),
    username: text(source.username),
    // A password may legitimately start or end with a space: kept as typed.
    password: typeof source.password === 'string' ? source.password : '',
    tls_insecure: bool(source.tls_insecure, false),
    topic_prefix: normalizePrefix(source.topic_prefix),
    // Meters.
    max_distance: choice(source.max_distance, MAX_DISTANCE_CHOICES, DEFAULT_CONFIG.max_distance),
    hysteresis: choice(source.hysteresis, HYSTERESIS_CHOICES, DEFAULT_CONFIG.hysteresis),
    // Seconds.
    away_after: choice(source.away_after, AWAY_AFTER_CHOICES, DEFAULT_CONFIG.away_after),
    use_companion: bool(source.use_companion, DEFAULT_CONFIG.use_companion),
    show_anonymous: bool(source.show_anonymous, DEFAULT_CONFIG.show_anonymous),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}

export const isConfigured = (config) => Boolean(config?.broker_url);

/**
 * An address safe for the logs and the messages: no user name, no password,
 * no path or query string.
 */
export function safeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '(invalid address)';
  }
}
