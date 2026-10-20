/* Moteur de formulaire : dessine les questions de questionnaire.json une fois, puis chaque modification appelle les
 * fonctions de mise à jour (reg) au lieu de tout redessiner, pour garder le focus et la position dans la page.
 * Les blocs dont la structure change (fiches F7, capacités F14, remarques) se redessinent seuls quand il le faut. */
import * as M from './model.js';
import { h, toast } from './util.js';

var seq = 0;
function nid(p) {
  seq += 1;
  return (p || 'f') + seq;
}

/** Affichage conditionnel : apparition en fondu (sans saut brutal), disparition immédiate. */
export function setVisible(el, vis) {
  if (vis && el.hidden) {
    el.hidden = false;
    el.classList.remove('appear');
    void el.offsetWidth;
    el.classList.add('appear');
  } else if (!vis && !el.hidden) el.hidden = true;
}

function topBinding(ctx, key) {
  return {
    get: function () {
      return ctx.fiche().answers[key];
    },
    tap: function (v) {
      return M.tap(ctx.q, ctx.fiche(), key, v);
    },
    set: function (v) {
      M.setValue(ctx.q, ctx.fiche(), key, v);
    }
  };
}

function itemBinding(ctx, key, id, sub) {
  function item() {
    return (ctx.fiche().answers[key] || []).find(function (x) {
      return x.id === id;
    });
  }
  return {
    get: function () {
      var it = item();
      return it && it[sub];
    },
    tap: function (v) {
      return M.tapItem(ctx.q, ctx.fiche(), key, id, sub, v);
    },
    set: function (v) {
      M.setItemValue(ctx.q, ctx.fiche(), key, id, sub, v);
    }
  };
}

/* ---------- Champs ---------- */

function chips(ctx, field, options, b, labelId, reg) {
  var one = field.type === 'single' || field.type === 'flag';
  var group = h('div', { class: 'chips', role: 'group', 'aria-labelledby': labelId });
  var btns = options.map(function (o) {
    var btn = h(
      'button',
      {
        type: 'button',
        class: 'chip' + (o.exclusive ? ' excl' : ''),
        'data-v': o.v,
        onclick: function () {
          if (ctx.readOnly()) return;
          var r = b.tap(o.v);
          if (r.refused) toast(field.max + ' choix au maximum : retire un choix pour en ajouter un autre.');
          ctx.commit();
        }
      },
      o.l
    );
    group.appendChild(btn);
    return btn;
  });
  reg.push(function () {
    var v = b.get();
    var arr = Array.isArray(v) ? v : [];
    var full = field.max && arr.length >= field.max;
    var ro = ctx.readOnly();
    btns.forEach(function (btn, i) {
      var o = options[i];
      var on = field.type === 'flag' ? !!v : one ? v === o.v : arr.indexOf(o.v) >= 0;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('maxed', !!full && !on);
      btn.disabled = ro;
    });
  });
  return group;
}

function slider(ctx, field, b, labelId, reg) {
  var input = h('input', {
    type: 'range',
    min: field.min,
    max: field.max,
    step: field.step,
    value: field.min,
    'aria-labelledby': labelId
  });
  var out = h('output', { class: 'sl-val', 'aria-live': 'polite' });
  function set() {
    if (ctx.readOnly()) return;
    b.set(Number(input.value));
    ctx.commit();
  }
  input.addEventListener('input', set);
  // Toucher le curseur sans le déplacer (valeur déjà sous le doigt) compte aussi comme une réponse
  input.addEventListener('change', function () {
    if (b.get() === undefined) set();
  });
  input.addEventListener('pointerup', function () {
    if (b.get() === undefined) set();
  });
  var wrap = h('div', { class: 'slider' }, input, out);
  reg.push(function () {
    var v = b.get();
    var unset = v === undefined || v === null;
    if (!unset && String(v) !== input.value) input.value = v;
    if (unset) input.value = field.min;
    input.setAttribute('aria-valuetext', unset ? 'Non renseigné' : v + ' ' + field.unit);
    wrap.classList.toggle('unset', unset);
    out.textContent = unset ? 'Non renseigné' : v + ' ' + field.unit;
    input.disabled = ctx.readOnly();
  });
  return wrap;
}

