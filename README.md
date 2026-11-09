# ESPresense for Gladys Assistant

Room-by-room presence in [Gladys Assistant](https://gladysassistant.com) from
[ESPresense](https://espresense.com/): ESP32 nodes, one per room, measure the
Bluetooth distance of phones, watches and beacons and publish it on an MQTT
broker. This integration reads that broker (subscribe only) and tells Gladys
who is in which room.

> Developed without the hardware, against messages in the exact format of the
> ESPresense firmware and of ESPresense-companion: feedback welcome.

## Features

- **Tracked devices** (`phone:alice`, `iBeacon:…`, `tile:…`): room (name or
  "Away"), in a room (yes/no), a presence ping for the "Check user presence"
  scene action of Gladys, distance to the nearest node.
- **Rooms**: occupied, number of tracked devices in it, node online (the
  node's last will).
- The room follows the nearest node under a maximum distance, with a margin
  before changing room and a delay before away. When
  [ESPresense-companion](https://github.com/ESPresense/ESPresense-companion)
  runs, its room (trilateration on the floor plan) wins; if it stops, back to
  the nearest node.
- Anonymous ids (bare MAC addresses, advertisement fingerprints) hidden from
  the Discovery tab unless asked.
- Scene trigger **Device enters a room**, scene action **Where is a device**,
  dashboard widget **ESPresense rooms**, action **Check the connection**.
- English, French, German and Spanish.

## Requirements

- Gladys Assistant 5.1 or later.
- ESPresense nodes publishing on an MQTT broker Gladys can reach (the broker
  installed by Gladys works).
- Phones made recognizable by an alias (a BLE transmitter or iBeacon app, or
  the IRK of an iPhone): see the [docs](docs/en.md).

## Installation

In Gladys: **Integrations → Install from GitHub**, with this repository's URL
(`https://github.com/guim31/gladys-espresense`), or from the store once
published. Enter the broker address and credentials in the Configuration tab,
click **Check the connection**, then add the rooms and the devices from the
Discovery tab. The user documentation is in [`docs/`](docs/en.md) (English,
French, German, Spanish).

## Limitations

- The distance is an estimate from the Bluetooth signal; calibrate the nodes
  in ESPresense first.
- A phone that only shows a rotating MAC address cannot be followed.
- Rooms are matched between the nodes and the companion by the firmware's
  slug of their names (`Living Room` = `living_room`).
- No ESP32 was used: the tests replay the firmware's message format and a real
  capture from the ESPresense-companion test suite, and the client was run
  against a real Mosquitto broker.

## Development

Node.js 22+, ESM, no build step. Runtime dependencies:
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
and [`mqtt`](https://github.com/mqttjs/MQTT.js) (MIT).

```bash
npm install
npm test              # node --test, on the SDK's fake Gladys and a fake broker
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store validator
```

```
index.js            SDK wiring (src/app.js registers the handlers)
src/app.js          handlers: discovery, action, scene action, widget, configuration
src/hub.js          MQTT link, discovery, states every 2 s, presence pings, trigger
src/tracker.js      readings -> room of each device (nearest node, margin, away, companion)
src/espresense.js   the ESPresense topics and payloads, the firmware's slug
src/devices.js      tracked and room devices, their features
src/mqtt.js         MQTT client: link states (credentials never logged)
src/scenes.js       "Where is a device" scene action
src/widgets.js      "ESPresense rooms" widget
src/texts.js        every text, in en/fr/de/es
src/clientId.js     stable MQTT client id, kept in /data
test/               node --test; test/fixtures/stationary.jsonp is a real capture
```

`test/gladys-rules.test.js` checks every discovered device against the
category/type table extracted from the Gladys core.

Releases are made by the **Release** workflow (Actions → Release); never edit
the versions by hand. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [ESPresense](https://github.com/ESPresense/ESPresense) (AGPL-3.0) and
  [ESPresense-companion](https://github.com/ESPresense/ESPresense-companion)
  (Apache-2.0) by DTTerastar and contributors: the MQTT format was read from
  their sources; no code of the firmware is included.
- `test/fixtures/stationary.jsonp`: a capture from the ESPresense-companion
  test suite (Apache-2.0).
- Cover: the ESPresense logo (`favicon.svg` of ESPresense-companion,
  Apache-2.0) on its navy background.
- [MQTT.js](https://github.com/mqttjs/MQTT.js) (MIT).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the ESPresense
project.

## License

[Apache-2.0](LICENSE)
