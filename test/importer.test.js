// Import de notes : bloc de reprise, reconstruction depuis le frontmatter, décision en import groupé.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMarkdown, frontmatter } from '../js/markdown.js';
import { readNote, parseFrontmatter, decision } from '../js/importer.js';
import { parse } from 'yaml';
import { loadQ, sampleFiche } from './helpers.js';

var q = loadQ();

test('note complète : fiche restituée à l’identique', () => {
  var f = sampleFiche(q);
  var r = readNote(q, toMarkdown(q, f));
  assert.equal(r.partiel, false);
  assert.deepEqual(r.fiche, JSON.parse(JSON.stringify(f)));
});

test('frontmatter relu comme le ferait une bibliothèque YAML', () => {
  var md = toMarkdown(q, sampleFiche(q));
  var ref = parse(/^---\n([\s\S]*?)\n---\n/.exec(md)[1]);
  var got = parseFrontmatter(md);
  // Dates : chaînes ici, objets Date pour certaines bibliothèques ; le reste est identique
  delete ref.date;
  delete ref.date_maj;
  delete got.date;
  delete got.date_maj;
  assert.deepEqual(got, ref);
});

test('note sans bloc de reprise : réponses fermées reconstruites, même frontmatter réexporté', () => {
  var f = sampleFiche(q);
  var md = toMarkdown(q, f).replace(/%%[\s\S]*%%\n$/, '');
  var r = readNote(q, md);
  assert.equal(r.partiel, true);
  assert.equal(r.fiche.debrief_id, f.debrief_id);
  assert.equal(r.fiche.answers.f7.length, 1);
  var a = frontmatter(q, f);
  var b = frontmatter(q, r.fiche);
  assert.deepEqual(b, a);
  // Plus ancienne que la fiche complète du même jour
  assert.equal(decision(f, r.fiche), 'ignoree');
});

test('note étrangère refusée ; décision de l’import groupé', () => {
  assert.ok(readNote(q, '# Courses\n- pain').erreur);
  assert.ok(readNote(q, '---\ntype: recette\ndebrief_id: x\n---\n').erreur);
  var old = { maj: '2026-01-01T00:00:00.000Z' };
  var neu = { maj: '2026-02-01T00:00:00.000Z' };
  assert.equal(decision(null, neu), 'nouvelle');
  assert.equal(decision(old, neu), 'maj');
  assert.equal(decision(neu, old), 'ignoree');
  assert.equal(decision(neu, neu), 'ignoree');
});
