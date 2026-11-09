# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Room-by-room presence from ESPresense: the integration reads the MQTT broker
  the ESP32 nodes publish to (subscribe only).
- One device per tracked phone, watch or beacon (`phone:alice`, `iBeacon:…`):
  its room, in a room or not, a presence ping for the "Check user presence"
  scene action of Gladys, and the distance to the nearest node.
- One device per room: occupied, number of tracked devices in it, node online
  (its last will).
- The room follows the nearest node under a maximum distance, with a margin
  before changing room and a delay before away; ESPresense-companion's room
  wins when the companion runs.
- Anonymous ids (bare MAC addresses, advertisement fingerprints) hidden from
  the Discovery tab unless asked.
- Scene trigger "Device enters a room", scene action "Where is a device",
  dashboard widget "ESPresense rooms", "Check the connection" action.
- English, French, German and Spanish texts and documentation.

[Unreleased]: https://github.com/guim31/gladys-espresense/commits/main
