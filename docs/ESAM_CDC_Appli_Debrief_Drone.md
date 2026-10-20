---
titre: Cahier des charges - Appli de debrief des vols drone ESAM
version: 0.1
date_maj: 2026-10-19
statut: Brouillon
responsable: Julien de Feydeau
questionnaire_version: 2.0
destinataire: Claude Code (développement)
---

# Cahier des charges : appli de debrief des vols drone ESAM

## 0. Mode d'emploi pour Claude Code

- Ce document est la référence fonctionnelle. Le questionnaire (section 6) a été validé question par question avec le responsable : ne pas ajouter, retirer ou reformuler de question sans validation.
- Les points marqués **[À CONFIRMER]** (section 13) doivent être tranchés avec le responsable avant d'être implémentés. En attendant, appliquer le comportement par défaut indiqué.
- Langue de l'interface, des fichiers produits et des commentaires : français.
- **Règle typographique absolue** : aucun tiret cadratin (U+2014) ni demi-cadratin (U+2013) dans le code, l'interface, les fichiers générés, les noms de fichiers et ce document. Utiliser uniquement le tiret classique (-, U+002D). Un test automatique doit le vérifier (section 11).

## 1. Contexte et objectifs

L'ESAM (Équipe de Secours Animalier en Montagne) utilise un drone DJI M30T (radiocommande RC Plus, batteries TB30, Power 2000) pour rechercher des animaux perdus en montagne.

Les interventions sont gérées dans Pat'rouille, outil interne peu adapté au retour d'expérience (RETEX) des télépilotes. Les logs de vol sont dans Airdata.

L'appli doit permettre un debrief rapide des vols drone, sans ressaisir ce qui existe déjà dans Pat'rouille ou Airdata, et produire une note Markdown pour le vault Obsidian.

Les réponses servent quatre usages, par ordre de priorité :

1. **Sécurité des vols** : faire évoluer la doctrine et la checklist.
2. **Efficacité de la recherche** : technique, questions au requérant, répartition des rôles.
3. **Matériel et financements** : achats, argumentaire auprès des financeurs.
4. **Prospective** : nouveaux usages, tests à réaliser, extension de l'utilité du drone en secours.

## 2. Utilisateurs et contexte d'usage

- **Utilisateurs** : télépilotes ESAM, puis les autres rôles présents au poste drone (copilote, auxiliaire).
- **Qui répond** : le pilote ouvre la fiche et répond à tout. Les autres rôles complètent ensuite en ajoutant des remarques, sans modifier les réponses du pilote.
- **Quand** : en deux temps.
  - **À chaud** : sur place, juste après le vol, en 1 à 2 minutes maximum.
  - **À froid** : plus tard, au calme.
- **Conditions terrain** : smartphone (Android en priorité, iOS à supporter), gants possibles, plein soleil ou nuit, froid, fatigue, réseau souvent absent.

## 3. Périmètre

**Dans le périmètre (v1)**

- Saisie du debrief à chaud et à froid (section 6).
- Gestion de plusieurs fiches sur l'appareil, reprise et complément d'une fiche.
- Export d'une note Markdown compatible Obsidian, et réimport de cette note pour compléter la fiche sur un autre appareil.
- Fonctionnement hors ligne.

**Hors périmètre (v1)**

- Pas de serveur, pas de compte, pas de synchronisation en ligne entre appareils.
- Pas de ressaisie des données Pat'rouille (requérant, animal, chronologie, issue) ni Airdata (vols, durées, trajectoires, batteries par vol, alertes).
- Pas de calcul dans l'appli à partir des logs Airdata : ce post-traitement est fait par Claude, hors appli (section 9).
- Pas de nom de personne : uniquement des rôles.

## 4. Contraintes techniques

- **Application web statique**, hébergée sur GitHub Pages, sur le modèle du dépôt existant `julok35/esam-gps`.
- **PWA hors ligne** : manifest et service worker. Après une première ouverture avec réseau, l'appli doit s'ouvrir et fonctionner entièrement sans réseau, et être installable sur l'écran d'accueil.
- **Pas de framework lourd.** HTML, CSS et JavaScript simples, ou un outillage léger si justifié. Aucune dépendance chargée à l'exécution depuis un CDN : tout est embarqué dans le dépôt pour garantir le hors ligne.
- **Stockage local** : IndexedDB, ou localStorage avec gestion d'erreur. Aucune donnée ne quitte l'appareil, sauf par export volontaire de l'utilisateur.
- **Export** :
  - copie dans le presse-papiers ;
  - téléchargement du fichier .md ;
  - partage natif (Web Share API avec fichier), notamment vers Obsidian sur Android.
  - Chaque méthode doit avoir un repli si elle est indisponible.