function counter(ctx, field, b, labelId, reg) {
  var val = h('output', { class: 'ct-val', 'aria-live': 'polite', 'aria-labelledby': labelId });
  function step(d) {
    if (ctx.readOnly()) return;
    var v = b.get();
    var n;
    if (v === undefined || v === null) n = d > 0 ? Math.max(field.min, 1) : field.min;
    else n = Math.min(field.max, Math.max(field.min, v + d));
    b.set(n);
    ctx.commit();
  }
  var minus = h('button', { type: 'button', class: 'ct-btn', 'aria-label': 'Moins', onclick: () => step(-1) }, '-');
  var plus = h('button', { type: 'button', class: 'ct-btn', 'aria-label': 'Plus', onclick: () => step(1) }, '+');
  reg.push(function () {
    var v = b.get();
    var unset = v === undefined || v === null;
    val.textContent = unset ? '-' : String(v);
    val.classList.toggle('unset', unset);
    var ro = ctx.readOnly();
    minus.disabled = ro || (!unset && v <= field.min);
    plus.disabled = ro || (!unset && v >= field.max);
  });
  return h('div', { class: 'counter' }, minus, val, plus);
}

/** Texte libre : enregistré en continu (dictée du clavier possible). editable : remarques, modifiables par tous. */
export function textInput(ctx, field, b, id, reg, editable) {
  var el = field.multiline
    ? h('textarea', { id: id, rows: 3, autocapitalize: 'sentences' })
    : h('input', {
        id: id,
        type: field.type === 'date' ? 'date' : 'text',
        autocapitalize: 'sentences',
        inputmode: field.inputmode
      });
  el.addEventListener('input', function () {
    if (!editable && ctx.readOnly()) return;
    b.set(el.value);
    ctx.commit('text');
  });
  reg.push(function () {
    var v = b.get() || '';
    if (document.activeElement !== el && el.value !== v) el.value = v;
    el.disabled = !editable && ctx.readOnly();
  });
  return el;
}

function grid(ctx, field, reg) {
  var q = ctx.q;
  var rows = field.rows.map(function (r) {
    var lid = nid('gl');
    var btns = field.values.map(function (v) {
      return h(
        'button',
        {
          type: 'button',
          class: 'seg',
          'data-v': v.v,
          onclick: function () {
            if (ctx.readOnly()) return;
            M.setGrid(q, ctx.fiche(), field.key, r.v, v.v);
            ctx.commit();
          }
        },
        v.l
      );
    });
    var obsId = nid('go');
    var obsB = {
      get: function () {
        return (ctx.fiche().answers[field.key + '_obs'] || {})[r.v];
      },
      set: function (t) {
        M.setObservation(q, ctx.fiche(), field.key, r.v, t);
      }
    };
    var obs = field.observer
      ? h(
          'div',
          { class: 'g-obs', hidden: true },
          h('label', { for: obsId, class: 'f-l' }, 'Observation : ' + r.l),
          textInput(ctx, { type: 'text' }, obsB, obsId, reg)
        )
      : null;
    var tag = h('span', { class: 'g-tag' });
    var row = h(
      'div',
      { class: 'g-row', 'data-row': r.v },
      h('span', { class: 'g-l', id: lid }, r.l, tag),
      h('div', { class: 'segs n' + field.values.length, role: 'group', 'aria-labelledby': lid }, btns),
      obs
    );
    return { r: r, row: row, btns: btns, obs: obs, tag: tag };
  });
  reg.push(function () {
    var st = M.gridState(q, field, ctx.fiche());
    var ro = ctx.readOnly();
    rows.forEach(function (x) {
      var s = st[x.r.v];
      x.btns.forEach(function (btn, i) {
        var on = field.values[i].v === s.value;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.classList.toggle('implicit', on && !s.explicit);
        btn.disabled = ro;
      });
      x.row.classList.toggle('hl', s.highlighted);
      x.tag.textContent = s.highlighted ? ' Signalé à chaud' : s.prefilled ? ' Prérempli à chaud' : '';
      if (x.obs) setVisible(x.obs, s.value === field.observer);
    });
  });
  return h(
    'div',
    { class: 'grid' },
    h('p', { class: 'hint' }, 'Valeurs par défaut en pointillé : touche une valeur pour la confirmer ou la changer.'),
    rows.map(function (x) {
      return x.row;
    })
  );
}

function confirmButton(label, confirmLabel, onConfirm, isDisabled) {
  var wrap = h('div', { class: 'confirm' });
  var ask = h(
    'button',
    {
      type: 'button',
      class: 'btn sec small',
      onclick: function () {
        if (isDisabled && isDisabled()) return;
        ask.hidden = true;
        box.hidden = false;
        yes.focus();
      }
    },
    label
  );
  var yes = h('button', { type: 'button', class: 'btn danger small', onclick: onConfirm }, confirmLabel);
  var no = h(
    'button',
    {
      type: 'button',
      class: 'btn sec small',
      onclick: function () {
        box.hidden = true;
        ask.hidden = false;
        ask.focus();
      }
    },
    'Annuler'
  );
  var box = h('span', { class: 'confirm-box', hidden: true }, yes, no);
  wrap.appendChild(ask);
  wrap.appendChild(box);
  wrap._ask = ask;
  return wrap;
}
export { confirmButton };

