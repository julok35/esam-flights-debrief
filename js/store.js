/* Stockage des fiches sur l'appareil : IndexedDB, localStorage à défaut. Rien ne quitte le téléphone.
 * Copie de secours synchrone dans localStorage à chaque modification : une fermeture brutale (onglet tué, batterie)
 * pendant une écriture IndexedDB ne perd pas la dernière saisie. */

var DB = 'esam-debrief',
  STORE = 'fiches',
  LS = 'esam-debrief-fiches',
  DRAFT = 'esam-debrief-brouillon';
var dbp = null;

function openDb() {
  if (dbp) return dbp;
  dbp = new Promise(function (res, rej) {
    if (typeof indexedDB === 'undefined') return rej(new Error('IndexedDB indisponible'));
    var r = indexedDB.open(DB, 1);
    r.onupgradeneeded = function () {
      r.result.createObjectStore(STORE, { keyPath: 'debrief_id' });
    };
    r.onsuccess = function () {
      res(r.result);
    };
    r.onerror = function () {
      rej(r.error);
    };
  }).catch(function (e) {
    dbp = Promise.reject(e);
    dbp.catch(function () {});
    throw e;
  });
  return dbp;
}

function tx(mode, fn) {
  return openDb().then(function (db) {
    return new Promise(function (res, rej) {
      var t = db.transaction(STORE, mode);
      var out = fn(t.objectStore(STORE));
      t.oncomplete = function () {
        res(out && 'result' in out ? out.result : undefined);
      };
      t.onerror = t.onabort = function () {
        rej(t.error);
      };
    });
  });
}

function lsAll() {
  try {
    return JSON.parse(localStorage.getItem(LS) || '{}');
  } catch (e) {
    return {};
  }
}
function lsSave(all) {
  localStorage.setItem(LS, JSON.stringify(all)); // une erreur (quota, mode privé) remonte à l'appelant
}

export function draft(fiche) {
  try {
    localStorage.setItem(DRAFT, JSON.stringify(fiche));
  } catch (e) {}
}
function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT) || 'null');
  } catch (e) {
    return null;
  }
}
// maj : la copie de secours n'est retirée que si elle n'est pas plus récente que ce qui vient d'être écrit
function clearDraft(id, maj) {
  var d = readDraft();
  if (d && d.debrief_id === id && (!maj || d.maj <= maj))
    try {
      localStorage.removeItem(DRAFT);
    } catch (e) {}
}

export function put(fiche) {
  var copy = JSON.parse(JSON.stringify(fiche));
  return tx('readwrite', function (s) {
    return s.put(copy);
  })
    .catch(function () {
      var all = lsAll();
      all[copy.debrief_id] = copy;
      lsSave(all);
    })
    .then(function () {
      clearDraft(copy.debrief_id, copy.maj);
    });
}

export function get(id) {
  return tx('readonly', function (s) {
    return s.get(id);
  })
    .catch(function () {
      return lsAll()[id];
    })
    .then(function (f) {
      var d = readDraft();
      return d && d.debrief_id === id && (!f || f.maj < d.maj) ? d : f;
    });
}

export function del(id) {
  clearDraft(id);
  return tx('readwrite', function (s) {
    return s.delete(id);
  }).catch(function () {
    var all = lsAll();
    delete all[id];
    lsSave(all);
  });
}

/** Toutes les fiches, la plus récemment modifiée d'abord. Rattrape une copie de secours plus récente. */
export function all() {
  return tx('readonly', function (s) {
    return s.getAll();
  })
    .catch(function () {
      var o = lsAll();
      return Object.keys(o).map(function (k) {
        return o[k];
      });
    })
    .then(function (list) {
      var d = readDraft();
      if (d && d.debrief_id) {
        var cur = list.find(function (f) {
          return f.debrief_id === d.debrief_id;
        });
        if (!cur || cur.maj < d.maj) {
          list = list.filter(function (f) {
            return f !== cur;
          });
          list.push(d);
          return put(d).then(function () {
            return list;
          });
        }
      }
      return list;
    })
    .then(function (list) {
      return list.sort(function (a, b) {
        return a.maj < b.maj ? 1 : -1;
      });
    });
}
