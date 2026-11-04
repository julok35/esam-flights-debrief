/* Point d'entrée : chargement du questionnaire, écrans (accueil et historique, consultation, rôle, à chaud, phases à
 * froid, note, statistiques, synchronisation), navigation par l'adresse (#/...), enregistrement automatique, import de
 * notes Obsidian, synchronisation en ligne quand elle est activée. */
import * as M from './model.js';
import * as store from './store.js';
import { toMarkdown, fileName } from './markdown.js';
import { copyText, download, share } from './exporter.js';
import { renderEntete, renderQuestion, renderRemarks, confirmButton, fillPosition } from './form.js';
import { $, h, hm, dateTime, toast } from './util.js';
import { APP_VERSION } from './version.js';
import { filterFiches, years, ficheResume, ETATS } from './history.js';
import { computeStats } from './stats.js';
import { readNote, decision } from './importer.js';
import { noteNodes } from './view.js';
import * as cloud from './cloud.js';

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
      scheduleSync(4000);
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

// Numéro de navigation : un écran chargé en différé (accueil, statistiques) ne s'affiche pas si on a navigué depuis
var navSeq = 0;

function route() {
  navSeq += 1;
  var m = /^#\/f\/([^/]+)\/(role|voir|chaud|export|p\/([^/]+))$/.exec(location.hash);
  reg = [];
  homeRefresh = null;
  if (takeLink()) return Promise.resolve();
  if (location.hash === '#/stats') return flush().then(statsScreen);
  if (location.hash === '#/compte') return flush().then(accountScreen);
  linkMsg = null; // message du lien de connexion : affiché tant que l'écran Synchronisation reste ouvert
  if (!m) return flush().then(home);
  var id = decodeURIComponent(m[1]);
  var view = m[2];
  var phase = m[3];
  var p = cur && cur.debrief_id === id ? Promise.resolve(cur) : flush().then(() => store.get(id));
  var seq = navSeq;
  return p.then(function (f) {
    if (seq !== navSeq) return;
    if (!f) return go('#/');
    cur = f;
    if (view === 'role') return roleScreen();
    if (view === 'voir') return viewScreen();
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

/* ---------- Accueil : historique des debriefs ---------- */

var FILTRES = 'esam-debrief-filtres';
var homeRefresh = null; // redessine la liste de l'accueil (après une synchronisation)

function loadFiltres() {
  var d = { texte: '', etat: 'tous', annee: '', tri: 'date' };
  try {
    return Object.assign(d, JSON.parse(sessionStorage.getItem(FILTRES) || '{}'));
  } catch (e) {
    return d;
  }
}
function saveFiltres(f) {
  try {
    sessionStorage.setItem(FILTRES, JSON.stringify(f));
  } catch (e) {}
}

/** Rangée de pastilles à choix unique (filtres) : options [{ v, l }], attribut data-<nom>. */
function choice(name, label, options, get, set) {
  var lid = 'lbl-' + name;
  var box = h('div', { class: 'chips small', role: 'group', 'aria-labelledby': lid, id: 'f-' + name });
  function draw() {
    box.textContent = '';
    options.forEach(function (o) {
      var attrs = { type: 'button', class: 'chip', 'aria-pressed': get() === o.v ? 'true' : 'false' };
      attrs['data-' + name] = o.v;
      attrs.onclick = function () {
        set(o.v);
        draw();
      };
      box.appendChild(h('button', attrs, o.l));
    });
  }
  draw();
  return h('div', { class: 'f' }, h('p', { class: 'f-l', id: lid }, label), box);
}

function ficheCard(f) {
  var id = f.debrief_id;
  var del = confirmButton('Supprimer', 'Confirmer la suppression', function () {
    store.del(id).then(function () {
      toast('Fiche supprimée');
      scheduleSync(0);
      reg = [];
      home();
    });
  });
  var resume = ficheResume(q, f);
  return h(
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
      resume ? [h('br'), resume] : null,
      h('br'),
      'Modifiée le ' + dateTime(f.maj)
    ),
    h(
      'div',
      { class: 'row' },
      h('a', { class: 'btn sec', href: '#/f/' + encodeURIComponent(id) + '/voir', 'data-act': 'voir' }, 'Consulter'),
      h('button', { type: 'button', class: 'btn', onclick: () => go(ficheLink(f)) }, 'Ouvrir'),
      del
    )
  );
}

function home() {
  cur = null;
  var seq = navSeq;
  return store.all().then(function (all) {
    if (seq !== navSeq) return;
    var fl = loadFiltres();
    var listBox = h('div', { class: 'hist', id: 'histList' });
    var count = h('p', { class: 'hint', id: 'ficheCount', role: 'status', 'aria-live': 'polite' });
    var filters = h('div', { class: 'filters', id: 'filters' });

    function drawList() {
      var shown = filterFiches(q, all, fl);
      listBox.textContent = '';
      if (!all.length) {
        count.textContent = '';
        listBox.appendChild(h('p', { class: 'hint' }, 'Aucune fiche pour le moment.'));
        return;
      }
      count.textContent =
        shown.length === all.length
          ? all.length + (all.length > 1 ? ' debriefs' : ' debrief')
          : shown.length + ' sur ' + all.length + ' debriefs';
      if (!shown.length) {
        listBox.appendChild(h('p', { class: 'hint', id: 'noMatch' }, 'Aucun debrief ne correspond à ces critères.'));
        return;
      }
      listBox.appendChild(h('ul', { class: 'list', id: 'ficheList' }, shown.map(ficheCard)));
    }
    function change(k, v) {
      fl[k] = v;
      saveFiltres(fl);
      drawList();
    }
    function drawFilters() {
      filters.textContent = '';
      if (all.length < 2 && !fl.texte && fl.etat === 'tous' && !fl.annee) return;
      var search = h('input', {
        type: 'search',
        id: 'search',
        placeholder: 'Animal, lieu, numéro, mot du commentaire',
        autocomplete: 'off',
        value: fl.texte || ''
      });
      search.addEventListener('input', function () {
        change('texte', search.value);
      });
      var ys = years(all);
      filters.appendChild(
        h(
          'details',
          { class: 'block fold', id: 'filterBox', open: fl.texte || fl.etat !== 'tous' || fl.annee ? true : null },
          h('summary', null, 'Rechercher et filtrer'),
          h(
            'div',
            { class: 'fold-b' },
            h('label', { class: 'f-l', for: 'search' }, 'Rechercher'),
            search,
            choice(
              'etat',
              'État',
              ETATS,
              () => fl.etat,
              (v) => change('etat', v)
            ),
            ys.length > 1 || fl.annee
              ? choice(
                  'annee',
                  'Année',
                  [{ v: '', l: 'Toutes' }].concat(
                    ys.map(function (y) {
                      return { v: y, l: y };
                    })
                  ),
                  () => fl.annee,
                  (v) => change('annee', v)
                )
              : null,
            choice(
              'tri',
              'Trier par',
              [
                { v: 'date', l: "Date d'intervention" },
                { v: 'maj', l: 'Dernière modification' }
              ],
              () => fl.tri,
              (v) => change('tri', v)
            )
          )
        )
      );
    }
    drawFilters();
    drawList();
    homeRefresh = function () {
      return store.all().then(function (l) {
        all = l;
        if (!filters.childNodes.length) drawFilters();
        drawList();
      });
    };
    screen(
      [
        h('button', { type: 'button', class: 'btn big wide', id: 'newBtn', onclick: newFiche }, '+ Nouvelle fiche'),
        h(
          'div',
          { class: 'row2' },
          h('a', { class: 'btn sec', href: '#/stats', id: 'statsBtn' }, 'Statistiques'),
          h('a', { class: 'btn sec', href: '#/compte', id: 'accountBtn' }, 'Synchronisation')
        ),
        syncLine(),
        h('h2', { class: 'sec-t' }, 'Debriefs'),
        filters,
        count,
        listBox,
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

/* ---------- Import de notes Obsidian ---------- */

function partialNote(r) {
  return r.partiel ? ' Reprise depuis le frontmatter : les textes libres et les remarques ne sont pas récupérés.' : '';
}

/** Import de plusieurs notes : la plus récente l'emporte, puis un bilan. */
function importMany(files, msg) {
  msg.className = 'msg';
  msg.textContent = 'Lecture de ' + files.length + ' notes...';
  var bilan = { nouvelle: 0, maj: 0, ignoree: 0, partiel: 0, erreurs: [] };
  return files
    .reduce(function (p, file) {
      return p.then(function () {
        return file.text().then(function (t) {
          var r = readNote(q, t);
          if (r.erreur) {
            bilan.erreurs.push(file.name);
            return;
          }
          return store.get(r.fiche.debrief_id).then(function (ex) {
            var d = decision(ex, r.fiche);
            bilan[d] += 1;
            if (d === 'ignoree') return;
            if (r.partiel) bilan.partiel += 1;
            return store.put(r.fiche);
          });
        });
      });
    }, Promise.resolve())
    .then(function () {
      var parts = [];
      if (bilan.nouvelle) parts.push(bilan.nouvelle + (bilan.nouvelle > 1 ? ' nouvelles fiches' : ' nouvelle fiche'));
      if (bilan.maj) parts.push(bilan.maj + ' mise' + (bilan.maj > 1 ? 's' : '') + ' à jour');
      if (bilan.ignoree)
        parts.push(
          bilan.ignoree + ' déjà à jour sur ce téléphone (non modifiée' + (bilan.ignoree > 1 ? 's' : '') + ')'
        );
      msg.textContent = 'Import terminé : ' + (parts.join(', ') || 'aucune fiche') + '.';
      if (bilan.partiel)
        msg.appendChild(
          h(
            'p',
            null,
            bilan.partiel +
              ' sans bloc de reprise, reprise' +
              (bilan.partiel > 1 ? 's' : '') +
              ' depuis le frontmatter : textes libres et remarques non récupérés.'
          )
        );
      if (bilan.erreurs.length)
        msg.appendChild(
          h(
            'p',
            { class: 'err' },
            bilan.erreurs.length +
              ' fichier' +
              (bilan.erreurs.length > 1 ? 's' : '') +
              " sans debrief de l'appli, ignoré" +
              (bilan.erreurs.length > 1 ? 's' : '') +
              ' : ' +
              bilan.erreurs.join(', ')
          )
        );
      msg.className = 'msg ' + (bilan.erreurs.length ? '' : 'ok');
      scheduleSync(0);
      if (homeRefresh) homeRefresh();
    });
}

function importBox() {
  var ta = h('textarea', {
    id: 'importText',
    rows: 4,
    spellcheck: 'false',
    placeholder: 'Colle ici le texte de la note'
  });
  var file = h('input', {
    type: 'file',
    id: 'importFile',
    accept: '.md,text/markdown,text/plain',
    multiple: true,
    class: 'offscreen'
  });
  var dir = h('input', { type: 'file', id: 'importDir', class: 'offscreen' });
  var dirOk = 'webkitdirectory' in dir;
  if (dirOk) dir.webkitdirectory = true;
  var msg = h('div', { class: 'msg', id: 'importMsg', role: 'status', 'aria-live': 'polite' });
  function run(text) {
    msg.textContent = '';
    var r = readNote(q, text);
    if (r.erreur) {
      msg.textContent = "Aucun debrief lisible dans cette note : vérifie qu'elle a été exportée par l'appli.";
      msg.className = 'msg err';
      return;
    }
    var st = r.fiche;
    store.get(st.debrief_id).then(function (existing) {
      if (!existing) return save(st, r);
      msg.className = 'msg';
      msg.appendChild(
        h('p', null, 'Cette fiche existe déjà sur ce téléphone (modifiée le ' + dateTime(existing.maj) + ').')
      );
      msg.appendChild(
        h(
          'div',
          { class: 'row' },
          h('button', { type: 'button', class: 'btn', id: 'importReplace', onclick: () => save(st, r) }, 'Remplacer'),
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
  function save(st, r) {
    store.put(st).then(function () {
      toast('Fiche reprise.' + partialNote(r));
      scheduleSync(0);
      go('#/f/' + encodeURIComponent(st.debrief_id) + '/role');
    });
  }
  function mdFiles(list) {
    return Array.prototype.filter.call(list || [], function (f) {
      return /\.(md|markdown|txt)$/i.test(f.name);
    });
  }
  file.addEventListener('change', function () {
    var fs = Array.prototype.slice.call(file.files || []);
    file.value = '';
    if (!fs.length) return;
    if (fs.length > 1) return importMany(fs, msg);
    fs[0].text().then(function (t) {
      ta.value = t;
      run(t);
    });
  });
  dir.addEventListener('change', function () {
    var fs = mdFiles(dir.files);
    dir.value = '';
    if (!fs.length) {
      msg.className = 'msg err';
      msg.textContent = 'Aucune note .md dans ce dossier.';
      return;
    }
    importMany(fs, msg);
  });
  return h(
    'details',
    { class: 'block fold', id: 'importBox' },
    h('summary', null, 'Importer des notes Obsidian'),
    h(
      'div',
      { class: 'fold-b' },
      h(
        'p',
        { class: 'hint' },
        "Pour reprendre ici des debriefs exportés par l'appli : une note collée, un ou plusieurs fichiers .md, ou tout un dossier du coffre Obsidian. Pour plusieurs notes, la version la plus récente de chaque fiche est gardée."
      ),
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
        h('label', { class: 'btn sec', for: 'importFile' }, 'Ouvrir des fichiers .md'),
        dirOk ? h('label', { class: 'btn sec', for: 'importDir' }, 'Ouvrir un dossier') : null,
        file,
        dir
      ),
      msg
    )
  );
}

/* ---------- Consultation d'une fiche ---------- */

function viewScreen() {
  var id = encodeURIComponent(cur.debrief_id);
  screen(
    [
      h(
        'div',
        { class: 'fbar' },
        h('button', { type: 'button', class: 'btn sec small', id: 'homeBtn', onclick: () => go('#/') }, 'Accueil'),
        h(
          'div',
          { class: 'fbar-t' },
          h('strong', null, ficheTitle(cur)),
          h('span', { class: 'saved' }, M.statutLabel(q, cur.statut) + ', modifiée le ' + dateTime(cur.maj))
        ),
        h('span')
      ),
      h(
        'div',
        { class: 'row2' },
        h('a', { class: 'btn', href: '#/f/' + id + '/role', id: 'editBtn' }, 'Compléter'),
        h('a', { class: 'btn sec', href: '#/f/' + id + '/export', id: 'noteBtn' }, 'Note Obsidian')
      ),
      h('article', { class: 'block v-note', id: 'viewNote' }, noteNodes(toMarkdown(q, cur)))
    ],
    'Consultation'
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

/* ---------- Synchronisation en ligne ---------- */

var syncTimer = 0;
var syncState = { busy: false, err: '' };
var syncViews = []; // éléments qui affichent l'état de la synchronisation

function syncText() {
  if (!cloud.configured() || !cloud.signedIn())
    return 'Synchronisation entre appareils : non activée. Les fiches restent sur ce téléphone.';
  if (syncState.busy) return 'Synchronisation en cours...';
  if (syncState.err) return syncState.err;
  if (navigator.onLine === false) return 'Hors ligne : synchronisation au retour du réseau.';
  var l = cloud.lastSync();
  return l ? 'Synchronisé le ' + dateTime(l) + '.' : 'Synchronisation à venir.';
}
function drawSync() {
  syncViews = syncViews.filter(function (el) {
    return el.isConnected;
  });
  syncViews.forEach(function (el) {
    el.textContent = syncText();
    el.classList.toggle('err', !!syncState.err && !syncState.busy);
  });
}
function syncLine() {
  var p = h('p', { class: 'sync', id: 'syncState', role: 'status', 'aria-live': 'polite' });
  syncViews.push(p);
  p.textContent = syncText();
  p.classList.toggle('err', !!syncState.err);
  return p;
}

function scheduleSync(delay) {
  if (!cloud.configured() || !cloud.signedIn()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, delay || 0);
}

function runSync() {
  clearTimeout(syncTimer);
  if (!cloud.configured() || !cloud.signedIn()) return Promise.resolve(null);
  if (navigator.onLine === false) {
    drawSync();
    return Promise.resolve(null);
  }
  syncState.busy = true;
  drawSync();
  return cloud.sync().then(
    function (r) {
      syncState = { busy: false, err: '' };
      drawSync();
      afterSync(r);
      return r;
    },
    function (e) {
      syncState = { busy: false, err: e.message };
      drawSync();
      return null;
    }
  );
}

/** Fiches reçues ou supprimées par la synchronisation : l'écran affiché est mis à jour. */
function afterSync(r) {
  if (!r || !r.ids.length) return;
  if (!cur) {
    if (homeRefresh) homeRefresh();
    else if (location.hash === '#/stats') statsScreen();
    return;
  }
  if (r.ids.indexOf(cur.debrief_id) >= 0 && !saveTimer) {
    var id = cur.debrief_id;
    cur = null;
    store.get(id).then(function (f) {
      if (!f) {
        toast('Cette fiche a été supprimée sur un autre appareil.');
        go('#/');
      } else {
        toast('Fiche mise à jour depuis un autre appareil.');
        route();
      }
    });
  }
}

/* ---------- Statistiques ---------- */

var PERIODE = 'esam-debrief-periode';

function bar(label, n, pc, max) {
  var fill = h('span', { class: 'bar-fill' });
  fill.style.width = (max ? Math.max(2, Math.round((n * 100) / max)) : 0) + '%';
  return h(
    'li',
    { class: 'bar' },
    h('span', { class: 'bar-l' }, label),
    h('span', { class: 'bar-v' }, n + (pc === null ? '' : ' (' + pc + ' %)')),
    h('span', { class: 'bar-track', 'aria-hidden': 'true' }, fill)
  );
}
function bars(rows) {
  var max = rows.reduce(function (m, r) {
    return Math.max(m, r.n);
  }, 0);
  var sorted = rows.slice().sort(function (a, b) {
    return b.n - a.n;
  });
  return h(
    'ul',
    { class: 'bars' },
    sorted.map(function (r) {
      return bar(r.l, r.n, r.pct, max);
    })
  );
}

function blocNodes(b, sur) {
  var head = function (txt) {
    return h('p', { class: 'st-l' }, b.l ? b.l + ' ' : '', h('small', null, txt));
  };
  if (b.type === 'dist')
    return [head('(' + b.n + ' ' + sur + (b.multi ? ', plusieurs choix possibles' : '') + ')'), bars(b.rows)];
  if (b.type === 'num')
    return [
      head('(' + b.n + ' ' + sur + ')'),
      h(
        'p',
        { class: 'st-num' },
        'Moyenne ' + String(b.moy).replace('.', ',') + (b.unit ? ' ' + b.unit : '') + ', de ' + b.min + ' à ' + b.max
      )
    ];
  if (b.type === 'grid')
    return [
      head('(' + b.n + ' ' + sur + ')'),
      h(
        'ul',
        { class: 'st-grid' },
        b.rows.map(function (r) {
          return h(
            'li',
            null,
            h('strong', null, r.l),
            ' : ',
            r.counts.length
              ? r.counts
                  .map(function (c) {
                    return c.l + ' ' + c.n;
                  })
                  .join(', ')
              : 'non renseigné'
          );
        })
      )
    ];
  if (b.type === 'repeat')
    return [
      h(
        'p',
        { class: 'st-l' },
        b.n + ' ' + b.itemLabel.toLowerCase() + (b.n > 1 ? 's' : '') + ' détaillé' + (b.n > 1 ? 's' : '')
      )
    ].concat(
      b.fields
        .filter(function (d) {
          return d.n;
        })
        .map(function (d) {
          return h('div', { class: 'st-sub' }, blocNodes(d, 'renseignés'));
        })
    );
  return [];
}

function statsScreen() {
  cur = null;
  var seq = navSeq;
  return store.all().then(function (all) {
    if (seq !== navSeq) return;
    var periode = '';
    try {
      periode = sessionStorage.getItem(PERIODE) || '';
    } catch (e) {}
    var ys = years(all);
    if (periode && ys.indexOf(periode) < 0) periode = '';
    var body = h('div', { class: 'stats', id: 'statsBody' });
    function draw() {
      var list = filterFiches(q, all, { annee: periode });
      var st = computeStats(q, list);
      body.textContent = '';
      if (!st.total) {
        body.appendChild(h('p', { class: 'hint' }, 'Aucun debrief sur cette période.'));
        return;
      }
      body.appendChild(
        h(
          'div',
          { class: 'kpis', id: 'kpis' },
          st.kpis.map(function (k) {
            return h(
              'div',
              { class: 'kpi', 'data-kpi': k.id },
              h('span', { class: 'kpi-v' }, k.v),
              h('span', { class: 'kpi-l' }, k.l),
              k.detail ? h('span', { class: 'kpi-d' }, k.detail) : null
            );
          })
        )
      );
      if (st.mois.length > 1) {
        var mois = st.mois.slice(-24);
        var max = Math.max.apply(
          null,
          mois.map(function (m) {
            return m.n;
          })
        );
        body.appendChild(
          h(
            'section',
            { class: 'block', id: 'statsMois' },
            h('h3', { class: 'st-h' }, 'Debriefs par mois'),
            h(
              'ul',
              { class: 'bars' },
              mois.map(function (m) {
                return bar(m.l, m.n, null, max);
              })
            )
          )
        );
      }
      st.phases.forEach(function (p) {
        body.appendChild(
          h(
            'details',
            { class: 'block fold', 'data-phase': p.id },
            h('summary', null, p.l),
            h(
              'div',
              { class: 'fold-b' },
              p.questions.map(function (qu) {
                return h(
                  'section',
                  { class: 'st-q', 'data-q': qu.id },
                  h('h4', { class: 'st-qt' }, h('span', { class: 'q-id' }, qu.id), ' ', qu.titre),
                  qu.blocs.map(function (b) {
                    return h('div', { class: 'st-b' }, blocNodes(b, 'fiches'));
                  })
                );
              })
            )
          )
        );
      });
    }
    var filtre =
      ys.length > 1
        ? choice(
            'periode',
            'Période',
            [{ v: '', l: 'Toutes' }].concat(
              ys.map(function (y) {
                return { v: y, l: y };
              })
            ),
            () => periode,
            function (v) {
              periode = v;
              try {
                sessionStorage.setItem(PERIODE, v);
              } catch (e) {}
              draw();
            }
          )
        : null;
    draw();
    screen(
      [
        h(
          'div',
          { class: 'fbar' },
          h('button', { type: 'button', class: 'btn sec small', id: 'homeBtn', onclick: () => go('#/') }, 'Accueil'),
          h('div', { class: 'fbar-t' }, h('strong', null, 'Statistiques')),
          h('span')
        ),
        h(
          'p',
          { class: 'hint' },
          cloud.signedIn()
            ? 'Calculées sur les debriefs de ce téléphone, synchronisés avec ceux des autres membres.'
            : 'Calculées sur les debriefs de ce téléphone. Importe tes notes Obsidian ou active la synchronisation pour tout y retrouver.'
        ),
        filtre,
        body
      ],
      'Statistiques'
    );
  });
}

/* ---------- Compte et synchronisation ---------- */

var EMAIL = 'esam-debrief-email';
var linkMsg = null; // retour du lien de connexion reçu par e-mail

/** Retour du lien de connexion reçu par e-mail (#access_token=... ou #error=...) : session enregistrée, adresse
 * nettoyée, écran Synchronisation. */
function takeLink() {
  var link = cloud.takeLinkSession(location.hash);
  if (link === null) return false;
  linkMsg = link;
  // Remplace l'adresse (jetons hors de l'historique) ; le changement d'adresse ouvre l'écran Synchronisation
  location.replace(location.pathname + location.search + '#/compte');
  if (link === true) scheduleSync(0);
  return true;
}

function accountScreen() {
  cur = null;
  var msg = h('div', { class: 'msg', id: 'cloudMsg', role: 'status', 'aria-live': 'polite' });
  function say(t, kind) {
    msg.textContent = t;
    msg.className = 'msg' + (kind ? ' ' + kind : '');
  }
  var parts = [
    h(
      'div',
      { class: 'fbar' },
      h('button', { type: 'button', class: 'btn sec small', id: 'homeBtn', onclick: () => go('#/') }, 'Accueil'),
      h('div', { class: 'fbar-t' }, h('strong', null, 'Synchronisation')),
      h('span')
    ),
    h(
      'p',
      { class: 'hint' },
      "Retrouve tes debriefs sur tous tes appareils. Les fiches restent d'abord sur ce téléphone et la saisie fonctionne sans réseau ; dès que le réseau revient, elles sont recopiées dans la base en ligne de l'ESAM (Supabase, hébergée en Europe). Tous les membres voient toutes les fiches."
    )
  ];

  function configForm(open) {
    var c = cloud.config();
    var url = h('input', {
      type: 'url',
      id: 'cloudUrl',
      inputmode: 'url',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'https://xxxx.supabase.co',
      value: c.url
    });
    var key = h('input', {
      type: 'text',
      id: 'cloudKey',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: 'sb_publishable_... ou eyJ...',
      value: c.key
    });
    return h(
      'details',
      { class: 'block fold', id: 'cloudConfig', open: open ? true : null },
      h('summary', null, 'Projet Supabase'),
      h(
        'div',
        { class: 'fold-b' },
        h(
          'p',
          { class: 'hint' },
          'Adresse du projet et clé publique (Project Settings, API Keys). Elles ne sont pas secrètes : seuls les membres connectés accèdent aux fiches.'
        ),
        h('label', { class: 'f-l', for: 'cloudUrl' }, 'Adresse du projet'),
        url,
        h('label', { class: 'f-l', for: 'cloudKey' }, 'Clé publique'),
        key,
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            id: 'cloudSave',
            onclick: function () {
              var u = url.value.trim().replace(/\/+$/, '');
              if (!cloud.validUrl(u)) return say("L'adresse doit être de la forme https://xxxx.supabase.co", 'err');
              if (!key.value.trim()) return say('Colle la clé publique du projet.', 'err');
              cloud.setConfig(u, key.value);
              toast('Projet enregistré');
              accountScreen();
            }
          },
          'Enregistrer'
        )
      )
    );
  }

  if (!cloud.configured()) {
    parts.push(configForm(true));
  } else if (!cloud.signedIn()) {
    var email = h('input', {
      type: 'email',
      id: 'cloudEmail',
      inputmode: 'email',
      autocomplete: 'email',
      placeholder: 'prenom.nom@exemple.fr'
    });
    try {
      email.value = localStorage.getItem(EMAIL) || '';
    } catch (e) {}
    var code = h('input', {
      type: 'text',
      id: 'cloudCode',
      inputmode: 'numeric',
      autocomplete: 'one-time-code',
      maxlength: '10',
      placeholder: '123456'
    });
    var step2 = h(
      'div',
      { class: 'f', id: 'codeStep', hidden: true },
      h('label', { class: 'f-l', for: 'cloudCode' }, 'Code reçu par e-mail'),
      code,
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          id: 'verifyCode',
          onclick: function () {
            if (!/^\d{6,10}$/.test(code.value.replace(/\s+/g, '')))
              return say('Saisis le code à 6 chiffres reçu par e-mail.', 'err');
            say('Connexion...');
            cloud.verifyCode(email.value.trim().toLowerCase(), code.value).then(
              function () {
                toast('Connecté');
                accountScreen();
                runSync();
              },
              function (e) {
                say(e.message, 'err');
              }
            );
          }
        },
        'Se connecter'
      )
    );
    parts.push(
      h(
        'section',
        { class: 'block form', id: 'loginBox' },
        h('h3', { class: 'st-h' }, 'Connexion'),
        h(
          'p',
          { class: 'hint' },
          'Sans mot de passe : un code à usage unique est envoyé à ton adresse. Le lien du même e-mail fonctionne aussi.'
        ),
        h('label', { class: 'f-l', for: 'cloudEmail' }, 'Adresse e-mail'),
        email,
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            id: 'sendCode',
            onclick: function () {
              var e = email.value.trim().toLowerCase();
              if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return say('Adresse e-mail invalide.', 'err');
              try {
                localStorage.setItem(EMAIL, e);
              } catch (x) {}
              say('Envoi du code...');
              cloud.sendCode(e).then(
                function () {
                  say('Code envoyé à ' + e + ' : regarde ta messagerie (et les indésirables).', 'ok');
                  step2.hidden = false;
                  code.focus();
                },
                function (x) {
                  say(x.message, 'err');
                }
              );
            }
          },
          'Recevoir un code'
        ),
        step2
      )
    );
    parts.push(configForm(false));
  } else {
    var s = cloud.session() || {};
    var who = h('p', { class: 'f-l', id: 'cloudWho' }, 'Connecté' + (s.email ? ' : ' + s.email : ''));
    var member = h('p', { class: 'hint', id: 'cloudMember' });
    parts.push(
      h(
        'section',
        { class: 'block form', id: 'syncBox' },
        who,
        member,
        syncLine(),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn',
              id: 'syncNow',
              onclick: function () {
                runSync().then(function (r) {
                  if (r)
                    say(
                      'Synchronisation faite : ' +
                        r.envoyees +
                        ' envoyée' +
                        (r.envoyees > 1 ? 's' : '') +
                        ', ' +
                        r.recues +
                        ' reçue' +
                        (r.recues > 1 ? 's' : '') +
                        (r.supprimees ? ', ' + r.supprimees + ' supprimée' + (r.supprimees > 1 ? 's' : '') : '') +
                        '.',
                      'ok'
                    );
                });
              }
            },
            'Synchroniser maintenant'
          ),
          confirmButton('Se déconnecter', 'Confirmer la déconnexion', function () {
            cloud.signOut().then(function () {
              syncState = { busy: false, err: '' };
              toast('Déconnecté : les fiches restent sur ce téléphone.');
              accountScreen();
            });
          })
        )
      )
    );
    parts.push(configForm(false));
    cloud
      .whoAmI()
      .then(function (e) {
        if (e) who.textContent = 'Connecté : ' + e;
        return cloud.isMember();
      })
      .then(
        function (ok) {
          member.textContent = ok
            ? 'Membre ESAM : accès à toutes les fiches.'
            : "Ton adresse n'est pas encore dans la liste des membres : les fiches ne peuvent pas être synchronisées. Ajoute-la dans la table membres (docs/SUPABASE.md).";
          member.className = ok ? 'hint' : 'msg err';
        },
        function (e) {
          member.textContent = e.message;
        }
      );
  }
  parts.push(msg);
  screen(parts, 'Synchronisation');
  if (linkMsg) {
    say(linkMsg === true ? 'Connecté par le lien reçu par e-mail.' : linkMsg, linkMsg === true ? 'ok' : 'err');
  }
}

/* ---------- Démarrage ---------- */

function initNet() {
  var n = $('net');
  var upd = function () {
    n.hidden = navigator.onLine !== false;
    drawSync();
  };
  window.addEventListener('online', function () {
    upd();
    scheduleSync(0);
  });
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
      return route().then(function () {
        scheduleSync(500);
      });
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
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') scheduleSync(0);
  });
  // Pendant l'utilisation : une synchronisation toutes les 5 minutes, pour voir les fiches des autres appareils
  setInterval(function () {
    if (document.visibilityState === 'visible') scheduleSync(0);
  }, 300000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
}

start();
