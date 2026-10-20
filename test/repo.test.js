// Cohérence du dépôt : version, cache hors ligne, règle typographique (section 0 et critère 11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

var root = fileURLToPath(new URL('..', import.meta.url));
var read = (p) => readFileSync(join(root, p), 'utf8');

test("version de l'appli = cache du service worker = package.json", () => {
  var v = read('js/version.js').match(/export var APP_VERSION = '([^']+)'/)[1];
  assert.match(v, /^\d+\.\d+\.\d+$/);
  assert.ok(read('sw.js').includes("var V = 'esam-debrief-v" + v + "'"));
  assert.equal(JSON.parse(read('package.json')).version, v);
  assert.ok(read('CHANGELOG.md').includes('## ' + v), 'CHANGELOG à jour');
});

test("chaque fichier de l'appli est dans le cache hors ligne", () => {
  var sw = read('sw.js');
  var files = readdirSync(join(root, 'js'))
    .map((f) => 'js/' + f)
    .concat(readdirSync(join(root, 'vendor/fonts')).map((f) => 'vendor/fonts/' + f));
  files.push('index.html', 'app.css', 'questionnaire.json', 'manifest.webmanifest', 'logo.png');
  for (var f of files) assert.ok(sw.includes("'" + f + "'"), f);
});

test("aucune ressource chargée hors de l'appli (pas de CDN)", () => {
  for (var f of [
    'index.html',
    'app.css',
    'vendor/fonts/fonts.css',
    ...readdirSync(join(root, 'js')).map((x) => 'js/' + x)
  ])
    assert.doesNotMatch(read(f), /(src|href)=["']https?:|url\(["']?https?:|import .* from ["']https?:/, f);
});

var TEXT = new Set(['.js', '.json', '.md', '.html', '.css', '.yml', '.yaml', '.webmanifest', '.txt', '']);
function walk(dir, out) {
  for (var name of readdirSync(dir)) {
    if (['node_modules', '.git', 'test-results', 'playwright-report'].includes(name)) continue;
    var p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (TEXT.has(extname(name))) out.push(p);
  }
  return out;
}

test('aucun tiret cadratin (U+2014) ni demi-cadratin (U+2013) dans le dépôt', () => {
  var bad = [];
  for (var p of walk(root, [])) {
    if (/[\u2013\u2014]/.test(p.slice(root.length))) bad.push(p + ' (nom)');
    read(p.slice(root.length))
      .split('\n')
      .forEach((l, i) => {
        if (/[\u2013\u2014]/.test(l)) bad.push(p.slice(root.length) + ':' + (i + 1));
      });
  }
  assert.deepEqual(bad, []);
});
