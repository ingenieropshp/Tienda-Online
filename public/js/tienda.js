// =====================================================================
// DUVAN STORE · Lógica de la tienda (navegador)
// Página única: cada pantalla se dibuja dentro de <main id="app"> según
// la parte de la dirección después del "#", por ejemplo #/producto/3.
// =====================================================================

// ---------- Estado global ----------
const estado = {
  productos: [],     // Catálogo traído de /api/productos
  config: {},        // WhatsApp, horario, domicilio... de /api/config
  carrito: leerCarrito(), // Productos que el cliente va agregando
  filtros: nuevosFiltros(), // Filtros activos del catálogo
};

// Orden de categorías en menús y accesos rápidos.
const CATEGORIAS = ['Camisas', 'Pantalones', 'Vestidos', 'Chaquetas', 'Zapatos', 'Accesorios'];
// Orden natural de tallas de ropa.
const ORDEN_TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Única'];

// Atajos para buscar elementos del HTML.
const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
// Contenedor donde se dibujan las pantallas (se reemplaza en cada navegación).
let app = $('#app');

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

// Formato de pesos colombianos: 89900 → "$89.900"
function pesos(n) {
  return '$' + Math.round(n || 0).toLocaleString('es-CO');
}

// Evita que un texto con < > & se interprete como HTML (seguridad).
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Porcentaje de descuento redondeado: 119900 → 89900 = 25
function descuento(p) {
  return p.precio_anterior > p.precio ? Math.round((1 - p.precio / p.precio_anterior) * 100) : 0;
}

// Ordena tallas: primero XS..XXL, luego números (37, 38...), luego el resto.
function ordenarTallas(lista) {
  return [...lista].sort((a, b) => {
    const ia = ORDEN_TALLAS.indexOf(a), ib = ORDEN_TALLAS.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return String(a).localeCompare(b);
  });
}

// Muestra un aviso breve en la parte de abajo.
let temporizadorToast;
function aviso(msg, esError = false) {
  const t = $('#toast');
  t.textContent = msg;                       // Texto del aviso
  t.classList.toggle('error', esError);      // Rojo si es error
  t.classList.add('visible');                // Lo muestra
  clearTimeout(temporizadorToast);
  temporizadorToast = setTimeout(() => t.classList.remove('visible'), 2600); // Lo oculta a los 2,6 s
}

// Llamada a la API con manejo de errores en español.
async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, { headers: { 'content-type': 'application/json' }, ...opciones });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || 'No se pudo conectar. Revisa tu internet.');
  return datos;
}

// Número de WhatsApp de la tienda (solo dígitos).
function numeroWa() {
  return String(estado.config.whatsapp || '').replace(/\D/g, '');
}

// Enlace de WhatsApp con un mensaje ya escrito.
function enlaceWa(mensaje) {
  return `https://wa.me/${numeroWa()}?text=${encodeURIComponent(mensaje)}`;
}

// ---------------------------------------------------------------------
// Carrito (se guarda en el navegador para no perderlo al recargar)
// ---------------------------------------------------------------------

// Lee el carrito guardado; si el navegador lo bloquea, empieza vacío.
function leerCarrito() {
  try {
    return JSON.parse(localStorage.getItem('ds_carrito') || '[]');
  } catch {
    return [];
  }
}

// Guarda el carrito y actualiza el contador del encabezado.
function guardarCarrito() {
  try {
    localStorage.setItem('ds_carrito', JSON.stringify(estado.carrito));
  } catch { /* Modo privado: el carrito vive solo mientras la página esté abierta */ }
  pintarContador();
}

// Actualiza el número sobre el ícono del carrito.
function pintarContador() {
  const n = estado.carrito.reduce((a, i) => a + i.cantidad, 0);
  const c = $('#contador');
  c.textContent = n;
  c.toggleAttribute('data-cero', n === 0);
}

// Agrega un producto (si ya está con la misma talla y color, suma la cantidad).
function agregarAlCarrito(p, talla, color, cantidad) {
  const existente = estado.carrito.find((i) => i.id === p.id && i.talla === talla && i.color === color);
  const stock = p.tallas[talla] ?? 0;
  const actual = existente ? existente.cantidad : 0;
  const nueva = Math.min(actual + cantidad, stock); // No permite pasar del stock
  if (nueva === actual) return aviso(`Solo hay ${stock} unidades en talla ${talla}`, true);
  if (existente) existente.cantidad = nueva;
  else estado.carrito.push({ id: p.id, talla, color, cantidad: nueva });
  guardarCarrito();
  aviso('Agregado al carrito ✓');
}

// Une cada línea del carrito con los datos actuales del producto.
function lineasCarrito() {
  return estado.carrito
    .map((i) => ({ ...i, p: estado.productos.find((p) => p.id === i.id) }))
    .filter((i) => i.p); // Descarta productos que ya no existen
}

// Calcula subtotal, domicilio y total con la configuración de la tienda.
function totales(lineas) {
  const subtotal = lineas.reduce((a, l) => a + l.p.precio * l.cantidad, 0);
  const costo = Number(estado.config.domicilio_costo || 0);
  const gratis = Number(estado.config.domicilio_gratis_desde || 0);
  const domicilio = subtotal === 0 ? 0 : gratis > 0 && subtotal >= gratis ? 0 : costo;
  return { subtotal, domicilio, total: subtotal + domicilio };
}

