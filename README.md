# Debrief drone ESAM

Formulaire pour débriefer et capitaliser sur les vols drone de l'Équipe de Secours Animalier en Montagne (ESAM), DJI M30T.

- **À chaud**, sur place, en moins de 2 minutes : 5 questions sur un écran, réponses à toucher.
- **À froid**, au calme : six phases (préparation, mise en place, vol, retour, dérushage, analyse), avancement par phase.
- Parcours court quand le drone n'a pas été engagé.
- Rôle choisi à l'ouverture : le pilote répond, les autres rôles (copilote, auxiliaire) ajoutent des remarques.
- **Note Markdown pour Obsidian** : frontmatter YAML pour Dataview, corps lisible, section « Données Airdata » réservée, bloc de reprise pour compléter la fiche sur un autre téléphone.
- Export par copie, fichier .md ou partage natif (vers Obsidian sur Android) ; reprise d'une note par collage ou fichier.
- Installable sur l'écran d'accueil, fonctionne sans réseau après une première ouverture. Aucune donnée ne quitte le téléphone sans export volontaire.

Cahier des charges : [docs/ESAM_CDC_Appli_Debrief_Drone.md](docs/ESAM_CDC_Appli_Debrief_Drone.md).

## Organisation

Site statique sans build, servi tel quel (GitHub Pages), sur le modèle de `julok35/esam-gps`.

| Fichier | Rôle |
| --- | --- |
| `questionnaire.json` | Questionnaire (version 2.0) : phases, questions, options, conditions, préremplissages. Seul fichier à modifier pour le faire évoluer |
| `index.html`, `app.css` | Page et styles (charte ESAM, thème clair et sombre) |
| `js/app.js` | Écrans, navigation, enregistrement automatique, import |
| `js/form.js` | Moteur de formulaire : dessine les questions du questionnaire |
| `js/model.js` | Règles sans DOM : options exclusives, maximum de choix, conditions, F7 depuis C1, grilles, statut |
| `js/markdown.js` | Note Obsidian : frontmatter YAML, corps, bloc de reprise, nom de fichier |
| `js/store.js` | Stockage sur l'appareil (IndexedDB, repli localStorage, copie de secours) |
| `js/exporter.js` | Copie, téléchargement, partage natif, avec replis |
| `sw.js`, `manifest.webmanifest` | Hors ligne et installation |
| `test/` | Tests Node (`node --test`) |
| `e2e/` | Tests Playwright des critères d'acceptation |
| `vendor/fonts/` | Anton et Montserrat (licence SIL OFL 1.1) |

## La note exportée

`Debrief_Drone_AAAA-MM-JJ_<numéro Pat'rouille>.md`

- Titre (`titre` et titre de la note) combiné depuis l'en-tête : date, nom des animaux, espèce, lieu, par exemple « 20/10/2026 - Rex, Max - Chien - Lac Blanc ». Ordre réglé par `titre_fiche` dans `questionnaire.json`.
- Frontmatter : `type: debrief-vol-drone`, `debrief_id`, `questionnaire_version`, `app_version`, `statut`, `titre`, `date`, `patrouille`, `animaux` (liste), `espece`, `lieu`, `date_maj`, `tags`, puis un champ par réponse fermée, dans l'ordre du questionnaire. Valeurs normalisées (`perte-liaison`), listes YAML pour les choix multiples, une clé par ligne de grille (`f8_autonomie`), `f7_incidents` (liste), `f14_issue` (capacité : oui / peut-etre / non). Un champ non renseigné ou masqué est vide.
- Une grille jamais touchée est exportée vide, pour ne pas compter ses valeurs par défaut dans les tableaux de bord ; dès qu'une ligne est saisie (ou préremplie depuis C4), toutes les lignes sont exportées.
- C3 : estimations saisies, `c3_ecart_source: estime` ; `c3_ecart_h_calcule` et `c3_ecart_v_calcule` sont laissés vides pour le calcul fait par Claude après coup.
- Bloc de reprise en fin de note, dans un commentaire Obsidian `%% esam-debrief-data:v1 ... %%` : l'état complet de la fiche (JSON en base64). Ne pas le modifier ; l'import ne lit que lui.

## Développer

```
npm ci
npm start           # http://localhost:8000
npm test            # règles, export, cohérence du dépôt
npm run test:e2e    # Playwright (Chromium)
npm run lint && npm run format:check
```

Le service worker sert l'appli depuis son cache : après une modification, changer la version (voir `CLAUDE.md`) ou cocher « Bypass for network » dans les outils de développement.

## Publication

GitHub Pages, depuis la branche principale, dossier racine (`.nojekyll` présent) : https://julok35.github.io/esam-flights-debrief/ une fois Pages activé dans les réglages du dépôt.