function repeat(ctx, field, reg) {
  var q = ctx.q;
  var list = h('div', { class: 'rep-list' });
  var sig = null;
  var inner = [];
  var add = h(
    'button',
    {
      type: 'button',
      class: 'btn sec',
      onclick: function () {
        if (ctx.readOnly()) return;
        M.addItem(q, ctx.fiche(), field.key);
        ctx.commit();
      }
    },
    '+ ' + field.addLabel
  );
  function build(items) {
    list.textContent = '';
    inner = [];
    items.forEach(function (it, i) {
      var head = h('h4', { class: 'rep-t' }, field.itemLabel + ' ' + (i + 1));
      var del = confirmButton(
        'Supprimer',
        'Confirmer la suppression',
        function () {
          M.removeItem(q, ctx.fiche(), field.key, it.id);
          ctx.commit();
        },
        ctx.readOnly
      );
      var card = h('div', { class: 'rep-card', 'data-item': it.id }, h('div', { class: 'rep-h' }, head, del));
      if (it.seed) card.appendChild(h('p', { class: 'hint' }, 'Ouvert depuis le debrief à chaud (C1).'));
      field.fields.forEach(function (sf) {
        card.appendChild(fieldBlock(ctx, sf, itemBinding(ctx, field.key, it.id, sf.key), inner, null));
      });
      inner.push(function () {
        del._ask.disabled = ctx.readOnly();
      });
      list.appendChild(card);
    });
  }
  reg.push(function () {
    var items = ctx.fiche().answers[field.key] || [];
    var s = items
      .map(function (x) {
        return x.id;
      })
      .join(',');
    if (s !== sig) {
      sig = s;
      build(items);
    }
    inner.forEach(function (u) {
      u();
    });
    add.disabled = ctx.readOnly();
  });
  return h('div', { class: 'rep' }, list, add);
}

function perOption(ctx, field, reg) {
  var q = ctx.q;
  var box = h('div', { class: 'perop' });
  var sig = null;
  var inner = [];
  reg.push(function () {
    var rows = M.perOptionRows(q, field, ctx.fiche());
    var s = rows
      .map(function (o) {
        return o.v;
      })
      .join(',');
    if (s !== sig) {
      sig = s;
      box.textContent = '';
      inner = [];
      if (rows.length) box.appendChild(h('p', { class: 'f-l' }, field.l));
      rows.forEach(function (o) {
        var lid = nid('po');
        var b = {
          get: function () {
            return (ctx.fiche().answers[field.key] || {})[o.v];
          },
          tap: function (v) {
            M.tapPerOption(q, ctx.fiche(), field.key, o.v, v);
            return {};
          }
        };
        box.appendChild(
          h(
            'div',
            { class: 'po-row', 'data-opt': o.v },
            h('span', { class: 'po-l', id: lid }, o.l),
            chips(ctx, { type: 'single' }, field.options, b, lid, inner)
          )
        );
      });
    }
    inner.forEach(function (u) {
      u();
    });
  });
  return box;
}

/** Un champ avec son libellé. visKey : clé dont dépend l'affichage (champ de premier niveau), null sinon. */
function fieldBlock(ctx, field, b, reg, visKey) {
  var q = ctx.q;
  var lid = nid('l');
  var label = h('p', { class: 'f-l', id: lid });
  var body;
  var t = field.type;
  if (t === 'single' || t === 'multi') body = chips(ctx, field, M.optionsOf(q, field), b, lid, reg);
  else if (t === 'flag') body = chips(ctx, field, [{ v: true, l: field.l, exclusive: true }], b, undefined, reg);
  else if (t === 'slider') body = slider(ctx, field, b, lid, reg);
  else if (t === 'counter') body = counter(ctx, field, b, lid, reg);
  else if (t === 'grid') body = grid(ctx, field, reg);
  else if (t === 'repeat') body = repeat(ctx, field, reg);
  else if (t === 'perOption') body = perOption(ctx, field, reg);
  else {
    var iid = nid('t');
    label = h('label', { class: 'f-l', for: iid, id: lid });
    body = textInput(ctx, field, b, iid, reg);
  }
  var wrap = h(
    'div',
    { class: 'f f-' + t, 'data-key': field.key },
    t === 'flag' || t === 'perOption' ? null : label,
    body
  );
  reg.push(function () {
    label.textContent = M.fieldLabel(field, ctx.fiche());
    label.hidden = !label.textContent;
    if (visKey) setVisible(wrap, M.fieldVisible(q, visKey, ctx.fiche()));
  });
  if (t === 'flag') wrap.classList.add('f-flag');
  return wrap;
}

