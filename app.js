'use strict';
const IMAGE_W=1639, IMAGE_H=959;
const $=s=>document.querySelector(s);
let data=null, selectedId=null;
let scale=1, tx=0, ty=0, pointer=null, moved=false;
const viewport=$('#viewport'), content=$('#mapContent');
const statusNames={pendiente:'Pendiente',proceso:'En proceso',instalada:'Instalada'};
function encode(str){return String(str??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function validate(value){if(!value||!Array.isArray(value.senales))throw Error('El archivo no contiene una lista de señales.');let ids=new Set();for(const p of value.senales){if(typeof p.id!=='string'||ids.has(p.id)||typeof p.x!=='number'||typeof p.y!=='number'||p.x<0||p.x>100||p.y<0||p.y>100||!statusNames[p.estado])throw Error('Señal inválida o identificador duplicado: '+String(p.id));ids.add(p.id)}return value;}
function render(){const s=data.senales;$('#total').textContent=s.length;$('#pending').textContent=s.filter(p=>p.estado==='pendiente').length;$('#working').textContent=s.filter(p=>p.estado==='proceso').length;let installed=s.filter(p=>p.estado==='instalada').length;$('#done').textContent=installed;let pct=s.length?Math.round(100*installed/s.length):0;$('#percentage').textContent=pct+'%';$('#progressFill').style.width=pct+'%';$('#updateDate').textContent='Actualización publicada: '+(data.actualizado||'sin fecha');renderMarkers();renderSelection();}
function renderMarkers(){const filter=$('#filter').value,q=$('#search').value.trim().toLowerCase();$('#markers').replaceChildren();for(let p of data.senales){if(filter!=='todos'&&p.estado!==filter)continue;if(q&&!p.id.toLowerCase().includes(q)&&!(p.poligono!=null&&String(p.poligono).includes(q)))continue;let b=document.createElement('button');b.type='button';b.className='marker '+p.estado+(p.id===selectedId?' selected':'');b.style.left=p.x+'%';b.style.top=p.y+'%';b.title=p.id+' · '+statusNames[p.estado];b.setAttribute('aria-label',b.title);b.addEventListener('click',ev=>{ev.stopPropagation();if(!moved){selectedId=p.id;render();}});$('#markers').append(b);}}
function renderSelection(){
 const el=$('#selection'),p=data.senales.find(v=>v.id===selectedId);
 if(!p){el.innerHTML='<h2>Selecciona una señal</h2><p>Toca cualquier marcador para consultar sus detalles.</p>';return;}
 if(window.AltosAdmin&&AltosAdmin.renderSelection(el,p))return;
 el.innerHTML=`<div class="id">${encode(p.id)}</div><span class="status-pill">${statusNames[p.estado]}</span><div class="detail"><b>Polígono:</b> ${p.poligono??'Sin asignar'}</div><div class="detail"><b>Fecha de instalación:</b> ${encode(p.fechaInstalacion||'No registrada')}</div><div class="detail"><b>Observaciones:</b> ${encode(p.observaciones||'Ninguna')}</div>`;
}
function transform(){content.style.transform=`translate(${tx}px,${ty}px) scale(${scale})`;}
function fit(){let r=viewport.getBoundingClientRect();scale=Math.min(r.width/IMAGE_W,r.height/IMAGE_H);tx=(r.width-IMAGE_W*scale)/2;ty=(r.height-IMAGE_H*scale)/2;transform();}
function zoom(f,cx=viewport.clientWidth/2,cy=viewport.clientHeight/2){let ns=Math.min(5,Math.max(.15,scale*f)),ix=(cx-tx)/scale,iy=(cy-ty)/scale;tx=cx-ix*ns;ty=cy-iy*ns;scale=ns;transform();}
$('#zoomIn').onclick=()=>zoom(1.3);$('#zoomOut').onclick=()=>zoom(1/1.3);$('#reset').onclick=fit;
viewport.addEventListener('wheel',e=>{e.preventDefault();let r=viewport.getBoundingClientRect();zoom(e.deltaY<0?1.12:1/1.12,e.clientX-r.left,e.clientY-r.top);},{passive:false});
viewport.addEventListener('pointerdown',e=>{if(e.button!==0)return;pointer={x:e.clientX,y:e.clientY,tx,ty};moved=false;});
viewport.addEventListener('pointermove',e=>{if(!pointer)return;let dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;if(!moved&&Math.hypot(dx,dy)>5){moved=true;try{viewport.setPointerCapture(e.pointerId)}catch(_){}}if(moved){tx=pointer.tx+dx;ty=pointer.ty+dy;transform();viewport.classList.add('dragging');}});
viewport.addEventListener('pointerup',e=>{if(!pointer)return;pointer=null;viewport.classList.remove('dragging');});
$('#filter').onchange=renderMarkers;$('#search').oninput=renderMarkers;
async function init(){try{let r=await fetch('senales.json',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);data=validate(await r.json());if(window.AltosAdmin)data=AltosAdmin.load(data);render();fit();window.addEventListener('resize',()=>{if(window.innerWidth<801)fit();});}catch(err){$('#selection').innerHTML='<h2>Error de carga</h2><p>No se pudo abrir senales.json: '+encode(err.message)+'. Publica este proyecto mediante GitHub Pages o un servidor local; no abras index.html directamente con file://.</p>';}}
init();
