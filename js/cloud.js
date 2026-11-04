/* Synchronisation en ligne avec Supabase, facultative : rien ne part tant que l'utilisateur ne s'est pas connecté.
 * Connexion sans mot de passe : code à 6 chiffres reçu par e-mail (ou lien du même e-mail). Appels directs aux API
 * REST de Supabase (Auth et PostgREST) avec fetch : aucune bibliothèque chargée. Les fiches restent d'abord sur
 * l'appareil ; la synchronisation recopie dans les deux sens, la plus récente l'emporte (sync.js). */
import * as store from './store.js';
import { planSync } from './sync.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

var CONF = 'esam-debrief-cloud';
var SESSION = 'esam-debrief-session';
var LAST = 'esam-debrief-derniere-synchro';
var TABLE = 'fiches';

function lsGet(k) {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch (e) {
    return null;
  }
}
function lsSet(k, v) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {}
}

/* ---------- Configuration ---------- */

/** { url, key } : réglage de l'appareil, sinon js/config.js. */
export function config() {
  var c = lsGet(CONF) || {};
  return {
    url: String(c.url || SUPABASE_URL || '').replace(/\/+$/, ''),
    key: String(c.key || SUPABASE_KEY || ''),
    local: !!(c.url || c.key)
  };
}
export function configured() {
  var c = config();
  return !!(c.url && c.key);
}
/** Adresse attendue : https://<projet>.supabase.co (autorisée par la politique de sécurité de la page). */
export function validUrl(u) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(String(u || '').replace(/\/+$/, ''));
}
export function setConfig(url, key) {
  if (!url && !key) lsSet(CONF, null);
  else lsSet(CONF, { url: String(url).trim().replace(/\/+$/, ''), key: String(key).trim() });
}

/* ---------- Session ---------- */

export function session() {
  return lsGet(SESSION);
}
export function signedIn() {
  var s = session();
  return !!(s && s.refresh_token);
}
function saveSession(d, email) {
  var s = {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (Number(d.expires_in) || 3600),
    email: (d.user && d.user.email) || email || (session() || {}).email || ''
  };
  lsSet(SESSION, s);
  return s;
}

export class CloudError extends Error {
  constructor(msg, code) {
    super(msg);
    this.code = code;
  }
}