- **Charte graphique ESAM** :
  - couleurs : Noir profond #111111, Blanc #FFFFFF, Bleu glacier #AFC8E8, Jaune alpin #FFD400, Rouge signal #E6332A ;
  - polices : Anton pour les titres, Montserrat pour les textes, embarquées localement, avec repli système ;
  - logo : badge rond ESAM, à fournir par le responsable.
- **Thème clair et sombre**, qui suit le réglage du système, avec bascule manuelle.

## 5. Parcours utilisateur

### 5.1 Écran d'accueil

- Liste des fiches enregistrées sur l'appareil. Pour chaque fiche : date, numéro Pat'rouille, statut (à chaud fait, à froid en cours, terminé), dernière modification.
- Actions :
  - nouvelle fiche ;
  - ouvrir ;
  - supprimer, avec confirmation intégrée à la page, sans dialogue natif ;
  - reprendre une note Obsidian, par collage du texte ou ouverture d'un fichier .md.

### 5.2 Debrief à chaud

- Un seul écran, les 5 questions C1 à C5 visibles d'un coup ou en défilement court.
- Réponses à toucher uniquement, sauf le commentaire facultatif de C4. Objectif : moins de 2 minutes.
- Le bouton « Terminer » enregistre la fiche et revient à l'accueil.

### 5.3 Debrief à froid

- Six phases dans l'ordre chronologique : 1. Préparation, 2. Mise en place, 3. Vol, 4. Retour, 5. Dérushage, 6. Analyse.
- Navigation par phase (onglets ou sections repliables), avec un indicateur d'avancement par phase.
- **Lien avec le debrief à chaud** :
  - ce qui a été coché à chaud est déjà ouvert à froid (par exemple une fiche de quasi-incident par catégorie cochée en C1) ;
  - chaque bloc garde un bouton « ajouter » pour ce qui n'a pas été vu sur le moment.
- **Remarques du second** : à la fin de chaque phase, un champ texte avec le choix du rôle (copilote, auxiliaire, autre). Plusieurs remarques possibles par phase.
- **Rôle courant** : l'utilisateur indique son rôle à l'ouverture de la fiche. Si le rôle n'est pas « pilote », les réponses du pilote sont en lecture seule et seules les remarques sont modifiables.

### 5.4 Parcours court « non engagé »

Si « non engagé » est coché en C2 :

- C3, C4 et C5 sont masquées ;
- à froid, seules la question NE1 (section 6.3) et la question F14 sont proposées.

## 6. Questionnaire (version 2.0)

### 6.1 Conventions

- **Choix unique** : une seule option. Toucher l'option sélectionnée la désélectionne.
- **Choix multiple** : plusieurs options. Une option marquée **exclusive** désélectionne toutes les autres, et inversement.
- **Grille** : une valeur par ligne, avec une valeur par défaut. Les valeurs par défaut ne sont pas comptées comme réponses saisies.
- Chaque question a un identifiant stable (C1, F5...), repris dans les données exportées.
- Commentaires libres : texte multiligne, dictée du clavier possible.

### 6.2 En-tête de la fiche

| Champ | Type | Remarque |
|---|---|---|
| Date de l'intervention | Date | Aujourd'hui par défaut |
| Numéro Pat'rouille | Texte | Facultatif à chaud |
| Rôle de la personne qui saisit | Choix unique : pilote, copilote, auxiliaire, autre | Pilote par défaut |
| Version du questionnaire | Automatique | 2.0 |
| Identifiant de fiche | Automatique | Unique, stable, sert à la reprise |

### 6.3 À chaud

**C1. « Y a-t-il eu un moment où le drone aurait pu être perdu ou percuter quelque chose ? »**
- Usage : sécurité des vols.
- Réponse : choix unique oui ou non.
- Si oui, choix multiple : obstacle, perte de liaison, relief, météo, tiers, énergie, humain, autre.
- Effet : une fiche F7 est ouverte à froid pour chaque catégorie cochée.

