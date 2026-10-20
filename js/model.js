/* Règles du questionnaire, sans DOM (testées sous Node) : valeurs, conditions d'affichage, options exclusives,
 * préremplissages, fiches F7 ouvertes depuis C1, avancement par phase, statut de la fiche. */
import { APP_VERSION } from './version.js';

/**
 * Fiche : tout ce qui est enregistré sur l'appareil et dans le bloc de reprise de la note.
 * @typedef {{ debrief_id: string, questionnaire_version: string, app_version: string, cree: string, maj: string,
 *   statut: string, role_saisie: string, answers: Object<string, any>, remarques: Object<string, Remarque[]> }} Fiche
 * @typedef {{ id: string, role: string, texte: string }} Remarque
 */

export function today() {
  var d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function pad(n) {
  return (n < 10 ? '0' : '') + n;
}
export function uid() {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
}

// Tirets typographiques interdits partout (règle de la section 0) : remplacés par le tiret classique dès la saisie.
export function cleanText(s) {
  return String(s).replace(/[\u2013\u2014]/g, '-');
}

/** Index des champs : clé -> { field, question } (en-tête compris, sans les sous-champs de F7). */
export function indexFields(q) {
  if (q._index) return q._index;
  var idx = {};
  q.entete.forEach(function (f) {
    idx[f.key] = { field: f, question: null };
  });
  q.questions.forEach(function (qu) {
    qu.fields.forEach(function (f) {
      idx[f.key] = { field: f, question: qu };
    });
  });
  Object.defineProperty(q, '_index', { value: idx, enumerable: false });
  return idx;
}

export function newFiche(q, role) {
  var now = new Date().toISOString();
  var answers = {};
  q.entete.forEach(function (f) {
    // « position » : rempli plus tard par l'appli (GPS du téléphone), voir fillPosition dans form.js
    if (f.defaut === 'aujourdhui') answers[f.key] = today();
    else if (f.defaut && f.defaut !== 'position') answers[f.key] = f.defaut;
  });
  return {
    debrief_id: uid(),
    questionnaire_version: q.version,
    app_version: APP_VERSION,
    cree: now,
    maj: now,
    statut: 'chaud-en-cours',
    role_saisie: role || 'pilote',
    answers: answers,
    remarques: {}
  };
}

/** Noms des animaux saisis « Rex, Max » : liste sans vides. */
export function animauxList(fiche) {
  return String(fiche.answers.animaux || '')
    .split(/[,;]/)
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean);
}

/** Titre de la fiche, combiné depuis l'en-tête (q.titre_fiche) : « 20/10/2026 - Rex, Max - Chien - Lac Blanc ». */
export function ficheTitre(q, fiche) {
  var a = fiche.answers;
  return (q.titre_fiche || ['date'])
    .map(function (k) {
      if (k === 'date') {
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(a.date || fiche.cree || '');
        return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
      }
      if (k === 'animaux') return animauxList(fiche).join(', ');
      return String(a[k] || '').trim();
    })
    .filter(Boolean)
    .join(' - ');
}

