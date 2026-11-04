// Historique, consultation, statistiques, import groupé de notes Obsidian et synchronisation entre deux appareils
// (Supabase simulé : mêmes API REST, en mémoire).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as M from '../js/model.js';
import { toMarkdown } from '../js/markdown.js';

var q = JSON.parse(readFileSync(new URL('../questionnaire.json', import.meta.url), 'utf8'));

function fiche(o) {
  var f = M.newFiche(q, 'pilote');
  M.setValue(q, f, 'date', o.date);
  M.setValue(q, f, 'animaux', o.animaux);
  M.setValue(q, f, 'lieu', o.lieu);
  if (o.c1) M.tap(q, f, 'c1', o.c1);
  (o.c2 || []).forEach((v) => M.tap(q, f, 'c2', v));
  if (o.gain) M.tap(q, f, 'f9_gain', o.gain);
  if (o.texte) M.setValue(q, f, 'f13_commentaire', o.texte);
  if (o.termine) M.finishAll(q, f);
  else M.finishHot(q, f);
  return f;
}

var FICHES = [
  fiche({
    date: '2025-08-14',
    animaux: 'Rex',
    lieu: 'Lac Blanc',
    c1: 'oui',
    c2: ['localisation-animal'],
    gain: 'plus-1h',
    termine: true
  }),
  fiche({
    date: '2026-02-03',
    animaux: 'Max',
    lieu: 'Chamrousse',
    c1: 'non',
    c2: ['levee-doute'],
    gain: 'moins-30min',
    texte: 'Relais radio utile'
  }),
  fiche({ date: '2026-09-21', animaux: 'Pépette', lieu: 'Belledonne', c1: 'non', c2: ['non-engage'] })
];
var note = (f) => toMarkdown(q, f);
var file = (name, text) => ({ name: name, mimeType: 'text/markdown', buffer: Buffer.from(text, 'utf8') });

async function importAll(page) {
  await page.goto('/');
  await page.click('#importBox summary');
  // La note de Pépette a perdu son bloc de reprise : reprise depuis le frontmatter
  var sansBloc = note(FICHES[2]).replace(/%%[\s\S]*%%\n$/, '');
  await page.setInputFiles('#importFile', [
    file('rex.md', note(FICHES[0])),
    file('max.md', note(FICHES[1])),
    file('pepette.md', sansBloc),
    file('liste-de-courses.md', '# Courses\n\n- pain\n')
  ]);
  await expect(page.locator('#importMsg')).toContainText('Import terminé : 3 nouvelles fiches');
}

test('import groupé de notes Obsidian : bilan, note sans bloc reprise depuis le frontmatter, fichier étranger ignoré', async ({
  page
}) => {
  await importAll(page);
  var msg = page.locator('#importMsg');
  await expect(msg).toContainText('1 sans bloc de reprise');
  await expect(msg).toContainText('liste-de-courses.md');
  await expect(page.locator('#ficheList .card')).toHaveCount(3);
  // Tri par date d'intervention, la plus récente d'abord
  await expect(page.locator('#ficheList .card-t').first()).toContainText('Pépette');
  // Réimport des mêmes notes : rien n'est écrasé
  await page.setInputFiles('#importFile', [file('rex.md', note(FICHES[0])), file('max.md', note(FICHES[1]))]);
  await expect(msg).toContainText('2 déjà à jour');
  // Version plus récente d'une note : mise à jour
  var maj = JSON.parse(JSON.stringify(FICHES[1]));
  maj.maj = new Date(Date.now() + 60000).toISOString();
  maj.answers.lieu = 'Chamrousse, Roche Béranger';
  await page.setInputFiles('#importFile', [file('max.md', note(maj)), file('rex.md', note(FICHES[0]))]);
  await expect(msg).toContainText('1 mise à jour, 1 déjà à jour');
  await expect(page.locator('#ficheList')).toContainText('Roche Béranger');
});

