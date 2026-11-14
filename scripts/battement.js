// Battement Supabase : une requête par jour pour que le projet gratuit ne soit pas mis en pause faute d'activité
// (docs/SUPABASE.md, « Éviter la mise en pause »). Lancé par .github/workflows/battement-supabase.yml, jamais par l'appli.
// N'utilise que l'adresse et la clé publique de js/config.js : aucune fiche n'est lue ni modifiée.
import { fileURLToPath } from 'node:url';
import { SUPABASE_URL, SUPABASE_KEY } from '../js/config.js';

/** Appelle la fonction battement() de la base (supabase/migrations/20261114120000_battement.sql) : renvoie l'heure
 *  de la base, ou rejette avec un message qui dit quoi faire. */
export async function battre(o) {
  o = o || {};
  var url = String(o.url || SUPABASE_URL).replace(/\/+$/, '');
  var key = o.key || SUPABASE_KEY;
  var rep;
  try {
    rep = await (o.fetch || fetch)(url + '/rest/v1/rpc/battement', {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(30000)
    });
  } catch (e) {
    throw new Error('Projet Supabase injoignable (' + (e && e.message) + ') : vérifier dans le tableau de bord.', {
      cause: e
    });
  }
  var texte = await rep.text();
  if (rep.status === 404)
    throw new Error(
      'Fonction battement() absente de la base : exécuter supabase/migrations/20261114120000_battement.sql ' +
        'dans le SQL Editor (docs/SUPABASE.md).'
    );
  if (!rep.ok)
    throw new Error(
      'Réponse ' +
        rep.status +
        ' du projet Supabase (en pause ? le réactiver depuis le tableau de bord) : ' +
        texte.slice(0, 300)
    );
  var heure = null;
  try {
    heure = JSON.parse(texte);
  } catch (e) {}
  if (typeof heure !== 'string' || isNaN(Date.parse(heure)))
    throw new Error('Réponse inattendue : ' + texte.slice(0, 300));
  return heure;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  battre().then(
    function (heure) {
      console.log('Battement reçu par la base à ' + heure);
    },
    function (e) {
      console.error(e.message);
      process.exit(1);
    }
  );
}
