'use strict';
/* Edición de señales de ALTO, solo para administrador.
   Se engancha a app.js mediante dos puntos: AltosAdmin.load() al cargar senales.json
   y AltosAdmin.renderSelection() al mostrar el detalle. Usa las variables de app.js
   (data, selectedId, scale, tx, ty, IMAGE_W, IMAGE_H) y sus funciones (render, validate). */
(() => {
  const KEY = 'ecoterra.senales.v1';
  const q = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const admin = () => AdminAuth.isUnlocked();
  const NAMES = { pendiente: 'Pendiente', proceso: 'En proceso', instalada: 'Instalada' };
  let base = null, adding = false;

  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dirty = () => !!base && JSON.stringify(data.senales) !== JSON.stringify(base.senales);

  function ui() {
    q('#aTools').classList.toggle('hidden', !admin());
    q('#aLocalNote').classList.toggle('hidden', !(admin() && dirty()));
    q('#aAdd').textContent = adding ? 'Cancelar (toca el mapa para colocar)' : '＋ Agregar señal';
    q('#viewport').style.cursor = adding ? 'crosshair' : '';
  }
  function persist() {
    if (!admin()) return;
    try { dirty() ? localStorage.setItem(KEY, JSON.stringify(data)) : localStorage.removeItem(KEY); } catch { }
    ui();
  }
  function loadDraft() {
    if (!admin()) return null;
    try { const s = localStorage.getItem(KEY); return s ? validate(JSON.parse(s)) : null; } catch { return null; }
  }

  function renderSelection(el, p) {
    if (!admin()) return false;
    el.innerHTML = `<div class="id">${esc(p.id)}</div><span class="status-pill">Editando</span>
      <label class="form-field" for="aEstado">Estado</label>
      <select id="aEstado">${Object.entries(NAMES).map(([k, v]) => `<option value="${k}"${p.estado === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
      <label class="form-field" for="aPol">Polígono</label><input id="aPol" type="number" min="1" max="70" inputmode="numeric" value="${p.poligono ?? ''}" />
      <label class="form-field" for="aFecha">Fecha de instalación</label><input id="aFecha" type="date" value="${esc(p.fechaInstalacion || '')}" />
      <label class="form-field" for="aObs">Observaciones</label><textarea id="aObs" maxlength="300">${esc(p.observaciones)}</textarea>
      <div class="actions"><button type="button" class="btn outline danger" id="aDel">Quitar señal</button></div>`;
    q('#aEstado').onchange = e => { p.estado = e.target.value; if (p.estado === 'instalada' && !p.fechaInstalacion) p.fechaInstalacion = today(); persist(); render(); };
    q('#aPol').onchange = e => { const v = e.target.value.trim(); p.poligono = v === '' ? null : Math.min(70, Math.max(1, parseInt(v, 10) || 1)); persist(); render(); };
    q('#aFecha').onchange = e => { p.fechaInstalacion = e.target.value || null; persist(); };
    q('#aObs').oninput = e => { p.observaciones = e.target.value; persist(); };
    q('#aDel').onclick = () => { if (!confirm('¿Quitar ' + p.id + ' del mapa?')) return; data.senales = data.senales.filter(v => v.id !== p.id); selectedId = null; persist(); render(); };
    return true;
  }

  function reload() { // al entrar o salir del modo administrador
    if (!base) return;
    adding = false; data = loadDraft() || clone(base); selectedId = null; render(); ui();
  }
  function exportJson() {
    data.actualizado = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
    a.download = 'senales.json'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  document.addEventListener('DOMContentLoaded', () => {
    AdminAuth.onChange(reload);
    q('#aAdd').onclick = () => { adding = !adding; if (adding) { selectedId = null; render(); } ui(); };
    q('#aExport').onclick = () => { if (admin()) exportJson(); };
    q('#aImport').onchange = async e => {
      const f = e.target.files[0]; e.target.value = ''; if (!f || !admin()) return;
      try { data = validate(JSON.parse(await f.text())); selectedId = null; persist(); render(); }
      catch (err) { alert('No se pudo importar: ' + err.message); }
    };
    q('#aDiscard').onclick = () => { if (!admin() || !confirm('¿Descartar los cambios guardados en este navegador y volver a la versión publicada?')) return; data = clone(base); selectedId = null; persist(); render(); };
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && adding) { adding = false; ui(); } });
    q('#viewport').addEventListener('click', e => {
      if (!adding || !admin() || moved) return;
      const r = q('#viewport').getBoundingClientRect(), ux = (e.clientX - r.left - tx) / scale, uy = (e.clientY - r.top - ty) / scale;
      if (ux < 0 || ux > IMAGE_W || uy < 0 || uy > IMAGE_H) return;
      const n = data.senales.reduce((m, s) => Math.max(m, parseInt(s.id.replace(/\D/g, ''), 10) || 0), 0) + 1;
      const s = { id: 'ALTO-' + String(n).padStart(3, '0'), x: +(ux / IMAGE_W * 100).toFixed(4), y: +(uy / IMAGE_H * 100).toFixed(4), estado: 'pendiente', poligono: null, fechaInstalacion: null, observaciones: '' };
      data.senales.push(s); selectedId = s.id; adding = false; persist(); render();
    });
  });

  window.AltosAdmin = {
    load(published) { base = clone(published); const d = loadDraft(); queueMicrotask(ui); return d || published; },
    renderSelection
  };
})();
