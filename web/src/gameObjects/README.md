# Objets du jeu

Ce dossier sert d'espace pour les objets qui pourront etre places ou personnalises dans la piece.

Pour ajouter un objet en V1 :

1. Ajouter son entree dans `placeableObjects.js`.
2. Donner un `id` unique, un `type`, une `position`, une `rotationY`, puis `canMove` / `canRotate`.
3. Ajouter le rendu du nouveau `type` dans `EditableObject` dans `src/App.jsx`.

Exemple :

```js
{
  id: 'lamp_01',
  type: 'lamp',
  position: [1.5, 0, 1],
  rotationY: 0,
  canMove: true,
  canRotate: true,
}
```

Plus tard, ce dossier pourra aussi accueillir un catalogue d'objets achetables, des prix, des tailles de collision, ou des chemins vers des modeles 3D.
