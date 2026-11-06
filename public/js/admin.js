// =====================================================================
// SANTOS STORE · Panel de administración (navegador)
// Secciones: Inicio, Pedidos, Productos y Configuración.
// Se entra con correo y contraseña; la sesión dura 7 días en una cookie segura.
// =====================================================================

// Atajos para buscar elementos.
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// Estados de pedido en orden.
const ESTADOS = ['Nuevo', 'Pago confirmado', 'Despachado', 'Entregado', 'Cancelado'];
// Categorías sugeridas en el formulario.
const CATEGORIAS = ['Camisetas', 'Pantalones', 'Pantalonetas', 'Sudaderas', 'Mochos'];

// Correo de la cuenta con sesión abierta (la sesión vive en una cookie segura que el JavaScript no puede leer).
let correoSesion = '';

// Formato de pesos: 89900 → "$89.900"
const pesos = (n) => '$' + Math.round(n || 0).toLocaleString('es-CO');

// Escapa HTML para mostrar textos de forma segura.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Fecha legible en hora de Colombia: "5 nov, 3:20 p. m."
const fecha = (iso) => new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// Aviso breve.
let tAviso;
function aviso(msg, error = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', error);
  t.classList.add('visible');
  clearTimeout(tAviso);
  tAviso = setTimeout(() => t.classList.remove('visible'), 2600);
}

// Llamada a la API del panel. La cookie de sesión viaja sola; "x-panel" confirma que la petición sale de este panel.
async function api(ruta, opciones = {}, { volverAlIngreso = true } = {}) {
  const headers = { 'x-panel': '1', ...(opciones.body && !(opciones.body instanceof Blob) ? { 'content-type': 'application/json' } : {}), ...opciones.headers };
  const r = await fetch(ruta, { ...opciones, headers, credentials: 'same-origin' });
  const datos = await r.json().catch(() => ({}));
  // Sesión vencida: vuelve a la pantalla de ingreso.
  if (r.status === 401 && volverAlIngreso) { mostrarIngreso(true); throw new Error(datos.error || 'Tu sesión terminó'); }
  if (!r.ok) throw new Error(datos.error || 'Error de conexión');
  return datos;
}

// ---------------------------------------------------------------------
// Ingreso y salida
// ---------------------------------------------------------------------
// Muestra el formulario que corresponda: crear la primera cuenta o entrar.
async function mostrarIngreso(soloEntrar = false) {
  $('#panel').hidden = true;
  $('#login').hidden = false;
  let hayAdmin = true;
  if (!soloEntrar) {
    try { hayAdmin = (await api('/api/admin/estado', {}, { volverAlIngreso: false })).hay_admin; } catch { /* asume que ya hay cuenta */ }
  }
  // Con enlace de invitación se muestra "Crear cuenta"; si no, "Entrar" (o un aviso si aún no hay cuentas).
  const conInvitacion = Boolean(invitacion());
  $('#form-registro').hidden = !conInvitacion;
  $('#form-login').hidden = conInvitacion || !hayAdmin;
  $('#sin-cuenta').hidden = conInvitacion || hayAdmin;
  (conInvitacion ? $('#reg-correo') : $('#correo')).focus();
}

// Token del enlace de invitación (/admin/#crear=<token>), o cadena vacía.
function invitacion() {
  const m = location.hash.match(/^#crear=([0-9a-f]{64})$/);
  return m ? m[1] : '';
}

// Abre el panel después de entrar.
function abrirPanel(correo) {
  correoSesion = correo;
  $('#login').hidden = true;
  $('#panel').hidden = false;
  navegar();
}

// Cierra la sesión en el servidor y vuelve al ingreso.
async function salir() {
  try { await api('/api/admin/salir', { method: 'POST' }, { volverAlIngreso: false }); } catch { /* igual se muestra el ingreso */ }
  correoSesion = '';
  mostrarIngreso(true);
}

// Muestra un error dentro del formulario.
function errorForm(id, msg) {
  const e = $(id);
  e.textContent = msg; e.hidden = !msg;
}

// Entrar con correo y contraseña.
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter; btn.disabled = true;
  try {
    const r = await api('/api/admin/entrar', { method: 'POST', body: JSON.stringify({ correo: $('#correo').value, contrasena: $('#contrasena').value }) }, { volverAlIngreso: false });
    $('#contrasena').value = '';
    errorForm('#error-login', '');
    abrirPanel(r.correo);
  } catch (ex) {
    errorForm('#error-login', ex.message);
  } finally { btn.disabled = false; }
});