// Titre combiné (date, animaux, espèce, lieu), recalculé à chaque saisie de l'en-tête
function titrePreview(ctx, reg) {
  var t = h('strong', { id: 'ficheTitre' });
  reg.push(function () {
    t.textContent = M.ficheTitre(ctx.q, ctx.fiche());
  });
  return h('p', { class: 'titre' }, 'Titre : ', t);
}

export function renderEntete(ctx, reg) {
  return h(
    'section',
    { class: 'q entete' },
    h('h2', { class: 'q-t' }, 'Fiche'),
    titrePreview(ctx, reg),
    ctx.q.entete.map(function (f) {
      var id = nid('e');
      return h(
        'div',
        { class: 'f', 'data-key': f.key },
        h('label', { class: 'f-l', for: id }, f.l, f.aide ? h('small', null, ' (' + f.aide.toLowerCase() + ')') : null),
        textInput(ctx, f, topBinding(ctx, f.key), id, reg)
      );
    })
  );
}

export function renderQuestion(ctx, qu, reg) {
  var q = ctx.q;
  var sec = h(
    'section',
    { class: 'q', id: 'q-' + qu.id, 'data-q': qu.id },
    h('h2', { class: 'q-t' }, h('span', { class: 'q-id' }, qu.id), ' ', qu.titre),
    qu.aide ? h('p', { class: 'hint' }, qu.aide) : null
  );
  qu.fields.forEach(function (f) {
    sec.appendChild(fieldBlock(ctx, f, topBinding(ctx, f.key), reg, f.key));
  });
  reg.push(function () {
    setVisible(sec, M.questionVisible(q, qu, ctx.fiche()));
  });
  return sec;
}

/** Remarques du second, en fin de phase : modifiables quel que soit le rôle. */
export function renderRemarks(ctx, phaseId, reg) {
  var q = ctx.q;
  var list = h('div', { class: 'rem-list' });
  var sig = null;
  var inner = [];
  var add = h(
    'button',
    {
      type: 'button',
      class: 'btn sec',
      onclick: function () {
        var role = ctx.role() === 'pilote' ? 'copilote' : ctx.role();
        var r = M.addRemark(q, ctx.fiche(), phaseId, role);
        ctx.commit();
        var ta = list.querySelector('[data-rem="' + r.id + '"] textarea');
        if (ta) ta.focus();
      }
    },
    '+ Ajouter une remarque'
  );
  reg.push(function () {
    var rems = ctx.fiche().remarques[phaseId] || [];
    var s = rems
      .map(function (r) {
        return r.id;
      })
      .join(',');
    if (s !== sig) {
      sig = s;
      list.textContent = '';
      inner = [];
      rems.forEach(function (r) {
        var lid = nid('rr');
        var tid = nid('rt');
        var roleB = {
          get: function () {
            var x = (ctx.fiche().remarques[phaseId] || []).find(function (y) {
              return y.id === r.id;
            });
            return x && x.role;
          },
          tap: function (v) {
            M.setRemark(q, ctx.fiche(), phaseId, r.id, { role: v });
            return {};
          }
        };
        var txtB = {
          get: function () {
            var x = (ctx.fiche().remarques[phaseId] || []).find(function (y) {
              return y.id === r.id;
            });
            return x && x.texte;
          },
          set: function (v) {
            M.setRemark(q, ctx.fiche(), phaseId, r.id, { texte: v });
          }
        };
        var free = Object.assign({}, ctx, {
          readOnly: function () {
            return false;
          }
        });
        list.appendChild(
          h(
            'div',
            { class: 'rem-card', 'data-rem': r.id },
            h('p', { class: 'f-l', id: lid }, 'Rôle'),
            chips(free, { type: 'single' }, ctx.q.roles, roleB, lid, inner),
            h('label', { class: 'f-l', for: tid }, 'Remarque'),
            textInput(free, { type: 'text', multiline: true }, txtB, tid, inner, true),
            confirmButton('Supprimer la remarque', 'Confirmer la suppression', function () {
              M.removeRemark(q, ctx.fiche(), phaseId, r.id);
              ctx.commit();
            })
          )
        );
      });
    }
    inner.forEach(function (u) {
      u();
    });
  });
  return h(
    'section',
    { class: 'q remarks', 'data-remarks': phaseId },
    h('h2', { class: 'q-t' }, 'Remarques du second'),
    h('p', { class: 'hint' }, 'Copilote, auxiliaire ou autre : ce que tu as vu, sans modifier les réponses du pilote.'),
    list,
    add
  );
}
