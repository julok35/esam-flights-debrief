# Changelog

Versions de l'appli (semver). La version du questionnaire est suivie à part (`questionnaire.json`, champ `version`) ; les deux figurent dans chaque note exportée.

## 1.3.2 - 2026-11-04

- Connexion : le lien de l'e-mail devient la voie principale (Supabase n'ajoute le code à l'e-mail qu'avec un serveur d'envoi personnel). Le champ du code reste disponible pour un e-mail qui en contient un.

## 1.3.1 - 2026-11-04

- Projet Supabase de l'ESAM branché par défaut (`js/config.js`) : sur chaque appareil, il suffit de se connecter avec son adresse e-mail (écran Synchronisation).

## 1.3.0 - 2026-11-04

Cahier des charges v0.2. Questionnaire inchangé (version 2.0).

- Historique des debriefs à l'accueil : recherche sans accents ni majuscules (titre, numéro, textes libres, remarques), filtres par état et par année, tri par date d'intervention ou par dernière modification, résumé de chaque fiche (engagement, apport, quasi-incident).
- Consultation d'une fiche en lecture, sans choisir de rôle : la note affichée en page.
- Statistiques : indicateurs clés (drone engagé, vols avec apport, quasi-incidents, gain de temps, debriefs terminés), debriefs par mois, répartition des réponses de chaque question fermée par phase (lue dans `questionnaire.json`), filtre par année.
- Import groupé de notes Obsidian : plusieurs fichiers .md ou un dossier entier, la version la plus récente de chaque fiche est gardée, bilan affiché. Une note de l'appli sans bloc de reprise est reprise depuis son frontmatter (réponses fermées ; textes libres et remarques non récupérés).
- Synchronisation facultative entre appareils avec Supabase : connexion par code ou lien reçu par e-mail, fiches recopiées dans les deux sens dès que le réseau revient, la plus récente l'emporte, suppressions transmises. Saisie toujours possible hors ligne. Mise en place : `docs/SUPABASE.md` et `supabase/migrations/`.
- Sans connexion, rien ne change : aucune requête ne sort de l'appli.

## 1.2.0 - 2026-10-20

- Espèce préremplie avec « Chien » (espèce la plus courante), modifiable.
- Lieu prérempli avec la position du téléphone à la création de la fiche (degrés décimaux WGS84, par exemple « 45.12346, 5.87654 »), modifiable ; bouton « Utiliser ma position » pour la reprendre. GPS du téléphone uniquement : fonctionne hors réseau, rien n'est envoyé à un service tiers.

## 1.1.0 - 2026-10-20

- Titre de chaque debrief, combiné à partir de la date, du nom des animaux, de l'espèce et du lieu : affiché dans l'en-tête de la fiche, la liste d'accueil, le titre de la note et le champ `titre` du frontmatter.
- Nouveaux champs d'en-tête : nom des animaux (plusieurs, séparés par des virgules), espèce, lieu ; exportés dans le frontmatter (`animaux` en liste, `espece`, `lieu`).
- Questionnaire inchangé (version 2.0) : seules les données d'en-tête s'enrichissent.

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