// Crear la primera cuenta (solo aparece cuando no hay ninguna).
$('#form-registro').addEventListener('submit', async (e) => {
  e.preventDefault();
  if ($('#reg-contrasena').value !== $('#reg-contrasena2').value) return errorForm('#error-registro', 'Las contraseñas no coinciden');
  const btn = e.submitter; btn.disabled = true;
  try {
    const r = await api('/api/admin/registro', { method: 'POST', body: JSON.stringify({
      invitacion: invitacion(), correo: $('#reg-correo').value, contrasena: $('#reg-contrasena').value,
    }) }, { volverAlIngreso: false });
    ['#reg-contrasena', '#reg-contrasena2'].forEach((id) => ($(id).value = ''));
    history.replaceState(null, '', '/admin/#inicio');   // Quita el token de la barra de direcciones
    errorForm('#error-registro', '');
    aviso('Cuenta creada ✓');
    abrirPanel(r.correo);
  } catch (ex) {
    errorForm('#error-registro', ex.message);
  } finally { btn.disabled = false; }
});

$('#salir').addEventListener('click', salir);

// ---------------------------------------------------------------------
// Navegación entre secciones (#inicio, #pedidos, #productos, #config, #producto/ID)
// ---------------------------------------------------------------------
async function navegar() {
  const [sec, arg] = (location.hash.slice(1) || 'inicio').split('/');
  // Marca la sección activa del menú.
  $$('.lateral [data-sec]').forEach((a) => a.toggleAttribute('aria-current', a.dataset.sec === (sec === 'producto' ? 'productos' : sec)));
  // Reemplaza el contenedor para limpiar eventos anteriores.
  const viejo = $('#contenido');
  const c = viejo.cloneNode(false);
  viejo.replaceWith(c);
  c.innerHTML = '<p>Cargando…</p>';
  window.scrollTo(0, 0);
  try {
    if (sec === 'pedidos') await seccionPedidos(c, arg);
    else if (sec === 'productos') await seccionProductos(c);
    else if (sec === 'producto') await seccionFormProducto(c, arg);
    else if (sec === 'config') await seccionConfig(c);
    else await seccionInicio(c);
  } catch (ex) {
    c.innerHTML = `<div class="caja">No se pudo cargar: ${esc(ex.message)}</div>`;
  }
}
window.addEventListener('hashchange', () => { if (correoSesion) navegar(); });

// ---------------------------------------------------------------------
// Inicio: tarjetas de resumen y últimos pedidos
// ---------------------------------------------------------------------
async function seccionInicio(c) {
  const [r, pedidos] = await Promise.all([api('/api/admin/resumen'), api('/api/admin/pedidos?estado=Nuevo')]);
  c.innerHTML = `
    <h1>Hola 👋</h1>
    <div class="tarjetas">
      <a class="tarjeta-res ${r.pedidos_nuevos ? 'alerta' : ''}" href="#pedidos/Nuevo"><small>Pedidos nuevos</small><b>${r.pedidos_nuevos}</b></a>
      <a class="tarjeta-res ${r.pendientes_pago ? 'alerta' : ''}" href="#pedidos/Nuevo"><small>Pendientes de pago</small><b>${r.pendientes_pago}</b></a>
      <div class="tarjeta-res"><small>Ventas de hoy (${r.pedidos_hoy})</small><b>${pesos(r.ventas_hoy)}</b></div>
      <a class="tarjeta-res ${r.productos_agotados ? 'alerta' : ''}" href="#productos"><small>Productos agotados</small><b>${r.productos_agotados}</b></a>
    </div>
    <h2 style="font-size:18px">Pedidos por atender</h2>
    <div id="lista"></div>`;
  pintarPedidos($('#lista', c), pedidos, () => navegar());
}

