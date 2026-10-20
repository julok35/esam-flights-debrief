// Critères d'acceptation du cahier des charges (section 11), dans Chromium au format smartphone.
import { test, expect } from '@playwright/test';
import { parse } from 'yaml';

var chip = (page, q, v) => page.locator('#q-' + q + ' [data-v="' + v + '"]');

async function newFiche(page) {
  await page.goto('/');
  await page.click('#newBtn');
  await expect(page.locator('#q-C1')).toBeVisible();
}

/** Ouvre une fiche existante depuis l'accueil avec le rôle donné. */
async function openAs(page, role) {
  await page.goto('/');
  await page.locator('#ficheList .btn', { hasText: 'Ouvrir' }).first().click();
  await page.click('[data-role="' + role + '"]');
}

async function exportText(page) {
  await page.locator('a.tab.note').click();
  var ta = page.locator('#exportText');
  await expect(ta).not.toHaveValue('');
  return ta.inputValue();
}

function frontmatter(md) {
  return parse(/^---\n([\s\S]*?)\n---\n/.exec(md)[1]);
}

test('1. debrief à chaud complet (C1 à C5) en 15 touches au plus, avec un quasi-incident', async ({ page }) => {
  var taps = 0;
  var tap = async (loc) => {
    taps += 1;
    await loc.click();
  };
  await page.goto('/');
  await tap(page.locator('#newBtn'));
  await tap(chip(page, 'C1', 'oui'));
  await tap(chip(page, 'C1', 'perte-liaison'));
  await tap(chip(page, 'C2', 'localisation-animal'));
  await tap(chip(page, 'C3', 'collier-gps'));
  await tap(page.locator('#q-C3 [data-key="c3_ecart_h"] [data-v="30-100m"]'));
  await tap(page.locator('#q-C3 [data-key="c3_ecart_v"] [data-v="moins-10m"]'));
  await tap(chip(page, 'C4', 'portee-liaison'));
  taps += 1; // un toucher sur le curseur
  await page.locator('#q-C5 input[type="range"]').fill('60');
  await tap(page.locator('#q-C5 .ct-btn[aria-label="Plus"]'));
  await tap(page.locator('#q-C5 .ct-btn[aria-label="Plus"]'));
  await tap(page.locator('#finishHot'));
  expect(taps).toBeLessThanOrEqual(15);

  await expect(page.locator('#ficheList .badge')).toHaveText('À chaud fait');
  await openAs(page, 'pilote');
  var fm = frontmatter(await exportText(page));
  expect(fm).toMatchObject({
    c1: 'oui',
    c1_categories: ['perte-liaison'],
    c2: ['localisation-animal'],
    c3_source: 'collier-gps',
    c3_ecart_h: '30-100m',
    c3_ecart_v: 'moins-10m',
    c4: ['portee-liaison'],
    c5_power2000: 60,
    c5_tb30: 2,
    statut: 'chaud-fait'
  });
});

test('2. « non engagé » masque C3 à C5 et réduit le debrief à froid à NE1 et F14', async ({ page }) => {
  await newFiche(page);
  await chip(page, 'C2', 'non-engage').click();
  for (var id of ['C3', 'C4', 'C5']) await expect(page.locator('#q-' + id)).toBeHidden();
  await expect(page.locator('#q-C1')).toBeVisible();
  var tabs = page.locator('.tabs .tab[data-phase]');
  await expect(tabs).toHaveCount(3);
  for (var ph of ['chaud', 'non-engage', 'analyse'])
    await expect(page.locator('.tabs [data-phase="' + ph + '"]')).toHaveCount(1);
  await page.click('[data-phase="non-engage"]');
  await expect(page.locator('section.q[data-q]:visible')).toHaveCount(1);
  await expect(page.locator('#q-NE1')).toBeVisible();
  await page.click('[data-phase="analyse"]');
  await expect(page.locator('#q-F14')).toBeVisible();
  await expect(page.locator('#q-F13')).toBeHidden();
  await expect(page.locator('section.q[data-q]:visible')).toHaveCount(1);
  // Retour au parcours complet
  await page.click('[data-phase="chaud"]');
  await chip(page, 'C2', 'non-engage').click();
  await expect(page.locator('#q-C3')).toBeVisible();
  await expect(page.locator('.tabs .tab[data-phase]')).toHaveCount(7);
});