// ---------------------------------------------------------------------
// Filtros del catálogo
// ---------------------------------------------------------------------

// Filtros vacíos.
function nuevosFiltros() {
  return { cats: new Set(), colores: new Set(), tallas: new Set(), min: '', max: '', orden: 'nuevos', q: '' };
}

// Aplica filtros y orden a la lista de productos.
function filtrar(lista, f) {
  const q = f.q.trim().toLowerCase();
  let r = lista.filter((p) =>
    (!f.cats.size || f.cats.has(p.categoria)) &&                                   // Categoría
    (!f.colores.size || p.colores.some((c) => f.colores.has(c.nombre))) &&         // Color
    (!f.tallas.size || Object.entries(p.tallas).some(([t, s]) => s > 0 && f.tallas.has(t))) && // Talla con stock
    (f.min === '' || p.precio >= Number(f.min)) &&                                 // Precio mínimo
    (f.max === '' || p.precio <= Number(f.max)) &&                                 // Precio máximo
    (!q || (p.nombre + ' ' + p.categoria + ' ' + p.descripcion).toLowerCase().includes(q)), // Búsqueda
  );
  // Ordenar: los agotados siempre al final.
  const orden = { nuevos: (a, b) => b.id - a.id, menor: (a, b) => a.precio - b.precio, mayor: (a, b) => b.precio - a.precio }[f.orden];
  r = r.sort((a, b) => (a.agotado - b.agotado) || orden(a, b));
  return r;
}

// ---------------------------------------------------------------------
// Piezas reutilizables de HTML
// ---------------------------------------------------------------------

// Tarjeta de producto para las grillas.
function tarjeta(p) {
  const d = descuento(p);
  // Etiqueta: "Agotado" tiene prioridad sobre el descuento.
  const etq = p.agotado ? '<span class="etq etq-agot">Agotado</span>' : d ? `<span class="etq etq-desc">-${d}%</span>` : '';
  return `
    <a class="tarjeta ${p.agotado ? 'agotada' : ''}" href="#/producto/${p.id}">
      <div class="tarjeta-foto">
        <img src="${esc(p.fotos[0] || '/img/sin-foto.svg')}" alt="${esc(p.nombre)}" loading="lazy">
        ${etq}
      </div>
      <h3>${esc(p.nombre)}</h3>
      <div><span class="precio">${pesos(p.precio)}</span>${d ? `<span class="precio-ant">${pesos(p.precio_anterior)}</span>` : ''}</div>
      <div class="puntos">${p.colores.map((c) => `<span class="punto" style="background:${esc(c.hex)}" title="${esc(c.nombre)}"></span>`).join('')}</div>
    </a>`;
}

// Iconos de línea finos (SVG) para la franja de confianza e información.
const ICONOS = {
  efectivo: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v6M18 9v6"/></svg>',
  envio: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 6h11v9H3zM14 9h4l3 3v3h-7"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>',
  cambio: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 9h13l-3-3M20 15H7l3 3"/></svg>',
  chat: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 5h16v11H8l-4 4z"/><path d="M8 10h8M8 13h5"/></svg>',
  pin: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  reloj: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};

// Franja con los cuatro beneficios.
function franjaConfianza() {
  return `
    <section class="seccion seccion-gris"><div class="contenedor confianza">
      <div>${ICONOS.efectivo}Pago contraentrega</div>
      <div>${ICONOS.envio}Envíos rápidos</div>
      <div>${ICONOS.cambio}Cambios fáciles</div>
      <div>${ICONOS.chat}Atención por WhatsApp</div>
    </div></section>`;
}

// ---------------------------------------------------------------------
// Pantallas
// ---------------------------------------------------------------------

// 1. Inicio
function pantallaInicio() {
  // Productos con descuento y disponibles.
  const ofertas = estado.productos.filter((p) => descuento(p) && !p.agotado).slice(0, 8);
  // Destacados ("Lo más vendido").
  const vendidos = estado.productos.filter((p) => p.destacado && !p.agotado).slice(0, 8);
  // Categorías que tienen productos, con la foto del primero como portada.
  const cats = CATEGORIAS.map((c) => ({ c, p: estado.productos.find((p) => p.categoria === c) })).filter((x) => x.p);
  app.innerHTML = `
    <section class="hero"><div class="hero-in">
      <small>DUVAN STORE</small>
      <h1>Nueva Colección</h1>
      <p>Ropa, zapatos y accesorios con estilo urbano. Pide en minutos y paga al recibir.</p>
      <a class="btn" href="#/catalogo">Comprar ahora</a>
    </div></section>

    <section class="seccion"><div class="contenedor">
      <div class="seccion-cab"><h2>Categorías</h2></div>
      <div class="cats">
        ${cats.map(({ c, p }) => `<a class="cat" href="#/catalogo?cat=${encodeURIComponent(c)}"><img src="${esc(p.fotos[0] || '/img/sin-foto.svg')}" alt="" loading="lazy"><span>${esc(c)}</span></a>`).join('')}
      </div>
    </div></section>

    ${ofertas.length ? `<section class="seccion"><div class="contenedor">
      <div class="seccion-cab"><h2>Ofertas</h2><a href="#/catalogo?ofertas=1">Ver todo</a></div>
      <div class="grilla">${ofertas.map(tarjeta).join('')}</div>
    </div></section>` : ''}

    ${franjaConfianza()}

    ${vendidos.length ? `<section class="seccion"><div class="contenedor">
      <div class="seccion-cab"><h2>Lo más vendido</h2><a href="#/catalogo">Ver todo</a></div>
      <div class="grilla">${vendidos.map(tarjeta).join('')}</div>
    </div></section>` : ''}`;
}