// ---------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------
async function seccionPedidos(c, filtro) {
  const estado = ESTADOS.includes(decodeURIComponent(filtro || '')) ? decodeURIComponent(filtro) : '';
  const pedidos = await api('/api/admin/pedidos' + (estado ? `?estado=${encodeURIComponent(estado)}` : ''));
  c.innerHTML = `
    <h1>Pedidos</h1>
    <div class="tabs">
      <button class="tab" data-e="" aria-pressed="${!estado}">Todos</button>
      ${ESTADOS.map((e) => `<button class="tab" data-e="${e}" aria-pressed="${estado === e}">${e}</button>`).join('')}
    </div>
    <div id="lista"></div>`;
  // Cambiar de pestaña.
  c.addEventListener('click', (ev) => {
    const t = ev.target.closest('.tab');
    if (t) location.hash = t.dataset.e ? `#pedidos/${encodeURIComponent(t.dataset.e)}` : '#pedidos';
  });
  pintarPedidos($('#lista', c), pedidos, () => navegar());
}

// Dibuja una lista de pedidos con su selector de estado.
function pintarPedidos(cont, pedidos, alCambiar) {
  if (!pedidos.length) { cont.innerHTML = '<div class="caja">No hay pedidos aquí.</div>'; return; }
  cont.innerHTML = pedidos.map((p) => {
    // Enlace para escribirle al cliente por WhatsApp.
    let cel = p.celular.replace(/\D/g, '');
    if (cel.length === 10) cel = '57' + cel;
    const msg = `Hola ${p.cliente_nombre.split(' ')[0]}, te escribimos de SANTOS STORE por tu pedido ${p.codigo} (${pesos(p.total)}).`;
    return `
      <article class="pedido">
        <div class="pedido-cab">
          <div><b>${esc(p.codigo)}</b> · ${esc(p.cliente_nombre)}<br><small>${fecha(p.creado_en)} · ${p.metodo_pago === 'transferencia' ? 'Transferencia/QR' : 'Contraentrega'}</small></div>
          <span class="estado" data-e="${esc(p.estado)}">${esc(p.estado)}</span>
        </div>
        <ul>${p.items.map((i) => `<li>${esc(i.nombre)} · ${esc(i.talla)}${i.color ? ` · ${esc(i.color)}` : ''} × ${i.cantidad} — ${pesos(i.precio * i.cantidad)}</li>`).join('')}</ul>
        <small>📍 ${esc(p.direccion)}, ${esc(p.barrio)}${p.notas ? ` · 📝 ${esc(p.notas)}` : ''}</small><br>
        <small>Subtotal ${pesos(p.subtotal)} + domicilio ${pesos(p.domicilio)} = <b style="color:var(--negro)">${pesos(p.total)}</b></small>
        <div class="pedido-acc">
          <select data-id="${p.id}" aria-label="Cambiar estado" ${p.estado === 'Cancelado' ? 'disabled' : ''}>
            ${ESTADOS.map((e) => `<option ${e === p.estado ? 'selected' : ''}>${e}</option>`).join('')}
          </select>
          <a class="btn btn-wa btn-peq" href="https://wa.me/${cel}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">WhatsApp</a>
          <a class="btn btn-sec btn-peq" href="tel:${esc(p.celular)}">Llamar</a>
        </div>
      </article>`;
  }).join('');
  // Cambiar estado.
  cont.addEventListener('change', async (ev) => {
    const s = ev.target.closest('select[data-id]');
    if (!s) return;
    // Cancelar devuelve el stock: pedimos confirmación en la misma página (sin ventanas emergentes).
    if (s.value === 'Cancelado' && !s.dataset.confirmado) {
      s.dataset.confirmado = '1';
      aviso('Vuelve a elegir "Cancelado" para confirmar. Las unidades vuelven al stock.');
      s.value = pedidos.find((p) => p.id === Number(s.dataset.id)).estado;
      return;
    }
    try {
      await api(`/api/admin/pedidos/${s.dataset.id}`, { method: 'PATCH', body: JSON.stringify({ estado: s.value }) });
      aviso(`Pedido actualizado: ${s.value}`);
      alCambiar();
    } catch (ex) { aviso(ex.message, true); }
  });
}

