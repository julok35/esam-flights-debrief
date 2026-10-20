/* Note Markdown pour Obsidian (sans DOM, testée sous Node) : frontmatter YAML pour Dataview, corps par phase,
 * section Données Airdata réservée, bloc de reprise (état complet en JSON base64 dans un commentaire %% ... %%). */
import {
  effective,
  fieldVisible,
  fieldLabel,
  nonEngage,
  optionsOf,
  gridState,
  gridFilled,
  perOptionRows,
  visiblePhases,
  phaseQuestions,
  statutLabel,
  cleanText,
  isEmpty
} from './model.js';
import { APP_VERSION } from './version.js';

export var DATA_TAG = 'esam-debrief-data:v1';

/* ---------- YAML ---------- */

// Mots que YAML (1.1 compris, celui de nombreux outils) lirait comme booléen ou null
var RESERVED = /^(y|n|yes|no|on|off|true|false|null|~)$/i;
function raw(s) {
  return { raw: s };
}
export function yamlScalar(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'raw' in v) return v.raw;
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  var s = String(v);
  if (/^[a-z][a-z0-9-]*(\/[a-z0-9-]+)*$/.test(s) && !RESERVED.test(s)) return s;
  return JSON.stringify(s); // une chaîne JSON est un scalaire YAML entre guillemets valide
}
function yamlValue(v, indent) {
  if (Array.isArray(v)) {
    if (!v.length) return ' []';
    if (v[0] && typeof v[0] === 'object' && !('raw' in v[0]))
      return (
        '\n' +
        v
          .map(function (o) {
            return yamlItem(o, indent + '  ');
          })
          .join('\n')
      );
    return ' [' + v.map(yamlScalar).join(', ') + ']';
  }
  if (v && typeof v === 'object' && !('raw' in v)) {
    if (!Object.keys(v).length) return ' {}';
    return '\n' + yamlMap(v, indent + '  ');
  }
  var s = yamlScalar(v);
  return s === '' ? '' : ' ' + s;
}
// Élément de liste de correspondances (F7) : « - clé: valeur », clés suivantes alignées
function yamlItem(o, indent) {
  var ks = Object.keys(o);
  if (!ks.length) return indent + '- {}';
  return ks
    .map(function (k, i) {
      return (i ? indent + '  ' : indent + '- ') + yamlKey(k) + ':' + yamlValue(o[k], indent + '  ');
    })
    .join('\n');
}
function yamlMap(obj, indent) {
  return Object.keys(obj)
    .map(function (k) {
      return indent + yamlKey(k) + ':' + yamlValue(obj[k], indent);
    })
    .join('\n');
}
function yamlKey(k) {
  return /^[a-z0-9_-]+$/.test(k) && !RESERVED.test(k) ? k : JSON.stringify(k);
}

/* ---------- Frontmatter ---------- */

function slugKey(s) {
  return s.replace(/-/g, '_');
}

function closedValue(q, field, fiche) {
  if (!fieldVisible(q, field.key, fiche)) return field.type === 'multi' ? [] : null;
  var v = fiche.answers[field.key];
  if (field.type === 'multi') return Array.isArray(v) ? v : [];
  if (field.type === 'flag') return !!v;
  return isEmpty(v) ? null : v;
}

