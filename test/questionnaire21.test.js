// Questionnaire 2.1 : cohérence C1 / F7 et C2 / F9, obstacles repérés, durée de vol (F12), fiches à vérifier, et
// compatibilité des fiches saisies en 2.0 (vue, modification, export, statistiques).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import * as M from '../js/model.js';
import { toMarkdown, extractState } from '../js/markdown.js';
import { computeStats } from '../js/stats.js';
import { ficheResume } from '../js/history.js';
import { readNote } from '../js/importer.js';
import { avecQuasiIncident, incoherenceC1F7, incoherenceC2F9, incoherences, aVerifier } from '../js/coherence.js';
import { DEBIT_GO_PAR_MIN, DEBIT_A_CALIBRER } from '../js/config.js';
import { loadQ, sampleFiche, fiche20 } from './helpers.js';

var q = loadQ();
var fmOf = (md) => parse(/^---\n([\s\S]*?)\n---\n/.exec(md)[1]);
var kpi = (st, id) => st.kpis.find((k) => k.id === id);
function bloc(st, qid, l) {
  for (var p of st.phases) for (var qu of p.questions) if (qu.id === qid) return qu.blocs.find((b) => !l || b.l === l);
  return undefined;
}

test('questionnaire en version 2.1', () => {
  assert.equal(q.version, '2.1');
});

/* ---------- Compatibilité 2.0 ---------- */

test('fiche 2.0 : version d’origine gardée tant qu’elle n’est pas modifiée, 2.1 dès la première modification', () => {
  var f = fiche20();
  var md = toMarkdown(q, f);
  assert.equal(fmOf(md).questionnaire_version, '2.0');
  assert.match(md, /questionnaire v2\.0/);
  M.setValue(q, f, 'f13_commentaire', 'Complément');
  assert.equal(f.questionnaire_version, '2.1');
  var g = fiche20();
  M.addRemark(q, g, 'vol', 'auxiliaire');
  assert.equal(g.questionnaire_version, '2.1', 'une remarque est une modification');
});

test('fiche 2.0 : aucune clé ni valeur renommée ou supprimée à la lecture et à l’export', () => {
  var f = fiche20();
  var avant = JSON.stringify(f);
  var md = toMarkdown(q, f);
  computeStats(q, [f]);
  ficheResume(q, f);
  assert.equal(JSON.stringify(f), avant, 'lecture sans effet de bord');
  var st = extractState(md);
  assert.deepEqual(st, JSON.parse(avant), 'bloc de reprise identique');
  var r = readNote(q, md);
  assert.equal(r.partiel, false);
  assert.deepEqual(r.fiche, JSON.parse(avant));
});

test('fiche 2.0 : F12 en lecture seule (« Volume saisi », ancienne version), durée non demandée', () => {
  var f = fiche20();
  assert.equal(M.fieldVisible(q, 'f12_volume', f), true);
  assert.equal(M.fieldVisible(q, 'f12_duree_min', f), false);
  assert.equal(
    M.questionAnswered(
      q,
      q.questions.find((x) => x.id === 'F12'),
      f
    ),
    true,
    'F12 compte comme répondue'
  );
  var md = toMarkdown(q, f);
  assert.match(md, /- Volume saisi : 64 Go \(ancienne version\)/);
  assert.doesNotMatch(md, /Durée totale de vol/);
  var fm = fmOf(md);
  assert.equal(fm.f12_volume, 64);
  assert.equal(fm.f12_duree_min, null);
  assert.equal(fm.f12_volume_estime, null);
});

test('fiche 2.0 : export complet (F7 gardé malgré C1 à « Non », grilles, remarques)', () => {
  var f = fiche20();
  var md = toMarkdown(q, f);
  var fm = fmOf(md);
  assert.equal(fm.c1, 'non');
  assert.equal(fm.f7_nb, 1);
  assert.deepEqual(fm.f7_categories, ['obstacle']);
  assert.deepEqual(fm.c2, ['sans-apport']);
  assert.deepEqual(fm.f9_effets, ['zone-ecartee']);
  assert.equal(fm.f6_obstacles, 'pas-bien', 'ligne « Obstacles » de la grille F6 inchangée');
  assert.deepEqual(fm.f6_obstacles_reperes, [], 'nouveau champ vide pour une fiche 2.0');
  assert.deepEqual(fm.f6_obstacles_trajectoire, {});
  assert.match(md, /Ligne haute tension dans le secteur/);
  assert.match(md, /\*\*Copilote\*\* :/);
});

