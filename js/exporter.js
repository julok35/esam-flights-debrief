/* Sorties de la note : presse-papiers, fichier .md, partage natif. Chaque méthode a son repli. */

function legacyCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.className = 'offscreen';
  document.body.appendChild(ta);
  ta.select();
  var ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (e) {}
  document.body.removeChild(ta);
  return ok;
}

/** Résout 'ok', ou 'manuel' quand il faut sélectionner le texte à la main (aperçu affiché). */
export function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext)
      return navigator.clipboard.writeText(text).then(
        function () {
          return 'ok';
        },
        function () {
          return legacyCopy(text) ? 'ok' : 'manuel';
        }
      );
  } catch (e) {}
  return Promise.resolve(legacyCopy(text) ? 'ok' : 'manuel');
}

export function mdFile(text, name) {
  try {
    return new File([text], name, { type: 'text/markdown' });
  } catch (e) {
    return null;
  }
}

/** Téléchargement du .md ; résout 'ok' ou 'manuel'. */
export function download(text, name) {
  try {
    var url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.className = 'offscreen';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 30000);
    return Promise.resolve('ok');
  } catch (e) {
    return Promise.resolve('manuel');
  }
}

export function canShareFile(text, name) {
  var f = mdFile(text, name);
  try {
    return !!(f && navigator.canShare && navigator.canShare({ files: [f] }));
  } catch (e) {
    return false;
  }
}

/**
 * Partage natif du fichier (vers Obsidian sur Android), sinon du texte, sinon téléchargement.
 * Résout 'ok', 'annule', ou le résultat du repli ('telecharge', 'manuel').
 */
export function share(text, name) {
  var f = mdFile(text, name);
  var p;
  if (canShareFile(text, name)) p = navigator.share({ files: [f], title: name });
  else if (navigator.share) p = navigator.share({ title: name, text: text });
  else
    return download(text, name).then(function (r) {
      return r === 'ok' ? 'telecharge' : r;
    });
  return p.then(
    function () {
      return 'ok';
    },
    function (e) {
      if (e && e.name === 'AbortError') return 'annule';
      return download(text, name).then(function (r) {
        return r === 'ok' ? 'telecharge' : r;
      });
    }
  );
}
