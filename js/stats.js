/* Statistiques sur un ensemble de fiches (sans DOM, testées sous Node) : indicateurs clés, debriefs par mois, et
 * répartition des réponses de chaque question fermée, lue dans questionnaire.json (une question ajoutée y apparaît
 * d'elle-même). Une réponse masquée par le parcours ne compte pas ; les pourcentages portent sur les fiches qui ont
 * répondu au champ. */
import {
  fieldVisible,
  effective,
  nonEngage,
  optionsOf,
  gridState,
  gridFilled,
  perOptionRows,
  isEmpty,
  indexFields
} from './model.js';
import { ficheDate } from './history.js';

export function pct(n, d) {
  return d ? Math.round((n * 100) / d) : 0;
}

function strip(s) {
  return String(s || '')
    .replace(/^« /, '')
    .replace(/ »$/, '');
}

function countRows(options, counts, n) {
  return options
    .map(function (o) {
      return { v: o.v, l: o.l, n: counts[o.v] || 0, pct: pct(counts[o.v] || 0, n) };
    })
    .filter(function (r) {
      return r.n > 0;
    });
}

/** Répartition d'un champ à choix (unique, multiple ou case) sur une liste de valeurs déjà retenues. */
function distOf(field, options, values) {
  var counts = {};
  var n = 0;
  values.forEach(function (v) {
    if (isEmpty(v)) return;
    n += 1;
    if (field.type === 'flag') counts.oui = (counts.oui || 0) + 1;
    else
      (Array.isArray(v) ? v : [v]).forEach(function (x) {
        counts[x] = (counts[x] || 0) + 1;
      });
  });
  var opts = field.type === 'flag' ? [{ v: 'oui', l: 'Oui' }] : options;
  return { type: 'dist', multi: field.type === 'multi', n: n, rows: countRows(opts, counts, n) };
}

function numOf(field, values) {
  var xs = values.filter(function (v) {
    return typeof v === 'number' && !isNaN(v);
  });
  if (!xs.length) return { type: 'num', n: 0 };
  var sum = xs.reduce(function (a, b) {
    return a + b;
  }, 0);
  return {
    type: 'num',
    n: xs.length,
    moy: Math.round((sum / xs.length) * 10) / 10,
    min: Math.min.apply(null, xs),
    max: Math.max.apply(null, xs),
    unit: field.unit || ''
  };
}

function fieldStats(q, field, fiches) {
  var vis = fiches.filter(function (f) {
    return fieldVisible(q, field.key, f);
  });
  var vals = vis.map(function (f) {
    return f.answers[field.key];
  });
  if (field.type === 'single' || field.type === 'multi' || field.type === 'flag')
    return distOf(field, optionsOf(q, field), vals);
  if (field.type === 'slider' || field.type === 'counter') return numOf(field, vals);
  if (field.type === 'grid') {
    var filled = vis.filter(function (f) {
      return gridFilled(q, field, f);
    });
    return {
      type: 'grid',
      n: filled.length,
      rows: field.rows.map(function (r) {
        var c = {};
        filled.forEach(function (f) {
          var v = gridState(q, field, f)[r.v].value;
          c[v] = (c[v] || 0) + 1;
        });
        return { v: r.v, l: r.l, counts: countRows(field.values, c, filled.length) };
      })
    };
  }
  if (field.type === 'perOption') {
    var src = indexFields(q)[field.source].field;
    var by = {};
    vis.forEach(function (f) {
      var cur = f.answers[field.key] || {};
      perOptionRows(q, field, f).forEach(function (o) {
        if (!cur[o.v]) return;
        by[o.v] = by[o.v] || {};
        by[o.v][cur[o.v]] = (by[o.v][cur[o.v]] || 0) + 1;
      });
    });
    var rows = src.options
      .filter(function (o) {
        return by[o.v];
      })
      .map(function (o) {
        var tot = Object.keys(by[o.v]).reduce(function (a, k) {
          return a + by[o.v][k];
        }, 0);
        return { v: o.v, l: o.l, counts: countRows(field.options, by[o.v], tot) };
      });
    return { type: 'grid', n: rows.length, rows: rows };
  }
  if (field.type === 'repeat') {
    var items = [];
    vis.forEach(function (f) {
      (f.answers[field.key] || []).forEach(function (it) {
        items.push(it);
      });
    });
    return {
      type: 'repeat',
      n: items.length,
      itemLabel: field.itemLabel,
      fields: field.fields
        .filter(function (sf) {
          return sf.type !== 'text';
        })
        .map(function (sf) {
          var d = distOf(
            sf,
            optionsOf(q, sf),
            items.map(function (it) {
              return it[sf.key];
            })
          );
          d.l = strip(sf.l);
          return d;
        })
    };
  }
  return null;
}