test('fiche 2.0 : modifiable (durée de vol non demandée, autres réponses modifiables, rien de perdu)', () => {
  var f = fiche20();
  M.tap(q, f, 'f6_obstacles_reperes', 'ligne-electrique');
  M.tapPerOption(q, f, 'f6_obstacles_trajectoire', 'ligne-electrique', 'hors-trajectoire');
  assert.equal(f.answers.f12_volume, 64);
  assert.equal(f.answers.f7.length, 1, 'F7 non supprimé sans confirmation');
  assert.equal(f.answers.f7[0].faits, fiche20().answers.f7[0].faits);
  var fm = fmOf(toMarkdown(q, f));
  assert.deepEqual(fm.f6_obstacles_reperes, ['ligne-electrique']);
  assert.deepEqual(fm.f6_obstacles_trajectoire, { 'ligne-electrique': 'hors-trajectoire' });
});

test('fiche 2.0 : statistiques (quasi-incident, volume saisi, fiches à vérifier)', () => {
  var st = computeStats(q, [fiche20()]);
  assert.equal(kpi(st, 'quasi').v, '100 %');
  assert.equal(kpi(st, 'quasi').detail, '1 sur 1 renseignés');
  var vol = bloc(st, 'F12', 'Volume enregistré (saisi en version 2.0, sinon estimé)');
  assert.equal(vol.n, 1);
  assert.equal(vol.moy, 64);
  assert.equal(bloc(st, 'F12', 'Volume saisi'), undefined, 'pas de bloc séparé pour l’ancien champ');
  var v = aVerifier(q, [fiche20()]);
  assert.equal(v.incoherences.length, 1);
  assert.deepEqual(
    v.incoherences[0].raisons.map((r) => r.id),
    ['c1-f7', 'c2-f9']
  );
  assert.equal(v.nonTermines.length, 0);
});

/* ---------- Lot 1 : C1 / F7 ---------- */

test('C1 / F7 : C1 à « Non » avec un quasi-incident décrit est signalé, pas corrigé', () => {
  var f = sampleFiche(q);
  assert.equal(incoherenceC1F7(q, f), 0);
  M.tap(q, f, 'c1', 'non');
  assert.equal(f.answers.c1, 'non');
  assert.equal(f.answers.f7.length, 1, 'le quasi-incident décrit reste');
  assert.equal(incoherenceC1F7(q, f), 1);
  assert.equal(avecQuasiIncident(q, f), true);
  assert.match(ficheResume(q, f), /Quasi-incident/);
});

test('C1 / F7 : un quasi-incident ouvert depuis C1 mais vide ne compte pas', () => {
  var f = M.newFiche(q);
  M.tap(q, f, 'c1', 'oui');
  M.tap(q, f, 'c1_categories', 'meteo');
  assert.equal(f.answers.f7.length, 1);
  M.tap(q, f, 'c1', 'non');
  assert.equal(f.answers.f7, undefined, 'fiche F7 vide retirée comme avant');
  assert.equal(incoherenceC1F7(q, f), 0);
  assert.equal(avecQuasiIncident(q, f), false);
});

test('C1 / F7 : « Supprimer » vide F7, « Garder » repasse C1 à « Oui » avec ses catégories', () => {
  var f = sampleFiche(q);
  M.tap(q, f, 'c1', 'non');
  M.setValue(q, f, 'c1', 'oui');
  assert.deepEqual(f.answers.c1_categories, ['perte-liaison']);
  assert.equal(incoherenceC1F7(q, f), 0);
  assert.equal(f.answers.f7.length, 1);
  M.tap(q, f, 'c1', 'non');
  M.clearItems(q, f, 'f7');
  assert.equal(f.answers.f7, undefined);
  assert.equal(f.answers.f7_ignores, undefined);
  assert.equal(incoherenceC1F7(q, f), 0);
  assert.equal(avecQuasiIncident(q, f), false);
});

