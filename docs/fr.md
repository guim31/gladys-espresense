# ESPresense

La présence pièce par pièce dans Gladys avec
[ESPresense](https://espresense.com/) : un ESP32 dans chaque pièce mesure la
distance Bluetooth de vos téléphones, montres et balises et la publie sur un
broker MQTT. L'intégration lit ce broker et indique à Gladys qui est dans
quelle pièce.

> Développée sans le matériel, avec des messages au format exact du firmware
> et d'ESPresense-companion : vos retours sont les bienvenus.

## Ce que vous obtenez

- **Un appareil par téléphone, montre ou balise suivi**, avec sa **Pièce**
  (le nom de la pièce, ou « Absent »), **Dans une pièce** (oui/non),
  **Présence** (pour l'action de scène « Vérifier la présence d'un
  utilisateur » de Gladys) et la **Distance au nœud le plus proche** en
  mètres.
- **Un appareil par pièce** : **Occupée** (oui/non), **Appareils dans la
  pièce** (un nombre) et **Nœud en ligne** (l'ESP32 de la pièce répond).
- Un déclencheur de scène, une action de scène et un widget (plus bas).

Seuls les appareils ajoutés dans Gladys comptent dans les pièces.

## Avant de commencer

1. Installez ESPresense sur un ESP32 par pièce (depuis
   [espresense.com/firmware](https://espresense.com/firmware), dans le
   navigateur), connectez-le à votre Wi-Fi et donnez-lui son **nom de pièce**
   et le **broker MQTT**. Le broker installé par Gladys convient : ses
   identifiants sont sur la page MQTT de Gladys.
2. Rendez vos téléphones reconnaissables. Un téléphone change d'adresse
   Bluetooth toutes les quelques minutes : activez un émetteur Bluetooth (le
   « BLE transmitter » ou l'iBeacon de l'application Home Assistant, par
   exemple) ou donnez à ESPresense l'IRK d'un iPhone, puis donnez à
   l'appareil un **alias** comme `phone:alice` (voir
   [la documentation d'ESPresense](https://espresense.com/), ou la page de
   l'appareil dans ESPresense-companion). Les balises (`iBeacon:…`, `tile:…`)
   ont déjà un identifiant stable.
3. Vérifiez sur la page web ESPresense d'un nœud (son adresse IP) qu'il voit
   vos appareils.

## ESPresense-companion

[ESPresense-companion](https://github.com/ESPresense/ESPresense-companion)
est un service facultatif qui place chaque appareil sur un plan par
trilatération entre tous les nœuds. Quand il tourne sur le même broker, la
pièce qu'il calcule prime sur le nœud le plus proche (option **Utiliser
ESPresense-companion**, cochée par défaut). S'il s'arrête (son message de
dernière volonté), l'intégration revient d'elle-même au nœud le plus proche.

Nommez ses pièces comme vos nœuds (`Living Room` et le nœud `living_room`) :
l'intégration les réunit dans la même pièce. Une pièce que seul le companion
connaît n'a pas de **Nœud en ligne**.

## Configuration

1. **Adresse du broker** : `mqtt://` (port 1883) ou `mqtts://` (port 8883),
   avec le nom d'utilisateur et le mot de passe si le broker les demande.
   L'intégration s'abonne seulement, sans jamais publier.
2. **Préfixe des sujets** : `espresense`, sauf si vos nœuds publient
   ailleurs.
3. **Distance maximale** : plus loin de tous les nœuds, un appareil n'est
   dans aucune pièce.
4. **Marge avant de changer de pièce** : un appareil ne quitte sa pièce que
   pour un nœud plus proche d'au moins cette marge, pour ne pas sauter d'une
   pièce à l'autre quand il est entre les deux.
5. **Absent après** : durée sans qu'aucun nœud n'entende un appareil sous la
   distance maximale avant qu'il soit absent.
6. **Afficher les appareils anonymes** : les adresses MAC seules
   (`0a1b2c3d4e5f`) et les empreintes d'annonces (`md:…`, `ad:…`, `sd:…`)
   changent ou sont partagées par beaucoup d'appareils : elles sont masquées
   de l'onglet Découverte sauf si la case est cochée.
7. **Langue des textes** : noms des fonctionnalités à l'ajout d'un appareil,
   texte « Absent », phrases des scènes et messages des actions.

**Vérifier la connexion** indique si le broker répond, combien de nœuds sont
en ligne et combien d'appareils ils entendent.

## Appareils et pièces

Ouvrez l'onglet **Découverte** de l'intégration : les pièces apparaissent dès
que leur nœud est en ligne, les appareils dès qu'un nœud les entend (ceux
entendus dans les 15 dernières minutes, 100 au plus). Ajoutez les pièces et
les appareils à suivre. Le nom d'un appareil vient de son alias
(`phone:alice` affiche le nom donné dans les réglages d'ESPresense) ;
renommez-le dans Gladys à votre guise.

La pièce d'un appareil suit le nœud le plus proche qui l'entend sous la
distance maximale, avec la marge ci-dessus, ou la pièce
d'ESPresense-companion. Les changements arrivent dans Gladys en deux
secondes.

## Présence d'un utilisateur Gladys

Chaque appareil suivi a une fonctionnalité **Présence**, celle qu'utilise la
présence Bluetooth de Gladys : elle est « vue » quand l'appareil entre dans
une pièce, puis toutes les 5 minutes tant qu'il y reste. Dans une scène,
l'action **Vérifier la présence d'un utilisateur** de Gladys la relie à un
utilisateur : choisissez l'utilisateur et cette fonctionnalité, et un délai
de plus de 5 minutes (10 minutes pour commencer). L'utilisateur est alors
marqué à la maison ou absent comme avec les autres sources de présence.

## Scènes

- **Appareil entré dans une pièce** (déclencheur) : un appareil suivi est
  entré dans une pièce, depuis une autre pièce ou en revenant. Choisissez
  l'appareil et la pièce, ou laissez l'un ou l'autre vide pour tous. Les
  actions suivantes lisent `{{triggerEvent.data.device_name}}` et
  `{{triggerEvent.data.room_name}}`.
- **Où est un appareil** (action) : la pièce d'un appareil suivi, en une
  phrase prête pour un message (« Téléphone d'Alice est dans la pièce
  Cuisine (1,2 m). ») et en valeurs (`present`, `room`, `distance`).
- « Pièce vide », « personne à la maison » ou « nœud hors ligne » : utilisez
  les fonctionnalités **Occupée**, **Dans une pièce** ou **Nœud en ligne**
  dans un déclencheur « état d'un appareil » de Gladys.

## Tableau de bord

Le widget **Pièces ESPresense** liste les pièces ajoutées à Gladys, pièces
occupées en tête, avec le nom des appareils qui s'y trouvent (10 pièces au
plus). Le réglage **Masquer les pièces vides** ne garde que les pièces
occupées.

## Limites

- L'intégration n'utilise pas le Bluetooth elle-même : ce sont les nœuds.
- La distance est une estimation tirée du signal Bluetooth : murs, corps et
  poches la modifient. Calibrez les nœuds dans ESPresense (`rx_adj_rssi`, la
  référence à 1 m de chaque appareil) avant de régler les seuils ici.
- Un téléphone sans alias, sans iBeacon ni application émettrice change
  d'adresse : il ne peut pas être suivi.
- Aucun ESP32 n'a servi au développement ; l'intégration a été testée contre
  un broker MQTT avec les messages du firmware et du companion.

## Dépannage

- **Aucune pièce dans la Découverte** : vérifiez le préfixe des sujets et
  que les nœuds utilisent le même broker (Vérifier la connexion les compte).
- **Un appareil manque** : il est peut-être anonyme (voir l'option), ou pas
  entendu dans les 15 dernières minutes.
- **Un appareil change trop souvent de pièce** : augmentez la marge, ou
  baissez la distance maximale.
- **Absent trop tôt** : augmentez **Absent après** ; un téléphone en veille
  émet moins souvent.
- Journaux détaillés : réglez `LOG_LEVEL=debug` sur le conteneur de
  l'intégration.