function countIf(list, fn) {
  return list.filter(fn).length;
}

/** Indicateurs clés, chacun avec sa valeur, sa base et une phrase lisible. */
export function kpis(q, fiches) {
  var idx = indexFields(q);
  var out = [];
  var total = fiches.length;
  out.push({ id: 'total', l: 'Debriefs', v: String(total), detail: '' });
  var eng = fiches.filter(function (f) {
    return !nonEngage(q, f);
  });
  out.push({
    id: 'engages',
    l: 'Drone engagé',
    v: pct(eng.length, total) + ' %',
    detail: eng.length + ' sur ' + total
  });
  if (idx.c2) {
    var withC2 = eng.filter(function (f) {
      return !isEmpty(effective(q, 'c2', f));
    });
    var apport = countIf(withC2, function (f) {
      return effective(q, 'c2', f).some(function (v) {
        return v !== 'sans-apport';
      });
    });
    out.push({
      id: 'apport',
      l: 'Vols avec apport',
      v: pct(apport, withC2.length) + ' %',
      detail: apport + ' sur ' + withC2.length + ' vols renseignés',
      base: withC2.length
    });
  }
  if (idx.c1) {
    var withC1 = fiches.filter(function (f) {
      return !isEmpty(effective(q, 'c1', f));
    });
    var qi = countIf(withC1, function (f) {
      return effective(q, 'c1', f) === 'oui';
    });
    out.push({
      id: 'quasi',
      l: 'Avec quasi-incident',
      v: pct(qi, withC1.length) + ' %',
      detail: qi + ' sur ' + withC1.length + ' renseignés',
      base: withC1.length
    });
  }
  if (idx.f9_gain) {
    var withGain = fiches.filter(function (f) {
      var v = effective(q, 'f9_gain', f);
      return !isEmpty(v) && v !== 'impossible-a-dire';
    });
    var big = countIf(withGain, function (f) {
      return ['30min-1h', 'plus-1h'].indexOf(effective(q, 'f9_gain', f)) >= 0;
    });
    out.push({
      id: 'gain',
      l: 'Gain de 30 min ou plus',
      v: pct(big, withGain.length) + ' %',
      detail: big + ' sur ' + withGain.length + ' estimés',
      base: withGain.length
    });
  }
  var term = countIf(fiches, function (f) {
    return f.statut === 'termine';
  });
  out.push({
    id: 'termines',
    l: 'Debriefs terminés',
    v: pct(term, total) + ' %',
    detail: term + ' sur ' + total,
    base: total
  });
  // Un indicateur sans aucune réponse sur la période n'est pas affiché (pas de « 0 % sur 0 »)
  return out.filter(function (k) {
    return k.base === undefined || k.base > 0;
  });
}

var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** Debriefs par mois d'intervention, du plus ancien au plus récent, mois vides compris entre les deux. */
export function parMois(fiches) {
  var c = {};
  fiches.forEach(function (f) {
    var d = ficheDate(f);
    if (d) c[d.slice(0, 7)] = (c[d.slice(0, 7)] || 0) + 1;
  });
  var ks = Object.keys(c).sort();
  if (!ks.length) return [];
  var out = [];
  var y = +ks[0].slice(0, 4),
    m = +ks[0].slice(5, 7);
  var last = ks[ks.length - 1];
  for (var guard = 0; guard < 600; guard++) {
    var k = y + '-' + (m < 10 ? '0' : '') + m;
    out.push({ mois: k, l: MOIS[m - 1] + ' ' + y, n: c[k] || 0 });
    if (k === last) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Tout le tableau : indicateurs, mois, et détail par phase et par question. */
export function computeStats(q, fiches) {
  return {
    total: fiches.length,
    kpis: kpis(q, fiches),
    mois: parMois(fiches),
    phases: q.phases
      .map(function (p) {
        var questions = q.questions
          .filter(function (qu) {
            return qu.phase === p.id;
          })
          .map(function (qu) {
            var blocs = qu.fields
              .filter(function (f) {
                return f.type !== 'text';
              })
              .map(function (f) {
                var s = fieldStats(q, f, fiches);
                if (s) s.l = strip(f.l);
                return s;
              })
              .filter(function (s) {
                return s && s.n > 0;
              });
            return { id: qu.id, titre: strip(qu.titre), blocs: blocs };
          })
          .filter(function (x) {
            return x.blocs.length;
          });
        return { id: p.id, l: (p.n ? p.n + '. ' : '') + p.l, questions: questions };
      })
      .filter(function (p) {
        return p.questions.length;
      })
  };
}