**C2. « Qu'est-ce que le drone a apporté ? »**
- Usage : efficacité de la recherche, financements, prospective.
- Choix multiple : localisation de l'animal, levée de doute, reconnaissance du terrain, voie d'accès, guidage de l'équipe, surveillance de l'animal, autre.
- Options exclusives : sans apport, non engagé.
- Effet : « non engagé » déclenche le parcours court (5.4).

**C3. Dernier indice reçu avant la localisation**
- Usage : efficacité de la recherche, en particulier la précision des colliers GPS Garmin en montagne.
- Libellé à afficher : « le dernier indice reçu avant la localisation ».
- Source, choix unique : collier GPS, requérant, témoin, autre.
- Écart horizontal, choix unique : moins de 10 m, 10 à 30 m, 30 à 100 m, 100 à 500 m, plus de 500 m.
- Écart vertical, choix unique : moins de 10 m, 10 à 30 m, 30 à 100 m, plus de 100 m.
- Option exclusive : pas d'indice exploitable.
- Les écarts saisis ici sont des estimations de secours. L'écart de référence est calculé par Claude (section 9) quand les coordonnées sont disponibles. Les deux valeurs sont conservées, avec la source de l'écart retenu : calculé ou estimé.
- Condition d'affichage : **[À CONFIRMER]** (section 13, point 1).

**C4. « Qu'est-ce qui t'a le plus manqué avec le matériel actuel ? »**
- Usage : matériel et financements.
- Choix multiple, 2 au maximum : autonomie et énergie, portée et liaison, capteur (infrarouge, zoom, télémètre), écran déporté, protection pluie et froid.
- Option exclusive : rien.
- Plus un commentaire libre.
- Les capacités que l'ESAM ne possède pas encore ne sont pas demandées ici : elles relèvent de F14.

**C5. Énergie restante**
- Usage : matériel et financements.
- Niveau de la Power 2000 : curseur de 0 à 100 % par pas de 10, plus une option « pas emportée ».
- Paires de batteries TB30 encore chargées et opérationnelles : compteur avec + et -, de 0 à 20.
- Le nombre de batteries utilisées n'est pas demandé : il vient d'Airdata.

**NE1. « Pourquoi le drone n'a-t-il pas volé ? »** (uniquement si « non engagé »)
- Choix multiple : météo ; réglementation (zone interdite, hélistation, autorisation) ; matériel indisponible ou en panne ; pas de télépilote disponible ; pas nécessaire ; contre-indiqué (risque pour l'équipe ou l'animal, hélicoptère en vol) ; autre.
- Plus un commentaire libre.

### 6.4 À froid, phase 1 : Préparation

**F1. « Au moment du départ, le matériel était-il prêt et complet ? »**
- Option exclusive : tout était prêt.
- Choix multiple : batteries pas toutes chargées, Power 2000 pas pleine, carte SD pleine ou absente, mise à jour à faire au départ (drone ou radiocommande), élément oublié ou manquant, matériel abîmé ou douteux, autre.
- Commentaire libre.

**F2. « Avant de partir, qu'est-ce qui manquait dans les informations reçues pour préparer le vol ? »**
- Option exclusive : rien, tout était là.
- Choix multiple : coordonnées exploitables (format, conversion), zone de recherche délimitée, accès véhicule et point de rendez-vous, description ou photo de l'animal, présence d'un collier GPS et moyen d'y accéder, contact du requérant sur place, autre.
- Commentaire libre.

**F3. « Ta préparation de pilote a-t-elle pu être faite avant le décollage ? »**
- Choix unique : complète, partielle ou pas faite.
- Si partielle ou pas faite :
  - ce qui manquait, choix multiple : zones aériennes et autorisations, météo, relief et obstacles sur carte, plan de vol ;
  - pourquoi, choix multiple : manque de temps, pas de réseau, outil indisponible, manque d'information, autre.

### 6.5 À froid, phase 2 : Mise en place

**F4. « Depuis le point de décollage, quelle vue directe avais-tu sur la zone de recherche ? »**
- Choix unique : totale, partielle, nulle.
- Si partielle ou nulle, ce qui masquait, choix multiple : crête, forêt, paroi, brouillard ou nuages, autre.