test('historique : recherche sans accents, filtres par état et par année, consultation en lecture', async ({
  page
}) => {
  await importAll(page);
  await page.click('#filterBox summary');
  await page.fill('#search', 'pepette');
  await expect(page.locator('#ficheList .card')).toHaveCount(1);
  await expect(page.locator('#ficheCount')).toHaveText('1 sur 3 debriefs');
  // Recherche dans les textes libres
  await page.fill('#search', 'relais radio');
  await expect(page.locator('#ficheList .card-t')).toContainText('Max');
  await page.fill('#search', 'zzz');
  await expect(page.locator('#noMatch')).toBeVisible();
  await page.fill('#search', '');
  await page.click('[data-etat="termine"]');
  await expect(page.locator('#ficheList .card')).toHaveCount(1);
  await page.click('[data-etat="tous"]');
  await page.click('[data-annee="2026"]');
  await expect(page.locator('#ficheList .card')).toHaveCount(2);
  // Filtres gardés au retour sur l'accueil
  await page.locator('#ficheList [data-act="voir"]').first().click();
  await expect(page.locator('#viewNote')).toContainText('Données Airdata');
  await expect(page.locator('#viewNote h3').first()).toBeVisible();
  await expect(page.locator('#viewNote')).not.toContainText('esam-debrief-data');
  await page.click('#homeBtn');
  await expect(page.locator('#ficheList .card')).toHaveCount(2);
  // Résumé de la fiche dans la liste
  await page.click('[data-annee=""]');
  await expect(page.locator('[data-id="' + FICHES[0].debrief_id + '"] .card-m')).toContainText(
    "Apport : Localisation de l'animal ; Quasi-incident"
  );
  await expect(page.locator('[data-id="' + FICHES[2].debrief_id + '"] .card-m')).toContainText('Non engagé');
});

test('statistiques : indicateurs, debriefs par mois, détail par question et filtre par année', async ({ page }) => {
  await importAll(page);
  await page.click('#statsBtn');
  await expect(page.locator('[data-kpi="total"] .kpi-v')).toHaveText('3');
  await expect(page.locator('[data-kpi="engages"] .kpi-v')).toHaveText('67 %');
  await expect(page.locator('[data-kpi="quasi"] .kpi-d')).toHaveText('1 sur 3 renseignés');
  await expect(page.locator('[data-kpi="gain"] .kpi-v')).toHaveText('50 %');
  await expect(page.locator('#statsMois .bar')).toHaveCount(14); // août 2025 à septembre 2026
  await page.click('#statsBody [data-phase="chaud"] summary');
  await expect(page.locator('#statsBody [data-q="C2"]')).toContainText("Localisation de l'animal");
  await page.click('[data-periode="2026"]');
  await expect(page.locator('[data-kpi="total"] .kpi-v')).toHaveText('2');
  await expect(page.locator('[data-kpi="quasi"] .kpi-v')).toHaveText('0 %');
});

/* ---------- Supabase simulé, partagé par deux appareils ---------- */

var URL_SB = 'https://esam-test.supabase.co';