test('indicateur « Avec quasi-incident » : C1 à « Oui » ou F7 non vide', () => {
  var oui = M.newFiche(q);
  M.tap(q, oui, 'c1', 'oui');
  var non = M.newFiche(q);
  M.tap(q, non, 'c1', 'non');
  var vide = M.newFiche(q);
  var sansC1 = M.newFiche(q);
  var it = M.addItem(q, sansC1, 'f7');
  M.setItemValue(q, sansC1, 'f7', it.id, 'faits', 'Câble frôlé');
  var st = computeStats(q, [oui, non, vide, sansC1, fiche20()]);
  assert.equal(kpi(st, 'quasi').detail, '3 sur 4 renseignés');
});

/* ---------- Lot 2 : obstacles repérés ---------- */

test('obstacles repérés : facultatif, position par obstacle, export et statistiques', () => {
  var f = M.newFiche(q);
  assert.equal(
    M.questionAnswered(
      q,
      q.questions.find((x) => x.id === 'F6'),
      f
    ),
    false
  );
  M.tap(q, f, 'f6_obstacles_reperes', 'ligne-electrique');
  M.tap(q, f, 'f6_obstacles_reperes', 'cable');
  M.tapPerOption(q, f, 'f6_obstacles_trajectoire', 'ligne-electrique', 'hors-trajectoire');
  M.tapPerOption(q, f, 'f6_obstacles_trajectoire', 'cable', 'sur-trajectoire');
  var rows = M.perOptionRows(q, M.indexFields(q).f6_obstacles_trajectoire.field, f).map((o) => o.v);
  assert.deepEqual(rows, ['ligne-electrique', 'cable']);
  var md = toMarkdown(q, f);
  var fm = fmOf(md);
  assert.deepEqual(fm.f6_obstacles_reperes, ['ligne-electrique', 'cable']);
  assert.deepEqual(fm.f6_obstacles_trajectoire, { 'ligne-electrique': 'hors-trajectoire', cable: 'sur-trajectoire' });
  assert.match(
    md,
    /- Obstacles repérés à l'installation : Ligne électrique, Câble \(téléphérique, remontée, forestier\)/
  );
  assert.match(md, /- Obstacle Ligne électrique : Hors trajectoire/);
  assert.equal(f.answers.f7, undefined, 'aucun quasi-incident créé');

  var g = M.newFiche(q);
  M.tap(q, g, 'f6_obstacles_reperes', 'ligne-electrique');
  M.tapPerOption(q, g, 'f6_obstacles_trajectoire', 'ligne-electrique', 'hors-trajectoire');
  var st = computeStats(q, [f, g, fiche20()]);
  var freq = bloc(st, 'F6', "Obstacles repérés à l'installation");
  assert.equal(freq.n, 2);
  assert.deepEqual(
    freq.rows.map((r) => [r.v, r.n]),
    [
      ['ligne-electrique', 2],
      ['cable', 1]
    ]
  );
  var pos = bloc(st, 'F6', 'Position par rapport à la trajectoire');
  var ligne = pos.rows.find((r) => r.v === 'ligne-electrique');
  assert.deepEqual(
    ligne.counts.map((c) => [c.v, c.n]),
    [['hors-trajectoire', 2]]
  );
});

test('obstacles repérés : clés distinctes de la ligne « Obstacles » de la grille F6', () => {
  var f = M.newFiche(q);
  M.setGrid(q, f, 'f6', 'obstacles', 'pas-bien');
  M.tap(q, f, 'f6_obstacles_reperes', 'paroi');
  var fm = fmOf(toMarkdown(q, f));
  assert.equal(fm.f6_obstacles, 'pas-bien');
  assert.deepEqual(fm.f6_obstacles_reperes, ['paroi']);
});

/* ---------- Lot 3 : C2 / F9 ---------- */

test('C2 : aide sous « Sans apport »', () => {
  var o = M.indexFields(q).c2.field.options.find((x) => x.v === 'sans-apport');
  assert.equal(
    o.aide,
    "Le drone n'a rien changé, même pas une zone écartée ou une décision. Une recherche négative qui écarte une zone est une levée de doute."
  );
});