**F5. Choix du point de décollage et repositionnements**
- Objectif : repérer les points de décollage mal choisis ou non choisis, qui provoquent des pertes de liaison quand le relief masque le signal entre la radiocommande et le drone.
- « Comment le point de décollage initial a-t-il été choisi ? », choix unique : choisi en analysant le relief (carte ou terrain), choisi par commodité (parking, accès, proximité de l'équipe), imposé (accès, sécurité, chef d'intervention), pas de choix (décollage là où on est arrivé).
- « T'es-tu repositionné en cours de mission ? », choix unique non ou oui. Si oui :
  - nombre de repositionnements : compteur, à partir de 1 ;
  - pourquoi, choix multiple : perte ou dégradation de la liaison, vue masquée, zone de recherche déplacée, rapprochement de l'animal ou de l'équipe, sécurité, autre ;
  - « Le nouveau point a-t-il résolu le problème ? », choix unique : oui, en partie, non.
- « Avec du recul, un meilleur point initial existait-il ? », choix unique oui ou non, plus un commentaire libre.

**F6. Grille des conditions du poste de pilotage**
- Valeurs : bien, neutre, pas bien. Valeur par défaut : neutre.
- Lignes : accès et portage ; surface de décollage (neige, boue, herbe haute, mouillée) ; pente ou irrégularités ; obstacles (arbres, câbles, rochers autour du point) ; abri (pluie, vent) ; température (pilote et matériel) ; lisibilité de l'écran (soleil, reflets) ; éclairage (nuit, pénombre) ; réseau (RTK, FlightHub) ; tiers.
- Commentaire libre.

### 6.6 À froid, phase 3 : Vol

**F7. Détail de chaque quasi-incident** (une fiche par catégorie cochée en C1, plus le bouton « ajouter »)
- Catégorie : reprise de C1, modifiable.
- Faits : texte libre, sans interprétation.
- Moment, choix unique : décollage, transit, recherche, retour, atterrissage.
- Ce qui a évité l'accident, choix multiple : vigilance du pilote, alerte d'un équipier, RTH automatique, capteurs anticollision, chance, autre.
- Gravité potentielle, choix unique : dommage léger, perte du drone, danger pour une personne.
- Cause immédiate : texte court.
- Cause racine : texte court.

**F8. Grille du matériel**
- Valeurs : bien, neutre, pas bien, non utilisé.
- Lignes et valeur par défaut :
  - infrarouge : non utilisé ;
  - zoom : non utilisé ;
  - télémètre et PinPoint : non utilisé ;
  - liaison vidéo et commande : neutre ;
  - étanchéité : neutre ;
  - hot swap des batteries : neutre ;
  - écran de la RC Plus : neutre ;
  - autonomie : neutre.
- Préremplissage depuis C4 : « autonomie et énergie » met Autonomie à « pas bien » ; « portée et liaison » met Liaison à « pas bien » ; « capteur » met en évidence les trois lignes capteur sans changer leur valeur (**[À CONFIRMER]**, section 13, point 3).
- Si une ligne est à « pas bien », un champ d'observation s'ouvre pour cette ligne.
- Commentaire libre.

**F9. « Qu'est-ce que le drone a changé dans cette intervention ? »**
- Effets, choix multiple : temps gagné, risque évité pour l'équipe ou les cordistes, zone écartée sans y envoyer personne, itinéraire plus sûr ou plus court, stress de l'animal limité, décision prise plus vite (engager, arrêter, changer de zone), autre.
- Gain de temps total, choix unique : aucun, moins de 30 min, 30 min à 1 h, plus de 1 h, impossible à dire.
- Commentaire libre.

**F10. « Le pilote était-il secondé ? »**
- Choix unique : oui ; non, mais ça aurait été préférable ; non, et ce n'était pas indispensable.
- Si oui, libellé « Quelles tâches le second a-t-il couvertes ? ». Si « aurait été préférable », libellé « Quelles tâches auraient dû être couvertes ? ».
- Choix multiple : analyse de l'image (infrarouge, zoom) ; vue directe sur le drone et surveillance de l'espace aérien ; liaison radio avec l'équipe ou la régulation ; gestion des batteries et du hot swap ; navigation (carte, coordonnées, PinPoint) ; gestion des tiers et du requérant ; autre.
- Commentaire libre.

### 6.7 À froid, phase 4 : Retour

**F11. « Au retour, as-tu constaté un dommage ou une anomalie sur le matériel ? »**
- Option exclusive : rien.
- Choix multiple : hélice abîmée, choc ou rayure, humidité ou condensation, batterie anormale (gonflement, chauffe, autonomie), nacelle ou optique, radiocommande, autre.
- Commentaire libre.

### 6.8 À froid, phase 5 : Dérushage