/** Champs du frontmatter, dans l'ordre du questionnaire : un par réponse fermée. */
export function frontmatter(q, fiche) {
  var a = fiche.answers;
  var fm = {
    type: 'debrief-vol-drone',
    debrief_id: fiche.debrief_id,
    questionnaire_version: fiche.questionnaire_version,
    app_version: APP_VERSION,
    statut: fiche.statut,
    date: a.date ? raw(a.date) : null,
    patrouille: a.patrouille || null,
    role_saisie: fiche.role_saisie,
    date_maj: raw(fiche.maj.slice(0, 10)),
    tags: ['esam/debrief-drone']
  };
  q.questions.forEach(function (qu) {
    qu.fields.forEach(function (f) {
      if (f.type === 'text') return;
      if (f.type === 'grid') {
        var filled = fieldVisible(q, f.key, fiche) && gridFilled(q, f, fiche);
        var st = gridState(q, f, fiche);
        f.rows.forEach(function (r) {
          fm[f.key + '_' + slugKey(r.v)] = filled ? st[r.v].value : null;
        });
      } else if (f.type === 'repeat') {
        var items = (fieldVisible(q, f.key, fiche) && a[f.key]) || [];
        fm[f.key + '_nb'] = items.length;
        fm[f.key + '_categories'] = items
          .map(function (it) {
            return it.categorie;
          })
          .filter(Boolean);
        fm[f.key + '_incidents'] = items.map(function (it) {
          var o = {};
          f.fields.forEach(function (sf) {
            if (sf.type === 'text') return;
            var v = it[sf.key];
            o[sf.key] = sf.type === 'multi' ? v || [] : isEmpty(v) ? null : v;
          });
          return o;
        });
      } else if (f.type === 'perOption') {
        var m = {};
        var cur = a[f.key] || {};
        perOptionRows(q, f, fiche).forEach(function (o) {
          m[o.v] = cur[o.v] || null;
        });
        fm[f.key] = m;
      } else {
        fm[f.key] = closedValue(q, f, fiche);
      }
    });
    (qu.derived || []).forEach(function (d) {
      var on =
        !d.ifAny ||
        d.ifAny.some(function (k) {
          return !isEmpty(effective(q, k, fiche));
        });
      fm[d.key] = on ? d.value : null;
    });
  });
  return fm;
}

export function toYaml(obj) {
  return yamlMap(obj, '');
}

/* ---------- Corps ---------- */