// 2. Catálogo con filtros
function pantallaCatalogo(params) {
  const f = estado.filtros;
  // Si se entra desde un enlace de categoría o búsqueda, se aplican esos filtros.
  if (params.has('cat')) { f.cats = new Set([params.get('cat')]); }
  if (params.has('q')) { f.q = params.get('q'); }
  const soloOfertas = params.has('ofertas');

  // Valores disponibles para cada filtro, según el catálogo.
  const todasCats = CATEGORIAS.filter((c) => estado.productos.some((p) => p.categoria === c))
    .concat([...new Set(estado.productos.map((p) => p.categoria))].filter((c) => !CATEGORIAS.includes(c)));
  const colores = new Map();
  estado.productos.forEach((p) => p.colores.forEach((c) => colores.set(c.nombre, c.hex)));
  const tallas = ordenarTallas([...new Set(estado.productos.flatMap((p) => Object.keys(p.tallas)))]);

  // Título según el filtro.
  const titulo = soloOfertas ? 'Ofertas' : f.q ? `Resultados para "${esc(f.q)}"` : f.cats.size === 1 ? esc([...f.cats][0]) : 'Toda la tienda';

  // HTML de los filtros (se usa en la barra lateral y en el panel inferior del celular).
  const htmlFiltros = () => `
    <div class="filtro"><h4>Categoría</h4><div class="chips">
      ${todasCats.map((c) => `<button class="chip" data-f="cats" data-v="${esc(c)}" aria-pressed="${f.cats.has(c)}">${esc(c)}</button>`).join('')}
    </div></div>
    <div class="filtro"><h4>Color</h4><div class="chips">
      ${[...colores].map(([n, h]) => `<button class="chip chip-color" style="background:${esc(h)}" data-f="colores" data-v="${esc(n)}" aria-pressed="${f.colores.has(n)}" title="${esc(n)}"><span class="sr">${esc(n)}</span></button>`).join('')}
    </div></div>
    <div class="filtro"><h4>Talla</h4><div class="chips">
      ${tallas.map((t) => `<button class="chip" data-f="tallas" data-v="${esc(t)}" aria-pressed="${f.tallas.has(t)}">${esc(t)}</button>`).join('')}
    </div></div>
    <div class="filtro"><h4>Precio</h4><div class="rango">
      <input type="number" inputmode="numeric" placeholder="Mínimo" data-r="min" value="${esc(f.min)}" aria-label="Precio mínimo">
      <input type="number" inputmode="numeric" placeholder="Máximo" data-r="max" value="${esc(f.max)}" aria-label="Precio máximo">
    </div></div>
    <button class="btn btn-sec btn-bloque btn-peq" data-limpiar>Limpiar filtros</button>`;

  app.innerHTML = `
    <div class="contenedor">
      <div class="cat-cab"><h1>${titulo}</h1><p id="conteo"></p></div>
      <div class="barra-filtros">
        <button class="btn btn-sec btn-peq" id="btn-filtrar">Filtrar</button>
        <select id="orden" aria-label="Ordenar">
          <option value="nuevos">Más nuevos</option>
          <option value="menor">Menor precio</option>
          <option value="mayor">Mayor precio</option>
        </select>
      </div>
      <div class="catalogo">
        <aside class="filtros" id="filtros-lat">${htmlFiltros()}</aside>
        <div><div class="grilla" id="grilla"></div></div>
      </div>
    </div>`;

  // Dibuja la grilla con los filtros actuales.
  const pintar = () => {
    let lista = filtrar(estado.productos, f);
    if (soloOfertas) lista = lista.filter((p) => descuento(p));
    $('#conteo').textContent = `${lista.length} producto${lista.length === 1 ? '' : 's'}`;
    $('#grilla').innerHTML = lista.length
      ? lista.map(tarjeta).join('')
      : '<div class="vacio" style="grid-column:1/-1">No encontramos productos con esos filtros.<br><br><button class="btn btn-sec btn-peq" data-limpiar>Limpiar filtros</button></div>';
    // Actualiza el estado visual de los botones de filtro.
    $$('[data-f]').forEach((b) => b.setAttribute('aria-pressed', f[b.dataset.f].has(b.dataset.v)));
  };

  // Clics en chips de filtro o "Limpiar".
  app.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-f]');
    if (chip) {
      const conjunto = f[chip.dataset.f];
      conjunto.has(chip.dataset.v) ? conjunto.delete(chip.dataset.v) : conjunto.add(chip.dataset.v);
      return pintar();
    }
    if (e.target.closest('[data-limpiar]')) {
      Object.assign(f, nuevosFiltros(), { orden: f.orden });
      $$('[data-r]').forEach((i) => (i.value = ''));
      return pintar();
    }
  });
  // Cambios en el rango de precio.
  app.addEventListener('input', (e) => {
    if (e.target.dataset.r) { f[e.target.dataset.r] = e.target.value; pintar(); }
  });
  // Cambio de orden.
  $('#orden').value = f.orden;
  $('#orden').addEventListener('change', (e) => { f.orden = e.target.value; pintar(); });

  // Panel inferior de filtros en celular.
  $('#btn-filtrar').addEventListener('click', () => {
    const panel = document.createElement('div');
    panel.className = 'panel-filtros';
    panel.innerHTML = `<div class="menu-fondo" data-cerrar></div>
      <div class="hoja" role="dialog" aria-label="Filtros"><h3>Filtrar</h3>${htmlFiltros()}
        <div class="hoja-pie"><button class="btn btn-bloque" data-cerrar>Ver resultados</button></div></div>`;
    document.body.appendChild(panel);
    // Mismos eventos que la barra lateral, dentro del panel.
    panel.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-f]');
      if (chip) {
        const conjunto = f[chip.dataset.f];
        conjunto.has(chip.dataset.v) ? conjunto.delete(chip.dataset.v) : conjunto.add(chip.dataset.v);
        $$('[data-f]', panel).forEach((b) => b.setAttribute('aria-pressed', f[b.dataset.f].has(b.dataset.v)));
        pintar();
      }
      if (e.target.closest('[data-limpiar]')) {
        Object.assign(f, nuevosFiltros(), { orden: f.orden });
        $$('[data-r]', panel).forEach((i) => (i.value = ''));
        $$('[data-f]', panel).forEach((b) => b.setAttribute('aria-pressed', 'false'));
        pintar();
      }
      if (e.target.closest('[data-cerrar]')) panel.remove();
    });
    panel.addEventListener('input', (e) => {
      if (e.target.dataset.r) { f[e.target.dataset.r] = e.target.value; pintar(); }
    });
  });

  pintar();
}

