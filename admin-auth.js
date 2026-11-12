'use strict';
/* ==========================================================================
   Acceso de administrador (señales de alto y túmulos)

   LÍMITES de esta protección — léelo antes de confiar en ella:
   No es un inicio de sesión real. Como todo el sitio vive en GitHub Pages, el
   código (su hash) viaja al navegador de cualquiera que lo visite, así que
   alguien dispuesto a revisar el código fuente puede saltarse esta pantalla.
   Sirve como filtro contra ediciones casuales o accidentales.

   La protección real de lo que se publica es quién tiene permiso de escritura
   (push) en el repositorio de GitHub: aunque alguien "entre" aquí, solo puede
   cambiar un borrador en SU navegador; nunca publica cambios para los demás.

   Para cambiar el código: abre generate-code.html, escribe el nuevo código y
   reemplaza la línea CODE_HASH de abajo por la que te entrega.
   ========================================================================== */
const AdminAuth = (() => {
  const CODE_HASH = "eba94d3bb331226f18e200353f163619f8f5da21af2c258176c51d9d4ebffa3e";
  const SESSION_KEY = 'ecoterra_admin_unlocked';
  const listeners = [];
  const q = s => document.querySelector(s);

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function isUnlocked() { try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; } }
  function setUnlocked(on) { try { on ? sessionStorage.setItem(SESSION_KEY, '1') : sessionStorage.removeItem(SESSION_KEY); } catch { } }
  function onChange(fn) { listeners.push(fn); }
  function emit() { updateUi(); for (const fn of listeners) fn(isUnlocked()); }

  async function tryUnlock(code) {
    if (!code) return false;
    if (!(window.crypto && crypto.subtle)) throw Error('Este navegador no permite la verificación (requiere HTTPS o localhost).');
    if (await sha256Hex(code) !== CODE_HASH) return false;
    setUnlocked(true); emit(); return true;
  }
  function lock() { setUnlocked(false); emit(); }

  function updateUi() {
    const on = isUnlocked();
    document.body.classList.toggle('is-admin', on);
    const tag = q('#modeIndicator'); if (tag) tag.textContent = on ? 'Modo administrador' : 'Consulta pública';
    const btn = q('#adminBtn'); if (btn) btn.textContent = on ? '🔓 Cerrar sesión de administrador' : '🔒 Administrador';
  }

  function init() {
    const modal = q('#adminModal'), input = q('#adminCode'), err = q('#adminError'), submit = q('#adminSubmit');
    const open = () => { err.classList.add('hidden'); input.value = ''; modal.classList.remove('hidden'); input.focus(); };
    const close = (refocus = true) => { modal.classList.add('hidden'); input.value = ''; if (refocus) q('#adminBtn').focus(); };
    q('#adminBtn').addEventListener('click', () => { if (isUnlocked()) lock(); else open(); });
    q('#adminCancel').addEventListener('click', () => close());
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
    async function attempt() {
      submit.disabled = true; err.classList.add('hidden');
      try {
        if (await tryUnlock(input.value)) { close(false); }
        else { await new Promise(r => setTimeout(r, 800)); err.textContent = 'Código incorrecto.'; err.classList.remove('hidden'); input.value = ''; input.focus(); }
      } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); }
      submit.disabled = false;
    }
    submit.addEventListener('click', attempt);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); attempt(); } });
    updateUi();
  }
  document.addEventListener('DOMContentLoaded', init);

  return { isUnlocked, onChange, lock };
})();