function frDate(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}
// Texte libre : ni commentaire Obsidian ouvert par erreur, ni tiret typographique
function safe(s) {
  return cleanText(s).replace(/%%/g, '% %');
}
function quote(s) {
  return safe(s)
    .split(/\r?\n/)
    .map(function (l) {
      return '> ' + l;
    })
    .join('\n');
}
function cell(s) {
  return safe(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}
function lbl(options, v) {
  var o = options.find(function (x) {
    return x.v === v;
  });
  return o ? o.l : v;
}
function stripQuotes(s) {
  return s.replace(/^« /, '').replace(/ »$/, '');
}
function labelOf(f, fiche) {
  var l = fieldLabel(f, fiche);
  return l ? stripQuotes(l) : 'Réponse';
}

function fieldLines(q, f, fiche, val) {
  var opts = optionsOf(q, f);
  var label = f.l ? stripQuotes(f.l) : 'Réponse';
  if (f.type === 'single') return isEmpty(val) ? [] : ['- ' + label + ' : ' + lbl(opts, val)];
  if (f.type === 'multi')
    return isEmpty(val)
      ? []
      : [
          '- ' +
            label +
            ' : ' +
            val
              .map(function (v) {
                return lbl(opts, v);
              })
              .join(', ')
        ];
  if (f.type === 'flag') return val ? ['- ' + label] : [];
  if (f.type === 'slider') return isEmpty(val) ? [] : ['- ' + label + ' : ' + val + ' ' + f.unit];
  if (f.type === 'counter') return isEmpty(val) ? [] : ['- ' + label + ' : ' + val];
  if (f.type === 'text') return isEmpty(val) ? [] : ['- ' + label + ' :', '', quote(val), ''];
  return [];
}

function questionBody(q, qu, fiche) {
  var out = ['**' + qu.id + '. ' + qu.titre + '**', ''];
  var lines = [];
  qu.fields.forEach(function (f) {
    if (!fieldVisible(q, f.key, fiche)) return;
    var a = fiche.answers;
    if (f.type === 'grid') {
      if (!gridFilled(q, f, fiche)) return;
      var st = gridState(q, f, fiche);
      var obs = a[f.key + '_obs'] || {};
      lines.push('| Élément | Évaluation | Observation |', '|---|---|---|');
      f.rows.forEach(function (r) {
        var s = st[r.v];
        var note = s.explicit ? '' : s.prefilled ? ' (prérempli à chaud)' : ' (par défaut)';
        lines.push(
          '| ' + cell(r.l) + ' | ' + lbl(f.values, s.value) + note + ' | ' + (obs[r.v] ? cell(obs[r.v]) : '') + ' |'
        );
      });
      lines.push('');
    } else if (f.type === 'repeat') {
      (a[f.key] || []).forEach(function (it, i) {
        var cat = it.categorie ? lbl(optionsOf(q, f.fields[0]), it.categorie) : 'sans catégorie';
        lines.push('*' + f.itemLabel + ' ' + (i + 1) + ' : ' + cat + '*', '');
        var n = lines.length;
        f.fields.forEach(function (sf) {
          if (sf.key !== f.seedKey) lines.push.apply(lines, fieldLines(q, sf, fiche, it[sf.key]));
        });
        if (lines.length === n) lines.push('Non détaillé.');
        lines.push('');
      });
    } else if (f.type === 'perOption') {
      var cur = a[f.key] || {};
      perOptionRows(q, f, fiche).forEach(function (o) {
        if (cur[o.v]) lines.push('- ' + stripQuotes(f.l) + ' ' + o.l + ' : ' + lbl(f.options, cur[o.v]));
      });
    } else {
      var l = fieldLines(q, Object.assign({}, f, { l: labelOf(f, fiche) }), fiche, a[f.key]);
      lines.push.apply(lines, l);
    }
  });
  if (!lines.length) lines.push('Non renseigné.');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return out.concat(lines, ['']);
}

function roleLabel(q, v) {
  var r = q.roles.find(function (x) {
    return x.v === v;
  });
  return r ? r.l : v;
}

function remarksBody(q, fiche, phaseId) {
  var list = (fiche.remarques[phaseId] || []).filter(function (r) {
    return r.texte && r.texte.trim();
  });
  if (!list.length) return [];
  var out = ['### Remarques', ''];
  list.forEach(function (r) {
    out.push('**' + roleLabel(q, r.role) + '** :', '', quote(r.texte.trim()), '');
  });
  return out;
}

export function encodeState(fiche) {
  var bytes = new TextEncoder().encode(JSON.stringify(fiche));
  var bin = '';
  for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function decodeState(b64) {
  var bin = atob(b64.replace(/\s+/g, ''));
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Relit le bloc de reprise d'une note ; null si absent ou illisible. */
export function extractState(text) {
  var m = new RegExp('%%\\s*' + DATA_TAG.replace(/[.:]/g, '\\$&') + '\\s+([A-Za-z0-9+/=\\s]+?)\\s*%%').exec(
    String(text)
  );
  if (!m) return null;
  try {
    var f = decodeState(m[1]);
    return f && typeof f.debrief_id === 'string' && f.answers && typeof f.answers === 'object' ? f : null;
  } catch (e) {
    return null;
  }
}

export function toMarkdown(q, fiche) {
  var a = fiche.answers;
  var lines = ['---', toYaml(frontmatter(q, fiche)), '---', ''];
  lines.push('# Debrief drone du ' + frDate(a.date) + (a.patrouille ? " - Pat'rouille " + safe(a.patrouille) : ''), '');
  lines.push(
    '> ' +
      [
        'Statut : ' + statutLabel(q, fiche.statut),
        'saisie : ' + roleLabel(q, fiche.role_saisie).toLowerCase(),
        'questionnaire v' + fiche.questionnaire_version,
        'appli v' + APP_VERSION
      ].join(', ') +
      '.',
    ''
  );
  if (nonEngage(q, fiche)) lines.push("Parcours court : le drone n'a pas été engagé.", '');
  visiblePhases(q, fiche).forEach(function (p) {
    lines.push('## ' + (p.n ? p.n + '. ' : '') + p.l, '');
    phaseQuestions(q, fiche, p.id).forEach(function (qu) {
      lines.push.apply(lines, questionBody(q, qu, fiche));
    });
    lines.push.apply(lines, remarksBody(q, fiche, p.id));
  });
  lines.push('## Données Airdata', '', '');
  lines.push('%%', DATA_TAG, encodeState(fiche), '%%', '');
  return lines.join('\n');
}

function ascii(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Debrief_Drone_AAAA-MM-JJ_<numéro Pat'rouille>.md, sans accents ni espaces. */
export function fileName(fiche) {
  var n = ascii(fiche.answers.patrouille || '') || 'sans-numero';
  return 'Debrief_Drone_' + (fiche.answers.date || fiche.cree.slice(0, 10)) + '_' + n + '.md';
}