function fakeSupabase() {
  var db = { rows: {}, calls: [] };
  async function handler(route) {
    var req = route.request();
    var u = new URL(req.url());
    var json = (status, body) =>
      route.fulfill({
        status: status,
        contentType: 'application/json',
        body: body === undefined ? '' : JSON.stringify(body)
      });
    db.calls.push(req.method() + ' ' + u.pathname);
    if (req.headers()['apikey'] !== 'cle-publique') return json(401, { message: 'Invalid API key' });
    if (u.pathname === '/auth/v1/otp') return json(200, {});
    if (u.pathname === '/auth/v1/verify') {
      var b = req.postDataJSON();
      if (b.token !== '123456') return json(403, { msg: 'Token has expired or is invalid' });
      return json(200, { access_token: 'jeton', refresh_token: 'renouv', expires_in: 3600, user: { email: b.email } });
    }
    if (u.pathname === '/auth/v1/user') return json(200, { email: 'pilote@esam.test' });
    if (u.pathname === '/auth/v1/logout') return json(204);
    if (req.headers()['authorization'] !== 'Bearer jeton') return json(401, { message: 'JWT expired' });
    if (u.pathname === '/rest/v1/rpc/est_membre') return json(200, true);
    if (u.pathname === '/rest/v1/fiches' && req.method() === 'GET') {
      var rows = Object.values(db.rows);
      if (u.searchParams.get('select') === 'data') {
        var ids = /^in\.\((.*)\)$/
          .exec(u.searchParams.get('debrief_id'))[1]
          .split(',')
          .map((s) => s.replace(/"/g, ''));
        return json(
          200,
          rows.filter((r) => ids.includes(r.debrief_id) && !r.supprime).map((r) => ({ data: r.data }))
        );
      }
      return json(
        200,
        rows.map((r) => ({ debrief_id: r.debrief_id, maj: r.maj, supprime: r.supprime }))
      );
    }
    if (u.pathname === '/rest/v1/fiches' && req.method() === 'POST') {
      for (var r of req.postDataJSON()) {
        var old = db.rows[r.debrief_id];
        if (!old || r.maj >= old.maj) db.rows[r.debrief_id] = r; // déclencheur : la plus récente l'emporte
      }
      return json(201);
    }
    return json(404, { message: 'inconnu' });
  }
  return { db: db, handler: handler };
}

async function device(browser, sb) {
  var ctx = await browser.newContext({
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    viewport: { width: 412, height: 915 }
  });
  await ctx.route(URL_SB + '/**', sb.handler);
  var page = await ctx.newPage();
  return { ctx, page };
}

async function connect(page) {
  await page.goto('/');
  await expect(page.locator('#syncState')).toContainText('non activée');
  await page.click('#accountBtn');
  await page.fill('#cloudUrl', 'https://pas-supabase.example.com');
  await page.fill('#cloudKey', 'cle-publique');
  await page.click('#cloudSave');
  await expect(page.locator('#cloudMsg')).toContainText('https://xxxx.supabase.co');
  await page.fill('#cloudUrl', URL_SB + '/');
  await page.click('#cloudSave');
  await page.fill('#cloudEmail', 'Pilote@ESAM.test');
  await page.click('#sendCode');
  await expect(page.locator('#cloudMsg')).toContainText('Code envoyé à pilote@esam.test');
  await page.fill('#cloudCode', '000000');
  await page.click('#verifyCode');
  await expect(page.locator('#cloudMsg')).toContainText('Code incorrect ou expiré');
  await page.fill('#cloudCode', '123 456');
  await page.click('#verifyCode');
  await expect(page.locator('#cloudWho')).toHaveText('Connecté : pilote@esam.test');
  await expect(page.locator('#cloudMember')).toContainText('Membre ESAM');
  await expect(page.locator('#syncState')).toContainText('Synchronisé le');
}

test('synchronisation : une fiche saisie sur un appareil arrive sur l’autre, modification et suppression suivent', async ({
  browser
}) => {
  var sb = fakeSupabase();
  var a = await device(browser, sb);
  var b = await device(browser, sb);
  await connect(a.page);
  await connect(b.page);

  // Appareil A : nouvelle fiche
  await a.page.click('#homeBtn');
  await a.page.click('#newBtn');
  await a.page.fill('[data-key="animaux"] input', 'Rex');
  await a.page.locator('#q-C1 [data-v="non"]').click();
  await a.page.click('#finishHot');
  await expect(a.page.locator('#ficheList .card')).toHaveCount(1);
  await a.page.click('#accountBtn');
  await a.page.click('#syncNow');
  await expect(a.page.locator('#cloudMsg')).toContainText('1 envoyée');
  expect(Object.keys(sb.db.rows)).toHaveLength(1);
  var id = Object.keys(sb.db.rows)[0];
  expect(sb.db.rows[id].data.answers.animaux).toBe('Rex');

  // Appareil B : la fiche arrive, B la complète
  await b.page.click('#syncNow');
  await expect(b.page.locator('#cloudMsg')).toContainText('1 reçue');
  await b.page.click('#homeBtn');
  await expect(b.page.locator('#ficheList .card-t')).toContainText('Rex');
  await b.page.locator('#ficheList .btn', { hasText: 'Ouvrir' }).click();
  await b.page.click('[data-role="pilote"]');
  await b.page.click('[data-phase="analyse"]');
  await b.page.fill('[data-key="f13_commentaire"] textarea', 'Repéré depuis la crête');
  await expect(b.page.locator('#saved')).toContainText('Enregistré à');
  await b.page.click('#homeBtn');
  await b.page.click('#accountBtn');
  await b.page.click('#syncNow');
  await expect(b.page.locator('#cloudMsg')).toContainText('1 envoyée');

  // A reçoit la modification
  await a.page.click('#syncNow');
  await expect(a.page.locator('#cloudMsg')).toContainText('1 reçue');
  await a.page.click('#homeBtn');
  await a.page.locator('#ficheList [data-act="voir"]').click();
  await expect(a.page.locator('#viewNote')).toContainText('Repéré depuis la crête');

  // A supprime : la suppression est transmise, B la retire
  await a.page.click('#homeBtn');
  await a.page.locator('#ficheList').getByRole('button', { name: 'Supprimer' }).click();
  await a.page.getByRole('button', { name: 'Confirmer la suppression' }).click();
  await expect(a.page.locator('#ficheList')).toHaveCount(0);
  await expect.poll(() => sb.db.rows[id].supprime).toBe(true);
  expect(sb.db.rows[id].data).toBeNull();
  await b.page.click('#syncNow');
  await expect(b.page.locator('#cloudMsg')).toContainText('1 supprimée');
  await b.page.click('#homeBtn');
  await expect(b.page.locator('#ficheList')).toHaveCount(0);

  // Déconnexion : plus aucun appel, les fiches restent
  await a.page.click('#accountBtn');
  await a.page.getByRole('button', { name: 'Se déconnecter' }).click();
  await a.page.getByRole('button', { name: 'Confirmer la déconnexion' }).click();
  await expect(a.page.locator('#cloudEmail')).toBeVisible();
  await a.ctx.close();
  await b.ctx.close();
});

test('connexion par le lien reçu par e-mail', async ({ browser }) => {
  var sb = fakeSupabase();
  var a = await device(browser, sb);
  await a.page.goto('/');
  await a.page.evaluate(
    (u) => localStorage.setItem('esam-debrief-cloud', JSON.stringify({ url: u, key: 'cle-publique' })),
    URL_SB
  );
  await a.page.goto('/#access_token=jeton&expires_in=3600&refresh_token=renouv&token_type=bearer&type=magiclink');
  await expect(a.page).toHaveURL(/#\/compte$/);
  await expect(a.page.locator('#cloudMsg')).toContainText('Connecté par le lien');
  await expect(a.page.locator('#cloudWho')).toHaveText('Connecté : pilote@esam.test');
  await a.page.goto('/#error=access_denied&error_code=otp_expired');
  await expect(a.page.locator('#cloudMsg')).toContainText('expiré');
  await a.ctx.close();
});

test('sans synchronisation activée, aucune requête ne sort de l’appli', async ({ page }) => {
  var out = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) out.push(r.url());
  });
  await page.goto('/');
  await page.click('#newBtn');
  await page.locator('#q-C1 [data-v="non"]').click();
  await page.click('#finishHot');
  await page.click('#statsBtn');
  await expect(page.locator('[data-kpi="total"] .kpi-v')).toHaveText('1');
  expect(out).toEqual([]);
});
