/* Point d'entrée : chargement du questionnaire, écrans (accueil, rôle, à chaud, phases à froid, note), navigation
 * par l'adresse (#/...), enregistrement automatique, import d'une note Obsidian. */
import * as M from './model.js';
import * as store from './store.js';
import { toMarkdown, fileName, extractState } from './markdown.js';
import { copyText, download, share } from './exporter.js';
import { renderEntete, renderQuestion, renderRemarks, confirmButton, fillPosition } from './form.js';
import { $, h, hm, dateTime, toast } from './util.js';
import { APP_VERSION } from './version.js';

var q = null;
var cur = null; // fiche ouverte
var reg = []; // fonctions de mise à jour de l'écran affiché
var saveTimer = 0;
var app = $('app');

/* ---------- Thème ---------- */

var THEME = 'esam-debrief-theme';
var THEMES = ['auto', 'clair', 'sombre'];
function applyTheme(t) {
  var root = document.documentElement;
  if (t === 'clair') root.setAttribute('data-theme', 'light');
  else if (t === 'sombre') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  var b = $('themeBtn');
  b.textContent = 'Thème : ' + t;
  b.setAttribute('aria-label', 'Thème ' + t + ', toucher pour changer');
}
function initTheme() {
  var t = 'auto';
  try {
    t = localStorage.getItem(THEME) || 'auto';
  } catch (e) {}
  if (THEMES.indexOf(t) < 0) t = 'auto';
  applyTheme(t);
  $('themeBtn').addEventListener('click', function () {
    t = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
    try {
      localStorage.setItem(THEME, t);
    } catch (e) {}
    applyTheme(t);
  });
}

/* ---------- Rôle courant (par fiche, le temps de la session) ---------- */

var ROLES = 'esam-debrief-roles';
function roles() {
  try {
    return JSON.parse(sessionStorage.getItem(ROLES) || '{}');
  } catch (e) {
    return {};
  }
}
function roleOf(id) {
  return roles()[id];
}
function setRole(id, r) {
  var o = roles();
  o[id] = r;
  try {
    sessionStorage.setItem(ROLES, JSON.stringify(o));
  } catch (e) {}
}

/* ---------- Enregistrement ---------- */

function showSaved(ok) {
  var s = $('saved');
  if (!s || !cur) return;
  s.textContent = ok ? 'Enregistré à ' + hm(cur.maj) : "Échec de l'enregistrement : la saisie reste en mémoire";
  s.classList.toggle('err', !ok);
}
function flush() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (!cur) return Promise.resolve();
  return store.put(cur).then(
    function () {
      showSaved(true);
    },
    function () {
      showSaved(false);
    }
  );
}
// Copie de secours immédiate, écriture IndexedDB juste après (un peu plus tard pendant la frappe)
function commit(kind) {
  store.draft(cur);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, kind === 'text' ? 400 : 0);
  refresh();
}
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'hidden' && saveTimer) flush();
});
window.addEventListener('pagehide', function () {
  if (saveTimer) flush();
});

function refresh() {
  reg.forEach(function (u) {
    u();
  });
}

var ctx = {
  q: null,
  fiche: function () {
    return cur;
  },
  role: function () {
    return (cur && roleOf(cur.debrief_id)) || 'pilote';
  },
  readOnly: function () {
    return ctx.role() !== 'pilote';
  },
  commit: commit
};

/* ---------- Navigation ---------- */

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route() {
  var m = /^#\/f\/([^/]+)\/(role|chaud|export|p\/([^/]+))$/.exec(location.hash);
  reg = [];
  if (!m) return flush().then(home);
  var id = decodeURIComponent(m[1]);
  var view = m[2];
  var phase = m[3];
  var p = cur && cur.debrief_id === id ? Promise.resolve(cur) : flush().then(() => store.get(id));
  return p.then(function (f) {
    if (!f) return go('#/');
    cur = f;
    if (view === 'role') return roleScreen();
    if (!roleOf(id)) return go('#/f/' + encodeURIComponent(id) + '/role');
    if (view === 'chaud') return hotScreen();
    if (view === 'export') return exportScreen();
    return phaseScreen(phase);
  });
}

// Chaque écran remet à zéro les fonctions de mise à jour (reg) avant de se dessiner : voir route()
function screen(nodes, title) {
  app.textContent = '';
  (Array.isArray(nodes) ? nodes : [nodes]).forEach(function (n) {
    if (n) app.appendChild(n);
  });
  document.title = (title ? title + ' - ' : '') + 'Debrief drone ESAM';
  window.scrollTo(0, 0);
}

function ficheTitle(f) {
  return M.ficheTitre(q, f);
}

/* ---------- Accueil ---------- */

