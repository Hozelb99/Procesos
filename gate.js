// Pantalla de acceso. El código de la aplicación viaja CIFRADO (AES-256-GCM) en app.enc; la clave se deriva de la contraseña
// con PBKDF2-SHA256. La contraseña no está escrita en ningún archivo: si descifra, es la correcta (GCM autentica el contenido).
const $ = (s) => document.querySelector(s);
const SESION = 'pp_k', LARGA = 'pp_kl', DIAS = 7;
const b64a = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const aB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const safe = (fn) => { try { return fn(); } catch { return null; } };

let enc = null;
async function cargarEnc() {
  if (enc) return enc;
  const r = await fetch('app.enc', { cache: 'no-cache' });
  if (!r.ok) throw new Error('red');
  enc = JSON.parse(await r.text()); return enc;
}
async function claveDe(pass, e) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64a(e.salt), iterations: e.iter, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
}
async function descifrar(clave, e) {
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64a(e.iv) }, clave, b64a(e.data)); // lanza error si la clave no corresponde
  return JSON.parse(new TextDecoder().decode(buf));
}
async function abrir(carga) {
  $('#acceso')?.remove();
  const st = document.createElement('style'); st.id = 'appcss'; st.textContent = carga.css; document.head.appendChild(st);
  document.body.insertAdjacentHTML('afterbegin', carga.shell);
  window.__pp_gate = { bloquear };
  const url = URL.createObjectURL(new Blob([carga.js], { type: 'text/javascript' }));
  await import(url);
}
export function bloquear() {
  safe(() => { sessionStorage.removeItem(SESION); localStorage.removeItem(LARGA); });
  location.reload();
}
async function guardarClave(clave, recordar) {
  const raw = aB64(new Uint8Array(await crypto.subtle.exportKey('raw', clave)));
  safe(() => sessionStorage.setItem(SESION, raw));
  if (recordar) safe(() => localStorage.setItem(LARGA, JSON.stringify({ k: raw, exp: Date.now() + DIAS * 864e5 })));
}
async function claveGuardada() {
  let raw = safe(() => sessionStorage.getItem(SESION));
  if (!raw) { const l = safe(() => JSON.parse(localStorage.getItem(LARGA) || 'null')); if (l && l.exp > Date.now()) raw = l.k; else if (l) safe(() => localStorage.removeItem(LARGA)); }
  if (!raw) return null;
  return crypto.subtle.importKey('raw', b64a(raw), { name: 'AES-GCM' }, false, ['decrypt']);
}

let fallos = 0;
function mostrarError(t) { const e = $('#err'); e.textContent = t; e.hidden = !t; }
function esperar(seg) {
  const b = $('#entrar'); b.disabled = true; let s = seg; const t0 = b.textContent;
  const id = setInterval(() => { s--; if (s <= 0) { clearInterval(id); b.disabled = false; b.textContent = t0; } else b.textContent = `Espera ${s} s`; }, 1000); b.textContent = `Espera ${s} s`;
}

async function intentar(pass, recordar) {
  const b = $('#entrar'); b.disabled = true; const t0 = b.textContent; b.textContent = 'Verificando…'; mostrarError('');
  try {
    const e = await cargarEnc();
    let carga;
    try { const clave = await claveDe(pass, e); carga = await descifrar(clave, e); await guardarClave(clave, recordar); }
    catch (err) { if (err && err.message === 'red') throw err; fallos++; b.textContent = t0; mostrarError('Contraseña incorrecta.'); $('#pass').select(); if (fallos >= 3) esperar(Math.min(30, 2 ** (fallos - 2))); else b.disabled = false; return; }
    await abrir(carga);
  } catch (err) { b.textContent = t0; b.disabled = false; mostrarError('No se pudo cargar la aplicación. Conéctate una vez a internet para guardar la copia sin conexión.'); }
}

(async function init() {
  if (!crypto?.subtle) { document.body.innerHTML = '<p style="padding:24px;font:16px system-ui">Este navegador no admite cifrado seguro (requiere HTTPS o localhost).</p>'; return; }
  try {
    const k = await claveGuardada();
    if (k) { try { const e = await cargarEnc(); await abrir(await descifrar(k, e)); return; } catch { safe(() => { sessionStorage.removeItem(SESION); localStorage.removeItem(LARGA); }); } }
  } catch { /* se muestra el formulario */ }
  $('#acceso').hidden = false; $('#pass').focus();
  $('#frm').addEventListener('submit', (ev) => { ev.preventDefault(); const p = $('#pass').value.replace(/^[\s“”"'‘’]+|[\s“”"'‘’]+$/g, ''); if (!p) { mostrarError('Escribe la contraseña.'); return; } intentar(p, $('#recordar').checked); });
  $('#ver').addEventListener('click', () => { const i = $('#pass'); const v = i.type === 'password'; i.type = v ? 'text' : 'password'; $('#ver').textContent = v ? 'Ocultar' : 'Mostrar'; $('#ver').setAttribute('aria-pressed', String(v)); });
})();