// ---------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------
async function seccionProductos(c) {
  const productos = await api('/api/admin/productos');
  c.innerHTML = `
    <h1>Productos <a class="btn btn-peq" href="#producto/nuevo">+ Nuevo producto</a></h1>
    <div class="campo"><input id="buscar" type="search" placeholder="Buscar producto…" aria-label="Buscar producto"></div>
    <div id="lista"></div>`;
  const pintar = (q = '') => {
    const lista = productos.filter((p) => (p.nombre + p.categoria).toLowerCase().includes(q.toLowerCase()));
    $('#lista', c).innerHTML = lista.map((p) => {
      const stock = Object.values(p.tallas).reduce((a, b) => a + b, 0);
      const d = p.precio_anterior > p.precio ? Math.round((1 - p.precio / p.precio_anterior) * 100) : 0;
      return `
        <div class="prod">
          <a href="#producto/${p.id}"><img src="${esc(p.fotos[0] || '/img/sin-foto.svg')}" alt=""></a>
          <a href="#producto/${p.id}">
            <h3>${esc(p.nombre)}</h3>
            <small>${esc(p.categoria)} · ${pesos(p.precio)}${d ? ` <span style="color:var(--dorado-oscuro)">(-${d}%)</span>` : ''}</small>
            <small>Stock: ${stock} ${stock === 0 ? '⚠️' : ''} · ${Object.entries(p.tallas).map(([t, s]) => `${esc(t)}:${s}`).join(' ')}</small>
          </a>
          <div class="prod-der">
            <label class="switch">Agotado <input type="checkbox" data-agot="${p.id}" ${p.agotado_manual ? 'checked' : ''}></label>
            <a class="btn btn-sec btn-peq" href="#producto/${p.id}">Editar</a>
          </div>
        </div>`;
    }).join('') || '<div class="caja">No hay productos.</div>';
  };
  $('#buscar', c).addEventListener('input', (e) => pintar(e.target.value));
  // Interruptor de agotado.
  c.addEventListener('change', async (e) => {
    const sw = e.target.closest('[data-agot]');
    if (!sw) return;
    try {
      const p = await api(`/api/admin/productos/${sw.dataset.agot}`, { method: 'PATCH', body: JSON.stringify({ agotado: sw.checked }) });
      Object.assign(productos.find((x) => x.id === p.id), p);
      aviso(sw.checked ? 'Marcado como agotado' : 'Disponible de nuevo');
    } catch (ex) { sw.checked = !sw.checked; aviso(ex.message, true); }
  });
  pintar();
}