function home() {
  cur = null;
  return store.all().then(function (list) {
    var ul = h('ul', { class: 'list', id: 'ficheList' });
    list.forEach(function (f) {
      var id = f.debrief_id;
      var open = h('button', { type: 'button', class: 'btn', onclick: () => go(ficheLink(f)) }, 'Ouvrir');
      var del = confirmButton('Supprimer', 'Confirmer la suppression', function () {
        store.del(id).then(function () {
          toast('Fiche supprimée');
          reg = [];
          home();
        });
      });
      ul.appendChild(
        h(
          'li',
          { class: 'card', 'data-id': id },
          h(
            'div',
            { class: 'card-h' },
            h('strong', { class: 'card-t' }, ficheTitle(f)),
            h('span', { class: 'badge s-' + f.statut }, M.statutLabel(q, f.statut))
          ),
          h(
            'p',
            { class: 'card-m' },
            "Pat'rouille : " + (f.answers.patrouille || 'non renseigné'),
            h('br'),
            'Modifiée le ' + dateTime(f.maj)
          ),
          h('div', { class: 'row' }, open, del)
        )
      );
    });
    screen(
      [
        h('button', { type: 'button', class: 'btn big wide', id: 'newBtn', onclick: newFiche }, '+ Nouvelle fiche'),
        h('h2', { class: 'sec-t' }, 'Fiches sur ce téléphone'),
        list.length ? ul : h('p', { class: 'hint' }, 'Aucune fiche pour le moment.'),
        importBox()
      ],
      null
    );
  });
}

function ficheLink(f) {
  var base = '#/f/' + encodeURIComponent(f.debrief_id);
  return base + '/role';
}

function newFiche() {
  cur = M.newFiche(q, 'pilote');
  setRole(cur.debrief_id, 'pilote');
  store.draft(cur);
  flush().then(function () {
    go('#/f/' + encodeURIComponent(cur.debrief_id) + '/chaud');
  });
  q.entete.forEach(function (f) {
    if (f.defaut === 'position') fillPosition(ctx, f.key, true);
  });
}

/* ---------- Import d'une note ---------- */

function importBox() {
  var ta = h('textarea', {
    id: 'importText',
    rows: 4,
    spellcheck: 'false',
    placeholder: 'Colle ici le texte de la note'
  });
  var file = h('input', { type: 'file', id: 'importFile', accept: '.md,text/markdown,text/plain', class: 'offscreen' });
  var msg = h('div', { class: 'msg', id: 'importMsg', role: 'status', 'aria-live': 'polite' });
  function run(text) {
    msg.textContent = '';
    var st = extractState(text);
    if (!st) {
      msg.textContent = "Aucun bloc de reprise lisible dans cette note : vérifie qu'elle a été exportée par l'appli.";
      msg.className = 'msg err';
      return;
    }
    store.get(st.debrief_id).then(function (existing) {
      if (!existing) return save(st);
      msg.className = 'msg';
      msg.appendChild(
        h('p', null, 'Cette fiche existe déjà sur ce téléphone (modifiée le ' + dateTime(existing.maj) + ').')
      );
      msg.appendChild(
        h(
          'div',
          { class: 'row' },
          h('button', { type: 'button', class: 'btn', id: 'importReplace', onclick: () => save(st) }, 'Remplacer'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn sec',
              id: 'importIgnore',
              onclick: function () {
                msg.textContent = 'Import ignoré : la fiche du téléphone est conservée.';
              }
            },
            'Ignorer'
          )
        )
      );
    });
  }
  function save(st) {
    store.put(st).then(function () {
      toast('Fiche reprise');
      go('#/f/' + encodeURIComponent(st.debrief_id) + '/role');
    });
  }
  file.addEventListener('change', function () {
    var f = file.files && file.files[0];
    if (!f) return;
    f.text().then(function (t) {
      ta.value = t;
      run(t);
    });
    file.value = '';
  });
  return h(
    'details',
    { class: 'block fold', id: 'importBox' },
    h('summary', null, 'Reprendre une note Obsidian'),
    h(
      'div',
      { class: 'fold-b' },
      h('p', { class: 'hint' }, 'Pour compléter sur ce téléphone une fiche exportée ailleurs.'),
      h('label', { class: 'f-l', for: 'importText' }, 'Texte de la note'),
      ta,
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          { type: 'button', class: 'btn', id: 'importBtn', onclick: () => run(ta.value) },
          'Importer le texte'
        ),
        h('label', { class: 'btn sec', for: 'importFile' }, 'Ouvrir un fichier .md'),
        file
      ),
      msg
    )
  );
}

/* ---------- Cadre d'une fiche ---------- */

