# Synchronisation entre appareils (Supabase)

La synchronisation est facultative : sans elle, l'appli fonctionne comme avant, tout reste sur le téléphone.
Une fois activée, chaque fiche est recopiée dans une base Supabase dès que le réseau est là, et redescend sur les
autres appareils connectés. La saisie reste possible sans réseau.

## Principe

- **L'appareil reste la référence.** Les fiches sont d'abord enregistrées sur le téléphone (IndexedDB). La
  synchronisation compare les deux côtés et recopie dans les deux sens ; la fiche modifiée en dernier (champ `maj`)
  l'emporte. Une suppression est transmise aux autres appareils (ligne gardée avec `supprime = true`, sans contenu).
- **Quand ?** À l'ouverture de l'appli, au retour du réseau, quelques secondes après chaque modification, toutes les
  5 minutes pendant l'utilisation, et à la demande (écran Synchronisation).
- **Qui voit quoi ?** Tous les membres voient et modifient toutes les fiches. Un membre est une adresse e-mail de la
  table `membres`. N'importe qui peut demander un code de connexion, mais sans être membre il n'accède à rien : les
  règles d'accès de la base (RLS) le bloquent.
- **Connexion sans mot de passe.** Un code à 6 chiffres est envoyé par e-mail ; le lien du même e-mail fonctionne
  aussi. La session se renouvelle seule, il n'y a pas à se reconnecter.
- **Pas de bibliothèque.** L'appli appelle directement les API REST de Supabase (`js/cloud.js`). La politique de
  sécurité de la page n'autorise que les adresses `https://*.supabase.co`.

## Mise en place (une fois, environ 10 minutes)

### 1. Créer le projet

Sur https://supabase.com/dashboard : **New project**.

- Nom : `esam-debrief` (au choix).
- Région : **West EU (Paris)** ou **Central EU (Frankfurt)**, pour garder les données en Europe.
- Mot de passe de la base : le noter dans un gestionnaire de mots de passe (l'appli n'en a pas besoin).

### 2. Créer les tables

**SQL Editor**, **New query** : coller tout le contenu de
[`supabase/migrations/20261104120000_fiches.sql`](../supabase/migrations/20261104120000_fiches.sql), puis **Run**.
Le script peut être relancé sans risque.

### 3. Ajouter les membres

Toujours dans le SQL Editor, une ligne par personne (adresse en minuscules) :

```sql
insert into public.membres (email) values ('prenom.nom@exemple.fr');
```

Retirer quelqu'un : `delete from public.membres where email = 'prenom.nom@exemple.fr';`

### 4. Régler la connexion

**Authentication**, **URL Configuration** :

- Site URL : `https://julok35.github.io/esam-flights-debrief/`
- Redirect URLs : la même adresse, plus `http://localhost:8000/` pour le développement.

