# Changelog

Versions de l'appli (semver). La version du questionnaire est suivie à part (`questionnaire.json`, champ `version`) ; les deux figurent dans chaque note exportée.

## 1.0.0 - 2026-10-20

Première version, questionnaire 2.0 (cahier des charges v0.1).

- Debrief à chaud sur un écran (C1 à C5), en touches seulement, bouton « Terminer ».
- Debrief à froid en six phases (Préparation, Mise en place, Vol, Retour, Dérushage, Analyse), avancement par phase.
- Parcours court « non engagé » : C3 à C5 masquées, NE1 et F14 seulement à froid.
- Fiches F7 ouvertes depuis les catégories cochées en C1, bouton « ajouter ».
- Grilles F6 et F8 avec valeurs par défaut ; préremplissage et mise en évidence de F8 depuis C4.
- Rôle choisi à l'ouverture de la fiche : hors pilote, réponses en lecture seule, remarques du second par phase.
- Plusieurs fiches sur l'appareil (IndexedDB, repli localStorage, copie de secours à chaque saisie), suppression confirmée dans la page.
- Note Markdown pour Obsidian : frontmatter YAML pour Dataview, corps par phase, section Données Airdata, bloc de reprise.
- Export : copie, téléchargement du .md, partage natif, avec replis ; reprise d'une note par collage ou fichier .md.
- PWA hors ligne installable, thème clair et sombre (suit le système, bascule manuelle), polices embarquées.
