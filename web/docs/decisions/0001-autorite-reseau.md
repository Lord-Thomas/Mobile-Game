# 0001 — Autorité réseau : le serveur Colyseus est un relais, pas une autorité

- **Statut** : accepté (état actuel du code, juin 2026)
- **Contexte** : sessions de visite à 2 joueurs (hôte + invité) via Colyseus
  (`web/server/rooms/VisitRoom.js`), persistance via Supabase (`progressService`).

## Décision

Le serveur Colyseus **ne simule rien** et **ne fait autorité sur rien**. Il :

1. valide la *forme* des messages (sanitizers : positions finies, deltas plafonnés,
   textes tronqués, types de sorts connus) ;
2. relaie ces messages aux autres clients (`broadcast`).

Il ne calcule pas les dégâts, les morts d'ennemis, ni les gains de pièces.
L'**hôte** diffuse l'état du monde (déco maison) via `world-state` ; les ennemis et
le combat sont simulés **localement par chaque client**.

## Raison

- C'est l'état réel du code, pas un objectif théorique : l'assumer évite des
  « corrections » qui casseraient l'existant en croyant rétablir une autorité serveur.
- Suffisant pour un prototype à 2 joueurs où la triche n'est pas (encore) un enjeu.
- La source de vérité durable de l'économie reste **Supabase** (`addPlayerCoins`),
  pas l'état réseau éphémère.

## Conséquences (limites assumées)

- **Triche possible** : un client modifié peut envoyer un `coin-gain` jusqu'à 10 000
  (seul plafond). Tant que ce modèle tient, ne jamais traiter un message réseau comme
  une vérité d'économie côté autres clients.
- **Divergence d'ennemis** : chaque client simule ses propres ennemis (positions, PV,
  morts non partagés). Conséquence directe de l'absence d'autorité serveur sur le combat.
- **Bug connexe identifié** : `applyRemoteCoinGain` (dans `App.jsx`) crédite le
  portefeuille local quand l'AUTRE joueur gagne des pièces — duplication non voulue.
  Voir le test et la tâche de correction associés.

## Si on veut changer cela plus tard

Rendre l'**hôte** autoritaire sur les ennemis/combat : l'invité envoie une *demande*
d'attaque, l'hôte calcule PV/mort/récompense et les diffuse dans `world-state`.
L'invité ne fait que rendre. Écrire une nouvelle ADR (`0002-...`) qui remplace celle-ci.
