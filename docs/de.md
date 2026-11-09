# ESPresense

Anwesenheit Raum für Raum in Gladys mit
[ESPresense](https://espresense.com/): Ein ESP32 in jedem Raum misst den
Bluetooth-Abstand deiner Handys, Uhren und Beacons und sendet ihn an einen
MQTT-Broker. Die Integration liest diesen Broker und sagt Gladys, wer in
welchem Raum ist.

> Ohne die Hardware entwickelt, mit Nachrichten im genauen Format der
> Firmware und von ESPresense-companion: Rückmeldungen sind willkommen.

## Was du bekommst

- **Ein Gerät pro verfolgtem Handy, Uhr oder Beacon**, mit seinem **Raum**
  (der Name des Raums oder „Abwesend“), **In einem Raum** (ja/nein),
  **Anwesenheit** (für die Szenen-Aktion „Anwesenheit eines Benutzers
  prüfen“ von Gladys) und dem **Abstand zum nächsten Knoten** in Metern.
- **Ein Gerät pro Raum**: **Belegt** (ja/nein), **Geräte im Raum** (eine
  Zahl) und **Knoten online** (der ESP32 des Raums antwortet).
- Ein Szenen-Auslöser, eine Szenen-Aktion und ein Widget (siehe unten).

Nur die in Gladys hinzugefügten Geräte zählen in den Räumen.

## Bevor du anfängst

1. Installiere ESPresense auf einem ESP32 pro Raum (über
   [espresense.com/firmware](https://espresense.com/firmware), im Browser),
   verbinde ihn mit deinem WLAN und gib ihm seinen **Raumnamen** und den
   **MQTT-Broker**. Der von Gladys installierte Broker geht: Seine
   Zugangsdaten stehen auf der MQTT-Seite von Gladys.
2. Mach deine Handys erkennbar. Ein Handy ändert seine Bluetooth-Adresse alle
   paar Minuten: Schalte einen Bluetooth-Sender ein (zum Beispiel den „BLE
   transmitter“ oder den iBeacon der Home-Assistant-App) oder gib ESPresense
   den IRK eines iPhones, und gib dem Gerät dann einen **Alias** wie
   `phone:alice` (siehe [die Dokumentation von ESPresense](https://espresense.com/)
   oder die Geräteseite von ESPresense-companion). Beacons (`iBeacon:…`,
   `tile:…`) haben schon eine feste Kennung.
3. Prüfe auf der ESPresense-Webseite eines Knotens (seine IP-Adresse), dass
   er deine Geräte sieht.

## ESPresense-companion

[ESPresense-companion](https://github.com/ESPresense/ESPresense-companion)
ist ein optionaler Dienst, der jedes Gerät per Trilateration über alle
Knoten auf einem Grundriss platziert. Läuft er am selben Broker, gilt der
Raum, den er berechnet, statt des nächsten Knotens (Option
**ESPresense-companion nutzen**, standardmäßig aktiv). Hört er auf (seine
Last-Will-Nachricht), kehrt die Integration von selbst zum nächsten Knoten
zurück.

Benenne seine Räume wie deine Knoten (`Living Room` und der Knoten
`living_room`): Die Integration führt beide im selben Raum zusammen. Ein
Raum, den nur der Companion kennt, hat kein **Knoten online**.

## Konfiguration

1. **Adresse des Brokers**: `mqtt://` (Port 1883) oder `mqtts://` (Port
   8883), mit Benutzername und Passwort, falls der Broker sie verlangt. Die
   Integration abonniert nur und veröffentlicht nie.
2. **Topic-Präfix**: `espresense`, außer deine Knoten senden woanders hin.
3. **Höchstabstand**: Weiter weg von allen Knoten ist ein Gerät in keinem
   Raum.
4. **Marge vor dem Raumwechsel**: Ein Gerät verlässt seinen Raum nur für
   einen Knoten, der um mehr als diese Marge näher ist, damit es nicht
   zwischen zwei Räumen hin und her springt, wenn es in der Mitte ist.
5. **Abwesend nach**: Wie lange kein Knoten ein Gerät unter dem
   Höchstabstand hört, bevor es als abwesend gilt.
6. **Anonyme Geräte anzeigen**: Reine MAC-Adressen (`0a1b2c3d4e5f`) und
   Werbe-Fingerabdrücke (`md:…`, `ad:…`, `sd:…`) ändern sich oder werden von
   vielen Geräten geteilt und sind daher im Tab „Erkennung“ versteckt, außer du
   aktivierst die Option.
7. **Sprache der Texte**: Namen der Funktionen beim Hinzufügen eines Geräts,
   der Text „Abwesend“, Szenen-Sätze und Meldungen der Aktionen.

**Verbindung prüfen** zeigt, ob der Broker antwortet, wie viele Knoten online
sind und wie viele Geräte sie hören.

## Geräte und Räume

Öffne den Tab **Erkennung** der Integration: Die Räume erscheinen, sobald ihr
Knoten online ist, die Geräte, sobald ein Knoten sie hört (die in den
letzten 15 Minuten gehörten, höchstens 100). Füge die Räume und die Geräte
hinzu, die du verfolgen willst. Der Name eines Geräts kommt von seinem Alias
(`phone:alice` zeigt den in ESPresense vergebenen Namen); benenne es in
Gladys nach Belieben um.

Der Raum eines Geräts folgt dem nächsten Knoten, der es unter dem
Höchstabstand hört, mit der Marge oben, oder dem Raum von
ESPresense-companion. Änderungen kommen innerhalb von zwei Sekunden in
Gladys an.

## Anwesenheit eines Gladys-Benutzers

Jedes verfolgte Gerät hat eine Funktion **Anwesenheit**, dieselbe wie die
Bluetooth-Anwesenheit von Gladys. Diese Funktion wird „gesehen“, wenn das Gerät einen
Raum betritt, dann alle 5 Minuten, solange es in einem Raum bleibt. In einer
Szene verbindet die Aktion **Anwesenheit eines Benutzers prüfen** von Gladys
sie mit einem Benutzer: Wähle den Benutzer und diese Funktion sowie eine
Wartezeit von mehr als 5 Minuten (10 Minuten für den Anfang). Der Benutzer
wird dann wie mit den anderen Anwesenheitsquellen als zu Hause oder
abwesend markiert.

## Szenen

- **Gerät betritt einen Raum** (Auslöser): Ein verfolgtes Gerät ist in einen
  Raum gekommen, aus einem anderen Raum oder zurück. Wähle das Gerät und den
  Raum, oder lass eines davon leer für alle. Die folgenden Aktionen lesen
  `{{triggerEvent.data.device_name}}` und `{{triggerEvent.data.room_name}}`.
- **Wo ist ein Gerät** (Aktion): Der Raum eines verfolgten Geräts, als Satz
  für eine Nachricht („Handy von Alice ist im Raum Küche (1,2 m).“) und als
  Werte (`present`, `room`, `distance`).
- „Raum leer“, „niemand zu Hause“ oder „Knoten offline“: Nutze die
  Funktionen **Belegt**, **In einem Raum** oder **Knoten online** der Geräte
  in einem Auslöser „Gerätezustand“ von Gladys.

## Dashboard

Das Widget **ESPresense-Räume** listet die zu Gladys hinzugefügten Räume
auf, belegte Räume zuerst, mit den Namen der Geräte darin (höchstens 10
Räume). Die Einstellung **Leere Räume ausblenden** zeigt nur die belegten.

## Grenzen

- Die Integration nutzt selbst kein Bluetooth: Das machen die Knoten.
- Der Abstand ist eine Schätzung aus dem Bluetooth-Signal: Wände, Körper und
  Taschen verändern ihn. Kalibriere die Knoten in ESPresense (`rx_adj_rssi`,
  die 1-m-Referenz jedes Geräts), bevor du hier die Schwellen einstellst.
- Ein Handy ohne Alias, ohne iBeacon und ohne Sender-App ändert seine
  Adresse: Es lässt sich nicht verfolgen.
- Für die Entwicklung wurde kein ESP32 verwendet; die Integration wurde an
  einem MQTT-Broker mit den Nachrichten der Firmware und des Companions
  getestet.

## Fehlerbehebung

- **Kein Raum in der Erkennung**: Prüfe das Topic-Präfix und ob die Knoten
  denselben Broker nutzen („Verbindung prüfen“ zählt sie).
- **Ein Gerät fehlt**: Vielleicht ist es anonym (siehe Option) oder wurde in
  den letzten 15 Minuten nicht gehört.
- **Ein Gerät wechselt zu oft den Raum**: Erhöhe die Marge oder senke den
  Höchstabstand.
- **Zu früh abwesend**: Erhöhe **Abwesend nach**; ein schlafendes Handy
  sendet seltener.
- Ausführliche Logs: Setze `LOG_LEVEL=debug` am Container der Integration.