test('C2 / F9 : « Sans apport » avec des effets cochés est signalé, sans rien changer', () => {
  var f = M.newFiche(q);
  M.tap(q, f, 'c2', 'sans-apport');
  assert.equal(incoherenceC2F9(q, f), false);
  M.tap(q, f, 'f9_effets', 'zone-ecartee');
  assert.equal(incoherenceC2F9(q, f), true);
  assert.deepEqual(f.answers.c2, ['sans-apport']);
  M.tap(q, f, 'c2', 'levee-doute');
  assert.equal(incoherenceC2F9(q, f), false);
  // Parcours « non engagé » : F9 masquée, rien à signaler
  var g = M.newFiche(q);
  M.tap(q, g, 'f9_effets', 'temps-gagne');
  M.tap(q, g, 'c2', 'non-engage');
  assert.equal(incoherenceC2F9(q, g), false);
});

/* ---------- Lot 4 : fiches à vérifier ---------- */

test('fiches à vérifier : incohérences et debriefs non terminés, sans modification', () => {
  var ok = M.newFiche(q);
  M.tap(q, ok, 'c1', 'non');
  M.finishAll(q, ok);
  var enCours = M.newFiche(q);
  M.finishHot(q, enCours);
  var inco = sampleFiche(q);
  M.tap(q, inco, 'c1', 'non');
  var list = [ok, enCours, inco, fiche20()];
  var avant = JSON.stringify(list);
  var v = aVerifier(q, list);
  assert.deepEqual(
    v.incoherences.map((x) => x.fiche.debrief_id),
    [inco.debrief_id, fiche20().debrief_id]
  );
  assert.deepEqual(
    v.nonTermines.map((x) => x.fiche.debrief_id),
    [enCours.debrief_id, inco.debrief_id]
  );
  assert.equal(v.nonTermines[0].raisons[0].l, 'À chaud fait');
  assert.match(incoherences(q, inco)[0].l, /1 quasi-incident décrit en F7/);
  assert.equal(JSON.stringify(list), avant);
});

/* ---------- Lot 5 : F12 durée de vol et volume estimé ---------- */

test('F12 : durée en minutes par pas de 5, volume estimé = durée x débit', () => {
  var field = M.indexFields(q).f12_duree_min.field;
  assert.equal(field.type, 'counter');
  assert.equal(field.step, 5);
  assert.equal(field.unit, 'min');
  var f = M.newFiche(q);
  assert.equal(M.fieldVisible(q, 'f12_duree_min', f), true);
  assert.equal(M.fieldVisible(q, 'f12_volume', f), false, 'ancien champ masqué pour une fiche neuve');
  assert.equal(M.estimation(q, field, f), null);
  M.setValue(q, f, 'f12_duree_min', 35);
  assert.equal(M.estimation(q, field, f), Math.round(35 * DEBIT_GO_PAR_MIN * 10) / 10);
  var md = toMarkdown(q, f);
  assert.match(md, /- Durée totale de vol, approximative : 35 min/);
  assert.match(md, /- Volume estimé : [\d,]+ Go/);
  if (DEBIT_A_CALIBRER) assert.match(md, /débit provisoire de [\d,]+ Go\/min, à calibrer/);
});

test('F12 : statistiques de volume = volume saisi s’il existe, sinon estimation', () => {
  var neuve = M.newFiche(q);
  M.setValue(q, neuve, 'f12_duree_min', 30);
  var vide = M.newFiche(q);
  var st = computeStats(q, [neuve, vide, fiche20()]);
  var vol = bloc(st, 'F12', 'Volume enregistré (saisi en version 2.0, sinon estimé)');
  assert.equal(vol.n, 2);
  assert.equal(vol.max, Math.max(64, 30 * DEBIT_GO_PAR_MIN));
  assert.equal(vol.min, Math.min(64, 30 * DEBIT_GO_PAR_MIN));
  var duree = bloc(st, 'F12', 'Durée totale de vol, approximative');
  assert.equal(duree.n, 1);
  assert.equal(duree.unit, 'min');
});

test('F12 : débit défini dans js/config.js et marqué à calibrer, avec sa source', async () => {
  var { readFileSync } = await import('node:fs');
  var src = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
  assert.match(src, /export var DEBIT_GO_PAR_MIN = /);
  assert.match(src, /CALIBRAGE_DEBIT\.md/);
  assert.equal(typeof DEBIT_GO_PAR_MIN, 'number');
  assert.ok(DEBIT_GO_PAR_MIN > 0);
});
