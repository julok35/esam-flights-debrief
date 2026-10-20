// Règles du questionnaire (section 6.1 et liens entre questions) testées sans navigateur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js';
import { loadQ } from './helpers.js';

var q = loadQ();

test("choix unique : toucher l'option choisie la désélectionne", () => {
  var f = M.newFiche(q);
  M.tap(q, f, 'c1', 'oui');
  assert.equal(f.answers.c1, 'oui');
  M.tap(q, f, 'c1', 'non');
  assert.equal(f.answers.c1, 'non');
  M.tap(q, f, 'c1', 'non');
  assert.equal(f.answers.c1, undefined);
});

test('option exclusive : désélectionne les autres, et inversement', () => {
  var f = M.newFiche(q);
  M.tap(q, f, 'c2', 'levee-doute');
  M.tap(q, f, 'c2', 'voie-acces');
  M.tap(q, f, 'c2', 'sans-apport');
  assert.deepEqual(f.answers.c2, ['sans-apport']);
  M.tap(q, f, 'c2', 'non-engage');
  assert.deepEqual(f.answers.c2, ['non-engage']);
  M.tap(q, f, 'c2', 'autre');
  assert.deepEqual(f.answers.c2, ['autre']);
});

test('C4 : 2 choix au maximum, « rien » exclusif', () => {
  var f = M.newFiche(q);
  M.tap(q, f, 'c4', 'capteur');
  M.tap(q, f, 'c4', 'autonomie-energie');
  var r = M.tap(q, f, 'c4', 'ecran-deporte');
  assert.equal(r.refused, true);
  assert.deepEqual(f.answers.c4, ['autonomie-energie', 'capteur']);
  M.tap(q, f, 'c4', 'rien');
  assert.deepEqual(f.answers.c4, ['rien']);
});

test("C3 : « pas d'indice exploitable » efface source et écarts, et inversement", () => {
  var f = M.newFiche(q);
  M.tap(q, f, 'c3_source', 'temoin');
  M.tap(q, f, 'c3_ecart_v', '10-30m');
  M.tap(q, f, 'c3_aucun', true);
  assert.equal(f.answers.c3_aucun, true);
  assert.equal(f.answers.c3_source, undefined);
  assert.equal(f.answers.c3_ecart_v, undefined);
  M.tap(q, f, 'c3_ecart_h', 'plus-500m');
  assert.equal(f.answers.c3_aucun, undefined);
});

test("C5 : « pas emportée » et le niveau de la Power 2000 s'excluent", () => {
  var f = M.newFiche(q);
  M.setValue(q, f, 'c5_power2000', 0);
  assert.equal(f.answers.c5_power2000, 0);
  M.tap(q, f, 'c5_power2000_absente', true);
  assert.equal(f.answers.c5_power2000, undefined);
  M.setValue(q, f, 'c5_power2000', 70);
  assert.equal(f.answers.c5_power2000_absente, undefined);
});

test('non engagé : C3 à C5 masquées, à froid seulement NE1 et F14', () => {
  var f = M.newFiche(q);
  M.tap(q, f, 'c2', 'non-engage');
  var hot = M.phaseQuestions(q, f, 'chaud').map((x) => x.id);
  assert.deepEqual(hot, ['C1', 'C2']);
  var cold = M.visiblePhases(q, f)
    .filter((p) => p.temps === 'froid')
    .flatMap((p) => M.phaseQuestions(q, f, p.id).map((x) => x.id));
  assert.deepEqual(cold, ['NE1', 'F14']);
  M.tap(q, f, 'c2', 'non-engage');
  assert.equal(M.phaseQuestions(q, f, 'non-engage').length, 0);
  assert.deepEqual(
    M.phaseQuestions(q, f, 'chaud').map((x) => x.id),
    ['C1', 'C2', 'C3', 'C4', 'C5']
  );
});

