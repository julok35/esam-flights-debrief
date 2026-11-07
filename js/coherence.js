/* Cohérence entre réponses (sans DOM, testée sous Node) : quasi-incidents C1 / F7 et apport du drone C2 / F9.
 * Rien n'est corrigé automatiquement : ces fonctions servent aux bandeaux du formulaire, à l'indicateur « Avec
 * quasi-incident » et à la liste « Fiches à vérifier » des statistiques. */
import { effective, itemsDecrits, isEmpty, statutLabel } from './model.js';

/** Quasi-incidents décrits en F7 (fiches avec au moins une saisie), quelle que soit la réponse à C1. */
export function quasiIncidentsDecrits(q, fiche) {
  if (isEmpty(effective(q, 'f7', fiche))) return [];
  return itemsDecrits(q, 'f7', fiche);
}

/** La fiche compte un quasi-incident : C1 à « Oui », ou au moins un quasi-incident décrit en F7. */
export function avecQuasiIncident(q, fiche) {
  return effective(q, 'c1', fiche) === 'oui' || quasiIncidentsDecrits(q, fiche).length > 0;
}

/** Question C1 renseignée, ou quasi-incident décrit : la fiche entre dans la base de l'indicateur. */
export function quasiIncidentRenseigne(q, fiche) {
  return !isEmpty(effective(q, 'c1', fiche)) || quasiIncidentsDecrits(q, fiche).length > 0;
}

/** C1 à « Non » alors que F7 décrit des quasi-incidents : nombre de quasi-incidents décrits, 0 si cohérent. */
export function incoherenceC1F7(q, fiche) {
  if (effective(q, 'c1', fiche) !== 'non') return 0;
  return quasiIncidentsDecrits(q, fiche).length;
}

/** C2 à « Sans apport » alors que des effets sont cochés en F9. */
export function incoherenceC2F9(q, fiche) {
  var c2 = effective(q, 'c2', fiche);
  return Array.isArray(c2) && c2.indexOf('sans-apport') >= 0 && !isEmpty(effective(q, 'f9_effets', fiche));
}

export function pluriel(n, un, plusieurs) {
  return n + ' ' + (n > 1 ? plusieurs : un);
}

/** Incohérences d'une fiche, avec un libellé court pour la liste « Fiches à vérifier ». */
export function incoherences(q, fiche) {
  var out = [];
  var n = incoherenceC1F7(q, fiche);
  if (n)
    out.push({
      id: 'c1-f7',
      l: 'C1 / F7 : C1 à « Non », mais ' + pluriel(n, 'quasi-incident décrit', 'quasi-incidents décrits') + ' en F7'
    });
  if (incoherenceC2F9(q, fiche))
    out.push({ id: 'c2-f9', l: 'C2 / F9 : C2 « Sans apport », mais des effets cochés en F9' });
  return out;
}

/** Liste « Fiches à vérifier » : incohérences, puis debriefs non terminés. Aucune fiche n'est modifiée. */
export function aVerifier(q, fiches) {
  var inco = [];
  var enCours = [];
  fiches.forEach(function (f) {
    var l = incoherences(q, f);
    if (l.length) inco.push({ fiche: f, raisons: l });
    if (f.statut !== 'termine') enCours.push({ fiche: f, raisons: [{ id: 'statut', l: statutLabel(q, f.statut) }] });
  });
  return { incoherences: inco, nonTermines: enCours };
}
