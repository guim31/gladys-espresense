// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of Gladys. German
// says "du", Spanish "usted". The language is the one of the configuration
// (a device integration and a scene action do not receive the user's), except
// for the widget, which gets the viewer's.
// -----------------------------------------------------------------------------

export const pick = (table, language) => table[language] ?? table.en;

/** Feature names, frozen when the user adds the device. */
export const FEATURE_NAMES = {
  en: {
    room: 'Room',
    present: 'In a room',
    presence: 'Presence',
    distance: 'Distance to the nearest node',
    occupied: 'Occupied',
    count: 'Devices in the room',
    node_online: 'Node online',
  },
  fr: {
    room: 'Pièce',
    present: 'Dans une pièce',
    presence: 'Présence',
    distance: 'Distance au nœud le plus proche',
    occupied: 'Occupée',
    count: 'Appareils dans la pièce',
    node_online: 'Nœud en ligne',
  },
  de: {
    room: 'Raum',
    present: 'In einem Raum',
    presence: 'Anwesenheit',
    distance: 'Abstand zum nächsten Knoten',
    occupied: 'Belegt',
    count: 'Geräte im Raum',
    node_online: 'Knoten online',
  },
  es: {
    room: 'Habitación',
    present: 'En una habitación',
    presence: 'Presencia',
    distance: 'Distancia al nodo más cercano',
    occupied: 'Ocupada',
    count: 'Dispositivos en la habitación',
    node_online: 'Nodo en línea',
  },
};

/** The `room` text of a device in no room. */
export const AWAY = {
  en: 'Away',
  fr: 'Absent',
  de: 'Abwesend',
  es: 'Ausente',
};

/** Connection status of the integration page. */
export const MESSAGES = {
  notConfigured: {
    en: 'Enter the address of the MQTT broker ESPresense publishes to.',
    fr: "Saisissez l'adresse du broker MQTT où publie ESPresense.",
    de: 'Gib die Adresse des MQTT-Brokers ein, an den ESPresense sendet.',
    es: 'Introduzca la dirección del broker MQTT donde publica ESPresense.',
  },
  unreachable: {
    en: 'The MQTT broker does not answer. Check its address and that it accepts this network.',
    fr: "Le broker MQTT ne répond pas. Vérifiez son adresse et qu'il accepte ce réseau.",
    de: 'Der MQTT-Broker antwortet nicht. Prüfe seine Adresse und ob er dieses Netz zulässt.',
    es: 'El broker MQTT no responde. Compruebe su dirección y que acepte esta red.',
  },
  refused: {
    en: 'The MQTT broker refuses the user name or the password.',
    fr: "Le broker MQTT refuse le nom d'utilisateur ou le mot de passe.",
    de: 'Der MQTT-Broker lehnt den Benutzernamen oder das Passwort ab.',
    es: 'El broker MQTT rechaza el nombre de usuario o la contraseña.',
  },
  publishFailed: {
    en: 'The integration could not start. Restart it from its page.',
    fr: "L'intégration n'a pas pu démarrer. Redémarrez-la depuis sa page.",
    de: 'Die Integration konnte nicht starten. Starte sie auf ihrer Seite neu.',
    es: 'La integración no pudo arrancar. Reiníciela desde su página.',
  },
};

/** The check_connection action. */
export const CHECK_TEXT = {
  en: {
    notConfigured: MESSAGES.notConfigured.en,
    unreachable: MESSAGES.unreachable.en,
    refused: MESSAGES.refused.en,
    connecting: 'Connecting to the broker, try again in a few seconds.',
    noNode: (url) =>
      `Connected to ${url}, but no ESPresense node heard yet: check the topic prefix and that the nodes use this broker.`,
    ok: (url, nodes, online, devices) =>
      `Connected to ${url}: ${nodes} node(s), ${online} online, ${devices} device(s) heard.`,
  },
  fr: {
    notConfigured: MESSAGES.notConfigured.fr,
    unreachable: MESSAGES.unreachable.fr,
    refused: MESSAGES.refused.fr,
    connecting: 'Connexion au broker en cours, réessayez dans quelques secondes.',
    noNode: (url) =>
      `Connecté à ${url}, mais aucun nœud ESPresense entendu : vérifiez le préfixe des sujets et que les nœuds utilisent ce broker.`,
    ok: (url, nodes, online, devices) =>
      `Connecté à ${url} : ${nodes} nœud(s), ${online} en ligne, ${devices} appareil(s) entendu(s).`,
  },
  de: {
    notConfigured: MESSAGES.notConfigured.de,
    unreachable: MESSAGES.unreachable.de,
    refused: MESSAGES.refused.de,
    connecting: 'Verbindung zum Broker läuft, versuch es in ein paar Sekunden erneut.',
    noNode: (url) =>
      `Mit ${url} verbunden, aber noch kein ESPresense-Knoten gehört: Prüfe das Topic-Präfix und ob die Knoten diesen Broker nutzen.`,
    ok: (url, nodes, online, devices) =>
      `Mit ${url} verbunden: ${nodes} Knoten, ${online} online, ${devices} Gerät(e) gehört.`,
  },
  es: {
    notConfigured: MESSAGES.notConfigured.es,
    unreachable: MESSAGES.unreachable.es,
    refused: MESSAGES.refused.es,
    connecting: 'Conectando con el broker, inténtelo de nuevo en unos segundos.',
    noNode: (url) =>
      `Conectado a ${url}, pero ningún nodo ESPresense oído: compruebe el prefijo de los temas y que los nodos usen este broker.`,
    ok: (url, nodes, online, devices) =>
      `Conectado a ${url}: ${nodes} nodo(s), ${online} en línea, ${devices} dispositivo(s) oído(s).`,
  },
};

const formatMeters = (distance, language) =>
  `${distance.toLocaleString(language, { maximumFractionDigits: 1 })} m`;

/** The where_is scene action sentence. */
export const WHERE_TEXT = {
  en: {
    unknown: 'This device is not tracked by ESPresense.',
    inRoom: (name, room, distance) =>
      `${name} is in ${room}` + (distance === null ? '.' : ` (${formatMeters(distance, 'en')}).`),
    away: (name) => `${name} is in no room.`,
  },
  fr: {
    unknown: "Cet appareil n'est pas suivi par ESPresense.",
    inRoom: (name, room, distance) =>
      `${name} est dans la pièce ${room}` +
      (distance === null ? '.' : ` (${formatMeters(distance, 'fr')}).`),
    away: (name) => `${name} n'est dans aucune pièce.`,
  },
  de: {
    unknown: 'Dieses Gerät wird nicht von ESPresense verfolgt.',
    inRoom: (name, room, distance) =>
      `${name} ist im Raum ${room}` +
      (distance === null ? '.' : ` (${formatMeters(distance, 'de')}).`),
    away: (name) => `${name} ist in keinem Raum.`,
  },
  es: {
    unknown: 'Este dispositivo no está seguido por ESPresense.',
    inRoom: (name, room, distance) =>
      `${name} está en ${room}` + (distance === null ? '.' : ` (${formatMeters(distance, 'es')}).`),
    away: (name) => `${name} no está en ninguna habitación.`,
  },
};