**F12. Volume enregistré par le drone**
- Usage : dimensionner les cartes SD et le futur boîtier de sauvegarde terrain.
- Jauge de 0 à 512 Go, par pas de 8 Go, avec la valeur affichée. Drone uniquement, pas les smartphones.
- Plus le champ « remarques » de la phase.

### 6.9 À froid, phase 6 : Analyse

**F13. « Avec du recul, qu'est-ce qui aurait le plus accéléré la recherche ? »**
- Levier principal, choix unique : information (indice plus tôt ou plus précis, questions au requérant) ; engagement (déclenchement, délai d'arrivée) ; technique de recherche (zone prioritaire, fenêtre horaire) ; matériel (capteur, autonomie, capacité absente) ; organisation (rôles, coordination avec l'équipe au sol) ; rien, la recherche a été menée au mieux.
- Maîtrisable par l'ESAM, choix unique : oui, en partie, non.
- Commentaire libre : ce qui aurait concrètement accéléré.

**F14. Prospective**
- « Quelle capacité, aujourd'hui absente, aurait servi sur cette intervention ? »
- Choix multiple : largage ou treuil, éclairage embarqué, haut-parleur, relais des colliers Garmin, cartographie (photogrammétrie, lidar), livestream vers la régulation, relais radio ou Meshtastic, vol de nuit, second drone, autre.
- Option exclusive : aucune.
- Pour chaque capacité cochée : « aurait-elle changé l'issue ? », choix unique oui, peut-être, non.
- Test ou nouvel usage à essayer : texte libre.

## 7. Données et export

### 7.1 Note Markdown

- **Nom de fichier** : `Debrief_Drone_AAAA-MM-JJ_<numéro Pat'rouille>.md`, sans accents ni espaces.
- **Frontmatter YAML**, pensé pour Dataview :
  - un champ par réponse fermée ;
  - des listes YAML pour les choix multiples ;
  - des valeurs normalisées en minuscules sans accents, par exemple `perte-liaison` (le libellé affiché reste accentué) ;
  - plus les champs `type: debrief-vol-drone`, `debrief_id`, `questionnaire_version`, `statut`, `date_maj`, `tags: [esam/debrief-drone]`.
- **Corps** : une section par phase (À chaud, puis phases 1 à 6), en phrases courtes ou en tableaux. Les grilles sont rendues en tableau. Les remarques du second apparaissent avec leur rôle.
- **Section réservée « Données Airdata »**, vide, complétée par Claude (section 9).
- **Bloc de données de reprise**, en fin de note, dans un commentaire Obsidian `%% ... %%` : l'état complet de la fiche en JSON encodé en base64. Il permet de réimporter la fiche exactement.

### 7.2 Reprise et complément

- L'import d'une note relit uniquement le bloc de données. Si `debrief_id` existe déjà sur l'appareil, l'utilisateur choisit entre remplacer la fiche et l'ignorer.
- Le scénario multi-rôles fonctionne sans serveur :
  1. le pilote exporte la note ;
  2. le second l'importe sur son téléphone, ajoute ses remarques et réexporte ;
  3. la note dans Obsidian est remplacée.

### 7.3 Compatibilité avec le prototype

Un prototype (`Debrief_Drone_ESAM.html`, v1.1, questionnaire antérieur) existe. Il peut servir de référence pour l'interface et l'export, mais son questionnaire est obsolète. Aucune migration de ses fiches n'est demandée.

## 8. Interface

- Cibles tactiles de 48 px minimum, contraste élevé, texte de 16 px minimum.
- Choix unique et choix multiple sous forme de boutons-pastilles plutôt que de listes déroulantes. Une pastille sélectionnée doit être lisible au soleil comme de nuit.
- Grilles : une ligne par élément, trois ou quatre boutons segmentés.
- Enregistrement automatique à chaque modification, avec l'heure du dernier enregistrement affichée.
- Aucun dialogue natif (`alert`, `confirm`, `prompt`) : toutes les confirmations sont intégrées à la page.
- Affichage conditionnel sans saut de mise en page brutal.

## 9. Post-traitement par Claude (hors appli)

Ces traitements sont faits par Claude à partir des notes exportées. L'appli doit seulement produire des données exploitables pour eux.