function ficheBar() {
  var saved = h('span', { class: 'saved', id: 'saved', role: 'status' }, 'Enregistré à ' + hm(cur.maj));
  var title = h('strong', null);
  reg.push(function () {
    title.textContent = ficheTitle(cur);
  });
  return h(
    'div',
    { class: 'fbar' },
    h('button', { type: 'button', class: 'btn sec small', id: 'homeBtn', onclick: () => go('#/') }, 'Accueil'),
    h('div', { class: 'fbar-t' }, title, saved),
    h(
      'button',
      {
        type: 'button',
        class: 'role-pill',
        id: 'roleBtn',
        onclick: () => go('#/f/' + encodeURIComponent(cur.debrief_id) + '/role')
      },
      'Rôle : ' + roleLabel(ctx.role())
    )
  );
}
function roleLabel(v) {
  var r = q.roles.find(function (x) {
    return x.v === v;
  });
  return r ? r.l : v;
}

function tabs(active) {
  var nav = h('nav', { class: 'tabs', 'aria-label': 'Phases du debrief' });
  var sig = null;
  var base = '#/f/' + encodeURIComponent(cur.debrief_id);
  reg.push(function () {
    var ph = M.visiblePhases(q, cur);
    var s = ph
      .map(function (p) {
        var pr = M.phaseProgress(q, cur, p.id);
        return p.id + ':' + pr.done + '/' + pr.total;
      })
      .join(',');
    if (s === sig) return;
    sig = s;
    nav.textContent = '';
    ph.forEach(function (p) {
      var pr = M.phaseProgress(q, cur, p.id);
      var href = p.id === 'chaud' ? base + '/chaud' : base + '/p/' + p.id;
      nav.appendChild(
        h(
          'a',
          {
            href: href,
            class: 'tab' + (pr.done === pr.total ? ' done' : ''),
            'data-phase': p.id,
            'aria-current': p.id === active ? 'page' : null
          },
          h('span', { class: 'tab-l' }, (p.n ? p.n + '. ' : '') + p.court),
          h(
            'span',
            { class: 'tab-p', 'aria-label': pr.done + ' sur ' + pr.total + ' questions' },
            pr.done + '/' + pr.total
          )
        )
      );
    });
    nav.appendChild(
      h('a', { href: base + '/export', class: 'tab note', 'aria-current': active === 'export' ? 'page' : null }, 'Note')
    );
  });
  return nav;
}

function roNotice() {
  var p = h(
    'p',
    { class: 'ro-note', id: 'roNote' },
    'Lecture seule : les réponses du pilote ne sont pas modifiables avec ton rôle. Tu peux ajouter des remarques à la fin de chaque phase.'
  );
  reg.push(function () {
    p.hidden = !ctx.readOnly();
  });
  return p;
}

/* ---------- Rôle ---------- */

function roleScreen() {
  var id = cur.debrief_id;
  var next = cur.statut === 'chaud-en-cours' ? '/chaud' : firstColdLink();
  screen(
    h(
      'section',
      { class: 'block role-pick' },
      h('h2', { class: 'sec-t' }, ficheTitle(cur)),
      h('p', { class: 'f-l', id: 'roleQ' }, 'Quel est ton rôle sur cette fiche ?'),
      h(
        'div',
        { class: 'chips big', role: 'group', 'aria-labelledby': 'roleQ' },
        q.roles.map(function (r) {
          return h(
            'button',
            {
              type: 'button',
              class: 'chip',
              'data-role': r.v,
              'aria-pressed': roleOf(id) === r.v ? 'true' : 'false',
              onclick: function () {
                setRole(id, r.v);
                go('#/f/' + encodeURIComponent(id) + next);
              }
            },
            r.l
          );
        })
      ),
      h(
        'p',
        { class: 'hint' },
        'Seul le pilote modifie les réponses. Les autres rôles ajoutent des remarques à la fin de chaque phase.'
      ),
      h('button', { type: 'button', class: 'btn sec', onclick: () => go('#/') }, "Retour à l'accueil")
    ),
    'Rôle'
  );
}

function firstColdLink() {
  var ph = M.visiblePhases(q, cur).filter(function (p) {
    return p.id !== 'chaud';
  });
  var first =
    ph.find(function (p) {
      var pr = M.phaseProgress(q, cur, p.id);
      return pr.done < pr.total;
    }) || ph[0];
  return first ? '/p/' + first.id : '/chaud';
}

/* ---------- À chaud ---------- */

function hotScreen() {
  var body = [ficheBar(), tabs('chaud'), roNotice(), renderEntete(ctx, reg)];
  q.questions
    .filter(function (qu) {
      return qu.phase === 'chaud';
    })
    .forEach(function (qu) {
      body.push(renderQuestion(ctx, qu, reg));
    });
  var done = h(
    'button',
    {
      type: 'button',
      class: 'btn big wide',
      id: 'finishHot',
      onclick: function () {
        if (!ctx.readOnly()) M.finishHot(q, cur);
        store.draft(cur);
        flush().then(function () {
          toast('Debrief à chaud enregistré');
          go('#/');
        });
      }
    },
    'Terminer'
  );
  body.push(h('div', { class: 'actions' }, done));
  screen(body, 'À chaud');
  refresh();
}

