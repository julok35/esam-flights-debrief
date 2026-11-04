// Plan de synchronisation : la plus récente l'emporte, suppressions transmises dans les deux sens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSync } from '../js/sync.js';

var f = (id, maj) => ({ debrief_id: id, maj: maj, answers: {} });
var r = (id, maj, supprime) => ({ debrief_id: id, maj: maj, supprime: !!supprime });
var T1 = '2026-11-01T10:00:00.000Z',
  T2 = '2026-11-02T10:00:00.000Z',
  T3 = '2026-11-03T10:00:00.000Z';

test('fiche seulement ici : envoyée ; seulement en ligne : récupérée', () => {
  var p = planSync([f('a', T1)], {}, [r('b', T1)]);
  assert.deepEqual(
    p.envoyer.map((x) => x.debrief_id),
    ['a']
  );
  assert.deepEqual(p.recuperer, ['b']);
});

test('des deux côtés : la plus récente gagne, identiques : rien', () => {
  var p = planSync([f('a', T2), f('b', T1), f('c', T1)], {}, [r('a', T1), r('b', T2), r('c', T1)]);
  assert.deepEqual(
    p.envoyer.map((x) => x.debrief_id),
    ['a']
  );
  assert.deepEqual(p.recuperer, ['b']);
});

test('supprimée ici : suppression transmise, sauf si la fiche a été modifiée ailleurs après', () => {
  var p = planSync([], { a: T2, b: T1 }, [r('a', T1), r('b', T2)]);
  assert.deepEqual(p.supprimerEnLigne, [{ debrief_id: 'a', maj: T2 }]);
  assert.deepEqual(p.recuperer, ['b']);
  assert.deepEqual(p.oublierTombes, ['b']);
});

test('supprimée en ligne : retirée ici, sauf si modifiée ici après', () => {
  var p = planSync([f('a', T1), f('b', T3)], {}, [r('a', T2, true), r('b', T2, true)]);
  assert.deepEqual(p.supprimerIci, ['a']);
  assert.deepEqual(
    p.envoyer.map((x) => x.debrief_id),
    ['b']
  );
});

test('suppression jamais transmise et absente en ligne : oubliée ; fiche réimportée après suppression : gardée', () => {
  var p = planSync([f('b', T2)], { a: T1, b: T1 }, []);
  assert.deepEqual(p.oublierTombes.sort(), ['a', 'b']);
  assert.deepEqual(
    p.envoyer.map((x) => x.debrief_id),
    ['b']
  );
  assert.deepEqual(p.supprimerEnLigne, []);
});
