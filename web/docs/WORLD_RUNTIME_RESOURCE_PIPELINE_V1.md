# World Runtime & Resource Pipeline V1

Cette V1 vise un monde stable, mesurable et extensible sans modifier la
direction artistique. Toute optimisation visuelle doit rester réversible et
être validée par une comparaison A/B.

## Principes

1. Mesurer séparément CPU, GPU, rendu et ressources avant de transformer une
   zone du monde.
2. Donner un propriétaire explicite à chaque géométrie, matériau, texture,
   squelette et cible de rendu créée dynamiquement.
3. Découper le monde en cellules indépendantes avec hystérésis entre activation,
   sommeil et déchargement.
4. Fixer des budgets par profil matériel et refuser les régressions mesurées.
5. Ne jamais masquer un problème structurel uniquement par une baisse de DPR.

## Étape 1 — observabilité

Le benchmark debug mesure désormais le temps GPU avec
`EXT_disjoint_timer_query_webgl2` lorsqu'il est disponible. Les requêtes sont
asynchrones : aucun appel n'attend le GPU sur le thread principal. Le rapport
indique explicitement si l'extension est indisponible ou si une mesure a été
invalidée par un état « disjoint ».

La même fenêtre enregistre les ressources Three.js :

- compte au début ;
- pic pendant la mesure ;
- compte à la fin ;
- delta début/fin ;
- nombre d'échantillons.

Cette étape ne libère encore aucune ressource. Elle établit la référence qui
permettra de vérifier le futur registre de propriété sans provoquer de double
`dispose()` ni invalider un asset partagé.

## Étape 2 — contrat de propriété

Le futur registre devra distinguer :

- ressources permanentes du monde ;
- ressources partagées et mises en cache ;
- ressources propres à une cellule ;
- ressources transitoires d'effets ou de warmup ;
- ressources externes dont R3F ou un loader conserve la propriété.

Chaque entrée devra posséder une clé stable, un propriétaire, un compteur de
références, une date de dernière utilisation et une politique explicite de
libération. Aucun appel à `dispose()` existant ne sera centralisé avant que ces
propriétés soient connues.

## Étape 3 — cellules du monde

Les cellules seront introduites derrière un drapeau de développement. Une
première expérience portera sur les chemins, sans changer leur aspect : découpe
spatiale, bornes correctes, frustum culling et comparaison avec la référence.
Les arbres, objets de carte, ambiance et herbe suivront uniquement si les
mesures le justifient.

## Critères initiaux

- benchmark reproductible immobile et en déplacement ;
- temps GPU exploitable ou indisponibilité déclarée ;
- P95/P99 CPU et GPU visibles ;
- ressources stables après des cycles maison/extérieur ;
- aucune différence de gameplay ou de rendu non validée ;
- tests, build et graphe d'architecture à jour à chaque étape.