// Formulario para crear o editar un producto.
async function seccionFormProducto(c, id) {
  const nuevo = id === 'nuevo';
  // Datos del producto (o valores vacíos si es nuevo).
  const p = nuevo
    ? { nombre: '', descripcion: '', categoria: 'Camisetas', precio: '', precio_anterior: '', colores: [{ nombre: 'Negro', hex: '#111111' }], tallas: { S: 0, M: 0, L: 0 }, fotos: [], video: null, agotado_manual: false, destacado: false }
    : (await api('/api/admin/productos')).find((x) => x.id === Number(id));
  if (!p) { c.innerHTML = '<div class="caja">Producto no encontrado.</div>'; return; }
  // Copias editables.
  let fotos = [...p.fotos];
  let video = p.video;
  const colores = p.colores.map((x) => ({ ...x }));
  const tallas = Object.entries(p.tallas).map(([t, s]) => ({ t, s }));

  c.innerHTML = `
    <h1>${nuevo ? 'Nuevo producto' : 'Editar producto'} <a class="btn btn-sec btn-peq" href="#productos">← Volver</a></h1>
    <form id="form" novalidate>
      <div class="caja">
        <h3>Fotos y video</h3>
        <p style="font-size:13px;color:var(--gris-texto);margin-top:0">La primera foto es la portada. Fotos JPG, PNG o WEBP hasta 10 MB. Video MP4 hasta 90 MB.</p>
        <div class="fotos-ed" id="fotos"></div>
      </div>
      <div class="caja form-grid">
        <div class="campo ancho"><label for="f-nombre">Nombre</label><input id="f-nombre" value="${esc(p.nombre)}" required></div>
        <div class="campo"><label for="f-cat">Categoría</label>
          <input id="f-cat" list="cats" value="${esc(p.categoria)}" required>
          <datalist id="cats">${CATEGORIAS.map((x) => `<option value="${x}">`).join('')}</datalist></div>
        <div class="campo"><label for="f-precio">Precio de venta</label><input id="f-precio" type="number" inputmode="numeric" min="0" step="100" value="${esc(p.precio)}" placeholder="89900" required></div>
        <div class="campo"><label for="f-ant">Precio antes del descuento (opcional)</label><input id="f-ant" type="number" inputmode="numeric" min="0" step="100" value="${esc(p.precio_anterior ?? '')}" placeholder="119900"></div>
        <div class="campo" style="align-self:end"><small id="f-desc" style="color:var(--dorado-oscuro);font-weight:600"></small></div>
        <div class="campo ancho"><label for="f-descripcion">Descripción corta</label><textarea id="f-descripcion">${esc(p.descripcion)}</textarea></div>
      </div>
      <div class="caja">
        <h3>Tallas y stock</h3>
        <div class="filas" id="tallas"></div>
        <button type="button" class="btn btn-sec btn-peq" id="add-talla">+ Agregar talla</button>
      </div>
      <div class="caja">
        <h3>Colores</h3>
        <div class="filas" id="colores"></div>
        <button type="button" class="btn btn-sec btn-peq" id="add-color">+ Agregar color</button>
      </div>
      <div class="caja">
        <label class="check-lin"><input type="checkbox" id="f-dest" ${p.destacado ? 'checked' : ''}> Mostrar en "Lo más vendido"</label>
        <label class="check-lin"><input type="checkbox" id="f-agot" ${p.agotado_manual ? 'checked' : ''}> Marcar como agotado</label>
      </div>
      <p class="error-form" id="error" hidden></p>
      <div class="barra-guardar">
        <button class="btn" type="submit" id="guardar" style="flex:1">Guardar producto</button>
        ${nuevo ? '' : '<button class="btn btn-sec peligro" type="button" id="borrar">Eliminar</button>'}
      </div>
    </form>`;

  // Dibuja las fotos con botón para quitar y el recuadro para subir.
  const pintarFotos = () => {
    $('#fotos', c).innerHTML =
      fotos.map((f, i) => `<div class="foto-ed"><img src="${esc(f)}" alt="">${i === 0 ? '<span class="portada">PORTADA</span>' : ''}<button type="button" data-qf="${i}" aria-label="Quitar foto">✕</button></div>`).join('') +
      (video ? `<div class="foto-ed"><video src="${esc(video)}" muted></video><span class="portada">VIDEO</span><button type="button" data-qv aria-label="Quitar video">✕</button></div>` : '') +
      `<label class="subir">+ Foto${video ? '' : '<br>o video'}<input type="file" accept="image/jpeg,image/png,image/webp${video ? '' : ',video/mp4,video/webm'}" multiple id="archivo"></label>`;
  };
  // Filas de tallas: nombre de talla + unidades.
  const pintarTallas = () => {
    $('#tallas', c).innerHTML = tallas.map((x, i) => `
      <div class="fila-ed"><input value="${esc(x.t)}" data-tt="${i}" placeholder="Talla (S, M, 38…)" aria-label="Talla">
      <input type="number" inputmode="numeric" min="0" value="${x.s}" data-ts="${i}" aria-label="Unidades" placeholder="Unidades">
      <button type="button" data-qt="${i}" aria-label="Quitar talla">✕</button></div>`).join('');
  };
  // Filas de colores: nombre + selector de color.
  const pintarColores = () => {
    $('#colores', c).innerHTML = colores.map((x, i) => `
      <div class="fila-ed"><input value="${esc(x.nombre)}" data-cn="${i}" placeholder="Nombre del color" aria-label="Color">
      <input type="color" value="${esc(x.hex)}" data-ch="${i}" aria-label="Tono">
      <button type="button" data-qc="${i}" aria-label="Quitar color">✕</button></div>`).join('');
  };
  // Muestra el % de descuento calculado.
  const pintarDesc = () => {
    const pr = Number($('#f-precio', c).value), an = Number($('#f-ant', c).value);
    $('#f-desc', c).textContent = an > pr && pr > 0 ? `Descuento visible: -${Math.round((1 - pr / an) * 100)}%` : '';
  };
  pintarFotos(); pintarTallas(); pintarColores(); pintarDesc();

  // Escritura en los campos dinámicos.
  c.addEventListener('input', (e) => {
    const d = e.target.dataset;
    if (d.tt) tallas[d.tt].t = e.target.value;
    if (d.ts) tallas[d.ts].s = Number(e.target.value);
    if (d.cn) colores[d.cn].nombre = e.target.value;
    if (d.ch) colores[d.ch].hex = e.target.value;
    if (e.target.id === 'f-precio' || e.target.id === 'f-ant') pintarDesc();
  });
  // Botones de quitar y agregar.
  c.addEventListener('click', (e) => {
    const d = e.target.closest('button')?.dataset || {};
    if (d.qf !== undefined) { fotos.splice(Number(d.qf), 1); pintarFotos(); }
    if (d.qv !== undefined) { video = null; pintarFotos(); }
    if (d.qt !== undefined) { tallas.splice(Number(d.qt), 1); pintarTallas(); }
    if (d.qc !== undefined) { colores.splice(Number(d.qc), 1); pintarColores(); }
    if (e.target.id === 'add-talla') { tallas.push({ t: '', s: 0 }); pintarTallas(); }
    if (e.target.id === 'add-color') { colores.push({ nombre: '', hex: '#111111' }); pintarColores(); }
  });
  // Subida de archivos a R2, uno por uno.
  c.addEventListener('change', async (e) => {
    if (e.target.id !== 'archivo') return;
    const archivos = [...e.target.files];
    for (const f of archivos) {
      aviso(`Subiendo ${f.name}…`);
      try {
        const r = await api('/api/admin/media', { method: 'POST', body: f, headers: { 'content-type': f.type } });
        if (f.type.startsWith('video/')) video = r.url; else fotos.push(r.url);
        pintarFotos();
        aviso('Archivo subido ✓');
      } catch (ex) { aviso(`${f.name}: ${ex.message}`, true); }
    }
  });
  // Guardar.
  $('#form', c).addEventListener('submit', async (e) => {
    e.preventDefault();
    const datos = {
      nombre: $('#f-nombre', c).value,
      categoria: $('#f-cat', c).value,
      precio: Number($('#f-precio', c).value),
      precio_anterior: $('#f-ant', c).value ? Number($('#f-ant', c).value) : null,
      descripcion: $('#f-descripcion', c).value,
      colores: colores.filter((x) => x.nombre.trim()),
      tallas: Object.fromEntries(tallas.filter((x) => x.t.trim()).map((x) => [x.t.trim(), Math.max(0, Math.floor(x.s || 0))])),
      fotos,
      video,
      destacado: $('#f-dest', c).checked,
      agotado: $('#f-agot', c).checked,
    };
    const btn = $('#guardar', c);
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      await api(nuevo ? '/api/admin/productos' : `/api/admin/productos/${p.id}`, { method: nuevo ? 'POST' : 'PUT', body: JSON.stringify(datos) });
      aviso('Producto guardado ✓');
      location.hash = '#productos';
    } catch (ex) {
      $('#error', c).textContent = ex.message; $('#error', c).hidden = false;
      btn.disabled = false; btn.textContent = 'Guardar producto';
    }
  });
  // Eliminar (doble toque para confirmar, sin ventanas emergentes).
  $('#borrar', c)?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    if (!b.dataset.ok) { b.dataset.ok = '1'; b.textContent = 'Toca otra vez para eliminar'; return; }
    try {
      await api(`/api/admin/productos/${p.id}`, { method: 'DELETE' });
      aviso('Producto eliminado');
      location.hash = '#productos';
    } catch (ex) { aviso(ex.message, true); }
  });
}

