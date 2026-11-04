/* Import de notes Obsidian (sans DOM, testé sous Node), une ou plusieurs à la fois.
 * 1. Bloc de reprise présent : fiche restituée à l'identique (extractState).
 * 2. Sinon, note de l'appli dont le bloc a été retiré ou abîmé : fiche reconstruite depuis le frontmatter
 *    (en-tête et réponses fermées ; les textes libres et les remarques, absents du frontmatter, sont perdus).
 * 3. Sinon : note non reconnue. */
import { extractState } from './markdown.js';
import { indexFields, isEmpty, uid, syncRepeats } from './model.js';

/* ---------- Lecture du frontmatter produit par l'appli (sous-ensemble YAML de markdown.js) ---------- */

function scalar(s) {
  s = s.trim();
  if (s === '' || s === '~' || s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === '[]') return [];
  if (s === '{}') return {};
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s[0] === '"') {
    try {
      return JSON.parse(s);
    } catch (e) {
      return s.slice(1, -1);
    }
  }
  if (s[0] === "'") return s.slice(1, -1).replace(/''/g, "'");
  if (s[0] === '[' && s[s.length - 1] === ']') return inlineList(s.slice(1, -1));
  return s;
}

// Liste en ligne [a, "b, c", d] : les virgules entre guillemets ne séparent pas
function inlineList(s) {
  var out = [];
  var curr = '';
  var inQ = false;
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (ch === '"' && s[i - 1] !== '\\') inQ = !inQ;
    if (ch === ',' && !inQ) {
      out.push(scalar(curr));
      curr = '';
    } else curr += ch;
  }
  if (curr.trim()) out.push(scalar(curr));
  return out;
}

function splitKey(line) {
  var m = /^("(?:[^"\\]|\\.)*"|[^:]+):(.*)$/.exec(line);
  if (!m) return null;
  var k = m[1].trim();
  if (k[0] === '"') k = JSON.parse(k);
  return { k: k, rest: m[2] };
}

/** Frontmatter d'une note (objet), ou null s'il n'y en a pas. */
export function parseFrontmatter(text) {
  var m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\s*(\r?\n|$)/.exec(String(text));
  if (!m) return null;
  var lines = m[1].split(/\r?\n/);
  var out = {};
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    if (!line.trim() || /^\s/.test(line) || line.trim()[0] === '#') {
      i += 1;
      continue;
    }
    var kv = splitKey(line);
    i += 1;
    if (!kv) continue;
    if (kv.rest.trim() !== '') {
      out[kv.k] = scalar(kv.rest);
      continue;
    }
    // Bloc indenté : liste de « - » ou correspondance
    var block = [];
    while (i < lines.length && (/^\s/.test(lines[i]) || !lines[i].trim())) {
      if (lines[i].trim()) block.push(lines[i]);
      i += 1;
    }
    out[kv.k] = block.length ? parseBlock(block) : null;
  }
  return out;
}

function parseBlock(block) {
  var ind = /^\s*/.exec(block[0])[0].length;
  var lines = block.map(function (l) {
    return l.slice(ind);
  });
  if (lines[0].slice(0, 2) === '- ') {
    var items = [];
    var cur = null;
    lines.forEach(function (l) {
      if (l.slice(0, 2) === '- ') {
        var body = l.slice(2);
        var kv = splitKey(body);
        if (kv && body.trim() !== '{}') {
          cur = {};
          cur[kv.k] = scalar(kv.rest);
          items.push(cur);
        } else {
          cur = null;
          items.push(scalar(body));
        }
      } else if (cur) {
        var kv2 = splitKey(l.trim());
        if (kv2) cur[kv2.k] = scalar(kv2.rest);
      }
    });
    return items;
  }
  var o = {};
  lines.forEach(function (l) {
    var kv = splitKey(l);
    if (kv && !/^\s/.test(l)) o[kv.k] = scalar(kv.rest);
  });
  return o;
}

/* ---------- Reconstruction d'une fiche depuis le frontmatter ---------- */

function asDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Fiche reconstruite à partir du frontmatter d'une note de l'appli, ou null si la note n'en est pas une. */
export function ficheFromFrontmatter(q, fm) {
  if (!fm || fm.type !== 'debrief-vol-drone' || typeof fm.debrief_id !== 'string' || !fm.debrief_id) return null;
  var idx = indexFields(q);
  var a = {};
  var day = asDate(fm.date_maj) || asDate(fm.date) || new Date().toISOString().slice(0, 10);
  if (asDate(fm.date)) a.date = fm.date;
  if (!isEmpty(fm.patrouille)) a.patrouille = String(fm.patrouille);
  if (Array.isArray(fm.animaux) && fm.animaux.length) a.animaux = fm.animaux.join(', ');
  if (!isEmpty(fm.espece)) a.espece = String(fm.espece);
  if (!isEmpty(fm.lieu)) a.lieu = String(fm.lieu);

  q.questions.forEach(function (qu) {
    qu.fields.forEach(function (f) {
      var v = fm[f.key];
      if (f.type === 'single' && typeof v === 'string' && v) a[f.key] = v;
      else if (f.type === 'multi' && Array.isArray(v) && v.length) a[f.key] = v.map(String);
      else if (f.type === 'flag' && v === true) a[f.key] = true;
      else if ((f.type === 'slider' || f.type === 'counter') && typeof v === 'number') a[f.key] = v;
      else if (f.type === 'grid') {
        var g = {};
        f.rows.forEach(function (r) {
          var x = fm[f.key + '_' + r.v.replace(/-/g, '_')];
          if (typeof x === 'string' && x) g[r.v] = x;
        });
        if (Object.keys(g).length) a[f.key] = g;
      } else if (f.type === 'perOption' && v && typeof v === 'object' && !Array.isArray(v)) {
        var m = {};
        Object.keys(v).forEach(function (k) {
          if (typeof v[k] === 'string' && v[k]) m[k] = v[k];
        });
        if (Object.keys(m).length) a[f.key] = m;
      } else if (f.type === 'repeat') {
        var list = fm[f.key + '_incidents'];
        if (!Array.isArray(list)) return;
        var seeds = Array.isArray(fm[f.seedFrom]) ? fm[f.seedFrom] : [];
        var items = list
          .filter(function (x) {
            return x && typeof x === 'object';
          })
          .map(function (x) {
            var it = { id: uid() };
            f.fields.forEach(function (sf) {
              var sv = x[sf.key];
              if (sf.type === 'multi' && Array.isArray(sv) && sv.length) it[sf.key] = sv.map(String);
              else if (sf.type === 'single' && typeof sv === 'string' && sv) it[sf.key] = sv;
            });
            if (it[f.seedKey] && seeds.indexOf(it[f.seedKey]) >= 0) it.seed = it[f.seedKey];
            return it;
          });
        if (items.length) a[f.key] = items;
      }
    });
  });
  Object.keys(a).forEach(function (k) {
    if (!idx[k] && ['date', 'patrouille', 'animaux', 'espece', 'lieu'].indexOf(k) < 0) delete a[k];
  });
  var fiche = {
    debrief_id: fm.debrief_id,
    questionnaire_version: String(fm.questionnaire_version || q.version),
    app_version: String(fm.app_version || ''),
    cree: day + 'T00:00:00.000Z',
    // Minuit du jour de mise à jour : une version complète (avec bloc de reprise) du même jour l'emporte
    maj: day + 'T00:00:00.000Z',
    statut:
      ['chaud-en-cours', 'chaud-fait', 'froid-en-cours', 'termine'].indexOf(fm.statut) >= 0 ? fm.statut : 'chaud-fait',
    role_saisie: typeof fm.role_saisie === 'string' ? fm.role_saisie : 'pilote',
    answers: a,
    remarques: {}
  };
  syncRepeats(q, fiche);
  return fiche;
}

/**
 * Lit une note. Résultat : { fiche, partiel } (partiel : reconstruite depuis le frontmatter), ou
 * { erreur } quand la note n'est pas un debrief de l'appli.
 */
export function readNote(q, text) {
  var st = extractState(text);
  if (st) return { fiche: st, partiel: false };
  var f = ficheFromFrontmatter(q, parseFrontmatter(text));
  if (f) return { fiche: f, partiel: true };
  return { erreur: "pas un debrief de l'appli (ni bloc de reprise, ni frontmatter type: debrief-vol-drone)" };
}

/** Import groupé : 'nouvelle', 'maj' (la note est plus récente) ou 'ignoree' (la fiche de l'appareil est à jour). */
export function decision(existing, incoming) {
  if (!existing) return 'nouvelle';
  return String(incoming.maj) > String(existing.maj) ? 'maj' : 'ignoree';
}
