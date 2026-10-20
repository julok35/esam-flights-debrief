// Outils communs aux tests Node : questionnaire et fiche de démonstration.
import { readFileSync } from 'node:fs';
import * as M from '../js/model.js';

export function loadQ() {
  return JSON.parse(readFileSync(new URL('../questionnaire.json', import.meta.url), 'utf8'));
}

/** Fiche complète type : un quasi-incident, matériel, remarques, textes avec caractères à risque. */
export function sampleFiche(q) {
  var f = M.newFiche(q, 'pilote');
  M.setValue(q, f, 'patrouille', '2026-145');
  M.tap(q, f, 'c1', 'oui');
  M.tap(q, f, 'c1_categories', 'perte-liaison');
  M.tap(q, f, 'c2', 'localisation-animal');
  M.tap(q, f, 'c3_source', 'collier-gps');
  M.tap(q, f, 'c3_ecart_h', '30-100m');
  M.tap(q, f, 'c4', 'portee-liaison');
  M.tap(q, f, 'c4', 'capteur');
  M.setValue(q, f, 'c5_power2000', 40);
  M.setValue(q, f, 'c5_tb30', 2);
  M.tap(q, f, 'f3', 'partielle');
  M.tap(q, f, 'f3_pourquoi', 'pas-reseau');
  M.setGrid(q, f, 'f6', 'abri', 'pas-bien');
  M.setObservation(q, f, 'f8', 'liaison', 'Coupures | derrière la crête');
  var it = f.answers.f7[0];
  M.setItemValue(q, f, 'f7', it.id, 'faits', 'Perte vidéo 20 s\nRTH déclenché');
  M.tapItem(q, f, 'f7', it.id, 'moment', 'recherche');
  M.tapItem(q, f, 'f7', it.id, 'evite', 'rth');
  M.setValue(q, f, 'f12_volume', 64);
  M.tap(q, f, 'f14', 'relais-garmin');
  M.tapPerOption(q, f, 'f14_issue', 'relais-garmin', 'peut-etre');
  M.setValue(q, f, 'f14_test', 'Essai relais -- 100 %% sûr \u2014 vraiment');
  var r = M.addRemark(q, f, 'vol', 'copilote');
  M.setRemark(q, f, 'vol', r.id, { texte: 'Vue directe perdue' });
  return f;
}