/* ---------- À froid ---------- */

function phaseScreen(phaseId) {
  var ph = M.visiblePhases(q, cur);
  var i = ph.findIndex(function (p) {
    return p.id === phaseId;
  });
  if (i < 0) return go('#/f/' + encodeURIComponent(cur.debrief_id) + firstColdLink());
  var p = ph[i];
  var base = '#/f/' + encodeURIComponent(cur.debrief_id);
  var body = [ficheBar(), tabs(p.id), roNotice(), h('h2', { class: 'phase-t' }, (p.n ? p.n + '. ' : '') + p.l)];
  q.questions
    .filter(function (qu) {
      return qu.phase === p.id;
    })
    .forEach(function (qu) {
      body.push(renderQuestion(ctx, qu, reg));
    });
  body.push(renderRemarks(ctx, p.id, reg));
  var prev = ph[i - 1];
  var next = ph[i + 1];
  var link = function (x) {
    return x.id === 'chaud' ? base + '/chaud' : base + '/p/' + x.id;
  };
  var nav = h(
    'div',
    { class: 'actions row2' },
    prev ? h('a', { class: 'btn sec', href: link(prev) }, 'Phase précédente') : h('span'),
    next
      ? h('a', { class: 'btn', href: link(next), id: 'nextPhase' }, 'Phase suivante')
      : h('a', { class: 'btn', href: base + '/export', id: 'toNote' }, 'Voir la note')
  );
  body.push(nav);
  screen(body, p.l);
  refresh();
}

/* ---------- Note ---------- */

function exportScreen() {
  var name = fileName(cur);
  var text = toMarkdown(q, cur);
  var msg = h('p', { class: 'msg', id: 'exportMsg', role: 'status', 'aria-live': 'polite' });
  var pre = h('textarea', { id: 'exportText', readonly: true, rows: 12, spellcheck: 'false', 'aria-label': 'Note' });
  pre.value = text;
  function manual() {
    pre.focus();
    pre.select();
    say('Copie automatique impossible : le texte est sélectionné, copie-le à la main.', true);
  }
  function say(t, err) {
    msg.textContent = t;
    msg.className = 'msg' + (err ? ' err' : ' ok');
  }
  var close =
    cur.statut !== 'termine' && !ctx.readOnly()
      ? h(
          'button',
          {
            type: 'button',
            class: 'btn sec wide',
            id: 'closeBtn',
            onclick: function () {
              M.finishAll(q, cur);
              store.draft(cur);
              flush().then(function () {
                reg = [];
                exportScreen();
              });
            }
          },
          'Clore le debrief (statut terminé)'
        )
      : null;
  screen(
    [
      ficheBar(),
      tabs('export'),
      h('h2', { class: 'phase-t' }, 'Note Obsidian'),
      h('p', { class: 'file' }, name),
      h(
        'div',
        { class: 'grid3' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            id: 'copyBtn',
            onclick: function () {
              copyText(text).then(function (r) {
                if (r === 'ok') say('Copié dans le presse-papiers.');
                else manual();
              });
            }
          },
          'Copier'
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            id: 'dlBtn',
            onclick: function () {
              download(text, name).then(function (r) {
                if (r === 'ok') say('Fichier ' + name + ' téléchargé.');
                else manual();
              });
            }
          },
          'Télécharger'
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            id: 'shareBtn',
            onclick: function () {
              share(text, name).then(function (r) {
                if (r === 'ok') say('Note partagée.');
                else if (r === 'annule') say('Partage annulé.');
                else if (r === 'telecharge') say('Partage indisponible : fichier téléchargé à la place.');
                else manual();
              });
            }
          },
          'Partager'
        )
      ),
      msg,
      h('label', { class: 'f-l', for: 'exportText' }, 'Aperçu'),
      pre,
      close
    ],
    'Note'
  );
  refresh();
}

/* ---------- Démarrage ---------- */

function initNet() {
  var n = $('net');
  var upd = function () {
    n.hidden = navigator.onLine !== false;
  };
  window.addEventListener('online', upd);
  window.addEventListener('offline', upd);
  upd();
}

function start() {
  $('ver').textContent = 'v' + APP_VERSION;
  initTheme();
  initNet();
  fetch('questionnaire.json')
    .then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(function (json) {
      q = json;
      ctx.q = q;
      window.addEventListener('hashchange', route);
      return route();
    })
    .catch(function () {
      app.textContent = '';
      app.appendChild(
        h(
          'p',
          { class: 'msg err' },
          "Questionnaire introuvable. Ouvre l'appli une première fois avec du réseau pour la préparer hors ligne."
        )
      );
    });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
}

start();
