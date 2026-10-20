// Note exportée : frontmatter YAML valide et complet, corps, bloc de reprise, nom de fichier (section 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import * as M from '../js/model.js';
import { toMarkdown, extractState, fileName, frontmatter } from '../js/markdown.js';
import { APP_VERSION } from '../js/version.js';
import { loadQ, sampleFiche } from './helpers.js';

var q = loadQ();

function fmOf(md) {
  var m = /^---\n([\s\S]*?)\n---\n/.exec(md);
  assert.ok(m, 'frontmatter présent');
  return parse(m[1]);
}

/** Clés attendues : champs fixes, un champ par réponse fermée, une ligne de grille par champ. */
function expectedKeys() {
  var keys = ['type', 'debrief_id', 'questionnaire_version', 'app_version', 'statut', 'date', 'titre', 'patrouille'];
  keys.push('animaux', 'espece', 'lieu');
  keys.push('role_saisie', 'date_maj', 'tags');
  q.questions.forEach((qu) => {
    qu.fields.forEach((f) => {
      if (f.type === 'text') return;
      if (f.type === 'grid') f.rows.forEach((r) => keys.push(f.key + '_' + r.v.replace(/-/g, '_')));
      else if (f.type === 'repeat') keys.push(f.key + '_nb', f.key + '_categories', f.key + '_incidents');
      else keys.push(f.key);
    });
    (qu.derived || []).forEach((d) => keys.push(d.key));
  });
  return keys;
}

test('frontmatter : YAML valide avec tous les champs prévus (fiche vide et fiche remplie)', () => {
  for (var f of [M.newFiche(q), sampleFiche(q)]) {
    var fm = fmOf(toMarkdown(q, f));
    assert.deepEqual(Object.keys(fm), expectedKeys());
    assert.equal(fm.type, 'debrief-vol-drone');
    assert.equal(fm.debrief_id, f.debrief_id);
    assert.equal(fm.questionnaire_version, '2.0');
    assert.equal(fm.app_version, APP_VERSION);
    assert.deepEqual(fm.tags, ['esam/debrief-drone']);
  }
});

test('frontmatter : valeurs normalisées, listes, grilles, F7, F14', () => {
  var f = sampleFiche(q);
  var fm = fmOf(toMarkdown(q, f));
  assert.equal(fm.patrouille, '2026-145');
  assert.equal(fm.c1, 'oui');
  assert.deepEqual(fm.c1_categories, ['perte-liaison']);
  assert.deepEqual(fm.c4, ['portee-liaison', 'capteur']);
  assert.equal(fm.c3_ecart_h, '30-100m');
  assert.equal(fm.c3_ecart_source, 'estime');
  assert.equal(fm.c3_ecart_h_calcule, null);
  assert.equal(fm.c3_aucun, false);
  assert.equal(fm.c5_power2000, 40);
  assert.equal(fm.c5_tb30, 2);
  assert.equal(fm.f6_abri, 'pas-bien');
  assert.equal(fm.f6_tiers, 'neutre');
  assert.equal(fm.f8_liaison, 'pas-bien', 'prérempli depuis C4');
  assert.equal(fm.f8_infrarouge, 'non-utilise');
  assert.equal(fm.f7_nb, 1);
  assert.deepEqual(fm.f7_incidents, [
    { categorie: 'perte-liaison', moment: 'recherche', evite: ['rth'], gravite: null }
  ]);
  assert.deepEqual(fm.f14_issue, { 'relais-garmin': 'peut-etre' });
  assert.equal(fm.f12_volume, 64);
  assert.equal(fm.ne1.length, 0);
  assert.equal(fm.statut, 'froid-en-cours');
});

test('grille jamais touchée : lignes vides (pas de valeurs par défaut comptées dans Dataview)', () => {
  var fm = fmOf(toMarkdown(q, M.newFiche(q)));
  assert.equal(fm.f6_abri, null);
  assert.equal(fm.f8_infrarouge, null);
});

test('valeurs des options : minuscules sans accents', () => {
  var bad = [];
  function check(opts, where) {
    (opts || []).forEach((o) => {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.v)) bad.push(where + ':' + o.v);
    });
  }
  q.questions.forEach((qu) =>
    qu.fields.forEach((f) => {
      check(f.options, f.key);
      check(f.values, f.key);
      check(f.rows, f.key);
      (f.fields || []).forEach((s) => check(s.options, f.key + '.' + s.key));
    })
  );
  assert.deepEqual(bad, []);
});

