# Calibrage du débit d'enregistrement (F12)

La question F12 demande au pilote la durée totale de vol, approximative. L'appli en déduit le volume des rushs :

```
volume estimé (Go) = durée (min) x DEBIT_GO_PAR_MIN (Go/min)
```

`DEBIT_GO_PAR_MIN` est défini dans `js/config.js`. Il couvre les 4 flux enregistrés à chaque vol par le M30T (Screen, Wide, Thermal, Zoom). Tant que `DEBIT_A_CALIBRER` vaut `true`, la valeur est **provisoire** (ordre de grandeur, pas une mesure) et l'appli l'indique à côté de chaque estimation (« débit provisoire, à calibrer »), dans l'écran comme dans la note exportée.

## Procédure

À faire après un vol réel ou un vol d'essai d'au moins 10 minutes, avec les réglages d'enregistrement habituels (les 4 flux actifs).

1. **Ne rien effacer** sur la carte SD du M30T avant la mesure.
2. **Taille des fichiers** : insérer la carte dans un ordinateur, ouvrir le dossier `DCIM` et faire la somme des tailles de tous les fichiers du vol (vidéos des 4 flux, fichiers associés compris). Sur Windows : sélectionner les fichiers, clic droit, Propriétés ; sur macOS : Lire les informations ; sous Linux : `du -cb DCIM/<dossier>`. Noter le total en octets ou en Go (1 Go = 1 000 000 000 octets, comme l'affiche l'appli).
3. **Durée de vol** : dans Airdata, ouvrir le ou les vols correspondants et additionner les durées de vol (moteurs en marche). Convertir en minutes.
4. **Débit** : `taille totale (Go) / durée (min)`. Exemple : 52 Go pour 40 min donnent 1,3 Go/min.
5. Refaire la mesure sur 2 ou 3 vols si possible (jour et nuit, zoom plus ou moins utilisé), et retenir la moyenne, arrondie au dixième.

## Mise à jour de l'appli

Dans `js/config.js` :

- remplacer la valeur de `DEBIT_GO_PAR_MIN` ;
- compléter le commentaire : date, vols de référence (numéros Airdata), taille et durée mesurées ;
- passer `DEBIT_A_CALIBRER` à `false`.

Puis incrémenter la version de l'appli (`js/version.js`, `package.json`, cache `V` de `sw.js`, `CHANGELOG.md`) et lancer `npm test`.

Les fiches déjà exportées gardent dans leur frontmatter le débit utilisé (`f12_debit_go_min`) à côté de la durée (`f12_duree_min`) : leur volume peut être recalculé avec le débit mesuré, sans les ressaisir.
