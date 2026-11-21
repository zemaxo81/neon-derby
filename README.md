# NEON DERBY — Destruction Arena

Jeu de destruction derby 3D jouable dans le navigateur (WebGL / Three.js — aucun plugin, aucun APK).

## Jouer

Ouvrir `index.html` — depuis un serveur statique (GitHub Pages sert parfaitement), ou en double-cliquant le fichier.

- **ZQSD / WASD / Flèches** : conduire
- **Espace** : frein à main (drift)
- **Maj** : nitro
- **P** : pause

## Règles

6 pilotes dans une arène néon. Le dernier qui roule gagne. Les collisions à haute vitesse déforment la carrosserie et infligent des dégâts ; les épaves restent sur la piste comme obstacles. Score : dégâts infligés ×2 (combo), +500 par élimination.

## Tech

- Three.js (vendu dans `three.min.js`, aucune dépendance réseau)
- Physique arcade custom : adhérence latérale, drift, impacts à impulsion, déformation en temps réel des vertices de carrosserie, sauts sur ramps
- IA de pilotes (chasse, esquive du mur, désenlisement, boosts)
- Particules GPU (étincelles, fumée, explosions), audio procédural WebAudio (moteur, crissements, impacts)