// 3. Detalle de producto
function pantallaProducto(id) {
  const p = estado.productos.find((x) => x.id === Number(id));
  if (!p) return pantallaNoExiste();
  const d = descuento(p);
  const tallas = ordenarTallas(Object.keys(p.tallas));
  // Selección inicial: primer color y primera talla con stock.
  let color = p.colores[0]?.nombre || '';
  let talla = tallas.find((t) => p.tallas[t] > 0) || '';
  let cantidad = 1;
  // Productos relacionados: misma categoría primero.
  const relacionados = estado.productos.filter((x) => x.id !== p.id && !x.agotado)
    .sort((a, b) => (b.categoria === p.categoria) - (a.categoria === p.categoria)).slice(0, 4);
  // Medios de la galería: fotos y, si hay, el video.
  const medios = [...p.fotos.map((f) => ({ tipo: 'foto', src: f }))];
  if (p.video) medios.push({ tipo: 'video', src: p.video });
  if (!medios.length) medios.push({ tipo: 'foto', src: '/img/sin-foto.svg' });

  app.innerHTML = `
    <div class="contenedor">
      <div class="detalle">
        <div>
          <div class="galeria" id="galeria">
            ${medios.map((m) => m.tipo === 'video'
              ? `<video src="${esc(m.src)}" controls playsinline muted preload="metadata"></video>`
              : `<img src="${esc(m.src)}" alt="${esc(p.nombre)}">`).join('')}
          </div>
          ${medios.length > 1 ? `<div class="miniaturas">${medios.map((m, i) => `<button data-i="${i}" aria-label="Ver ${m.tipo} ${i + 1}">${m.tipo === 'video' ? '▶' : `<img src="${esc(m.src)}" alt="">`}</button>`).join('')}</div>` : ''}
        </div>
        <div class="info">
          <small style="color:var(--gris-texto)">${esc(p.categoria)}</small>
          <h1>${esc(p.nombre)}</h1>
          <div class="precios">
            <span class="precio">${pesos(p.precio)}</span>
            ${d ? `<span class="precio-ant">${pesos(p.precio_anterior)}</span><span class="etq etq-desc">-${d}%</span>` : ''}
          </div>
          ${d ? `<div class="ahorro">Ahorras ${pesos(p.precio_anterior - p.precio)}</div>` : ''}
          ${p.agotado ? '<p><span class="etq etq-agot">Agotado</span> Escríbenos y te avisamos cuando llegue.</p>' : ''}

          ${p.colores.length ? `<div class="opcion"><h4>Color: <span id="color-nom">${esc(color)}</span></h4><div class="chips">
            ${p.colores.map((c) => `<button class="chip chip-color" style="background:${esc(c.hex)}" data-color="${esc(c.nombre)}" aria-pressed="${c.nombre === color}" title="${esc(c.nombre)}"><span class="sr">${esc(c.nombre)}</span></button>`).join('')}
          </div></div>` : ''}

          <div class="opcion"><h4>Talla</h4><div class="chips">
            ${tallas.map((t) => `<button class="chip" data-talla="${esc(t)}" aria-pressed="${t === talla}" ${p.tallas[t] > 0 ? '' : 'disabled'}>${esc(t)}</button>`).join('')}
          </div><small id="stock" style="color:var(--gris-texto)"></small></div>

          <div class="opcion"><h4>Cantidad</h4>
            <div class="cantidad"><button data-cant="-1" aria-label="Menos">−</button><span id="cant">1</span><button data-cant="1" aria-label="Más">+</button></div>
          </div>

          <div class="acciones">
            <button class="btn btn-bloque" id="agregar" ${p.agotado ? 'disabled' : ''}>Agregar al carrito</button>
            <a class="btn btn-sec btn-bloque" id="pedir-wa" target="_blank" rel="noopener">Pedir por WhatsApp</a>
          </div>

          <p class="desc">${esc(p.descripcion)}</p>
          <details class="guia"><summary>Guía de tallas</summary>
            <table>
              <tr><th>Talla</th><th>Pecho (cm)</th><th>Cintura (cm)</th></tr>
              <tr><td>XS</td><td>82–86</td><td>66–70</td></tr>
              <tr><td>S</td><td>86–92</td><td>70–76</td></tr>
              <tr><td>M</td><td>92–98</td><td>76–82</td></tr>
              <tr><td>L</td><td>98–104</td><td>82–88</td></tr>
              <tr><td>XL</td><td>104–112</td><td>88–96</td></tr>
            </table>
            <p style="font-size:13px;color:var(--gris-texto)">¿Dudas con tu talla? Escríbenos por WhatsApp y te asesoramos.</p>
          </details>
        </div>
      </div>
      ${relacionados.length ? `<section class="seccion" style="padding-top:0"><div class="seccion-cab"><h2>También te puede gustar</h2></div>
        <div class="grilla">${relacionados.map(tarjeta).join('')}</div></section>` : ''}
    </div>`;

  // Actualiza el texto de stock, el enlace de WhatsApp y los botones seleccionados.
  const refrescar = () => {
    const s = p.tallas[talla] ?? 0;
    $('#stock').textContent = talla ? (s <= 3 && s > 0 ? `¡Últimas ${s} unidades!` : '') : 'Elige una talla';
    if (cantidad > s) cantidad = Math.max(1, s);
    $('#cant').textContent = cantidad;
    $$('[data-talla]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.talla === talla));
    $$('[data-color]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.color === color));
    if ($('#color-nom')) $('#color-nom').textContent = color;
    $('#pedir-wa').href = enlaceWa(
      `Hola DUVAN STORE 👋 Quiero pedir:\n• ${p.nombre}${color ? ` · ${color}` : ''}${talla ? ` · Talla ${talla}` : ''} · x${cantidad}\nPrecio: ${pesos(p.precio)}\n${location.origin}/#/producto/${p.id}`,
    );
  };

  // Clics: miniaturas, color, talla, cantidad.
  app.addEventListener('click', (e) => {
    const mini = e.target.closest('[data-i]');
    if (mini) { const g = $('#galeria'); g.scrollTo({ left: g.clientWidth * Number(mini.dataset.i), behavior: 'smooth' }); }
    const bc = e.target.closest('[data-color]');
    if (bc) { color = bc.dataset.color; refrescar(); }
    const bt = e.target.closest('[data-talla]');
    if (bt && !bt.disabled) { talla = bt.dataset.talla; refrescar(); }
    const bq = e.target.closest('[data-cant]');
    if (bq) { cantidad = Math.min(Math.max(1, cantidad + Number(bq.dataset.cant)), p.tallas[talla] || 1); refrescar(); }
  });
  // Agregar al carrito.
  $('#agregar').addEventListener('click', () => {
    if (!talla) return aviso('Elige una talla', true);
    agregarAlCarrito(p, talla, color, cantidad);
  });
  refrescar();
}

// 4. Carrito y formulario de pedido
function pantallaCarrito() {
  const lineas = lineasCarrito();
  // Carrito vacío.
  if (!lineas.length) {
    app.innerHTML = `<div class="contenedor vacio"><h2>Tu carrito está vacío</h2><p>Explora la tienda y agrega lo que te guste.</p><br><a class="btn" href="#/catalogo">Ver productos</a></div>`;
    return;
  }
  // Datos del cliente recordados de un pedido anterior (para no escribirlos otra vez).
  let previo = {};
  try { previo = JSON.parse(localStorage.getItem('ds_cliente') || '{}'); } catch { /* sin datos */ }
  const t = totales(lineas);
  const gratis = Number(estado.config.domicilio_gratis_desde || 0);

  app.innerHTML = `
    <div class="contenedor"><div class="carrito">
      <section>
        <h1 style="font-size:24px">Tu carrito</h1>
        <div id="lineas">
          ${lineas.map((l, i) => `
            <div class="linea">
              <img src="${esc(l.p.fotos[0] || '/img/sin-foto.svg')}" alt="">
              <div>
                <h3>${esc(l.p.nombre)}</h3>
                <small>Talla ${esc(l.talla)}${l.color ? ` · ${esc(l.color)}` : ''}</small>
                <small>${pesos(l.p.precio)} c/u</small>
                <div class="cantidad" style="margin-top:6px"><button data-mas="${i}" data-d="-1" aria-label="Menos">−</button><span>${l.cantidad}</span><button data-mas="${i}" data-d="1" aria-label="Más">+</button></div>
              </div>
              <div style="text-align:right"><b>${pesos(l.p.precio * l.cantidad)}</b><br><button class="quitar" data-quitar="${i}">Quitar</button></div>
            </div>`).join('')}
        </div>
      </section>

      <section>
        <div class="resumen" style="margin-bottom:20px">
          <div class="fila"><span>Subtotal</span><span>${pesos(t.subtotal)}</span></div>
          <div class="fila"><span>Domicilio</span><span>${t.domicilio ? pesos(t.domicilio) : 'Gratis'}</span></div>
          ${gratis && t.subtotal < gratis ? `<small style="color:var(--dorado-oscuro)">Te faltan ${pesos(gratis - t.subtotal)} para envío gratis</small>` : ''}
          <div class="fila total"><span>Total</span><span>${pesos(t.total)}</span></div>
        </div>

        <form id="form-pedido" novalidate>
          <h2 style="font-size:18px">Datos de entrega</h2>
          <div class="campo"><label for="nombre">Nombre completo</label><input id="nombre" name="nombre" autocomplete="name" required value="${esc(previo.nombre)}"></div>
          <div class="campo"><label for="celular">Celular (WhatsApp)</label><input id="celular" name="celular" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(previo.celular)}" placeholder="300 123 4567"></div>
          <div class="campo"><label for="direccion">Dirección</label><input id="direccion" name="direccion" autocomplete="street-address" required value="${esc(previo.direccion)}" placeholder="Calle 10 # 20-30, casa/apto"></div>
          <div class="campo"><label for="barrio">Barrio / municipio</label><input id="barrio" name="barrio" required value="${esc(previo.barrio)}"></div>
          <div class="campo"><label for="notas">Notas (opcional)</label><textarea id="notas" name="notas" placeholder="Ej: entregar después de las 3 p. m."></textarea></div>

          <h2 style="font-size:18px">¿Cómo quieres pagar?</h2>
          <div class="metodos">
            <label class="metodo"><input type="radio" name="metodo_pago" value="contraentrega" checked>
              <span><b>Pago contraentrega</b><small>Pagas en efectivo cuando recibas tu pedido.</small></span></label>
            <label class="metodo"><input type="radio" name="metodo_pago" value="transferencia">
              <span><b>Transferencia o QR</b><small>Nequi, Daviplata o transferencia. Al confirmar se abre WhatsApp para enviar el comprobante.</small></span></label>
          </div>
          <p class="error-form" id="error-form" hidden></p>
          <button class="btn btn-bloque" id="confirmar" type="submit">Confirmar pedido · ${pesos(t.total)}</button>
        </form>
      </section>
    </div></div>`;

  // Cambiar cantidades o quitar productos.
  $('#lineas').addEventListener('click', (e) => {
    const bm = e.target.closest('[data-mas]');
    const bq = e.target.closest('[data-quitar]');
    if (bm) {
      const l = lineas[Number(bm.dataset.mas)];
      const item = estado.carrito.find((x) => x.id === l.id && x.talla === l.talla && x.color === l.color);
      const stock = l.p.tallas[l.talla] ?? 0;
      item.cantidad = Math.min(Math.max(1, item.cantidad + Number(bm.dataset.d)), stock || 1);
      guardarCarrito(); pantallaCarrito();
    }
    if (bq) {
      const l = lineas[Number(bq.dataset.quitar)];
      estado.carrito = estado.carrito.filter((x) => !(x.id === l.id && x.talla === l.talla && x.color === l.color));
      guardarCarrito(); pantallaCarrito();
    }
  });

  // Enviar el pedido.
  $('#form-pedido').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const datos = Object.fromEntries(new FormData(form));
    const error = $('#error-form');
    // Validación simple antes de enviar.
    const faltan = ['nombre', 'celular', 'direccion', 'barrio'].filter((k) => !String(datos[k] || '').trim());
    if (faltan.length) {
      error.textContent = 'Completa los campos: ' + faltan.map((k) => ({ nombre: 'nombre', celular: 'celular', direccion: 'dirección', barrio: 'barrio' }[k])).join(', ');
      error.hidden = false;
      form.elements[faltan[0]].focus();
      return;
    }
    error.hidden = true;
    const btn = $('#confirmar');
    btn.disabled = true; btn.textContent = 'Enviando pedido…';
    // Si paga por transferencia, abrimos la pestaña de WhatsApp ya (los celulares bloquean ventanas abiertas después de esperar).
    const ventanaWa = datos.metodo_pago === 'transferencia' ? window.open('', '_blank') : null;
    try {
      const pedido = await api('/api/pedidos', {
        method: 'POST',
        body: JSON.stringify({ ...datos, items: estado.carrito }),
      });
      // Recordamos los datos del cliente para la próxima compra.
      try { localStorage.setItem('ds_cliente', JSON.stringify({ nombre: datos.nombre, celular: datos.celular, direccion: datos.direccion, barrio: datos.barrio })); } catch { /* opcional */ }
      // Guardamos el pedido para la pantalla de confirmación y vaciamos el carrito.
      sessionStorage.setItem('ds_ultimo', JSON.stringify(pedido));
      estado.carrito = []; guardarCarrito();
      // Recargamos el catálogo para reflejar el nuevo stock.
      cargarProductos();
      // WhatsApp con el resumen.
      if (ventanaWa) ventanaWa.location.href = enlaceWa(mensajePedido(pedido));
      location.hash = `#/pedido/${pedido.codigo}`;
    } catch (err) {
      if (ventanaWa) ventanaWa.close();
      error.textContent = err.message; error.hidden = false;
      btn.disabled = false; btn.textContent = `Confirmar pedido · ${pesos(t.total)}`;
    }
  });
}