test('identifiants de questions et clés de champs uniques', () => {
  var ids = q.questions.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  var keys = q.entete.map((f) => f.key).concat(q.questions.flatMap((x) => x.fields.map((f) => f.key)));
  assert.equal(new Set(keys).size, keys.length);
});

test('corps : phases, grilles en tableau, remarques avec leur rôle, section Airdata vide', () => {
  var md = toMarkdown(q, sampleFiche(q));
  for (var h of ['## À chaud', '## 1. Préparation', '## 2. Mise en place', '## 3. Vol', '## 4. Retour'])
    assert.ok(md.includes('\n' + h + '\n'), h);
  assert.ok(md.includes('## 5. Dérushage') && md.includes('## 6. Analyse'));
  assert.ok(md.includes('| Élément | Évaluation | Observation |'));
  assert.ok(md.includes('Coupures \\| derrière la crête'), 'barre verticale échappée dans le tableau');
  assert.ok(md.includes('**Copilote** :\n\n> Vue directe perdue'));
  assert.match(md, /## Données Airdata\n\n\n%%\nesam-debrief-data:v1\n/);
  assert.ok(!md.includes('100 %% sûr'), 'pas de commentaire Obsidian ouvert par le texte saisi');
});

test('parcours court : seules NE1 et F14 à froid', () => {
  var f = M.newFiche(q);
  M.tap(q, f, 'c2', 'non-engage');
  M.tap(q, f, 'ne1', 'meteo');
  var md = toMarkdown(q, f);
  assert.ok(md.includes('**NE1.') && md.includes('**F14.'));
  assert.ok(!md.includes('**C3.') && !md.includes('**F1.') && !md.includes('## 1. Préparation'));
  assert.deepEqual(fmOf(md).ne1, ['meteo']);
});

test("bloc de reprise : la fiche est restituée à l'identique", () => {
  var f = sampleFiche(q);
  var back = extractState(toMarkdown(q, f));
  assert.deepEqual(back, JSON.parse(JSON.stringify(f)));
  assert.equal(toMarkdown(q, back), toMarkdown(q, f));
  assert.equal(extractState('# une note sans bloc'), null);
  assert.equal(extractState('%%\nesam-debrief-data:v1\n!!!\n%%'), null);
});

test('titre combiné : date, animaux, espèce, lieu', () => {
  var f = M.newFiche(q);
  M.setValue(q, f, 'date', '2026-10-19');
  assert.equal(M.ficheTitre(q, f), '19/10/2026 - Chien', 'espèce par défaut');
  M.setValue(q, f, 'espece', '');
  assert.equal(M.ficheTitre(q, f), '19/10/2026');
  M.setValue(q, f, 'animaux', ' Rex ,Max,, ');
  M.setValue(q, f, 'lieu', 'Lac Blanc, Belledonne');
  assert.equal(M.ficheTitre(q, f), '19/10/2026 - Rex, Max - Lac Blanc, Belledonne');
  M.setValue(q, f, 'espece', 'Chien');
  assert.equal(M.ficheTitre(q, f), '19/10/2026 - Rex, Max - Chien - Lac Blanc, Belledonne');
  var md = toMarkdown(q, f);
  var fm = fmOf(md);
  assert.equal(fm.titre, '19/10/2026 - Rex, Max - Chien - Lac Blanc, Belledonne');
  assert.deepEqual(fm.animaux, ['Rex', 'Max']);
  assert.equal(fm.espece, 'Chien');
  assert.equal(fm.lieu, 'Lac Blanc, Belledonne');
  assert.ok(md.includes('\n# 19/10/2026 - Rex, Max - Chien - Lac Blanc, Belledonne\n'));
});

test('nom de fichier sans accents ni espaces', () => {
  var f = M.newFiche(q);
  M.setValue(q, f, 'date', '2026-10-19');
  assert.equal(fileName(f), 'Debrief_Drone_2026-10-19_sans-numero.md');
  M.setValue(q, f, 'patrouille', ' Intervention n° 12 Évian ');
  assert.equal(fileName(f), 'Debrief_Drone_2026-10-19_Intervention-n-12-Evian.md');
});

test('note exportée sans tiret cadratin ni demi-cadratin', () => {
  var md = toMarkdown(q, sampleFiche(q));
  assert.ok(!/[\u2013\u2014]/.test(md));
  assert.equal(typeof frontmatter(q, sampleFiche(q)), 'object');
});