Facultatif, **Authentication**, **Emails**, **Templates** : dans les modèles **Magic Link** et **Confirm signup**,
ajouter le code sous le lien. Supabase ne permet de modifier les modèles qu'avec un serveur d'envoi personnel
(**SMTP Settings**, par exemple un compte Gmail avec mot de passe d'application, ou Brevo, Resend). Sans cela,
l'e-mail ne contient que le lien, ce qui suffit. Exemple de ligne :

```html
<p>Ton code de connexion : <strong>{{ .Token }}</strong></p>
```

Le lien doit être ouvert sur l'appareil à connecter, dans le navigateur où l'appli est utilisée (sur Android,
l'appli installée partage les données de Chrome). Sur iPhone, l'appli installée sur l'écran d'accueil ne partage pas
les données de Safari : le code est alors nécessaire, donc le serveur d'envoi personnel.

### 5. Brancher l'appli

**Project Settings**, **API Keys** : relever l'adresse du projet (`https://xxxx.supabase.co`) et la clé publique
(**Publishable key** `sb_publishable_...`, ou l'ancienne clé `anon`). Ces deux valeurs ne sont pas secrètes.

Deux possibilités :

- **Pour tous les appareils d'un coup** (recommandé) : les écrire dans [`js/config.js`](../js/config.js), changer la
  version de l'appli (voir `CLAUDE.md`) et publier. Fait pour le projet de l'ESAM (`rcwbwokguvnluwuilxoo`, depuis la v1.3.1).
- **Appareil par appareil** : écran **Synchronisation** de l'appli, bloc **Projet Supabase**.

### 6. Se connecter

Écran **Synchronisation** : adresse e-mail, **Recevoir un e-mail de connexion**, puis ouvrir le lien de l'e-mail sur le même appareil (ou saisir le code, s'il y en a un). Les fiches déjà
présentes sur le téléphone partent aussitôt ; celles des autres appareils arrivent.

## Reprendre les anciens debriefs

Les notes déjà rangées dans Obsidian s'importent depuis l'accueil, **Importer des notes Obsidian** : plusieurs
fichiers `.md` d'un coup, ou tout un dossier du coffre (bouton **Ouvrir un dossier**, sur ordinateur). Les fiches
importées sont ensuite synchronisées comme les autres. Une note qui a perdu son bloc de reprise est reprise depuis
son frontmatter : les réponses fermées sont retrouvées, pas les textes libres ni les remarques.

## Bon à savoir

- **Offre gratuite** : largement suffisante. Un projet gratuit sans activité suffisante pendant environ une semaine
  est mis en pause : voir « Éviter la mise en pause » ci-dessous. Les fiches restent sur les téléphones pendant ce temps.
- **E-mails** : l'envoi intégré de Supabase est limité à quelques e-mails par heure. Pour une équipe, configurer un
  serveur d'envoi (Authentication, Emails, SMTP Settings).
- **Sauvegarde** : l'export Obsidian reste la copie de référence ; la base en ligne n'est pas une archive.
- **Voir les fiches dans la base** : Table Editor, table `fiches` (colonne `data` : la fiche complète en JSON).

## Éviter la mise en pause

Supabase met en pause un projet gratuit qui n'a pas reçu assez de requêtes pendant environ une semaine, après un
e-mail d'avertissement (« Your Supabase Project is going to be paused »). Quelques synchronisations isolées ne
suffisent pas toujours : l'avertissement du 14 novembre 2026 est arrivé moins de 6 jours après la dernière.

Pour que cela n'arrive pas, un **battement** envoie une requête à la base chaque jour, même quand personne n'ouvre
l'appli :

- [`.github/workflows/battement-supabase.yml`](../.github/workflows/battement-supabase.yml) : atelier GitHub Actions
  planifié tous les jours (05 h 17 UTC), qui lance [`scripts/battement.js`](../scripts/battement.js). Il se réactive
  lui-même à chaque passage, car GitHub suspend les planifications d'un dépôt resté 60 jours sans activité.
- [`supabase/migrations/20261114120000_battement.sql`](../supabase/migrations/20261114120000_battement.sql) : fonction
  `battement()` de la base, appelée avec la clé publique. Elle renvoie l'heure de la base et ne lit ni ne modifie
  aucune donnée. **À exécuter une fois dans le SQL Editor**, comme le script des tables.

L'appli n'envoie rien de plus : le battement part de GitHub, pas des téléphones.

**Vérifier** : sur GitHub, onglet **Actions**, **Battement Supabase**. Un passage vert par jour ; **Run workflow**
le lance à la main. En cas d'échec, GitHub envoie un e-mail et le journal du passage dit quoi faire (fonction absente
de la base, projet en pause).

**Si le projet est quand même en pause** : tableau de bord Supabase, **Restore project** (possible pendant 90 jours ;
au-delà, les données ne sont plus récupérables que par une sauvegarde à télécharger). Les fiches restent sur les
téléphones et repartent à la synchronisation suivante.

## En cas de problème

| Message dans l'appli | Cause et solution |
| --- | --- |
| « Ton adresse n'est pas encore dans la liste des membres » | Ajouter l'adresse dans `membres` (étape 3), en minuscules. |
| « La table des fiches est absente » | Relancer le script SQL (étape 2). |
| « Code incorrect ou expiré » | Le code vaut une heure et une seule fois : en demander un nouveau. |
| « Trop de demandes » | Limite d'envoi d'e-mails atteinte : attendre, ou configurer un SMTP. |
| « Lien de connexion refusé » | Lien déjà utilisé ou expiré, ou adresse de l'appli absente des Redirect URLs (étape 4). |
| E-mail « Your Supabase Project is going to be paused » | Vérifier le battement (« Éviter la mise en pause ») ; ouvrir l'appli connectée relance aussi l'activité. |
| « Session expirée : reconnecte-toi » | Session révoquée (déconnexion ailleurs, projet réinitialisé) : se reconnecter. |