// Texto del pedido para WhatsApp.
function mensajePedido(p) {
  const lineas = p.items.map((i) => `• ${i.nombre} · Talla ${i.talla}${i.color ? ` · ${i.color}` : ''} · x${i.cantidad} = ${pesos(i.precio * i.cantidad)}`).join('\n');
  const pago = p.metodo_pago === 'transferencia' ? 'Transferencia / QR (envío el comprobante)' : 'Contraentrega (efectivo)';
  return `Hola DUVAN STORE 👋 Acabo de hacer el pedido *${p.codigo}*\n\n${lineas}\n\nSubtotal: ${pesos(p.subtotal)}\nDomicilio: ${p.domicilio ? pesos(p.domicilio) : 'Gratis'}\n*Total: ${pesos(p.total)}*\n\nPago: ${pago}\nNombre: ${p.cliente?.nombre || p.cliente_nombre || ''}${p.cliente ? `\nDirección: ${p.cliente.direccion}, ${p.cliente.barrio}` : ''}`;
}

// 5. Confirmación del pedido
async function pantallaPedido(codigo) {
  // Primero intenta con el pedido recién hecho (tiene todos los datos), si no lo consulta a la API.
  let p = null;
  try { const u = JSON.parse(sessionStorage.getItem('ds_ultimo') || 'null'); if (u?.codigo === codigo) p = u; } catch { /* nada */ }
  if (!p) {
    try { p = await api(`/api/pedidos/${encodeURIComponent(codigo)}`); } catch { return pantallaNoExiste(); }
  }
  const transf = p.metodo_pago === 'transferencia';
  app.innerHTML = `
    <div class="contenedor"><div class="confirma">
      <span class="logo" style="font-size:22px"><b>DUVAN</b><span>STORE</span></span>
      <div class="check">✓</div>
      <h1 style="font-size:26px">¡Gracias por tu compra!</h1>
      <p>Número de pedido</p>
      <div class="codigo">${esc(p.codigo)}</div>
      ${transf ? `<div class="pasos-pago" style="margin-top:22px">
          <b>Para terminar, envía tu comprobante por WhatsApp:</b><br>
          Nequi: <b>${esc(estado.config.nequi)}</b> · Daviplata: <b>${esc(estado.config.daviplata)}</b><br>
          Transfiere <b>${pesos(p.total)}</b> y envía la captura con tu número de pedido.
        </div>` : ''}
      <div class="resumen">
        ${p.items.map((i) => `<div class="fila"><span>${esc(i.nombre)} · ${esc(i.talla)} × ${i.cantidad}</span><span>${pesos(i.precio * i.cantidad)}</span></div>`).join('')}
        <div class="fila"><span>Domicilio</span><span>${p.domicilio ? pesos(p.domicilio) : 'Gratis'}</span></div>
        <div class="fila total"><span>Total</span><span>${pesos(p.total)}</span></div>
      </div>
      <p>Te contactaremos por WhatsApp para coordinar el despacho.</p>
      <div style="display:grid;gap:10px;margin-top:18px">
        <a class="btn btn-wa btn-bloque" href="${enlaceWa(mensajePedido(p))}" target="_blank" rel="noopener">${transf ? 'Enviar comprobante por WhatsApp' : 'Escribir por WhatsApp'}</a>
        <a class="btn btn-sec btn-bloque" href="#/">Seguir comprando</a>
      </div>
    </div></div>`;
}