1. **Écarts C3** : calcul de l'écart horizontal et vertical entre les coordonnées de l'indice et celles de l'animal, quand elles sont disponibles. Sources possibles : coordonnées reçues par la régulation ou lues avec esam-gps, photo PinPoint, photo géolocalisée prise sur place. Écriture dans la note avec `ecart_source: calcule`. Sinon, l'estimation saisie est conservée avec `ecart_source: estime`.
2. **Section Données Airdata** : vols, durées, distance maximale, hauteur maximale, batteries utilisées, alertes.
3. **Agrégation** : tableaux de bord Dataview sur l'ensemble des fiches (fréquence des quasi-incidents par catégorie, points de décollage subis contre choisis, manques récurrents, capacités demandées, volumes enregistrés).
4. **Revue du questionnaire** après 5 debriefs : identifier les questions qui reçoivent toujours la même réponse et celles qui ont fait émerger une action.

## 10. Exigences non fonctionnelles

- **Hors ligne** : toutes les fonctions sauf la première installation.
- **Performance** : ouverture en moins de 2 secondes sur un smartphone récent, saisie sans latence perceptible.
- **Compatibilité** : Chrome Android (cible principale : Samsung Galaxy S24 Ultra), Safari iOS récent.
- **Robustesse** : aucune perte de saisie en cas de fermeture de l'onglet, de mise en veille ou de batterie faible.
- **Confidentialité** : aucune donnée envoyée à un service tiers, aucun outil d'analyse d'audience.
- **Accessibilité** : focus visible, libellés associés aux champs, respect de `prefers-reduced-motion`.

## 11. Critères d'acceptation

Tests automatisés (Playwright, navigateur Chromium) au minimum :

1. Le debrief à chaud complet (C1 à C5) se remplit en 15 touches au plus pour un cas avec un quasi-incident.
2. Cocher « non engagé » masque C3 à C5 et réduit le debrief à froid à NE1 et F14.
3. Une option exclusive désélectionne les autres options de sa question, et inversement.
4. C4 refuse un troisième choix.
5. Une catégorie cochée en C1 ouvre une fiche F7 correspondante à froid ; le bouton « ajouter » crée une fiche F7 vide.
6. Les grilles F6 et F8 ont les bonnes valeurs par défaut ; le préremplissage depuis C4 fonctionne.
7. En rôle autre que pilote, les réponses du pilote sont en lecture seule et les remarques sont modifiables.
8. Export puis réimport sur un navigateur vierge : la fiche est restituée à l'identique.
9. Le frontmatter exporté est du YAML valide et contient tous les champs prévus.
10. Hors ligne, après une première visite : l'appli s'ouvre, enregistre et exporte.
11. Aucun caractère U+2014 ni U+2013 dans les sources du dépôt ni dans une note exportée.

## 12. Livrables et organisation

- **Dépôt GitHub** dédié, nom **[À CONFIRMER]** (section 13, point 4), publié sur GitHub Pages.
- Un fichier `CLAUDE.md` à la racine qui reprend les règles de ce document : langue, typographie, charte, pas de dépendance CDN.
- Le questionnaire est décrit dans un **fichier de configuration unique** (par exemple `questionnaire.json`), séparé du code. Ça permet de le faire évoluer à chaque revue sans toucher au moteur de formulaire.
- Versionnage semver de l'appli et version propre du questionnaire. Les deux numéros figurent dans chaque note exportée.
- `CHANGELOG.md` tenu à jour.
- Tests automatisés de la section 11, lancés en intégration continue.

## 13. Points à confirmer

1. **Affichage de C3** : l'option « sans objet » doit-elle être ajoutée pour un animal non retrouvé, ou C3 n'est-elle affichée que si l'animal a été localisé ? Il n'existe pas de question « animal retrouvé » dans le questionnaire. *Par défaut : C3 toujours affichée, avec l'option exclusive « pas d'indice exploitable ».*
2. **Saisie des coordonnées pour le calcul de C3** : faut-il dans l'appli deux champs facultatifs à froid (coordonnées de l'indice, coordonnées de l'animal), ou Claude va-t-il chercher ces coordonnées ailleurs (Pat'rouille, photos) ? *Par défaut : pas de champ dans l'appli.*
3. **Préremplissage F8 depuis C4** pour « capteur » (trois lignes possibles) et « protection pluie et froid » (aucune ligne correspondante). *Par défaut : mise en évidence sans changer les valeurs.*
4. **Nom du dépôt et adresse de publication.**
5. **Logo** : fichier source du badge ESAM à fournir.

## Changelog

| Version | Date | Changements |
|---|---|---|
| 0.1 | 2026-10-19 | Création à partir du questionnaire v2.0 validé question par question. |