export function isEmpty(v) {
  if (v === null || v === undefined || v === '' || v === false) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

/** Parcours court : « non engagé » coché en C2. */
export function nonEngage(q, fiche) {
  var v = fiche.answers[q.parcours.key];
  return Array.isArray(v) && v.indexOf(q.parcours.nonEngage) >= 0;
}

function testCond(c, v) {
  if ('eq' in c) return v === c.eq;
  if ('in' in c) return c.in.indexOf(v) >= 0;
  if ('has' in c) return Array.isArray(v) && v.indexOf(c.has) >= 0;
  return !isEmpty(v);
}

export function questionVisible(q, qu, fiche) {
  var ne = nonEngage(q, fiche);
  if (qu.parcours === 'engage' && ne) return false;
  if (qu.parcours === 'non-engage' && !ne) return false;
  return true;
}

/** Un champ est visible si sa question l'est et si sa condition (et celle du champ dont il dépend) est remplie. */
export function fieldVisible(q, key, fiche) {
  var e = indexFields(q)[key];
  if (!e) return false;
  if (e.question && !questionVisible(q, e.question, fiche)) return false;
  var c = e.field.showIf;
  if (!c) return true;
  return fieldVisible(q, c.key, fiche) && testCond(c, fiche.answers[c.key]);
}

/** Valeur prise en compte : celle d'un champ masqué est ignorée (mais gardée, au cas où il réapparaît). */
export function effective(q, key, fiche) {
  return fieldVisible(q, key, fiche) ? fiche.answers[key] : undefined;
}

export function fieldLabel(field, fiche) {
  if (field.labelIf)
    for (var i = 0; i < field.labelIf.length; i++) {
      var c = field.labelIf[i];
      if (testCond(c, fiche.answers[c.key])) return c.l;
    }
  return field.l || '';
}

/** Options d'un champ (optionsFrom : reprises d'un autre champ, comme la catégorie F7 reprise de C1). */
export function optionsOf(q, field) {
  if (field.optionsFrom) return indexFields(q)[field.optionsFrom].field.options;
  return field.options || [];
}

/**
 * Touche d'une option : renvoie la nouvelle valeur, ou refused si la question est déjà au maximum de choix.
 * Choix unique : toucher l'option choisie la désélectionne. Choix multiple : une option exclusive désélectionne
 * toutes les autres, et inversement.
 */
export function toggle(field, options, current, v) {
  if (field.type === 'single') return { value: current === v ? null : v };
  if (field.type === 'flag') return { value: current ? null : true };
  var cur = Array.isArray(current) ? current.slice() : [];
  var i = cur.indexOf(v);
  if (i >= 0) {
    cur.splice(i, 1);
    return { value: cur };
  }
  var opt = options.find(function (o) {
    return o.v === v;
  });
  if (opt && opt.exclusive) return { value: [v] };
  cur = cur.filter(function (x) {
    var o = options.find(function (p) {
      return p.v === x;
    });
    return !(o && o.exclusive);
  });
  if (field.max && cur.length >= field.max) return { value: current, refused: true };
  cur.push(v);
  // Ordre du questionnaire, pour un export stable
  var order = options.map(function (o) {
    return o.v;
  });
  cur.sort(function (a, b) {
    return order.indexOf(a) - order.indexOf(b);
  });
  return { value: cur };
}

function phaseOfKey(q, key) {
  var e = indexFields(q)[key];
  return e && e.question ? e.question.phase : 'entete';
}
function isColdPhase(q, phaseId) {
  var p = q.phases.find(function (x) {
    return x.id === phaseId;
  });
  return !!p && p.temps === 'froid';
}

/** Après une modification : date de mise à jour, statut, fiches F7. */
export function touch(q, fiche, phaseId) {
  fiche.maj = new Date().toISOString();
  if (isColdPhase(q, phaseId) && (fiche.statut === 'chaud-en-cours' || fiche.statut === 'chaud-fait'))
    fiche.statut = 'froid-en-cours';
  syncRepeats(q, fiche);
}

/** Écrit une valeur et applique les effacements croisés (clears), par exemple « Pas d'indice exploitable » en C3. */
export function setValue(q, fiche, key, value) {
  var field = indexFields(q)[key].field;
  if (typeof value === 'string') value = cleanText(value);
  if (isEmpty(value)) delete fiche.answers[key];
  else fiche.answers[key] = value;
  if (!isEmpty(value) && field.clears)
    field.clears.forEach(function (k) {
      delete fiche.answers[k];
    });
  touch(q, fiche, phaseOfKey(q, key));
}

/** Touche d'une option d'un champ de premier niveau. */
export function tap(q, fiche, key, v) {
  var field = indexFields(q)[key].field;
  var r = toggle(field, optionsOf(q, field), fiche.answers[key], v);
  if (!r.refused) setValue(q, fiche, key, r.value);
  return r;
}

/* ---------- Grilles (F6, F8) ---------- */

/** Ligne par ligne : valeur retenue, saisie ou non, préremplie depuis C4 ou mise en évidence. */
export function gridState(q, field, fiche) {
  var explicit = fiche.answers[field.key] || {};
  var out = {};
  field.rows.forEach(function (r) {
    out[r.v] = { value: r.defaut || field.defaut, explicit: r.v in explicit, prefilled: false, highlighted: false };
    if (r.v in explicit) out[r.v].value = explicit[r.v];
  });
  (field.prefill || []).forEach(function (p) {
    var src = effective(q, p.from, fiche);
    if (Array.isArray(src) && src.indexOf(p.has) >= 0 && !out[p.row].explicit) {
      out[p.row].value = p.value;
      out[p.row].prefilled = true;
    }
  });
  (field.highlight || []).forEach(function (h) {
    var src = effective(q, h.from, fiche);
    if (Array.isArray(src) && src.indexOf(h.has) >= 0)
      h.rows.forEach(function (r) {
        out[r].highlighted = true;
      });
  });
  return out;
}

/** Toucher une valeur de grille la fixe (y compris la valeur par défaut, pour la confirmer). */
export function setGrid(q, fiche, key, row, value) {
  var g = Object.assign({}, fiche.answers[key] || {});
  g[row] = value;
  fiche.answers[key] = g;
  touch(q, fiche, phaseOfKey(q, key));
}

/** Grille remplie : au moins une ligne saisie ou préremplie. Sinon elle n'est pas exportée (valeurs par défaut). */
export function gridFilled(q, field, fiche) {
  var st = gridState(q, field, fiche);
  return Object.keys(st).some(function (r) {
    return st[r].explicit || st[r].prefilled;
  });
}

export function setObservation(q, fiche, key, row, text) {
  var k = key + '_obs';
  var o = Object.assign({}, fiche.answers[k] || {});
  if (text) o[row] = cleanText(text);
  else delete o[row];
  if (Object.keys(o).length) fiche.answers[k] = o;
  else delete fiche.answers[k];
  touch(q, fiche, phaseOfKey(q, key));
}

/* ---------- Fiches répétées (F7) ---------- */

function itemEmpty(field, item) {
  return field.fields.every(function (f) {
    return f.key === field.seedKey || isEmpty(item[f.key]);
  });
}

/**
 * Une fiche F7 par catégorie cochée en C1 (seed : catégorie d'origine). Une fiche encore vide dont la catégorie a été
 * décochée disparaît ; une fiche commencée reste. Une fiche supprimée à la main n'est pas recréée (_ignores).
 */
export function syncRepeats(q, fiche) {
  q.questions.forEach(function (qu) {
    qu.fields.forEach(function (field) {
      if (field.type !== 'repeat' || !field.seedFrom) return;
      var seeds = effective(q, field.seedFrom, fiche) || [];
      var ign = fiche.answers[field.key + '_ignores'] || [];
      var items = (fiche.answers[field.key] || []).filter(function (it) {
        return !it.seed || seeds.indexOf(it.seed) >= 0 || !itemEmpty(field, it);
      });
      seeds.forEach(function (s) {
        if (ign.indexOf(s) >= 0) return;
        if (
          !items.some(function (it) {
            return it.seed === s;
          })
        ) {
          var it = { id: uid(), seed: s };
          it[field.seedKey] = s;
          items.push(it);
        }
      });
      // Une catégorie décochée puis recochée peut de nouveau ouvrir une fiche
      var keepIgn = ign.filter(function (s) {
        return seeds.indexOf(s) >= 0;
      });
      if (keepIgn.length) fiche.answers[field.key + '_ignores'] = keepIgn;
      else delete fiche.answers[field.key + '_ignores'];
      if (items.length) fiche.answers[field.key] = items;
      else delete fiche.answers[field.key];
    });
  });
}

export function addItem(q, fiche, key) {
  var items = (fiche.answers[key] || []).slice();
  var it = { id: uid() };
  items.push(it);
  fiche.answers[key] = items;
  touch(q, fiche, phaseOfKey(q, key));
  return it;
}

export function removeItem(q, fiche, key, id) {
  var items = fiche.answers[key] || [];
  var it = items.find(function (x) {
    return x.id === id;
  });
  if (!it) return;
  if (it.seed) {
    var ign = (fiche.answers[key + '_ignores'] || []).slice();
    if (ign.indexOf(it.seed) < 0) ign.push(it.seed);
    fiche.answers[key + '_ignores'] = ign;
  }
  fiche.answers[key] = items.filter(function (x) {
    return x.id !== id;
  });
  touch(q, fiche, phaseOfKey(q, key));
}

export function itemField(q, key, sub) {
  return indexFields(q)[key].field.fields.find(function (f) {
    return f.key === sub;
  });
}

export function setItemValue(q, fiche, key, id, sub, value) {
  var it = (fiche.answers[key] || []).find(function (x) {
    return x.id === id;
  });
  if (!it) return;
  if (typeof value === 'string') value = cleanText(value);
  if (isEmpty(value)) delete it[sub];
  else it[sub] = value;
  touch(q, fiche, phaseOfKey(q, key));
}

export function tapItem(q, fiche, key, id, sub, v) {
  var it = (fiche.answers[key] || []).find(function (x) {
    return x.id === id;
  });
  if (!it) return { refused: true };
  var f = itemField(q, key, sub);
  var r = toggle(f, optionsOf(q, f), it[sub], v);
  if (!r.refused) setItemValue(q, fiche, key, id, sub, r.value);
  return r;
}

/* ---------- Choix par option (F14 : « aurait-elle changé l'issue ? ») ---------- */

export function perOptionRows(q, field, fiche) {
  var srcField = indexFields(q)[field.source].field;
  var sel = effective(q, field.source, fiche) || [];
  return srcField.options.filter(function (o) {
    return !o.exclusive && sel.indexOf(o.v) >= 0;
  });
}

export function tapPerOption(q, fiche, key, opt, v) {
  var m = Object.assign({}, fiche.answers[key] || {});
  if (m[opt] === v) delete m[opt];
  else m[opt] = v;
  if (Object.keys(m).length) fiche.answers[key] = m;
  else delete fiche.answers[key];
  touch(q, fiche, phaseOfKey(q, key));
}

/* ---------- Remarques du second ---------- */

export function addRemark(q, fiche, phaseId, role) {
  var list = (fiche.remarques[phaseId] || []).slice();
  var r = { id: uid(), role: role || 'copilote', texte: '' };
  list.push(r);
  fiche.remarques[phaseId] = list;
  touch(q, fiche, phaseId);
  return r;
}
export function setRemark(q, fiche, phaseId, id, patch) {
  var r = (fiche.remarques[phaseId] || []).find(function (x) {
    return x.id === id;
  });
  if (!r) return;
  if (typeof patch.texte === 'string') patch.texte = cleanText(patch.texte);
  Object.assign(r, patch);
  touch(q, fiche, phaseId);
}
export function removeRemark(q, fiche, phaseId, id) {
  var list = (fiche.remarques[phaseId] || []).filter(function (x) {
    return x.id !== id;
  });
  if (list.length) fiche.remarques[phaseId] = list;
  else delete fiche.remarques[phaseId];
  touch(q, fiche, phaseId);
}

/* ---------- Avancement ---------- */

/** Valeur saisie pour un champ visible (les valeurs par défaut des grilles ne comptent pas). */
export function fieldAnswered(q, field, fiche) {
  if (!fieldVisible(q, field.key, fiche)) return false;
  var v = fiche.answers[field.key];
  // Une fiche F7 ouverte d'office depuis C1 ne compte qu'une fois détaillée
  if (field.type === 'repeat')
    return (v || []).some(function (it) {
      return !itemEmpty(field, it);
    });
  return !isEmpty(v);
}

/** Question répondue : un de ses champs fermés visibles saisi (ou son texte, si elle n'a que du texte). */
export function questionAnswered(q, qu, fiche) {
  var closed = qu.fields.filter(function (f) {
    return f.type !== 'text';
  });
  var fs = closed.length ? closed : qu.fields;
  return fs.some(function (f) {
    return fieldAnswered(q, f, fiche);
  });
}

export function visiblePhases(q, fiche) {
  return q.phases.filter(function (p) {
    if (p.parcours === 'non-engage' && !nonEngage(q, fiche)) return false;
    return phaseQuestions(q, fiche, p.id).length > 0;
  });
}

export function phaseQuestions(q, fiche, phaseId) {
  return q.questions.filter(function (qu) {
    return qu.phase === phaseId && questionVisible(q, qu, fiche);
  });
}

export function phaseProgress(q, fiche, phaseId) {
  var qs = phaseQuestions(q, fiche, phaseId);
  return {
    done: qs.filter(function (qu) {
      return questionAnswered(q, qu, fiche);
    }).length,
    total: qs.length
  };
}

export function statutLabel(q, v) {
  var s = q.statuts.find(function (x) {
    return x.v === v;
  });
  return s ? s.l : v;
}

export function finishHot(q, fiche) {
  if (fiche.statut === 'chaud-en-cours') fiche.statut = 'chaud-fait';
  fiche.maj = new Date().toISOString();
}
export function finishAll(q, fiche) {
  fiche.statut = 'termine';
  fiche.maj = new Date().toISOString();
}