// 6. Información de la tienda
function pantallaInfo() {
  const c = estado.config;
  const gratis = Number(c.domicilio_gratis_desde || 0);
  app.innerHTML = `
    <div class="contenedor">
      <div class="cat-cab"><h1>Información de la tienda</h1></div>
      <div class="info-grid">
        <div class="info-caja"><h3>${ICONOS.pin} Ubicación</h3><p>${esc(c.direccion)}</p>
          <iframe class="mapa" loading="lazy" title="Mapa" src="https://maps.google.com/maps?q=${encodeURIComponent(c.mapa || c.direccion || '')}&output=embed"></iframe></div>
        <div style="display:grid;gap:16px">
          <div class="info-caja"><h3>${ICONOS.reloj} Horario</h3><p>${esc(c.horario)}</p></div>
          <div class="info-caja"><h3>Métodos de pago</h3>
            <p>• Efectivo contraentrega (pagas al recibir).</p>
            <p>• Nequi: ${esc(c.nequi)}</p><p>• Daviplata: ${esc(c.daviplata)}</p><p>• Transferencia bancaria (pide los datos por WhatsApp).</p></div>
          <div class="info-caja"><h3>Despacho</h3><p>${esc(c.zonas)}</p>
            <p>Costo del domicilio: <b>${pesos(c.domicilio_costo)}</b>${gratis ? ` · Gratis en compras desde ${pesos(gratis)}` : ''}.</p></div>
        </div>
        <div class="info-caja faq" style="grid-column:1/-1"><h3>Preguntas frecuentes</h3>
          <details><summary>¿Cómo hago un pedido?</summary><p>Elige tus productos, agrégalos al carrito, llena tus datos y confirma. Te escribimos por WhatsApp para coordinar.</p></details>
          <details><summary>¿Puedo pagar al recibir?</summary><p>Sí. Con "Pago contraentrega" pagas en efectivo cuando te llega el domicilio.</p></details>
          <details><summary>¿Hacen cambios?</summary><p>Sí, tienes 8 días para cambiar por talla o color, con la prenda sin usar y con etiquetas.</p></details>
          <details><summary>¿Cuánto tarda el envío?</summary><p>${esc(c.zonas)}</p></details>
        </div>
      </div>
    </div>`;
}

