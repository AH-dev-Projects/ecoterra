'use strict';
/* Sección de túmulos. Independiente de app.js (señales de alto): no comparte estado con ella. */
(() => {
  const W = 1639, H = 959, KEY = 'ecoterra.tumulos.v1';
  const q = s => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const vp = q('#tViewport'), content = q('#tMapContent'), svg = q('#tSvg'), pop = q('#tPop');
  const NAMES = { pendiente: 'Pendiente', proceso: 'En proceso', instalado: 'Instalado' };
  const admin = () => AdminAuth.isUnlocked();
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  let base = null, data = null, polys = [];
  let selId = null, edit = false, adding = false;
  let sc = 1, tx = 0, ty = 0, fitted = false, ptr = null;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const find = id => data.tumulos.find(t => t.id === id);
  const num = v => typeof v === 'number' && isFinite(v);

  /* ---------- datos ---------- */
  function validate(v) {
    if (!v || !Array.isArray(v.tumulos)) throw Error('El archivo no contiene una lista de túmulos.');
    const ids = new Set();
    for (const t of v.tumulos) {
      if (typeof t.id !== 'string' || ids.has(t.id) || !num(t.x) || !num(t.y) || !num(t.angulo) || !num(t.largo) || t.x < 0 || t.x > 100 || t.y < 0 || t.y > 100)
        throw Error('Túmulo inválido o identificador duplicado: ' + String(t.id));
      ids.add(t.id);
    }
    return normalize(v);
  }
  function normalize(v) {
    for (const t of v.tumulos) {
      t.angulo = ((Math.round(t.angulo) % 180) + 180) % 180;
      t.largo = Math.min(60, Math.max(10, Math.round(t.largo)));
      if (!NAMES[t.estado]) t.estado = 'pendiente';
      t.fechaInstalacion = typeof t.fechaInstalacion === 'string' && t.fechaInstalacion ? t.fechaInstalacion : null;
      t.poligono = num(t.poligono) ? Math.round(t.poligono) : null;
      t.poligonoVerificado = t.poligonoVerificado === true;
      t.casa = String(t.casa ?? '').slice(0, 40);
      t.comentario = String(t.comentario ?? '').slice(0, 300);
    }
    return v;
  }
  const dirty = () => JSON.stringify(data.tumulos) !== JSON.stringify(base.tumulos);
  function persist() {
    if (!admin()) return;
    try {
      if (dirty()) localStorage.setItem(KEY, JSON.stringify(data));
      else localStorage.removeItem(KEY);
    } catch { /* almacenamiento no disponible: el trabajo sigue en memoria */ }
    q('#tLocalNote').classList.toggle('hidden', !dirty());
  }
  function nearestPoly(xPct, yPct) {
    const px = xPct / 100 * W, py = yPct / 100 * H;
    let best = null, bd = Infinity;
    for (const p of polys) { const d = (p.x - px) ** 2 + (p.y - py) ** 2; if (d < bd) { bd = d; best = p.n; } }
    return best;
  }
  const label = t => `${t.poligono != null ? 'Polígono ' + t.poligono : 'Polígono sin asignar'} · ${t.casa ? 'Casa ' + t.casa : 'Casa sin registrar'}`;

  /* ---------- mapa ---------- */
  function geom(t) {
    const cx = t.x / 100 * W, cy = t.y / 100 * H, a = t.angulo * Math.PI / 180, L = Math.max(t.largo, 14) / 2;
    return { x1: cx - L * Math.cos(a), y1: cy - L * Math.sin(a), x2: cx + L * Math.cos(a), y2: cy + L * Math.sin(a), cx, cy };
  }
  function setGeom(g, t) {
    const p = geom(t);
    for (const l of g.querySelectorAll('line')) { l.setAttribute('x1', p.x1); l.setAttribute('y1', p.y1); l.setAttribute('x2', p.x2); l.setAttribute('y2', p.y2); }
    const ti = g.querySelector('title'); if (ti) ti.textContent = t.id + ' · ' + NAMES[t.estado] + ' · ' + label(t);
    g.setAttribute('aria-label', t.id + ', ' + NAMES[t.estado] + ', ' + label(t));
  }
  function visible(t) {
    const f = q('#tFilter').value, d = q('#tData').value, s = q('#tSearch').value.trim().toLowerCase();
    if (f !== 'todos' && t.estado !== f) return false;
    if (d === 'concasa' && !t.casa) return false;
    if (d === 'sincasa' && t.casa) return false;
    if (d === 'porverificar' && t.poligonoVerificado) return false;
    if (s && ![t.id, t.poligono ?? '', t.casa, t.comentario, NAMES[t.estado]].some(v => String(v).toLowerCase().includes(s))) return false;
    return true;
  }
  function renderMap() {
    svg.replaceChildren();
    let shown = 0;
    for (const t of data.tumulos) {
      if (!visible(t)) continue;
      shown++;
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'tum ' + t.estado + (t.id === selId ? ' selected' : ''));
      g.setAttribute('data-id', t.id); g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
      g.append(document.createElementNS(NS, 'title'));
      for (const c of ['tum-halo', 'tum-line', 'tum-hit']) { const l = document.createElementNS(NS, 'line'); l.setAttribute('class', c); g.append(l); }
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(t.id); } });
      setGeom(g, t);
      svg.append(g);
    }
    q('#tCount').textContent = shown === data.tumulos.length ? `${data.tumulos.length} túmulos marcados` : `${shown} de ${data.tumulos.length} túmulos`;
    placePop();
  }
  function renderStats() {
    const T = data.tumulos, n = e => T.filter(t => t.estado === e).length, done = n('instalado');
    q('#tTotal').textContent = T.length; q('#tPending').textContent = n('pendiente'); q('#tWorking').textContent = n('proceso'); q('#tDone').textContent = done;
    const pct = T.length ? Math.round(100 * done / T.length) : 0;
    q('#tPercentage').textContent = pct + '%'; q('#tProgressFill').style.width = pct + '%';
  }
  function placePop() {
    const t = selId && find(selId);
    if (!t || !visible(t)) { pop.classList.add('hidden'); return; }
    const p = geom(t);
    pop.innerHTML = `<b>${esc(t.id)}</b> · ${NAMES[t.estado]} · ${esc(label(t))}`;
    pop.style.left = (tx + p.cx * sc) + 'px'; pop.style.top = (ty + p.cy * sc - 14) + 'px';
    pop.classList.remove('hidden');
  }

  /* ---------- panel de detalle ---------- */
  function renderSelection() {
    const el = q('#tSelection'), t = selId && find(selId);
    if (!t) {
      el.innerHTML = '<h2>Selecciona un túmulo</h2><p>' + (adding ? 'Toca el mapa donde quieres colocar el nuevo túmulo.' : 'Toca cualquier línea en el mapa para ver su estado, polígono y casa.') + '</p>';
      return;
    }
    if (!edit) {
      el.innerHTML = `<div class="id">${esc(t.id)}</div><span class="status-pill pill-${t.estado}">${NAMES[t.estado]}</span>
        <div class="detail"><b>Fecha de instalación:</b> ${esc(t.fechaInstalacion || 'No registrada')}</div>
        <div class="detail"><b>Polígono:</b> ${t.poligono ?? 'Sin asignar'}${t.poligono != null && !t.poligonoVerificado ? '<span class="chip warn">por verificar</span>' : ''}</div>
        <div class="detail"><b>Casa:</b> ${t.casa ? esc(t.casa) : 'Sin registrar'}</div>
        <div class="detail"><b>Comentario:</b> ${t.comentario ? esc(t.comentario) : 'Ninguno'}</div>`;
      return;
    }
    el.innerHTML = `<div class="id">${esc(t.id)}</div><span class="status-pill pill-${t.estado}">Editando</span>
      <label class="form-field" for="fEstado">Estado</label>
      <select id="fEstado">${Object.entries(NAMES).map(([k, v]) => `<option value="${k}"${t.estado === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
      <label class="form-field" for="fFecha">Fecha de instalación</label><input id="fFecha" type="date" value="${esc(t.fechaInstalacion || '')}" />
      <label class="form-field" for="fPol">Polígono</label><input id="fPol" type="number" min="1" max="70" inputmode="numeric" value="${t.poligono ?? ''}" />
      <p class="input-note" id="fPolNote">${t.poligonoVerificado ? '' : 'Sugerido por cercanía al número del plano. Corrígelo o confírmalo.'}</p>
      <label class="form-field" for="fCasa">Casa (frente a)</label><input id="fCasa" type="text" maxlength="40" placeholder="Ej. 14 o 14-B" value="${esc(t.casa)}" />
      <label class="form-field" for="fCom">Comentario</label><textarea id="fCom" maxlength="300" placeholder="Ej. Frente a la casa 14, junto al poste">${esc(t.comentario)}</textarea>
      <label class="form-field" for="fLargo">Largo</label><input id="fLargo" type="range" min="10" max="60" value="${t.largo}" />
      <label class="form-field" for="fAng">Ángulo</label><input id="fAng" type="range" min="0" max="179" value="${t.angulo}" />
      <div class="actions"><button type="button" class="btn outline" id="fRot">Girar 90°</button><button type="button" class="btn outline danger" id="fDel">Quitar túmulo</button></div>
      <p class="input-note">Arrastra el túmulo en el mapa para moverlo.</p>`;
    const touch = () => { persist(); renderStats(); renderMap(); };
    q('#fEstado').onchange = e => { t.estado = e.target.value; if (t.estado === 'instalado' && !t.fechaInstalacion) t.fechaInstalacion = today(); persist(); renderAll(); };
    q('#fFecha').onchange = e => { t.fechaInstalacion = e.target.value || null; persist(); renderSelection(); };
    q('#fPol').oninput = e => { const v = e.target.value.trim(); t.poligono = v === '' ? null : Math.min(70, Math.max(1, parseInt(v, 10) || 1)); t.poligonoVerificado = true; q('#fPolNote').textContent = ''; touch(); };
    q('#fCasa').oninput = e => { t.casa = e.target.value.trim(); touch(); };
    q('#fCom').oninput = e => { t.comentario = e.target.value; touch(); };
    q('#fLargo').oninput = e => { t.largo = +e.target.value; touch(); };
    q('#fAng').oninput = e => { t.angulo = +e.target.value; touch(); };
    q('#fRot').onclick = () => { t.angulo = (t.angulo + 90) % 180; q('#fAng').value = t.angulo; touch(); };
    q('#fDel').onclick = () => { if (!confirm('¿Quitar ' + t.id + ' del mapa?')) return; data.tumulos = data.tumulos.filter(v => v.id !== t.id); selId = null; persist(); renderAll(); };
  }
  function renderAll() { renderStats(); renderMap(); renderSelection(); }
  function select(id) { selId = id; renderMap(); renderSelection(); }

  /* ---------- edición ---------- */
  function setEdit(on) {
    edit = on && admin(); on = edit; adding = false;
    q('#tEditToggle').textContent = on ? 'Salir del modo edición' : 'Activar modo edición';
    q('#tEditToggle').setAttribute('aria-pressed', on);
    q('#tEditTools').classList.toggle('hidden', !on);
    vp.classList.toggle('editing', on); vp.classList.remove('adding');
    q('#tAdd').textContent = '＋ Agregar túmulo';
    renderSelection();
  }
  function setAdding(on) {
    adding = on; vp.classList.toggle('adding', on);
    q('#tAdd').textContent = on ? 'Cancelar (toca el mapa para colocar)' : '＋ Agregar túmulo';
    if (on) { selId = null; renderMap(); }
    renderSelection();
  }
  function addAt(clientX, clientY) {
    if (!admin()) return;
    const r = vp.getBoundingClientRect(), ux = (clientX - r.left - tx) / sc, uy = (clientY - r.top - ty) / sc;
    if (ux < 0 || ux > W || uy < 0 || uy > H) return;
    const x = +(ux / W * 100).toFixed(4), y = +(uy / H * 100).toFixed(4);
    const n = data.tumulos.reduce((m, t) => Math.max(m, parseInt(t.id.replace(/\D/g, ''), 10) || 0), 0) + 1;
    const t = { id: 'TUM-' + String(n).padStart(3, '0'), x, y, angulo: 0, largo: 20, estado: 'pendiente', fechaInstalacion: null, poligono: nearestPoly(x, y), poligonoVerificado: false, casa: '', comentario: '' };
    data.tumulos.push(t); selId = t.id; adding = false; vp.classList.remove('adding'); q('#tAdd').textContent = '＋ Agregar túmulo';
    persist(); renderAll();
  }
  function exportJson() {
    if (!admin()) return;
    data.actualizado = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tumulos.json';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- zoom y arrastre ---------- */
  function apply() { content.style.transform = `translate(${tx}px,${ty}px) scale(${sc})`; placePop(); }
  function fit() {
    const r = vp.getBoundingClientRect(); if (!r.width || !r.height) return false;
    sc = Math.min(r.width / W, r.height / H); tx = (r.width - W * sc) / 2; ty = (r.height - H * sc) / 2; fitted = true; apply(); return true;
  }
  function zoom(f, cx = vp.clientWidth / 2, cy = vp.clientHeight / 2) {
    const ns = Math.min(5, Math.max(.15, sc * f)), ix = (cx - tx) / sc, iy = (cy - ty) / sc;
    tx = cx - ix * ns; ty = cy - iy * ns; sc = ns; apply();
  }
  q('#tZoomIn').onclick = () => zoom(1.3); q('#tZoomOut').onclick = () => zoom(1 / 1.3); q('#tReset').onclick = fit;
  vp.addEventListener('wheel', e => { e.preventDefault(); const r = vp.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  vp.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !data) return;
    const g = e.target.closest && e.target.closest('[data-id]'), id = g ? g.dataset.id : null;
    ptr = { x: e.clientX, y: e.clientY, tx, ty, hit: id, moved: false, drag: false };
    if (id && edit && admin()) { const t = find(id); ptr.drag = true; ptr.ox = t.x; ptr.oy = t.y; if (selId !== id) select(id); }
  });
  vp.addEventListener('pointermove', e => {
    if (!ptr) return;
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    if (!ptr.moved && Math.hypot(dx, dy) > 5) { ptr.moved = true; try { vp.setPointerCapture(e.pointerId); } catch { } vp.classList.add('dragging'); }
    if (!ptr.moved) return;
    if (ptr.drag) {
      const t = find(ptr.hit);
      t.x = Math.min(100, Math.max(0, +(ptr.ox + dx / sc / W * 100).toFixed(4)));
      t.y = Math.min(100, Math.max(0, +(ptr.oy + dy / sc / H * 100).toFixed(4)));
      const g = svg.querySelector(`[data-id="${t.id}"]`); if (g) setGeom(g, t); placePop();
    } else { tx = ptr.tx + dx; ty = ptr.ty + dy; apply(); }
  });
  vp.addEventListener('pointerup', e => {
    if (!ptr) return;
    const p = ptr; ptr = null; vp.classList.remove('dragging');
    if (p.moved) { if (p.drag) persist(); return; }
    if (adding && !p.hit) addAt(e.clientX, e.clientY);
    else if (p.hit) select(p.hit);
    else if (selId) select(null);
  });
  vp.addEventListener('pointercancel', () => { ptr = null; vp.classList.remove('dragging'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && adding) setAdding(false); });

  /* ---------- controles ---------- */
  q('#tFilter').onchange = renderMap; q('#tData').onchange = renderMap; q('#tSearch').oninput = renderMap;
  q('#tEditToggle').onclick = () => setEdit(!edit);
  q('#tAdd').onclick = () => setAdding(!adding);
  q('#tExport').onclick = exportJson;
  q('#tImport').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f || !admin()) return;
    try { data = validate(JSON.parse(await f.text())); selId = null; persist(); renderAll(); }
    catch (err) { alert('No se pudo importar: ' + err.message); }
  };
  q('#tDiscard').onclick = () => {
    if (!admin() || !confirm('¿Descartar los cambios guardados en este navegador y volver a la versión publicada?')) return;
    data = clone(base); selId = null; persist(); renderAll();
  };

  /* ---------- pestañas ---------- */
  function showTab(name, push = true) {
    const tum = name === 'tumulos';
    q('#panel-alto').classList.toggle('hidden', tum); q('#panel-tumulos').classList.toggle('hidden', !tum);
    for (const b of document.querySelectorAll('.tab-btn')) { const on = b.dataset.tab === name; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); }
    if (push) history.replaceState(null, '', tum ? '#tumulos' : location.pathname + location.search);
    if (tum) { if (!fitted) fit(); placePop(); }
    else if (typeof window.fit === 'function' && typeof scale === 'number' && scale < 0.05) window.fit(); // mapa de alto: recalcular si cambió el tamaño mientras estaba oculto
  }
  for (const b of document.querySelectorAll('.tab-btn')) b.onclick = () => showTab(b.dataset.tab);
  window.addEventListener('resize', () => { if (!q('#panel-tumulos').classList.contains('hidden') && window.innerWidth < 801) fit(); });

  /* Al entrar o salir del modo administrador: el público ve lo publicado; el administrador ve además su borrador local. */
  function applyMode() {
    if (!base) return;
    data = clone(base);
    if (admin()) { try { const s = localStorage.getItem(KEY); if (s) data = validate(JSON.parse(s)); } catch { data = clone(base); } }
    q('#tAdminArea').classList.toggle('hidden', !admin());
    q('#tLocalNote').classList.toggle('hidden', !(admin() && dirty()));
    selId = null; setEdit(false); renderAll();
  }

  /* ---------- arranque ---------- */
  async function init() {
    try {
      const [r1, r2] = await Promise.all([fetch('tumulos.json', { cache: 'no-store' }), fetch('poligonos.json')]);
      if (!r1.ok) throw Error('HTTP ' + r1.status);
      base = validate(await r1.json());
      polys = r2.ok ? (await r2.json()).poligonos || [] : [];
      applyMode();
      AdminAuth.onChange(applyMode);
      if (location.hash === '#tumulos') showTab('tumulos', false);
    } catch (err) {
      q('#tSelection').innerHTML = '<h2>Error de carga</h2><p>No se pudo abrir tumulos.json: ' + esc(err.message) + '. Publica este proyecto mediante GitHub Pages o un servidor local; no abras index.html directamente con file://.</p>';
    }
  }
  init();
})();
