// Questionnaire 2.1 dans Chromium : confirmation C1 / F7, obstacles repérés, aide C2 et bandeau F9, durée de vol F12,
// fiches à vérifier, et fiche de référence saisie en 2.0 (vue, modification, export, statistiques).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { toMarkdown } from '../js/markdown.js';
import { DEBIT_GO_PAR_MIN } from '../js/config.js';

var q = JSON.parse(readFileSync(new URL('../questionnaire.json', import.meta.url), 'utf8'));
var F20 = JSON.parse(readFileSync(new URL('../test/fixtures/fiche-2.0.json', import.meta.url), 'utf8'));
var chip = (page, q, v) => page.locator('#q-' + q + ' [data-v="' + v + '"]');
var frontmatter = (md) => parse(/^---\n([\s\S]*?)\n---\n/.exec(md)[1]);
var num = (x) => String(Math.round(x * 10) / 10).replace('.', ',');

async function newFiche(page) {
  await page.goto('/');
  await page.click('#newBtn');
  await expect(page.locator('#q-C1')).toBeVisible();
}
async function phase(page, id) {
  await page.click('.tabs [data-phase="' + id + '"]');
  await expect(page.locator('.tabs [data-phase="' + id + '"]')).toHaveAttribute('aria-current', 'page');
}
async function exportFm(page) {
  await page.locator('a.tab.note').click();
  var ta = page.locator('#exportText');
  await expect(ta).not.toHaveValue('');
  return frontmatter(await ta.inputValue());
}
/** Importe la fiche 2.0 de référence par sa note Obsidian (bloc de reprise : la fiche telle qu'enregistrée). */
async function import20(page) {
  await page.goto('/');
  await page.click('#importBox summary');
  await page.setInputFiles('#importFile', {
    name: 'Debrief_Drone_2026-10-28_2026-188.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(toMarkdown(q, F20), 'utf8')
  });
  await expect(page.locator('.role-pick')).toBeVisible();
  await page.goto('/');
}

test('C1 / F7 : passer C1 à « Non » avec un quasi-incident décrit demande confirmation dans la page', async ({
  page
}) => {
  await newFiche(page);
  await chip(page, 'C1', 'oui').click();
  await chip(page, 'C1', 'obstacle').click();
  await phase(page, 'vol');
  await page.locator('#q-F7 .rep-card textarea').first().fill('Câble frôlé en transit');
  await phase(page, 'chaud');
  var alerte = page.locator('#alerteC1F7');
  await expect(alerte).toBeHidden();
  await chip(page, 'C1', 'non').click();
  await expect(alerte).toBeVisible();
  await expect(alerte).toContainText('1 quasi-incident décrit');
  await expect(page.locator('#c1f7Suppr')).toHaveText('Supprimer le quasi-incident décrit');
  await page.click('#c1f7Garder');
  await expect(chip(page, 'C1', 'oui')).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'C1', 'obstacle')).toHaveAttribute('aria-pressed', 'true');
  await expect(alerte).toBeHidden();

  await chip(page, 'C1', 'non').click();
  await expect(alerte).toBeVisible();
  await page.click('#c1f7Suppr');
  await expect(alerte).toBeHidden();
  await expect(chip(page, 'C1', 'non')).toHaveAttribute('aria-pressed', 'true');
  await phase(page, 'vol');
  await expect(page.locator('#q-F7 .rep-card')).toHaveCount(0);
  var fm = await exportFm(page);
  expect(fm.c1).toBe('non');
  expect(fm.f7_nb).toBe(0);
});

test('obstacles repérés à l’installation : multi-choix, position par obstacle, note', async ({ page }) => {
  await newFiche(page);
  await phase(page, 'mise-en-place');
  var obs = page.locator('#q-F6 [data-key="f6_obstacles_reperes"]');
  await expect(obs).toContainText("Obstacles repérés à l'installation");
  await obs.locator('[data-v="ligne-electrique"]').click();
  await obs.locator('[data-v="paroi"]').click();
  var pos = page.locator('#q-F6 [data-key="f6_obstacles_trajectoire"]');
  await expect(pos.locator('.po-row')).toHaveCount(2);
  await pos.locator('[data-opt="ligne-electrique"] [data-v="hors-trajectoire"]').click();
  await pos.locator('[data-opt="paroi"] [data-v="sur-trajectoire"]').click();
  var fm = await exportFm(page);
  expect(fm.f6_obstacles_reperes).toEqual(['ligne-electrique', 'paroi']);
  expect(fm.f6_obstacles_trajectoire).toEqual({ 'ligne-electrique': 'hors-trajectoire', paroi: 'sur-trajectoire' });
  expect(fm.f7_nb).toBe(0);
  await expect(page.locator('#exportText')).toHaveValue(/- Obstacle Ligne électrique : Hors trajectoire/);
});

