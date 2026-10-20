/* Position du téléphone pour préremplir le lieu : GPS de l'appareil uniquement, sans service de cartographie
 * (fonctionne hors réseau, rien n'est envoyé). Coordonnées en degrés décimaux WGS84, comme GPS ESAM. */

export function formatPosition(lat, lon) {
  return lat.toFixed(5) + ', ' + lon.toFixed(5);
}

/** Résout « 45.12345, 5.87654 », ou rejette avec un message en français. fresh : pas de position gardée en cache. */
export function currentPosition(fresh) {
  return new Promise(function (res, rej) {
    if (!navigator.geolocation) return rej(new Error('Position indisponible sur cet appareil.'));
    navigator.geolocation.getCurrentPosition(
      function (p) {
        res(formatPosition(p.coords.latitude, p.coords.longitude));
      },
      function (e) {
        rej(
          new Error(
            e && e.code === 1
              ? "Position refusée : autorise la localisation pour l'appli dans les réglages du navigateur."
              : 'Position introuvable pour le moment : réessaie à découvert.'
          )
        );
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: fresh ? 0 : 120000 }
    );
  });
}
