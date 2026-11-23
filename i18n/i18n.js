/* ==========================================================================
   VAUCLAIR — i18n : interfaz en francés, inglés y español (latinoamericano).

   La aplicación sigue escrita en francés: los estados («À vendre», «Acceptée»…)
   son también claves de negocio, así que el código y los datos no se tocan.
   Este motor traduce lo que se MUESTRA, a partir de I18N_DICT
   (clave = texto francés → [inglés, español]):
     · nodos de texto y atributos (title, placeholder, aria-label, alt, data-tip)
       en cuanto aparecen en el DOM (MutationObserver);
     · textos dibujados en canvas (letreros y planos del mapa 3D);
     · documentos escritos con document.write (impresiones);
     · alert / confirm / prompt.
   Búsqueda: frase exacta → números como {0} → trozos separados por · — –
   → patrones con huecos {0} {1} → sin puntuación final → sin mayúsculas.
   Idioma: ?lang=xx en la URL → elección guardada → idioma del navegador → fr.
   Cambiar de idioma recarga la página (los datos están en localStorage).
   ========================================================================== */
(function () {
  'use strict';

  const LANGS = {
    fr: { label: 'FR', name: 'Français', locale: 'fr-CH', html: 'fr-CH' },
    en: { label: 'EN', name: 'English', locale: 'en-GB', html: 'en' },
    es: { label: 'ES', name: 'Español', locale: 'es-419', html: 'es-419' },
  };
  const STORE = 'vauclair-lang';

  function pick() {
    try {
      const q = new URLSearchParams(location.search).get('lang');
      if (q && LANGS[q]) { try { localStorage.setItem(STORE, q); } catch (e) {} return q; }
    } catch (e) {}
    try { const s = localStorage.getItem(STORE); if (s && LANGS[s]) return s; } catch (e) {}
    const n = String(navigator.language || 'fr').slice(0, 2).toLowerCase();
    return LANGS[n] ? n : 'fr';
  }

  const lang = pick();
  const ON = lang !== 'fr';
  const COL = lang === 'en' ? 0 : 1;
  document.documentElement.lang = LANGS[lang].html;

  /* ---------------- índice del diccionario ---------------- */
  const LETTER = /[A-Za-zÀ-ÖØ-öø-ÿŒœ]/;
  const NUM = /(?:(?<=^|\s)[-+−])?\d+(?:[’'.,]\d+)*/g;
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // separadores que el código pega a los textos: «Offre reçue ·», «Montant :»
  const EDGE = /^[\s·:;,—–]+|[\s·:;,—–]+$/g;

  const EXACT = new Map();   // clave normalizada → traducción
  const LOWER = new Map();   // clave en minúsculas → traducción (respaldo)
  const PATS = [];           // patrones con huecos {n}
  if (ON) {
    const D = window.I18N_DICT || {};
    const entries = [];
    for (const k in D) {
      const v = D[k] && D[k][COL];
      if (v == null || v === '') continue;
      entries.push([norm(k), v]);
    }
    // variante sin separadores en los extremos, si no existe ya
    const have = new Set(entries.map(e => e[0]));
    for (const [nk, v] of entries.slice()) {
      const sk = nk.replace(EDGE, '');
      if (sk !== nk && LETTER.test(sk) && !have.has(sk)) { have.add(sk); entries.push([sk, v.replace(EDGE, '')]); }
    }
    for (const [nk, v] of entries) {
      EXACT.set(nk, v);
      if (!LOWER.has(nk.toLowerCase())) LOWER.set(nk.toLowerCase(), v);
      if (/\{\d+\}/.test(nk)) {
        const lits = nk.split(/\{\d+\}/).map(s => s.trim()).filter(Boolean);
        const lit = lits.sort((a, b) => b.length - a.length)[0] || '';
        if (!LETTER.test(lit) || lit.length < 2) continue;      // «{0} {1}» lo atraparía todo
        if (/\}\{/.test(nk)) continue;                          // «{0}{1}» seguidos: no se sabe dónde cortar
        const order = [];
        const src = nk.split(/(\{\d+\})/).map(p => {
          const m = /^\{(\d+)\}$/.exec(p);
          if (m) { order.push(+m[1]); return '(.+?)'; }
          return reEsc(p);
        }).join('');
        PATS.push({ re: new RegExp('^' + src + '$'), order, out: v, lit, size: nk.replace(/\{\d+\}/g, '').length });
      }
    }
    PATS.sort((a, b) => b.size - a.size);   // los más específicos primero
  }

  /* ---------------- traducción de una cadena ---------------- */
  const cache = new Map();
  const MISS = new Set();
  const fill = (t, vals) => t.replace(/\{(\d+)\}/g, (m, i) => (vals[i] != null ? vals[i] : m));
  const sub = s => (LETTER.test(s) ? (trCore(norm(s)) ?? s) : s);

  function matchCase(src, t) {
    if (src === src.toUpperCase() && src !== src.toLowerCase()) return t.toUpperCase();
    if (/^[a-zà-ÿ]/.test(src) && /^[A-ZÀ-Ý]/.test(t)) return t[0].toLowerCase() + t.slice(1);
    if (/^[A-ZÀ-Ý]/.test(src) && /^[a-zà-ÿ]/.test(t)) return t[0].toUpperCase() + t.slice(1);
    return t;
  }

  /* Un texto conocido pegado a un valor (importe, fecha, porcentaje…):
     se traduce la parte de texto y el valor se deja tal cual. */
  const UNIT = new Set(['CHF', '%', '‰', 'k', 'M', 'm²', 'm³', '/', '+', '−', '-', '×', '→']);
  const isVal = w => /\d/.test(w) || UNIT.has(w);
  function valueSplit(c) {
    const w = c.split(' ');
    if (w.length < 2) return undefined;
    let i = w.findIndex(isVal);
    if (i > 0) {                              // texto + valor: «brut CHF 389 k»
      const head = w.slice(0, i).join(' ');
      if (!LETTER.test(head)) return undefined;
      const t = trCore(head);
      if (t == null) return undefined;
      return t + ' ' + sub(w.slice(i).join(' '));
    }
    if (i === 0) {                            // valor + texto: «5 visites aujourd’hui»
      let j = 0;
      while (j < w.length && isVal(w[j])) j++;
      if (j >= w.length) return undefined;
      const rest = w.slice(j).join(' ');
      const t = trCore(rest);
      if (t == null) return undefined;
      return w.slice(0, j).join(' ') + ' ' + t;
    }
    return undefined;
  }

  function byPattern(c, minSize) {
    for (const p of PATS) {
      if (p.size < minSize) break;            // PATS está ordenado de mayor a menor
      if (!c.includes(p.lit)) continue;
      const m = p.re.exec(c);
      if (!m) continue;
      const vals = [];
      p.order.forEach((idx, j) => { vals[idx] = sub(m[j + 1]); });
      return fill(p.out, vals);
    }
    return undefined;
  }

  function trCore(c) {
    if (!c) return null;
    if (cache.has(c)) return cache.get(c);
    cache.set(c, null);                       // evita recursión sobre la misma cadena
    let r = EXACT.get(c);

    if (r === undefined) {                    // números → {n}
      const nums = [];
      const k = c.replace(NUM, x => '{' + (nums.push(x) - 1) + '}');
      if (nums.length) { const t = EXACT.get(k); if (t !== undefined) r = fill(t, nums); }
    }
    if (r === undefined) r = byPattern(c, 15); // frases largas con huecos, antes de partirlas
    if (r === undefined) {                    // trozos separados por · — –
      const parts = c.split(/(\s+[·—–]\s+)/);
      if (parts.length > 1) {
        let changed = false;
        const out = parts.map((p, i) => {
          if (i % 2) return p;
          const t = LETTER.test(p) ? trCore(p.trim()) : null;
          if (t != null) { changed = true; return t; }
          return p;
        });
        if (changed) r = out.join('');
      }
    }
    if (r === undefined) r = byPattern(c, 0); // patrones con huecos
    if (r === undefined) {                    // «lundi 23 novembre à 16:00»
      const m = /^(.*\S) à (\d{1,2}[:h]\d{2})(.*)$/.exec(c);
      if (m) r = sub(m[1]) + ' ' + (EXACT.get('à') || 'à') + ' ' + m[2] + (m[3] ? sub(m[3]) : '');
    }
    if (r === undefined) r = valueSplit(c);   // «probabilité 25 %», «5 visites aujourd’hui»
    if (r === undefined) {                    // puntuación o símbolos alrededor
      const m = /^([\s(«"“'‘\-–—·•:;,/+]*)(.*?)([\s:;,.!?…·)»"”'’\-–—•]*)$/.exec(c);
      if (m && m[2] && m[2] !== c && LETTER.test(m[2])) {
        const t = trCore(m[2]);
        if (t != null) r = m[1] + t + m[3];
      }
    }
    if (r === undefined) {                    // otra capitalización
      const t = LOWER.get(c.toLowerCase());
      if (t !== undefined) r = matchCase(c, t);
    }
    if (r === undefined && c.includes(', ')) { // listas: «villa, maison, loft»
      const parts = c.split(/(,\s+)/);
      const out = parts.map((p, i) => (i % 2 || !LETTER.test(p)) ? p : trCore(p.trim()));
      if (out.every(p => p != null)) r = out.join('');
    }

    if (r === undefined) {
      r = null;
      if (MISS.size < 6000) MISS.add(c);
    }
    if (cache.size > 30000) cache.clear();
    cache.set(c, r);
    return r;
  }

  function tr(s) {
    if (!ON || s == null) return s;
    s = String(s);
    if (!LETTER.test(s)) return s;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    const t = trCore(norm(m[2]));
    return t == null ? s : m[1] + t + m[3];
  }

  /* ---------------- DOM ---------------- */
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt', 'data-tip', 'label'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'KBD']);
  const NO_TR = '[translate="no"], .notranslate';
  const DONE = new WeakMap();    // nodo de texto → valor que pusimos nosotros
  const ADONE = new WeakMap();   // elemento → { atributo: valor que pusimos }

  function trText(n) {
    const v = n.nodeValue;
    if (!v || DONE.get(n) === v || !LETTER.test(v)) return;
    const p = n.parentNode;
    if (!p || p.nodeType !== 1 || SKIP.has(p.nodeName)) return;
    const t = tr(v);
    if (t === v) return;
    if (p.nodeName === 'OPTION' && !p.hasAttribute('value')) p.setAttribute('value', p.textContent);
    DONE.set(n, t);
    n.nodeValue = t;
  }

  function trAttrs(el) {
    for (const a of ATTRS) {
      if (!el.hasAttribute(a)) continue;
      const v = el.getAttribute(a);
      const d = ADONE.get(el);
      if (d && d[a] === v) continue;
      const t = tr(v);
      if (t === v) continue;
      if (d) d[a] = t; else ADONE.set(el, { [a]: t });
      el.setAttribute(a, t);
    }
  }

  const filter = {
    acceptNode(n) {
      if (n.nodeType === 1) {
        if (SKIP.has(n.nodeName) || n.getAttribute('translate') === 'no' || n.classList.contains('notranslate')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  };

  function walkTree(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      const p = root.parentNode;
      if (p && p.nodeType === 1 && p.closest(NO_TR)) return;
      trText(root);
      return;
    }
    if (root.nodeType === 1) {
      if (SKIP.has(root.nodeName) || root.closest(NO_TR)) return;
      trAttrs(root);
    } else if (root.nodeType !== 9 && root.nodeType !== 11) return;
    const doc = root.ownerDocument || root;
    const w = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, filter);
    let n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) trText(n); else trAttrs(n); }
  }

  if (ON) {
    const mo = new MutationObserver(recs => {
      for (const r of recs) {
        if (r.type === 'characterData') walkTree(r.target);
        else if (r.type === 'attributes') { if (!r.target.closest(NO_TR)) trAttrs(r.target); }
        else for (const n of r.addedNodes) walkTree(n);
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    walkTree(document.head);
    document.addEventListener('DOMContentLoaded', () => walkTree(document.documentElement));
  }

  /* ---------------- canvas (letreros y planos del mapa 3D) ---------------- */
  if (ON && window.CanvasRenderingContext2D) {
    const P = CanvasRenderingContext2D.prototype;
    ['fillText', 'strokeText', 'measureText'].forEach(fn => {
      const orig = P[fn];
      P[fn] = function (text, ...rest) { return orig.call(this, tr(text), ...rest); };
    });
  }

  /* ---------------- impresiones (document.write) ---------------- */
  function trHTML(h) {
    if (!ON || typeof h !== 'string' || !/<[a-z!]/i.test(h)) return tr(h);
    const doc = new DOMParser().parseFromString(h, 'text/html');
    walkTree(doc.documentElement);
    if (!/<html[\s>]/i.test(h)) return doc.body.innerHTML;   // fragmento, no documento
    doc.documentElement.lang = LANGS[lang].html;
    const dt = /^\s*<!doctype[^>]*>/i.exec(h);
    return (dt ? dt[0] : '') + doc.documentElement.outerHTML;
  }
  if (ON) {
    const W = Document.prototype.write;
    Document.prototype.write = function (...a) { return W.apply(this, a.map(trHTML)); };
  }

  /* ---------------- diálogos nativos ---------------- */
  if (ON) ['alert', 'confirm', 'prompt'].forEach(fn => {
    const orig = window[fn];
    if (typeof orig === 'function') window[fn] = function (m, ...rest) { return orig.call(window, tr(m == null ? '' : m), ...rest); };
  });

  /* ---------------- selector de idioma (barra superior) ---------------- */
  function set(l) {
    if (!LANGS[l] || l === lang) return;
    try { localStorage.setItem(STORE, l); } catch (e) {}
    try {
      const u = new URL(location.href);
      if (u.searchParams.has('lang')) { u.searchParams.delete('lang'); history.replaceState(null, '', u.toString()); }
    } catch (e) {}
    location.reload();
  }

  function mountSwitch() {
    const bar = document.querySelector('.topbar');
    if (!bar || bar.querySelector('.lang-sw')) return;
    const st = document.createElement('style');
    st.textContent =
      '.lang-sw{display:flex;align-items:center;gap:2px;padding:3px;border:1px solid var(--line);border-radius:999px;background:var(--card);flex:none}' +
      '.lang-sw button{font:700 11px/1 var(--font);letter-spacing:.08em;color:var(--ink3);padding:7px 9px;border-radius:999px;transition:background .15s,color .15s}' +
      '.lang-sw button:hover:not(.on){color:var(--ink);background:var(--linen)}' +
      '.lang-sw button.on{background:var(--espresso);color:var(--cream);cursor:default}' +
      '.lang-sw button:focus-visible{outline:2px solid var(--bronze);outline-offset:1px}';
    document.head.appendChild(st);
    const sw = document.createElement('div');
    sw.className = 'lang-sw';
    sw.setAttribute('translate', 'no');
    sw.setAttribute('role', 'group');
    sw.setAttribute('aria-label', { fr: 'Langue', en: 'Language', es: 'Idioma' }[lang]);
    sw.innerHTML = Object.keys(LANGS).map(k =>
      `<button type="button" data-lang="${k}" class="${k === lang ? 'on' : ''}" title="${LANGS[k].name}" aria-pressed="${k === lang}">${LANGS[k].label}</button>`).join('');
    sw.addEventListener('click', e => { const b = e.target.closest('[data-lang]'); if (b) set(b.dataset.lang); });
    const bell = bar.querySelector('#top-bell');
    bar.insertBefore(sw, bell || null);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountSwitch);
  else mountSwitch();

  window.I18N = {
    lang,
    locale: LANGS[lang].locale,
    langs: Object.keys(LANGS),
    tr,
    html: trHTML,
    set,
    /** textos mostrados que no encontraron traducción (para completar el diccionario) */
    faltantes: () => [...MISS],
  };
})();