test('C2 « Sans apport » : aide affichée ; F9 avec des effets : bandeau et lien vers C2', async ({ page }) => {
  await newFiche(page);
  await expect(page.locator('#q-C2 [data-aide="sans-apport"]')).toContainText(
    'Une recherche négative qui écarte une zone est une levée de doute.'
  );
  await chip(page, 'C2', 'sans-apport').click();
  await phase(page, 'vol');
  var alerte = page.locator('#alerteC2F9');
  await expect(alerte).toBeHidden();
  await chip(page, 'F9', 'zone-ecartee').click();
  await expect(alerte).toBeVisible();
  await page.click('#revoirC2');
  await expect(page).toHaveURL(/\/chaud$/);
  await expect(page.locator('#q-C2')).toBeInViewport();
  await expect(page.locator('#q-C2 .q-t')).toBeFocused();
  await chip(page, 'C2', 'levee-doute').click();
  await phase(page, 'vol');
  await expect(page.locator('#alerteC2F9')).toBeHidden();
  await expect(chip(page, 'F9', 'zone-ecartee')).toHaveAttribute('aria-pressed', 'true');
});

test('F12 : durée de vol par pas de 5 min et volume estimé affiché dessous', async ({ page }) => {
  await newFiche(page);
  await phase(page, 'derushage');
  var f12 = page.locator('#q-F12');
  await expect(f12).toContainText('Durée totale de vol, approximative');
  await expect(f12.locator('.ancien-val')).toBeHidden();
  await expect(f12.locator('.f-est')).toBeHidden();
  var plus = f12.locator('.ct-btn[aria-label="Plus"]');
  await plus.click();
  await plus.click();
  await plus.click();
  await expect(f12.locator('.ct-val')).toHaveText('15 min');
  await expect(f12.locator('.f-est')).toContainText('Volume estimé : ' + num(15 * DEBIT_GO_PAR_MIN) + ' Go');
  await f12.locator('.ct-btn[aria-label="Moins"]').click();
  await expect(f12.locator('.ct-val')).toHaveText('10 min');
  var fm = await exportFm(page);
  expect(fm.f12_duree_min).toBe(10);
  expect(fm.f12_volume).toBeNull();
  expect(fm.f12_volume_estime).toBe(Math.round(10 * DEBIT_GO_PAR_MIN * 10) / 10);
});

test('fiche 2.0 de référence : vue, modification, export et statistiques', async ({ page }) => {
  await import20(page);
  var card = page.locator('#ficheList li').first();
  await expect(card).toContainText('Quasi-incident');

  // Vue
  await card.locator('[data-act="voir"]').click();
  await expect(page.locator('#viewNote')).toContainText('Volume saisi : 64 Go (ancienne version)');
  await expect(page.locator('#viewNote')).toContainText('questionnaire v2.0');

  // Ouverture en pilote : rien n'est modifié tant qu'on ne touche à rien
  await page.click('#editBtn');
  await page.click('[data-role="pilote"]');
  await phase(page, 'derushage');
  await expect(page.locator('#q-F12 .ancien-val')).toHaveText('Volume saisi : 64 Go (ancienne version)');
  await expect(page.locator('#q-F12 .counter')).toBeHidden();
  await phase(page, 'chaud');
  await expect(page.locator('#alerteC1F7')).toBeVisible();
  await expect(chip(page, 'C1', 'non')).toHaveAttribute('aria-pressed', 'true');
  var fm = await exportFm(page);
  expect(fm.questionnaire_version).toBe('2.0');
  expect(fm.f12_volume).toBe(64);
  expect(fm.f7_nb).toBe(1);
  expect(fm.statut).toBe('termine');

  // Statistiques : quasi-incident compté, volume saisi, fiche à vérifier
  await page.goto('/#/stats');
  await expect(page.locator('[data-kpi="quasi"] .kpi-v')).toHaveText('100 %');
  var inco = page.locator('#aVerifier [data-verif="incoherences"] li');
  await expect(inco).toHaveCount(1);
  await expect(inco.locator('[data-raison="c1-f7"]')).toBeVisible();
  await expect(inco.locator('[data-raison="c2-f9"]')).toBeVisible();
  await expect(page.locator('#aVerifier [data-verif="non-termines"]')).toHaveCount(0);
  await page.click('#statsBody [data-phase="derushage"] summary');
  await expect(page.locator('#statsBody [data-q="F12"]')).toContainText('Moyenne 64 Go');

  // Modification : version 2.1, ancien volume gardé
  await inco.locator('a').click();
  await expect(page).toHaveURL(/\/voir$/);
  await page.click('#editBtn');
  await page.click('[data-role="pilote"]');
  await phase(page, 'mise-en-place');
  await page.locator('#q-F6 [data-key="f6_obstacles_reperes"] [data-v="ligne-electrique"]').click();
  fm = await exportFm(page);
  expect(fm.questionnaire_version).toBe('2.1');
  expect(fm.f12_volume).toBe(64);
  expect(fm.f6_obstacles).toBe('pas-bien');
  expect(fm.f6_obstacles_reperes).toEqual(['ligne-electrique']);
  expect(fm.f7_nb).toBe(1);
});

test('statistiques : debriefs non terminés dans « Fiches à vérifier », avec un lien vers la fiche', async ({
  page
}) => {
  await newFiche(page);
  await page.fill('[data-key="animaux"] input', 'Pistache');
  await chip(page, 'C1', 'non').click();
  await page.click('#finishHot');
  await page.click('#statsBtn');
  var li = page.locator('#aVerifier [data-verif="non-termines"] li');
  await expect(li).toHaveCount(1);
  await expect(li).toContainText('Pistache');
  await expect(li).toContainText('À chaud fait');
  await expect(page.locator('#aVerifier [data-verif="incoherences"]')).toHaveCount(0);
  await li.locator('a').click();
  await expect(page.locator('#viewNote')).toContainText('Pistache');
});
