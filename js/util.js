/* Petits outils partagés : DOM, dates, annonces. */

export var $ = function (id) {
  return document.getElementById(id);
};

/** Crée un élément : h('button', { class: 'chip', type: 'button' }, 'Texte', enfant...) */
export function h(tag, attrs) {
  var el = document.createElement(tag);
  if (attrs)
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
  for (var i = 2; i < arguments.length; i++) {
    var c = arguments[i];
    if (c === null || c === undefined || c === false) continue;
    (Array.isArray(c) ? c : [c]).forEach(function (x) {
      if (x !== null && x !== undefined && x !== false)
        el.appendChild(typeof x === 'string' ? document.createTextNode(x) : x);
    });
  }
  return el;
}

export function frDate(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}
export function hm(iso) {
  var d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
export function dateTime(iso) {
  var d = new Date(iso);
  return isNaN(d)
    ? ''
    : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) +
        ' ' +
        d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Message bref annoncé aux lecteurs d'écran et affiché en bas d'écran
var toastTimer = 0;
export function toast(msg) {
  var t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    t.hidden = true;
  }, 2600);
}
