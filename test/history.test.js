// Historique et statistiques : filtres, recherche, indicateurs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/model.js';
import { filterFiches, years, ficheResume, norm } from '../js/history.js';
import { computeStats, parMois } from '../js/stats.js';
import { loadQ, sampleFiche } from './helpers.js';

var q = loadQ();
function mk(date, o) {
  var f = M.newFiche(q, 'pilote');
  M.setValue(q, f, 'date', date);
  Object.keys(o || {}).forEach((k) => {
    var v = o[k];
    if (Array.isArray(v)) v.forEach((x) => M.tap(q, f, k, x));
    else if (typeof v === 'string' && M.indexFields(q)[k].field.type === 'single') M.tap(q, f, k, v);
    else M.setValue(q, f, k, v);
  });
  return f;
}

test('recherche sans accents ni casse, dans les textes libres et les remarques', () => {
  var a = sampleFiche(q);
  M.setValue(q, a, 'animaux', 'Pépette');
  var b = mk('2025-01-02', { lieu: 'Chamrousse' });
  assert.equal(norm('Éévitement'), 'eevitement');
  assert.deepEqual(filterFiches(q, [a, b], { texte: 'PEPETTE' }), [a]);
  assert.deepEqual(filterFiches(q, [a, b], { texte: 'rth declenche' }), [a]);
  assert.deepEqual(filterFiches(q, [a, b], { texte: 'vue directe perdue' }), [a]);
  assert.deepEqual(filterFiches(q, [a, b], { texte: 'chamrousse' }), [b]);
});

test('filtres par état et par année, tri par date d’intervention ou par modification', () => {
  var a = mk('2025-06-01');
  var b = mk('2026-03-01');
  var c = mk('2026-01-01');
  M.finishAll(q, c);
  c.maj = '2099-01-01T00:00:00.000Z';
  assert.deepEqual(years([a, b, c]), ['2026', '2025']);
  assert.deepEqual(filterFiches(q, [a, b, c], { annee: '2026' }), [b, c]);
  assert.deepEqual(filterFiches(q, [a, b, c], { etat: 'termine' }), [c]);
  assert.deepEqual(filterFiches(q, [a, b, c], { etat: 'en-cours' }), [b, a]);
  assert.equal(filterFiches(q, [a, b, c], { tri: 'maj' })[0], c);
});

test('résumé de la fiche', () => {
  assert.equal(ficheResume(q, sampleFiche(q)), "Apport : Localisation de l'animal ; Quasi-incident");
  assert.equal(ficheResume(q, mk('2026-01-01', { c2: ['non-engage'] })), 'Non engagé');
});

test('indicateurs : bases de calcul limitées aux fiches renseignées', () => {
  var list = [
    mk('2026-01-05', { c1: 'oui', c2: ['localisation-animal'], f9_gain: 'plus-1h' }),
    mk('2026-01-20', { c1: 'non', c2: ['sans-apport'], f9_gain: 'impossible-a-dire' }),
    mk('2026-03-02', { c2: ['non-engage'] })
  ];
  var k = {};
  computeStats(q, list).kpis.forEach((x) => (k[x.id] = x));
  assert.equal(k.total.v, '3');
  assert.equal(k.engages.detail, '2 sur 3');
  assert.equal(k.apport.v, '50 %');
  assert.equal(k.quasi.detail, '1 sur 2 renseignés');
  assert.equal(k.gain.detail, '1 sur 1 estimés');
  // Sans aucune estimation du gain de temps : indicateur absent
  assert.ok(!computeStats(q, [list[2]]).kpis.some((x) => x.id === 'gain'));
});

test('debriefs par mois, mois vides compris', () => {
  var m = parMois([mk('2025-11-03'), mk('2026-01-20'), mk('2026-01-21')]);
  assert.deepEqual(
    m.map((x) => [x.mois, x.n]),
    [
      ['2025-11', 1],
      ['2025-12', 0],
      ['2026-01', 2]
    ]
  );
});

test('détail par question : choix, nombres, grilles, quasi-incidents, réponses masquées ignorées', () => {
  var a = sampleFiche(q);
  var b = mk('2026-01-01', { c2: ['non-engage'], c4: ['capteur'] }); // C4 masquée par le parcours court
  var st = computeStats(q, [a, b]);
  var get = (id) => st.phases.flatMap((p) => p.questions).find((x) => x.id === id);
  var c4 = get('C4').blocs[0];
  assert.equal(c4.n, 1);
  assert.deepEqual(
    c4.rows.map((r) => [r.v, r.n, r.pct]),
    [
      ['portee-liaison', 1, 100],
      ['capteur', 1, 100]
    ]
  );
  var c5 = get('C5').blocs.find((x) => x.type === 'num');
  assert.equal(c5.moy, 40);
  var f6 = get('F6').blocs[0];
  assert.equal(f6.type, 'grid');
  assert.deepEqual(
    f6.rows.find((r) => r.v === 'abri').counts.map((c) => [c.v, c.n]),
    [['pas-bien', 1]]
  );
  var f7 = get('F7').blocs[0];
  assert.equal(f7.n, 1);
  assert.equal(f7.fields.find((x) => x.l === 'Moment').rows[0].v, 'recherche');
  var f14 = get('F14').blocs.find((x) => x.type === 'grid');
  assert.deepEqual(
    f14.rows[0].counts.map((c) => c.v),
    ['peut-etre']
  );
});