test('F7 : une fiche par catégorie cochée en C1, vide retirée si décochée, « ajouter » en crée une vide', () => {
  var f = M.newFiche(q);
  M.tap(q, f, 'c1', 'oui');
  M.tap(q, f, 'c1_categories', 'obstacle');
  M.tap(q, f, 'c1_categories', 'meteo');
  assert.deepEqual(
    f.answers.f7.map((x) => x.categorie),
    ['obstacle', 'meteo']
  );
  var met = f.answers.f7[1];
  M.setItemValue(q, f, 'f7', met.id, 'faits', 'Rafales');
  M.tap(q, f, 'c1_categories', 'obstacle');
  M.tap(q, f, 'c1_categories', 'meteo');
  assert.deepEqual(
    f.answers.f7.map((x) => x.categorie),
    ['meteo'],
    'la fiche commencée reste'
  );
  M.addItem(q, f, 'f7');
  assert.equal(f.answers.f7.length, 2);
  assert.equal(f.answers.f7[1].categorie, undefined);
  // C1 repassé à non : la fiche vide ouverte d'office disparaît, pas celle ajoutée ni la commencée
  M.tap(q, f, 'c1_categories', 'relief');
  assert.equal(f.answers.f7.length, 3);
  M.tap(q, f, 'c1', 'non');
  assert.equal(f.answers.f7.length, 2);
});

test("F7 : une fiche supprimée à la main n'est pas recréée", () => {
  var f = M.newFiche(q);
  M.tap(q, f, 'c1', 'oui');
  M.tap(q, f, 'c1_categories', 'tiers');
  M.removeItem(q, f, 'f7', f.answers.f7[0].id);
  M.tap(q, f, 'c1_categories', 'humain');
  assert.deepEqual(
    f.answers.f7.map((x) => x.categorie),
    ['humain']
  );
});

test('grilles : valeurs par défaut non comptées, préremplissage et mise en évidence depuis C4', () => {
  var f = M.newFiche(q);
  var f6 = q.questions.find((x) => x.id === 'F6').fields[0];
  var f8 = q.questions.find((x) => x.id === 'F8').fields[0];
  var s6 = M.gridState(q, f6, f);
  assert.ok(Object.values(s6).every((r) => r.value === 'neutre' && !r.explicit));
  var s8 = M.gridState(q, f8, f);
  assert.deepEqual(Object.fromEntries(Object.entries(s8).map(([k, v]) => [k, v.value])), {
    infrarouge: 'non-utilise',
    zoom: 'non-utilise',
    telemetre: 'non-utilise',
    liaison: 'neutre',
    etancheite: 'neutre',
    'hot-swap': 'neutre',
    'ecran-rc': 'neutre',
    autonomie: 'neutre'
  });
  assert.equal(M.phaseProgress(q, f, 'vol').done, 0);
  M.tap(q, f, 'c4', 'autonomie-energie');
  M.tap(q, f, 'c4', 'capteur');
  s8 = M.gridState(q, f8, f);
  assert.equal(s8.autonomie.value, 'pas-bien');
  assert.equal(s8.autonomie.prefilled, true);
  assert.equal(s8.infrarouge.value, 'non-utilise');
  assert.ok(s8.infrarouge.highlighted && s8.zoom.highlighted && s8.telemetre.highlighted);
  M.tap(q, f, 'c4', 'capteur');
  M.tap(q, f, 'c4', 'portee-liaison');
  assert.equal(M.gridState(q, f8, f).liaison.value, 'pas-bien');
  M.setGrid(q, f, 'f8', 'autonomie', 'bien');
  assert.equal(M.gridState(q, f8, f).autonomie.value, 'bien', "la saisie l'emporte sur le préremplissage");
});

test('statut : à chaud en cours, à chaud fait, à froid en cours, terminé', () => {
  var f = M.newFiche(q);
  assert.equal(f.statut, 'chaud-en-cours');
  M.tap(q, f, 'c1', 'non');
  assert.equal(f.statut, 'chaud-en-cours');
  M.finishHot(q, f);
  assert.equal(f.statut, 'chaud-fait');
  M.tap(q, f, 'f4', 'totale');
  assert.equal(f.statut, 'froid-en-cours');
  M.finishAll(q, f);
  assert.equal(f.statut, 'termine');
});

test('les tirets typographiques saisis sont remplacés par le tiret classique', () => {
  var f = M.newFiche(q);
  M.setValue(q, f, 'f1_commentaire', 'a \u2013 b \u2014 c');
  assert.equal(f.answers.f1_commentaire, 'a - b - c');
});
