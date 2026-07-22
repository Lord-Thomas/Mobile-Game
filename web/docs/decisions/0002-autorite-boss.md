# 0002 — Autorité du boss : simulation locale par une autorité unique, promouvable serveur

- **Statut** : proposé (juillet 2026) — étend l'[ADR 0001](0001-autorite-reseau.md) pour le combat de boss.
- **Contexte** : ajout d'un Boss Slime partagé (invocation via autel, barre de vie,
  attaques télégraphées, récompense épée). Le jeu se joue **aussi bien en solo**
  (aucune session, aucun serveur : `connectColyseusVisitSession` retourne `null` si
  `role === 'solo'`) **qu'en visite à 2 joueurs**. Les deux transports réseau existants
  (Colyseus `VisitRoom` et Supabase Realtime `session:*`) sont de purs **relais** : ils
  ne simulent rien (cf. ADR 0001).

## Décision

La logique du boss (machine à états, PV, choix d'attaque, positions d'impact, onde de
choc, mort) est un **module de simulation pur, agnostique de l'autorité et du transport** :

- il ne dépend ni de `App()`, ni de React, ni de Colyseus/Supabase ;
- il expose un `tick(dt, inputs)` déterministe et un état sérialisable ;
- il reçoit des *demandes* (ex. « coup porté, N dégâts ») et produit un état à diffuser.

**Une seule autorité fait tourner ce module à un instant donné :**

- **Solo** : le client local est l'autorité (le module tourne dans le navigateur du joueur).
- **Visite à 2 joueurs** : l'**hôte** est l'autorité ; il diffuse l'état du boss dans le
  flux `world-state` existant. L'invité envoie des *demandes* (`boss-hit`) et ne fait que
  **rendre** l'état reçu (position, PV, phase, télégraphes).

## Raison

- **C'est le seul modèle qui rend le boss testable en solo** (pas de serveur en solo) tout
  en restant cohérent en multi. Rendre le serveur Colyseus réellement autoritaire
  n'aiderait pas le solo et supposerait une réécriture lourde de `VisitRoom` (0 simulation
  aujourd'hui).
- **Réutilise `world-state`** (déjà hôte→invités) plutôt que d'inventer une autorité au
  cas par cas — conforme à l'esprit de l'ADR 0001.
- **Promouvable sans réécriture** : le module étant pur, le jour où l'on veut une vraie
  autorité serveur (anti-triche, >2 joueurs), on instancie le *même* module côté serveur
  Colyseus et on route `boss-hit`/`world-state` vers lui. Rien à refaire côté gameplay.

## Conséquences (limites assumées)

- **Triche possible** en multi (comme pour l'économie, cf. ADR 0001) : un invité modifié
  peut sur-déclarer des dégâts. Acceptable en coop à 2 pour la V1.
- **Autorité liée à l'hôte** : si l'hôte se déconnecte pendant le combat, le boss n'a plus
  d'autorité. V1 : le combat se **réinitialise** (boss supprimé, autel redéverrouillé) ;
  pas de migration d'autorité vers l'invité (chantier ultérieur si besoin).
- **Récompense = source de vérité Supabase**, jamais l'état réseau : l'épée est attribuée
  par une RPC **idempotente** (`claim_boss_slime_reward`, miroir de
  `claim_first_mob_defeat_rewards`), une seule fois par joueur, indépendamment de qui a
  porté le coup fatal.

## Réinitialisation du combat

Le boss revient à l'état inactif (supprimé + autel réutilisable + PV plein au prochain
spawn) quand : tous les joueurs meurent / quittent la zone / se déconnectent ; l'hôte se
déconnecte ; le serveur/onglet redémarre ; le boss sort de sa zone de combat.

## Si on veut changer cela plus tard

Écrire une ADR `0003-...` : instancier le module de boss côté serveur Colyseus, faire de
`VisitRoom` l'autorité, router `boss-hit` → serveur et `world-state` boss ← serveur.
Le module de gameplay reste inchangé.