// ---------------------------------------------------------------------
// Configuración de la tienda
// ---------------------------------------------------------------------
async function seccionConfig(c) {
  const cfg = await (await fetch('/api/config')).json();
  // Campos editables con su etiqueta y ayuda.
  const campos = [
    ['whatsapp', 'WhatsApp de pedidos', 'Celular de 10 dígitos o con 57 adelante'],
    ['direccion', 'Dirección de la tienda', ''],
    ['mapa', 'Ubicación para el mapa', 'Dirección o nombre como lo buscarías en Google Maps'],
    ['horario', 'Horario', ''],
    ['domicilio_costo', 'Costo del domicilio', 'En pesos, sin puntos'],
    ['domicilio_gratis_desde', 'Envío gratis desde', 'Subtotal en pesos. 0 = nunca gratis'],
    ['zonas', 'Zonas y tiempos de despacho', ''],
    ['nequi', 'Número Nequi', ''],
    ['daviplata', 'Número Daviplata', ''],
    ['instagram', 'Enlace de Instagram', ''],
    ['facebook', 'Enlace de Facebook', ''],
    ['tiktok', 'Enlace de TikTok', ''],
  ];
  c.innerHTML = `
    <h1>Configuración</h1>
    <form id="form-cfg" class="caja form-grid">
      ${campos.map(([k, l, h]) => `<div class="campo ${['zonas', 'horario', 'direccion'].includes(k) ? 'ancho' : ''}">
        <label for="c-${k}">${l}</label><input id="c-${k}" name="${k}" value="${esc(cfg[k])}" ${k.startsWith('domicilio') ? 'inputmode="numeric"' : ''}>
        ${h ? `<small style="color:var(--gris-texto)">${h}</small>` : ''}</div>`).join('')}
      <div class="ancho"><button class="btn" type="submit">Guardar cambios</button></div>
    </form>
    <h2 style="font-size:18px">Mi cuenta</h2>
    <form id="form-clave" class="caja form-grid" autocomplete="on">
      <div class="campo ancho"><label>Correo</label><input value="${esc(correoSesion)}" disabled autocomplete="username"></div>
      <div class="campo"><label for="cl-actual">Contraseña actual</label><input id="cl-actual" type="password" autocomplete="current-password" required></div>
      <div class="campo"><label for="cl-nueva">Contraseña nueva (mínimo 10 caracteres)</label><input id="cl-nueva" type="password" autocomplete="new-password" minlength="10" required></div>
      <p class="error-form ancho" id="error-clave" hidden></p>
      <div class="ancho"><button class="btn" type="submit">Cambiar contraseña</button></div>
    </form>`;
  // Cambiar contraseña (cierra las otras sesiones abiertas).
  $('#form-clave', c).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/contrasena', { method: 'PUT', body: JSON.stringify({ actual: $('#cl-actual', c).value, nueva: $('#cl-nueva', c).value }) }, { volverAlIngreso: false });
      $('#cl-actual', c).value = ''; $('#cl-nueva', c).value = '';
      errorForm('#error-clave', '');
      aviso('Contraseña cambiada ✓');
    } catch (ex) { errorForm('#error-clave', ex.message); }
  });
  $('#form-cfg', c).addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/admin/config', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(e.target))) });
      aviso('Configuración guardada ✓');
      navegar();
    } catch (ex) { aviso(ex.message, true); }
  });
}

// ---------------------------------------------------------------------
// Arranque: si ya hay una sesión abierta entra directo; si no, muestra el ingreso.
// ---------------------------------------------------------------------
api('/api/admin/estado', {}, { volverAlIngreso: false })
  .then((r) => (r.sesion && !invitacion() ? abrirPanel(r.sesion.correo) : mostrarIngreso()))
  .catch(() => mostrarIngreso(true));