test('3. une option exclusive désélectionne les autres, et inversement', async ({ page }) => {
  await newFiche(page);
  await chip(page, 'C2', 'levee-doute').click();
  await chip(page, 'C2', 'voie-acces').click();
  await expect(chip(page, 'C2', 'voie-acces')).toHaveAttribute('aria-pressed', 'true');
  await chip(page, 'C2', 'sans-apport').click();
  await expect(page.locator('#q-C2 [aria-pressed="true"]')).toHaveCount(1);
  await expect(chip(page, 'C2', 'sans-apport')).toHaveAttribute('aria-pressed', 'true');
  await chip(page, 'C2', 'guidage-equipe').click();
  await expect(chip(page, 'C2', 'sans-apport')).toHaveAttribute('aria-pressed', 'false');
  await expect(chip(page, 'C2', 'guidage-equipe')).toHaveAttribute('aria-pressed', 'true');
  // Choix unique : toucher l'option choisie la désélectionne
  await chip(page, 'C1', 'non').click();
  await chip(page, 'C1', 'non').click();
  await expect(chip(page, 'C1', 'non')).toHaveAttribute('aria-pressed', 'false');
});

test('4. C4 refuse un troisième choix', async ({ page }) => {
  await newFiche(page);
  await chip(page, 'C4', 'autonomie-energie').click();
  await chip(page, 'C4', 'capteur').click();
  await chip(page, 'C4', 'ecran-deporte').click();
  await expect(page.locator('#q-C4 [aria-pressed="true"]')).toHaveCount(2);
  await expect(chip(page, 'C4', 'ecran-deporte')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#toast')).toContainText('2 choix au maximum');
});

test('5. une catégorie cochée en C1 ouvre une fiche F7 ; « ajouter » en crée une vide', async ({ page }) => {
  await newFiche(page);
  await chip(page, 'C1', 'oui').click();
  await chip(page, 'C1', 'obstacle').click();
  await chip(page, 'C1', 'energie').click();
  await page.click('[data-phase="vol"]');
  var cards = page.locator('[data-q="F7"] .rep-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).locator('[data-key="categorie"] [aria-pressed="true"]')).toHaveText(/Obstacle/);
  await expect(cards.nth(1).locator('[data-key="categorie"] [aria-pressed="true"]')).toHaveText(/Énergie/);
  await page.getByRole('button', { name: '+ Ajouter un quasi-incident' }).click();
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(2).locator('[aria-pressed="true"]')).toHaveCount(0);
  await expect(cards.nth(2).locator('textarea')).toHaveValue('');
});

test('6. grilles F6 et F8 : valeurs par défaut et préremplissage depuis C4', async ({ page }) => {
  await newFiche(page);
  await chip(page, 'C4', 'autonomie-energie').click();
  await chip(page, 'C4', 'capteur').click();
  await page.click('[data-phase="mise-en-place"]');
  var f6 = page.locator('[data-q="F6"] .g-row');
  await expect(f6).toHaveCount(10);
  for (var i = 0; i < 10; i++)
    await expect(f6.nth(i).locator('[aria-pressed="true"]')).toHaveAttribute('data-v', 'neutre');
  await page.click('[data-phase="vol"]');
  var val = (row) => page.locator('[data-q="F8"] [data-row="' + row + '"] [aria-pressed="true"]');
  var expected = {
    infrarouge: 'non-utilise',
    zoom: 'non-utilise',
    telemetre: 'non-utilise',
    liaison: 'neutre',
    etancheite: 'neutre',
    'hot-swap': 'neutre',
    'ecran-rc': 'neutre',
    autonomie: 'pas-bien'
  };
  for (var r in expected) await expect(val(r)).toHaveAttribute('data-v', expected[r]);
  for (var hl of ['infrarouge', 'zoom', 'telemetre'])
    await expect(page.locator('[data-q="F8"] [data-row="' + hl + '"]')).toHaveClass(/hl/);
  await expect(page.locator('[data-q="F8"] [data-row="liaison"]')).not.toHaveClass(/hl/);
  // « pas bien » ouvre le champ d'observation de la ligne
  await expect(page.locator('[data-q="F8"] [data-row="autonomie"] .g-obs')).toBeVisible();
  await expect(page.locator('[data-q="F8"] [data-row="zoom"] .g-obs')).toBeHidden();
  // « portée et liaison » met Liaison à « pas bien »
  await page.click('[data-phase="chaud"]');
  await chip(page, 'C4', 'capteur').click();
  await chip(page, 'C4', 'portee-liaison').click();
  await page.click('[data-phase="vol"]');
  await expect(val('liaison')).toHaveAttribute('data-v', 'pas-bien');
});

test('7. hors pilote, réponses du pilote en lecture seule, remarques modifiables', async ({ page }) => {
  await newFiche(page);
  await chip(page, 'C1', 'non').click();
  await page.click('#finishHot');
  await openAs(page, 'copilote');
  await expect(page.locator('#roNote')).toBeVisible();
  var f1 = page.locator('#q-F1 [data-v="tout-pret"]');
  await expect(f1).toBeDisabled();
  await expect(page.locator('#q-F1 textarea')).toBeDisabled();
  await page.getByRole('button', { name: '+ Ajouter une remarque' }).click();
  var rem = page.locator('.rem-card textarea');
  await expect(rem).toBeEditable();
  await rem.fill('Batteries à recharger la veille');
  await expect(page.locator('.rem-card [data-v="copilote"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('[data-phase="chaud"]');
  await expect(chip(page, 'C1', 'non')).toBeDisabled();
  await expect(chip(page, 'C1', 'non')).toHaveAttribute('aria-pressed', 'true');
  var md = await exportText(page);
  expect(md).toContain('**Copilote** :\n\n> Batteries à recharger la veille');
  // Revenu pilote : modifiable
  await page.click('#roleBtn');
  await page.click('[data-role="pilote"]');
  await expect(page.locator('#roNote')).toBeHidden();
  await expect(page.locator('#q-F1 [data-v="tout-pret"]')).toBeEnabled();
});

test("8. export puis réimport sur un navigateur vierge : fiche restituée à l'identique", async ({ page, browser }) => {
  await newFiche(page);
  await page.fill('[data-key="patrouille"] input', '2026-145');
  await chip(page, 'C1', 'oui').click();
  await chip(page, 'C1', 'relief').click();
  await chip(page, 'C2', 'levee-doute').click();
  await page.click('[data-phase="vol"]');
  await page.locator('[data-q="F7"] .rep-card textarea').first().fill('Paroi plus proche que prévu\nÉvitement manuel');
  await page.locator('[data-q="F8"] [data-row="zoom"] [data-v="bien"]').click();
  await page.click('[data-phase="analyse"]');
  await chip(page, 'F14', 'vol-nuit').click();
  await page.locator('[data-q="F14"] [data-opt="vol-nuit"] [data-v="oui"]').click();
  var md = await exportText(page);

  var ctx2 = await browser.newContext({ locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  var p2 = await ctx2.newPage();
  await p2.goto('/');
  await expect(p2.locator('#ficheList')).toHaveCount(0);
  await p2.click('#importBox summary');
  await p2.fill('#importText', md);
  await p2.click('#importBtn');
  await p2.click('[data-role="copilote"]');
  expect(await exportText(p2)).toBe(md);
  var state = await p2.evaluate(
    () =>
      new Promise((res) => {
        var r = indexedDB.open('esam-debrief', 1);
        r.onsuccess = () => {
          var g = r.result.transaction('fiches').objectStore('fiches').getAll();
          g.onsuccess = () => res(g.result);
        };
      })
  );
  expect(state).toHaveLength(1);
  expect(state[0].answers.f7[0].faits).toBe('Paroi plus proche que prévu\nÉvitement manuel');

  // Même note réimportée : choix entre remplacer et ignorer
  await p2.goto('/');
  await p2.click('#importBox summary');
  await p2.fill('#importText', md);
  await p2.click('#importBtn');
  await expect(p2.locator('#importMsg')).toContainText('existe déjà');
  await p2.click('#importIgnore');
  await expect(p2.locator('#importMsg')).toContainText('Import ignoré');
  await ctx2.close();
});

test('9. frontmatter exporté : YAML valide avec les champs prévus', async ({ page }) => {
  await newFiche(page);
  await chip(page, 'C1', 'non').click();
  var md = await exportText(page);
  var fm = frontmatter(md);
  expect(fm.type).toBe('debrief-vol-drone');
  expect(fm.questionnaire_version).toBe('2.0');
  expect(fm.tags).toEqual(['esam/debrief-drone']);
  for (var k of ['debrief_id', 'statut', 'date_maj', 'app_version', 'c1', 'c2', 'f6_abri', 'f8_autonomie', 'f14_issue'])
    expect(fm).toHaveProperty(k);
  expect(md).toContain('\n## Données Airdata\n');
  expect(md).toMatch(/%%\nesam-debrief-data:v1\n[A-Za-z0-9+/=]+\n%%\n$/);
  expect(await page.locator('.file').textContent()).toMatch(/^Debrief_Drone_\d{4}-\d{2}-\d{2}_sans-numero\.md$/);
});

test("10. hors ligne après une première visite : l'appli s'ouvre, enregistre et exporte", async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => caches.keys())).toContain('esam-debrief-v1.2.0');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#net')).toBeVisible();
  await page.click('#newBtn');
  await chip(page, 'C1', 'non').click();
  await expect(page.locator('#saved')).toContainText('Enregistré à');
  await page.click('#finishHot');
  await expect(page.locator('#ficheList .card')).toHaveCount(1);
  await openAs(page, 'pilote');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  var md = await exportText(page);
  expect(md).toContain('c1: non');
  await page.click('#copyBtn');
  await expect(page.locator('#exportMsg')).toContainText(/Copié|copie-le à la main/);
});

test("titre combiné affiché dans la fiche, l'accueil et la note", async ({ page }) => {
  await newFiche(page);
  await page.fill('[data-key="animaux"] input', 'Rex, Max');
  await page.fill('[data-key="espece"] input', 'Chien');
  await page.fill('[data-key="lieu"] input', 'Lac Blanc');
  var t = /^\d{2}\/\d{2}\/\d{4} - Rex, Max - Chien - Lac Blanc$/;
  await expect(page.locator('#ficheTitre')).toHaveText(t);
  await expect(page.locator('.fbar-t strong')).toHaveText(t);
  var md = await exportText(page);
  expect(frontmatter(md).titre).toMatch(t);
  expect(md).toMatch(/\n# \d{2}\/\d{2}\/\d{4} - Rex, Max - Chien - Lac Blanc\n/);
  await page.click('#homeBtn');
  await expect(page.locator('#ficheList .card-t')).toHaveText(t);
});

test('espèce préremplie avec chien, lieu prérempli avec la position du téléphone', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 45.123456, longitude: 5.876543 });
  await newFiche(page);
  await expect(page.locator('[data-key="espece"] input')).toHaveValue('Chien');
  await expect(page.locator('[data-key="lieu"] input')).toHaveValue('45.12346, 5.87654');
  await expect(page.locator('#ficheTitre')).toHaveText(/ - Chien - 45\.12346, 5\.87654$/);
  // Champs libres : modifiables, et le bouton reprend la position à la demande
  await page.fill('[data-key="espece"] input', 'Chat');
  await page.fill('[data-key="lieu"] input', 'Lac Blanc');
  await expect(page.locator('#ficheTitre')).toHaveText(/ - Chat - Lac Blanc$/);
  await context.setGeolocation({ latitude: 45.2, longitude: 5.9 });
  await page.click('[data-geo="lieu"]');
  await expect(page.locator('[data-key="lieu"] input')).toHaveValue('45.20000, 5.90000');
});

