// Battement Supabase (scripts/battement.js) : requête envoyée et messages d'échec, sans réseau.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { battre } from '../scripts/battement.js';
import { SUPABASE_URL, SUPABASE_KEY } from '../js/config.js';

function faux(status, corps, appels) {
  return async function (url, o) {
    if (appels) appels.push({ url: url, o: o });
    return { status: status, ok: status >= 200 && status < 300, text: async () => corps };
  };
}

test('battement : appelle la fonction battement() avec la clé publique, sans autre donnée', async () => {
  var appels = [];
  var heure = await battre({ fetch: faux(200, '"2026-11-14T05:17:03.123456+00:00"', appels) });
  assert.equal(heure, '2026-11-14T05:17:03.123456+00:00');
  assert.equal(appels.length, 1);
  assert.equal(appels[0].url, SUPABASE_URL + '/rest/v1/rpc/battement');
  assert.equal(appels[0].o.method, 'POST');
  assert.equal(appels[0].o.headers.apikey, SUPABASE_KEY);
  assert.equal(appels[0].o.headers.Authorization, undefined);
  assert.equal(appels[0].o.body, '{}');
});

test('battement : échecs signalés avec la marche à suivre', async () => {
  await assert.rejects(battre({ fetch: faux(404, '{"code":"PGRST202"}') }), /battement\(\) absente.*SQL Editor/);
  await assert.rejects(battre({ fetch: faux(540, 'Project paused') }), /Réponse 540.*en pause/);
  await assert.rejects(battre({ fetch: faux(200, '{"message":"autre"}') }), /Réponse inattendue/);
  await assert.rejects(
    battre({
      fetch: async function () {
        throw new Error('getaddrinfo ENOTFOUND');
      }
    }),
    /injoignable.*ENOTFOUND/
  );
});

test('battement : la fonction de la base est ouverte à la clé publique et planifiée chaque jour', () => {
  var lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  var sql = lire('supabase/migrations/20261114120000_battement.sql');
  assert.match(sql, /create or replace function public\.battement\(\)/);
  assert.match(sql, /grant execute on function public\.battement\(\) to anon, authenticated/);
  var atelier = lire('.github/workflows/battement-supabase.yml');
  assert.match(atelier, /cron: '\d+ \d+ \* \* \*'/);
  assert.match(atelier, /node scripts\/battement\.js/);
});
