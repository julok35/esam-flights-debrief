/* Consultation d'une fiche : la note Markdown (markdown.js) affichée en page, sans frontmatter ni bloc de reprise.
 * Ne lit que le sous-ensemble produit par l'appli (titres, gras, listes, citations, tableaux), et uniquement en
 * texte (textContent) : aucun HTML de la note n'est interprété. */
import { h } from './util.js';

function inline(s) {
  // **gras** et *italique*, le reste en texte brut
  var out = [];
  var re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  var last = 0;
  var m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(m[1] !== undefined ? h('strong', null, m[1]) : h('em', null, m[2]));
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

// Cellules d'une ligne de tableau ; « \| » est une barre verticale dans le texte, pas un séparateur
function cells(line) {
  var out = [''];
  var body = line.replace(/^\|/, '').replace(/\|$/, '');
  for (var i = 0; i < body.length; i++) {
    if (body[i] === '\\' && body[i + 1] === '|') {
      out[out.length - 1] += '|';
      i += 1;
    } else if (body[i] === '|') out.push('');
    else out[out.length - 1] += body[i];
  }
  return out.map(function (c) {
    return c.trim();
  });
}

/** Corps de la note en éléments de page. */
export function noteNodes(md) {
  var text = String(md)
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/%%[\s\S]*?%%/g, '');
  var lines = text.split('\n');
  var out = [];
  var i = 0;
  while (i < lines.length) {
    var l = lines[i];
    if (!l.trim()) {
      i += 1;
      continue;
    }
    var m = /^(#{1,3}) (.*)$/.exec(l);
    if (m) {
      out.push(h(m[1].length === 1 ? 'h2' : m[1].length === 2 ? 'h3' : 'h4', { class: 'v-h' + m[1].length }, m[2]));
      i += 1;
      continue;
    }
    if (l[0] === '|') {
      var rows = [];
      while (i < lines.length && lines[i][0] === '|') {
        if (!/^\|[-| ]+\|$/.test(lines[i])) rows.push(cells(lines[i]));
        i += 1;
      }
      var head = rows.shift() || [];
      out.push(
        h(
          'div',
          { class: 'v-tw' },
          h(
            'table',
            { class: 'v-table' },
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                head.map(function (c) {
                  return h('th', { scope: 'col' }, c);
                })
              )
            ),
            h(
              'tbody',
              null,
              rows.map(function (r) {
                return h(
                  'tr',
                  null,
                  r.map(function (c) {
                    return h('td', null, c);
                  })
                );
              })
            )
          )
        )
      );
      continue;
    }
    if (l.slice(0, 2) === '> ' || l === '>') {
      var q = [];
      while (i < lines.length && (lines[i].slice(0, 2) === '> ' || lines[i] === '>')) {
        q.push(lines[i].slice(2));
        i += 1;
      }
      out.push(h('blockquote', { class: 'v-q' }, q.join('\n')));
      continue;
    }
    if (l.slice(0, 2) === '- ') {
      var items = [];
      while (i < lines.length && lines[i].slice(0, 2) === '- ') {
        items.push(h('li', null, inline(lines[i].slice(2))));
        i += 1;
      }
      out.push(h('ul', { class: 'v-ul' }, items));
      continue;
    }
    out.push(h('p', { class: 'v-p' }, inline(l)));
    i += 1;
  }
  return out;
}