function errMsg(status, body, path) {
  var b = body || {};
  var raw = b.msg || b.message || b.error_description || b.error || '';
  var p = path || '';
  if (status === 0) return 'Pas de réseau : la synchronisation reprendra plus tard.';
  if (/^\/auth\/v1\/verify/.test(p) && (status === 400 || status === 403 || /expired|invalid/i.test(raw)))
    return 'Code incorrect ou expiré : demandes-en un nouveau.';
  if (status === 429 && (b.error_code === 'over_email_send_rate_limit' || /email rate limit/i.test(raw)))
    return "Limite d'envoi d'e-mails atteinte : sans serveur d'envoi personnel, Supabase n'envoie que 2 e-mails par heure pour tout le projet. Réessaie dans une heure, ou configure un serveur d'envoi (docs/SUPABASE.md).";
  if (status === 429) return 'Trop de demandes : attends quelques minutes avant de réessayer.';
  if (/^\/rest\//.test(p) && (b.code === '42501' || status === 403))
    return "Accès refusé : ton adresse n'est pas encore dans la liste des membres (table membres, voir docs/SUPABASE.md).";
  if (b.code === '42P01' || /relation .* does not exist|schema cache/i.test(raw))
    return 'La table des fiches est absente : exécute le script SQL de docs/SUPABASE.md.';
  return 'Erreur du serveur (' + status + ')' + (raw ? ' : ' + raw : '');
}

function call(path, opts) {
  var c = config();
  if (!c.url || !c.key) return Promise.reject(new CloudError('Synchronisation non configurée.', 'config'));
  var o = opts || {};
  var headers = Object.assign({ apikey: c.key, 'Content-Type': 'application/json' }, o.headers || {});
  if (o.token) headers.Authorization = 'Bearer ' + o.token;
  return fetch(c.url + path, {
    method: o.method || 'GET',
    headers: headers,
    body: o.body === undefined ? undefined : JSON.stringify(o.body)
  }).then(
    function (r) {
      return r.text().then(function (t) {
        var body;
        try {
          body = t ? JSON.parse(t) : null;
        } catch (e) {
          body = { message: t };
        }
        if (!r.ok) throw new CloudError(errMsg(r.status, body, path), r.status);
        return body;
      });
    },
    function () {
      throw new CloudError(errMsg(0), 'reseau');
    }
  );
}

/** Envoie le code de connexion (et le lien) à l'adresse ; crée le compte à la première connexion. */
export function sendCode(email) {
  var redirect = location.origin + location.pathname;
  return call('/auth/v1/otp?redirect_to=' + encodeURIComponent(redirect), {
    method: 'POST',
    body: { email: email, create_user: true }
  });
}

export function verifyCode(email, code) {
  return call('/auth/v1/verify', {
    method: 'POST',
    body: { type: 'email', email: email, token: String(code).replace(/\s+/g, '') }
  }).then(function (d) {
    return saveSession(d, email);
  });
}

/**
 * Retour du lien de l'e-mail : #access_token=...&refresh_token=... dans l'adresse. Enregistre la session et renvoie
 * true ; renvoie un message si le lien est expiré ; null si l'adresse n'est pas un retour de connexion.
 */
export function takeLinkSession(hash) {
  var h = String(hash || '').replace(/^#/, '');
  if (!/(^|&)(access_token|error)=/.test(h)) return null;
  var p = new URLSearchParams(h);
  if (p.get('error'))
    return (
      'Lien de connexion refusé' +
      (p.get('error_code') === 'otp_expired' ? ' : il a expiré, demande un nouveau code.' : '.')
    );
  saveSession({
    access_token: p.get('access_token'),
    refresh_token: p.get('refresh_token'),
    expires_at: Number(p.get('expires_at')) || undefined,
    expires_in: p.get('expires_in')
  });
  return true;
}

var refreshing = null;
function refresh() {
  if (refreshing) return refreshing;
  var s = session();
  if (!s) return Promise.reject(new CloudError('Non connecté.', 'session'));
  refreshing = call('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: s.refresh_token }
  })
    .then(
      function (d) {
        return saveSession(d);
      },
      function (e) {
        // Jeton de renouvellement refusé : la session est terminée, il faut se reconnecter
        if (e.code === 400 || e.code === 401) {
          lsSet(SESSION, null);
          throw new CloudError('Session expirée : reconnecte-toi.', 'session');
        }
        throw e;
      }
    )
    .finally(function () {
      refreshing = null;
    });
  return refreshing;
}

function token() {
  var s = session();
  if (!s) return Promise.reject(new CloudError('Non connecté.', 'session'));
  if (s.access_token && s.expires_at - 60 > Date.now() / 1000) return Promise.resolve(s.access_token);
  return refresh().then(function (n) {
    return n.access_token;
  });
}

/** Appel authentifié ; un jeton refusé est renouvelé une fois. */
function api(path, opts) {
  return token().then(function (t) {
    return call(path, Object.assign({}, opts, { token: t })).catch(function (e) {
      if (e.code !== 401) throw e;
      return refresh().then(function (n) {
        return call(path, Object.assign({}, opts, { token: n.access_token }));
      });
    });
  });
}

/** E-mail de la session (complété depuis Supabase après une connexion par lien). */
export function whoAmI() {
  return api('/auth/v1/user').then(function (u) {
    var s = session();
    if (s && u && u.email && s.email !== u.email) {
      s.email = u.email;
      lsSet(SESSION, s);
    }
    return u && u.email;
  });
}

/** L'adresse connectée figure-t-elle dans la table membres ? */
export function isMember() {
  return api('/rest/v1/rpc/est_membre', { method: 'POST', body: {} }).then(function (r) {
    return r === true;
  });
}

export function signOut() {
  var s = session();
  lsSet(SESSION, null);
  lsSet(LAST, null);
  if (!s) return Promise.resolve();
  return call('/auth/v1/logout', { method: 'POST', token: s.access_token, body: {} }).catch(function () {});
}

/* ---------- Synchronisation ---------- */

export function lastSync() {
  return lsGet(LAST);
}

function chunks(list, n) {
  var out = [];
  for (var i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

var running = null;

/**
 * Synchronise l'appareil et la base. Résout { envoyees, recues, supprimees, ids (recues ou supprimées ici) }.
 * Un seul passage à la fois : un appel pendant un passage attend ce passage.
 */
export function sync() {
  if (running) return running;
  if (!configured() || !signedIn()) return Promise.reject(new CloudError('Synchronisation non activée.', 'off'));
  var res = { envoyees: 0, recues: 0, supprimees: 0, ids: [] };
  running = Promise.all([
    store.all(),
    api('/rest/v1/' + TABLE + '?select=debrief_id,maj,supprime&limit=100000', {
      headers: { Accept: 'application/json' }
    })
  ])
    .then(function (x) {
      var p = planSync(x[0], store.tombes(), x[1] || []);
      var steps = [];
      var rows = p.envoyer
        .map(function (f) {
          return { debrief_id: f.debrief_id, maj: f.maj, supprime: false, data: f };
        })
        .concat(
          p.supprimerEnLigne.map(function (d) {
            return { debrief_id: d.debrief_id, maj: d.maj, supprime: true, data: null };
          })
        );
      chunks(rows, 50).forEach(function (part) {
        steps.push(function () {
          return api('/rest/v1/' + TABLE + '?on_conflict=debrief_id', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: part
          });
        });
      });
      chunks(p.recuperer, 40).forEach(function (part) {
        steps.push(function () {
          var inList = part
            .map(function (id) {
              return '"' + id.replace(/"/g, '') + '"';
            })
            .join(',');
          return api(
            '/rest/v1/' + TABLE + '?select=data&supprime=eq.false&debrief_id=in.(' + encodeURIComponent(inList) + ')'
          ).then(function (got) {
            return (got || []).reduce(function (pr, row) {
              var f = row.data;
              if (!f || typeof f.debrief_id !== 'string' || !f.answers) return pr;
              return pr.then(function () {
                res.recues += 1;
                res.ids.push(f.debrief_id);
                return store.put(f);
              });
            }, Promise.resolve());
          });
        });
      });
      p.supprimerIci.forEach(function (id) {
        steps.push(function () {
          res.supprimees += 1;
          res.ids.push(id);
          return store.remove(id);
        });
      });
      return steps
        .reduce(function (pr, s) {
          return pr.then(s);
        }, Promise.resolve())
        .then(function () {
          store.oublierTombes(
            p.oublierTombes.concat(
              p.supprimerEnLigne.map(function (d) {
                return d.debrief_id;
              })
            )
          );
          res.envoyees = p.envoyer.length + p.supprimerEnLigne.length;
          lsSet(LAST, new Date().toISOString());
          return res;
        });
    })
    .finally(function () {
      running = null;
    });
  return running;
}
