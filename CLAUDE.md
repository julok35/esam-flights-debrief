# CLAUDE.md

Appli de debrief des vols drone de l'ESAM. Référence fonctionnelle : `docs/ESAM_CDC_Appli_Debrief_Drone.md` (cahier des charges).

## Règles absolues

- **Langue** : français pour l'interface, les fichiers produits, les commentaires et les messages de commit.
- **Typographie** : aucun tiret cadratin (U+2014) ni demi-cadratin (U+2013), nulle part (code, interface, notes exportées, noms de fichiers, documentation). Tiret classique (-) uniquement. Vérifié par `test/repo.test.js` et par les tests e2e. Attention : certains outils d'édition transforment l'échappement `\u2014` écrit dans un fichier en vrai caractère ; relancer `npm test` après chaque modification.
- **Questionnaire** : validé question par question avec le responsable. Ne pas ajouter, retirer ni reformuler une question sans sa validation. Il est décrit dans `questionnaire.json` uniquement, séparé du moteur (`js/form.js`, `js/model.js`).
- **Pas de dépendance chargée à l'exécution depuis un CDN** : tout est dans le dépôt (polices dans `vendor/fonts/`). Les `devDependencies` (lint, tests) ne sont jamais chargées par l'appli.
- **Aucune donnée ne quitte l'appareil** sauf export volontaire. Pas d'outil d'analyse d'audience.
- **Aucun dialogue natif** (`alert`, `confirm`, `prompt`) : confirmations intégrées à la page.

## Charte ESAM

- Couleurs : Noir profond #111111, Blanc #FFFFFF, Bleu glacier #AFC8E8, Jaune alpin #FFD400, Rouge signal #E6332A.
- Polices : Anton (titres), Montserrat (textes), embarquées, avec repli système.
- Cibles tactiles de 48 px minimum, texte de 16 px minimum, thème clair et sombre.

## Versions

- Appli en semver : `js/version.js`, `package.json`, cache `V` de `sw.js` et une entrée dans `CHANGELOG.md`, toujours ensemble (vérifié par les tests).
- Questionnaire : champ `version` de `questionnaire.json`. Les deux numéros figurent dans chaque note exportée.
- Tout fichier ajouté à l'appli doit être listé dans `SHELL` de `sw.js` (vérifié pour `js/` et `vendor/fonts/`).

## Commandes

```
npm ci              # outils de développement
npm start           # serveur local http://localhost:8000
npm run lint        # ESLint
npm run format      # Prettier
npm test            # tests Node (règles, export, dépôt)
npm run test:e2e    # Playwright, Chromium (critères d'acceptation de la section 11)
```

## Points à confirmer (section 13 du cahier des charges)

Comportements par défaut appliqués en attendant la décision du responsable : C3 toujours affichée avec l'option exclusive « pas d'indice exploitable » ; pas de champ de coordonnées pour C3 ; F8 depuis C4 « capteur » et « protection pluie et froid » : mise en évidence sans changer les valeurs (Étanchéité mise en évidence pour « protection pluie et froid »).
