/* Plan de synchronisation (sans DOM ni réseau, testé sous Node). La fiche modifiée en dernier (champ maj) l'emporte,
 * sur l'appareil comme en ligne. Une suppression est gardée comme « pierre tombale » (date de suppression) jusqu'à ce
 * qu'elle soit transmise ; une fiche modifiée après sa suppression sur un autre appareil est conservée. */

function later(a, b) {
  return String(a || '') > String(b || '');
}

/**
 * local : fiches de l'appareil ; tombes : { debrief_id: date de suppression } ; distant : [{ debrief_id, maj, supprime }].
 * Résultat : envoyer (fiches), supprimerEnLigne ([{ debrief_id, maj }]), recuperer (identifiants), supprimerIci
 * (identifiants), oublierTombes (identifiants).
 */
export function planSync(local, tombes, distant) {
  var L = {};
  local.forEach(function (f) {
    L[f.debrief_id] = f;
  });
  var T = tombes || {};
  var R = {};
  distant.forEach(function (r) {
    R[r.debrief_id] = r;
  });
  var p = { envoyer: [], supprimerEnLigne: [], recuperer: [], supprimerIci: [], oublierTombes: [] };
  var ids = {};
  Object.keys(L)
    .concat(Object.keys(T), Object.keys(R))
    .forEach(function (id) {
      ids[id] = true;
    });
  Object.keys(ids).forEach(function (id) {
    var l = L[id],
      t = T[id],
      r = R[id];
    if (l && t) t = undefined; // fiche réimportée ou recréée après suppression : la fiche compte
    if (l && T[id]) p.oublierTombes.push(id);
    if (!r) {
      if (l) p.envoyer.push(l);
      else if (t) p.oublierTombes.push(id);
      return;
    }
    if (!r.supprime) {
      if (l) {
        if (later(l.maj, r.maj)) p.envoyer.push(l);
        else if (later(r.maj, l.maj)) p.recuperer.push(id);
      } else if (t) {
        if (later(r.maj, t)) {
          p.recuperer.push(id);
          p.oublierTombes.push(id);
        } else p.supprimerEnLigne.push({ debrief_id: id, maj: t });
      } else p.recuperer.push(id);
      return;
    }
    // Supprimée en ligne
    if (l) {
      if (later(l.maj, r.maj)) p.envoyer.push(l);
      else p.supprimerIci.push(id);
    } else if (t) p.oublierTombes.push(id);
  });
  return p;
}