// Página no encontrada.
function pantallaNoExiste() {
  app.innerHTML = `<div class="contenedor vacio"><h2>No encontramos esta página</h2><br><a class="btn" href="#/">Ir al inicio</a></div>`;
}

// ---------------------------------------------------------------------
// Menús y pie de página (dependen de la configuración y categorías)
// ---------------------------------------------------------------------
function pintarMarco() {
  const c = estado.config;
  // Categorías que realmente tienen productos.
  const cats = CATEGORIAS.filter((x) => estado.productos.some((p) => p.categoria === x));
  const links = [['#/catalogo', 'Toda la tienda'], ['#/catalogo?ofertas=1', 'Ofertas'], ...cats.map((x) => [`#/catalogo?cat=${encodeURIComponent(x)}`, x]), ['#/info', 'Información']];
  $('#cab-nav').innerHTML = links.map(([h, t]) => `<a href="${h}">${esc(t)}</a>`).join('');
  $('#menu-links').innerHTML = links.map(([h, t]) => `<a href="${h}">${esc(t)}</a>`).join('');
  // Botón flotante de WhatsApp.
  $('#wa-flot').href = enlaceWa('Hola DUVAN STORE 👋 Quiero información.');
  // Pie de página.
  $('#pie').innerHTML = `
    <div class="contenedor">
      <div class="pie-grid">
        <div><span class="logo"><b>DUVAN</b><span>STORE</span></span><p>Moda urbana con envíos a domicilio y pago al recibir.</p></div>
        <div><h4>Tienda</h4><p>${esc(c.direccion)}</p><p>${esc(c.horario)}</p></div>
        <div><h4>Pagos</h4><p>Contraentrega · Nequi · Daviplata · Transferencia</p></div>
        <div><h4>Síguenos</h4>
          <a href="${esc(c.instagram)}" target="_blank" rel="noopener">Instagram</a>
          <a href="${esc(c.facebook)}" target="_blank" rel="noopener">Facebook</a>
          <a href="${esc(c.tiktok)}" target="_blank" rel="noopener">TikTok</a>
          <a href="#/info">Información y preguntas</a></div>
      </div>
      <div class="legal">© ${new Date().getFullYear()} DUVAN STORE · Todos los derechos reservados</div>
    </div>`;
}

