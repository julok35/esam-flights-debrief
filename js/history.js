/* Historique des debriefs (sans DOM, testé sous Node) : recherche, filtres par état et par année, tri, résumé
 * d'une fiche pour la liste d'accueil. */
import { ficheTitre, nonEngage, effective, indexFields, isEmpty } from './model.js';

/** Date de l'intervention (AAAA-MM-JJ), à défaut date de création. */
export function ficheDate(fiche) {
  var d = String((fiche.answers && fiche.answers.date) || fiche.cree || '');
  return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : '';
}

export function ficheYear(fiche) {
  return ficheDate(fiche).slice(0, 4);
}

/** Années présentes, la plus récente d'abord. */
export function years(list) {
  var s = {};
  list.forEach(function (f) {
    var y = ficheYear(f);
    if (y) s[y] = true;
  });
  return Object.keys(s).sort().reverse();
}

// Minuscules sans accents, pour une recherche tolérante (« lac blanc » trouve « Lac Blanc »)
export function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function textsOf(v, out) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v))
    v.forEach(function (x) {
      textsOf(x, out);
    });
  else if (v && typeof v === 'object')
    Object.keys(v).forEach(function (k) {
      textsOf(v[k], out);
    });
  return out;
}

/** Texte cherchable : titre, numéro Pat'rouille, réponses saisies, remarques. */
export function searchText(q, fiche) {
  var out = [ficheTitre(q, fiche)];
  textsOf(fiche.answers, out);
  textsOf(fiche.remarques || {}, out);
  return norm(out.join(' '));
}

export var ETATS = [
  { v: 'tous', l: 'Tous' },
  { v: 'en-cours', l: 'En cours' },
  { v: 'termine', l: 'Terminés' }
];

/**
 * Filtre et trie. opts : { texte, etat ('tous' | 'en-cours' | 'termine'), annee ('' = toutes),
 * tri ('date' : date d'intervention, 'maj' : dernière modification) }.
 */
export function filterFiches(q, list, opts) {
  var o = opts || {};
  var words = norm(o.texte).split(/\s+/).filter(Boolean);
  var out = list.filter(function (f) {
    if (o.etat === 'termine' && f.statut !== 'termine') return false;
    if (o.etat === 'en-cours' && f.statut === 'termine') return false;
    if (o.annee && ficheYear(f) !== o.annee) return false;
    if (words.length) {
      var t = searchText(q, f);
      return words.every(function (w) {
        return t.indexOf(w) >= 0;
      });
    }
    return true;
  });
  var key =
    o.tri === 'maj'
      ? function (f) {
          return f.maj || '';
        }
      : function (f) {
          return ficheDate(f) + ' ' + (f.cree || '');
        };
  return out.sort(function (a, b) {
    var ka = key(a),
      kb = key(b);
    return ka < kb ? 1 : ka > kb ? -1 : 0;
  });
}

function optLabel(q, key, v) {
  var e = indexFields(q)[key];
  var o = e && (e.field.options || []).find((x) => x.v === v);
  return o ? o.l : v;
}

/** Résumé court d'une fiche pour la liste : engagement, apport, quasi-incident. */
export function ficheResume(q, fiche) {
  var parts = [];
  if (nonEngage(q, fiche)) parts.push('Non engagé');
  else {
    var c2 = effective(q, 'c2', fiche);
    if (!isEmpty(c2))
      parts.push(
        'Apport : ' +
          c2
            .map(function (v) {
              return optLabel(q, 'c2', v);
            })
            .join(', ')
      );
  }
  var c1 = effective(q, 'c1', fiche);
  if (c1 === 'oui') parts.push('Quasi-incident');
  else if (c1 === 'non') parts.push('Sans quasi-incident');
  return parts.join(' ; ');
}