test('sans autorisation de position, le lieu reste vide et la fiche fonctionne', async ({ page }) => {
  await newFiche(page);
  await page.click('[data-geo="lieu"]');
  await expect(page.locator('#toast')).toContainText('Position');
  await expect(page.locator('[data-key="lieu"] input')).toHaveValue('');
});

test('11. aucun tiret cadratin ni demi-cadratin dans une note exportée', async ({ page }) => {
  await newFiche(page);
  await page.fill('[data-key="patrouille"] input', 'A\u2014B');
  await chip(page, 'C1', 'non').click();
  await page.fill('[data-key="c4_commentaire"] textarea', 'trop lourd \u2013 vraiment \u2014 sous la pluie');
  var md = await exportText(page);
  expect(md).not.toMatch(/[\u2013\u2014]/);
  expect(md).toContain('trop lourd - vraiment - sous la pluie');
});

test('suppression avec confirmation dans la page, enregistrement après rechargement', async ({ page }) => {
  await newFiche(page);
  await page.fill('[data-key="c4_commentaire"] textarea', 'Saisie en cours');
  await expect(page.locator('#saved')).toContainText('Enregistré à');
  await page.reload();
  await expect(page.locator('[data-key="c4_commentaire"] textarea')).toHaveValue('Saisie en cours');
  await page.goto('/');
  await expect(page.locator('#ficheList .card')).toHaveCount(1);
  var dialogs = 0;
  page.on('dialog', () => (dialogs += 1));
  await page.locator('#ficheList').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.locator('#ficheList .card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Confirmer la suppression' }).click();
  await expect(page.locator('#ficheList')).toHaveCount(0);
  expect(dialogs).toBe(0);
});