// ---------------------------------------------------------------------
// Navegación entre pantallas
// ---------------------------------------------------------------------
function enrutar() {
  // Quita el "#" y separa ruta y parámetros: "#/catalogo?cat=Camisas"
  const [ruta, query = ''] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(query);
  const partes = ruta.split('/').filter(Boolean);
  // Clonamos <main> para quitar los eventos de la pantalla anterior.
  const nuevo = app.cloneNode(false);
  app.replaceWith(nuevo);
  app = nuevo;
  // Cierra menú y buscador al navegar.
  $('#menu-lat').hidden = true;
  $$('.panel-filtros').forEach((p) => p.remove());
  // Elige la pantalla.
  if (!partes.length) pantallaInicio();
  else if (partes[0] === 'catalogo') pantallaCatalogo(params);
  else if (partes[0] === 'producto') pantallaProducto(partes[1]);
  else if (partes[0] === 'carrito') pantallaCarrito();
  else if (partes[0] === 'pedido') pantallaPedido(decodeURIComponent(partes[1] || ''));
  else if (partes[0] === 'info') pantallaInfo();
  else pantallaNoExiste();
  // Marca el enlace activo del menú y sube al inicio de la página.
  $$('#cab-nav a').forEach((a) => a.toggleAttribute('aria-current', a.getAttribute('href') === location.hash));
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------

// Descarga el catálogo.
async function cargarProductos() {
  estado.productos = await api('/api/productos');
}

// Eventos fijos del encabezado.
function eventosMarco() {
  // Abrir menú lateral.
  $('#btn-menu').addEventListener('click', () => ($('#menu-lat').hidden = false));
  // Cerrar menú lateral tocando el fondo o la X.
  $('#menu-lat').addEventListener('click', (e) => {
    if (e.target.closest('[data-cerrar]') || e.target.closest('a')) $('#menu-lat').hidden = true;
  });
  // Mostrar/ocultar buscador.
  $('#btn-buscar').addEventListener('click', () => {
    const b = $('#buscador');
    b.hidden = !b.hidden;
    if (!b.hidden) $('#q').focus();
  });
  // Buscar al presionar Enter.
  $('#buscador').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#q').value.trim();
    estado.filtros = nuevosFiltros();
    location.hash = `#/catalogo?q=${encodeURIComponent(q)}`;
    $('#buscador').hidden = true;
  });
  // Cerrar con la tecla Escape.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('#menu-lat').hidden = true; $$('.panel-filtros').forEach((p) => p.remove()); }
  });
  // Al cambiar de categoría desde el menú, se reinician los filtros.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/catalogo"]');
    if (a) estado.filtros = nuevosFiltros();
  });
}

// Inicia la tienda.
async function iniciar() {
  eventosMarco();
  pintarContador();
  app.innerHTML = '<div class="cargando">Cargando…</div>';
  try {
    // Productos y configuración en paralelo.
    const [, config] = await Promise.all([cargarProductos(), api('/api/config')]);
    estado.config = config;
  } catch (err) {
    app.innerHTML = `<div class="contenedor vacio"><h2>No pudimos cargar la tienda</h2><p>${esc(err.message)}</p><br><button class="btn" onclick="location.reload()">Reintentar</button></div>`;
    return;
  }
  pintarMarco();
  window.addEventListener('hashchange', enrutar);
  enrutar();
}

iniciar();
