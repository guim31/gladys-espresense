# ESPresense

Room-by-room presence in Gladys with [ESPresense](https://espresense.com/): an
ESP32 in each room measures the Bluetooth distance of your phones, watches
and beacons and publishes it on an MQTT broker. The integration reads that
broker and tells Gladys who is in which room.

> Developed without the hardware, against messages in the exact format of the
> firmware and of ESPresense-companion: feedback welcome.

## What you get

- **One device per tracked phone, watch or beacon**, with its **Room** (the
  room name, or "Away"), **In a room** (yes/no), **Presence** (for the
  "Check user presence" scene action of Gladys) and the **Distance to the
  nearest node** in meters.
- **One device per room**: **Occupied** (yes/no), **Devices in the room**
  (a count) and **Node online** (the ESP32 of the room answers).
- A scene trigger, a scene action and a dashboard widget (below).

Only the devices you add in Gladys count in the rooms.

## Before you start

1. Flash ESPresense on one ESP32 per room (from
   [espresense.com/firmware](https://espresense.com/firmware), in the browser),
   join it to your Wi-Fi and give it its **room name** and the **MQTT broker**.
   The broker installed by Gladys works: its credentials are on the MQTT page
   of Gladys.
2. Make your phones recognizable. A phone changes its Bluetooth address every
   few minutes: turn on a Bluetooth transmitter (the BLE transmitter or the
   iBeacon of the Home Assistant app, for instance) or give ESPresense the
   IRK of an iPhone, then give the device an **alias** such as `phone:alice`
   (see [the ESPresense docs](https://espresense.com/), or the device page of
   ESPresense-companion). Beacons (`iBeacon:…`, `tile:…`)
   have a stable id already.
3. Check in the ESPresense web page of a node (its IP address) that it sees
   your devices.

## ESPresense-companion

[ESPresense-companion](https://github.com/ESPresense/ESPresense-companion) is
an optional service that places each device on a floor plan by trilateration
across all the nodes. When it runs on the same broker, the room it computes
wins over the nearest node (option **Use ESPresense-companion**, checked by
default). If it stops (its last will), the integration goes back to the
nearest node by itself.

Name its rooms like your nodes (`Living Room` and the node `living_room`): the
integration brings both together under the same room. A room only the
companion knows has no **Node online**.

## Configuration

1. **Broker address**: `mqtt://` (port 1883) or `mqtts://` (port 8883), with
   the user name and password if the broker asks for them. The integration
   only subscribes, never publishes.
2. **Topic prefix**: `espresense`, unless your nodes publish elsewhere.
3. **Maximum distance**: farther from every node, a device is in no room.
4. **Margin before changing room**: a device leaves its room only for a node
   closer by more than this margin, so it does not jump between two rooms
   when it sits half-way.
5. **Away after**: how long without any node hearing a device under the
   maximum distance before it is away.
6. **Show anonymous devices**: bare MAC addresses (`0a1b2c3d4e5f`) and
   advertisement fingerprints (`md:…`, `ad:…`, `sd:…`) change or are shared
   by many devices: they are hidden from the Discovery tab unless checked.
7. **Language of the texts**: feature names when a device is added, the
   "Away" text, scene sentences and action messages.

**Check the connection** tells whether the broker answers, how many nodes are
online and how many devices they hear.

## Devices and rooms

Open the **Discovery** tab of the integration: the rooms appear as soon as
their node is online, the devices as soon as a node hears them (those heard
in the last 15 minutes, 100 at most). Add the rooms and the devices you want
to follow. The name of a device comes from its alias (`phone:alice` shows the
name given in the ESPresense settings); rename it in Gladys at will.

The room of a device follows the nearest node that hears it under the
maximum distance, with the margin above, or the room of
ESPresense-companion. Changes reach Gladys within two seconds.

## Presence of a Gladys user

Each tracked device has a **Presence** feature, the one the Bluetooth
presence of Gladys uses: it is "seen" when the device enters a room, then
every 5 minutes while it stays in one. In a scene, the **Check user
presence** action of Gladys links it to a user: pick the user and this
feature, and a delay longer than 5 minutes (10 minutes is a good start). The
user is then marked at home or away like with the other presence sources.

## Scenes

- **Device enters a room** (trigger): a tracked device moved into a room,
  from another room or coming back. Pick the device and the room, or leave
  either empty for any. The following actions read
  `{{triggerEvent.data.device_name}}` and `{{triggerEvent.data.room_name}}`.
- **Where is a device** (action): the room of a tracked device, as a
  sentence ready for a message ("Alice phone is in Kitchen (1.2 m).") and as
  values (`present`, `room`, `distance`).
- "Room empty", "nobody home" or "node offline": use the **Occupied**, **In a
  room** or **Node online** features of the devices in a "device state"
  trigger of Gladys.

## Dashboard

The **ESPresense rooms** widget lists the rooms added to Gladys, occupied
rooms first, with the names of the devices in each (10 rooms at most). The
**Hide empty rooms** setting keeps only the occupied ones.

## Limits

- The integration does not use Bluetooth itself: the nodes do.
- The distance is an estimate from the Bluetooth signal: walls, bodies and
  pockets change it. Calibrate the nodes in ESPresense (`rx_adj_rssi`, the
  1 m reference of each device) before tuning the thresholds here.
- A phone without an alias, an iBeacon or a transmitter app changes its
  address: it cannot be followed.
- No ESP32 was used to develop this integration; it was tested against an
  MQTT broker with the messages of the firmware and of the companion.

## Troubleshooting

- **No room in Discovery**: check the topic prefix and that the nodes use
  the same broker (Check the connection counts them).
- **A device is missing**: it may be anonymous (see the option), or not heard
  in the last 15 minutes.
- **A device switches rooms too often**: raise the margin, or lower the
  maximum distance.
- **Away too soon**: raise **Away after**; a sleeping phone sends less often.
- Detailed logs: set `LOG_LEVEL=debug` on the integration container.
