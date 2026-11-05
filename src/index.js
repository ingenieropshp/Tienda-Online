// =====================================================================
// DUVAN STORE · Worker "tienda-virtual"
// API del servidor: catálogo, pedidos, fotos y panel de administración.
// Los archivos de /public (la tienda y el panel) los sirve Cloudflare
// directamente; este código solo atiende las rutas que empiezan por /api/.
// =====================================================================

// Estados válidos de un pedido, en el orden en que avanza.
const ESTADOS = ['Nuevo', 'Pago confirmado', 'Despachado', 'Entregado', 'Cancelado'];

// Claves de configuración que el panel puede modificar.
const CLAVES_CONFIG = [
  'whatsapp', 'direccion', 'mapa', 'horario', 'domicilio_costo', 'domicilio_gratis_desde',
  'zonas', 'nequi', 'daviplata', 'instagram', 'facebook', 'tiktok',
];

// Tipos de archivo permitidos al subir fotos o videos, con su extensión.
const TIPOS_MEDIA = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

// Tamaños máximos: 10 MB para fotos y 90 MB para videos (el plan gratis acepta hasta 100 MB por petición).
const MAX_FOTO = 10 * 1024 * 1024;
const MAX_VIDEO = 90 * 1024 * 1024;

// Punto de entrada: Cloudflare llama a fetch() con cada petición.
export default {
  async fetch(request, env) {
    // Convertimos la dirección en un objeto para leer la ruta y los parámetros.
    const url = new URL(request.url);
    try {
      // Pasamos la petición al enrutador de la API.
      const respuesta = await enrutar(request, env, url);
      // Si ninguna ruta coincidió, respondemos 404.
      return respuesta ?? json({ error: 'Ruta no encontrada' }, 404);
    } catch (err) {
      // Los errores "esperados" (datos inválidos) traen su propio código HTTP.
      if (err instanceof ErrorHttp) return json({ error: err.message }, err.status);
      // Cualquier otro error se registra en los logs de Cloudflare.
      console.error(err);
      // Al cliente no le mostramos detalles internos.
      return json({ error: 'Error interno del servidor' }, 500);
    }
  },
};

// ---------------------------------------------------------------------
// Enrutador: decide qué función atiende cada ruta.
// ---------------------------------------------------------------------
async function enrutar(request, env, url) {
  // Método HTTP (GET, POST, PUT, PATCH, DELETE).
  const m = request.method;
  // Ruta sin la barra final, ej: /api/productos/3
  const ruta = url.pathname.replace(/\/+$/, '');

  // ---------- Rutas públicas (clientes) ----------
  // Lista de productos visibles en la tienda.
  if (m === 'GET' && ruta === '/api/productos') return listarProductos(env, false);
  // Detalle de un producto: /api/productos/<id>
  let p = ruta.match(/^\/api\/productos\/(\d+)$/);
  if (m === 'GET' && p) return obtenerProducto(env, Number(p[1]));
  // Configuración pública (WhatsApp, horario, domicilio...).
  if (m === 'GET' && ruta === '/api/config') return json(await leerConfig(env));
  // Crear un pedido desde el carrito.
  if (m === 'POST' && ruta === '/api/pedidos') return crearPedido(request, env);
  // Consultar un pedido por su código (pantalla de confirmación).
  p = ruta.match(/^\/api\/pedidos\/(DS-[A-Z0-9]{6})$/);
  if (m === 'GET' && p) return obtenerPedidoPublico(env, p[1]);
  // Servir una foto o video guardado en R2: /api/media/<archivo>
  p = ruta.match(/^\/api\/media\/([a-zA-Z0-9-]+\.(jpg|png|webp|mp4|webm))$/);
  if (m === 'GET' && p) return servirMedia(request, env, p[1]);

  // ---------- Rutas del panel (requieren la clave) ----------
  if (ruta.startsWith('/api/admin/')) {
    // Verifica la clave antes de hacer cualquier cosa.
    await exigirAdmin(request, env);
    // Comprobar que la clave es correcta (lo usa la pantalla de ingreso).
    if (m === 'GET' && ruta === '/api/admin/sesion') return json({ ok: true });
    // Resumen para el inicio del panel.
    if (m === 'GET' && ruta === '/api/admin/resumen') return resumenAdmin(env);
    // Todos los productos, incluso agotados.
    if (m === 'GET' && ruta === '/api/admin/productos') return listarProductos(env, true);
    // Crear producto.
    if (m === 'POST' && ruta === '/api/admin/productos') return guardarProducto(request, env, null);
    // Editar, cambiar agotado o borrar un producto.
    p = ruta.match(/^\/api\/admin\/productos\/(\d+)$/);
    if (p && m === 'PUT') return guardarProducto(request, env, Number(p[1]));
    if (p && m === 'PATCH') return cambiarAgotado(request, env, Number(p[1]));
    if (p && m === 'DELETE') return borrarProducto(env, Number(p[1]));
    // Lista de pedidos (opcionalmente filtrada por estado).
    if (m === 'GET' && ruta === '/api/admin/pedidos') return listarPedidos(env, url.searchParams.get('estado'));
    // Cambiar el estado de un pedido.
    p = ruta.match(/^\/api\/admin\/pedidos\/(\d+)$/);
    if (p && m === 'PATCH') return cambiarEstado(request, env, Number(p[1]));
    // Subir foto o video.
    if (m === 'POST' && ruta === '/api/admin/media') return subirMedia(request, env);
    // Guardar configuración.
    if (m === 'PUT' && ruta === '/api/admin/config') return guardarConfig(request, env);
  }

  // Ninguna ruta coincidió.
  return null;
}

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------

// Error con código HTTP para responder mensajes claros (400, 401, 404...).
class ErrorHttp extends Error {
  constructor(status, message) {
    super(message);      // Guarda el mensaje del error.
    this.status = status; // Guarda el código HTTP.
  }
}

// Crea una respuesta JSON con el código indicado.
function json(datos, status = 200, extra = {}) {
  return new Response(JSON.stringify(datos), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}

// Lee el cuerpo JSON de la petición, o lanza 400 si viene mal formado.
async function leerJson(request) {
  try {
    return await request.json();
  } catch {
    throw new ErrorHttp(400, 'El cuerpo de la petición no es JSON válido');
  }
}

// Limpia un texto: lo convierte a string, quita espacios y lo recorta a un largo máximo.
function texto(valor, max = 200) {
  return String(valor ?? '').trim().slice(0, max);
}

// Convierte a número entero no negativo, o devuelve null si no es válido.
function entero(valor) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// Convierte una fila de la base (con columnas JSON en texto) a un objeto listo para el navegador.
function filaAProducto(f) {
  const tallas = JSON.parse(f.tallas || '{}');                         // Stock por talla
  const stockTotal = Object.values(tallas).reduce((a, b) => a + b, 0); // Unidades totales
  return {
    id: f.id,
    nombre: f.nombre,
    descripcion: f.descripcion,
    categoria: f.categoria,
    precio: f.precio,
    precio_anterior: f.precio_anterior,
    colores: JSON.parse(f.colores || '[]'),
    tallas,
    fotos: JSON.parse(f.fotos || '[]'),
    video: f.video,
    // Agotado si se marcó a mano o si no queda ninguna unidad.
    agotado: f.agotado === 1 || stockTotal === 0,
    agotado_manual: f.agotado === 1,
    destacado: f.destacado === 1,
    creado_en: f.creado_en,
  };
}

// Lee toda la configuración como objeto { clave: valor }.
async function leerConfig(env) {
  const { results } = await env.DB.prepare('SELECT clave, valor FROM configuracion').all();
  return Object.fromEntries(results.map((r) => [r.clave, r.valor]));
}

// Compara dos textos en tiempo constante (evita adivinar la clave midiendo tiempos).
async function igualesSeguro(a, b) {
  const enc = new TextEncoder();
  // Resumimos ambos con SHA-256 para que tengan el mismo largo.
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  // timingSafeEqual compara byte a byte sin salir antes de tiempo.
  return crypto.subtle.timingSafeEqual(ha, hb);
}

// Verifica el encabezado "Authorization: Bearer <clave>" contra el secreto ADMIN_CLAVE.
async function exigirAdmin(request, env) {
  // Si el secreto no está configurado, el panel queda bloqueado.
  if (!env.ADMIN_CLAVE) throw new ErrorHttp(503, 'Falta configurar ADMIN_CLAVE en Cloudflare');
  // Extrae la clave enviada por el panel.
  const enviada = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  // Compara de forma segura.
  if (!enviada || !(await igualesSeguro(enviada, env.ADMIN_CLAVE))) {
    throw new ErrorHttp(401, 'Clave incorrecta');
  }
}

// Genera un código de pedido legible, ej: DS-7K2M9Q (sin letras confusas como O/0, I/1).
function generarCodigo() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return 'DS-' + Array.from(bytes, (b) => letras[b % letras.length]).join('');
}

// ---------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------

// Lista productos activos. "todos" incluye los agotados (para el panel); la tienda también los muestra con etiqueta.
async function listarProductos(env, paraAdmin) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM productos WHERE activo = 1 ORDER BY creado_en DESC, id DESC',
  ).all();
  // Los productos se pueden guardar en caché 60 s en la tienda; en el panel nunca.
  const cache = paraAdmin ? {} : { 'cache-control': 'public, max-age=60' };
  return json(results.map(filaAProducto), 200, cache);
}

// Devuelve un producto por id, o 404.
async function obtenerProducto(env, id) {
  const f = await env.DB.prepare('SELECT * FROM productos WHERE id = ? AND activo = 1').bind(id).first();
  if (!f) throw new ErrorHttp(404, 'Producto no encontrado');
  return json(filaAProducto(f));
}

// Valida los datos que llegan del formulario del panel y los deja listos para guardar.
function validarProducto(d) {
  const nombre = texto(d.nombre, 120);
  if (!nombre) throw new ErrorHttp(400, 'El nombre es obligatorio');
  const categoria = texto(d.categoria, 40);
  if (!categoria) throw new ErrorHttp(400, 'La categoría es obligatoria');
  const precio = entero(d.precio);
  if (precio === null || precio === 0) throw new ErrorHttp(400, 'El precio debe ser un número mayor a 0');
  // El precio anterior es opcional; solo tiene sentido si es mayor que el actual.
  let precioAnterior = d.precio_anterior === '' || d.precio_anterior == null ? null : entero(d.precio_anterior);
  if (precioAnterior !== null && precioAnterior <= precio) precioAnterior = null;
  // Colores: lista de { nombre, hex } con hex válido.
  const colores = (Array.isArray(d.colores) ? d.colores : [])
    .map((c) => ({ nombre: texto(c.nombre, 30), hex: /^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : '#CCCCCC' }))
    .filter((c) => c.nombre)
    .slice(0, 12);
  // Tallas: objeto { talla: stock } con stock entero no negativo.
  const tallas = {};
  for (const [t, s] of Object.entries(d.tallas && typeof d.tallas === 'object' ? d.tallas : {})) {
    const talla = texto(t, 10);
    const stock = entero(s);
    if (talla && stock !== null) tallas[talla] = stock;
  }
  if (Object.keys(tallas).length === 0) throw new ErrorHttp(400, 'Agrega al menos una talla con su stock');
  // Fotos: rutas propias (/api/media/ o /img/) o fotos de ejemplo de Unsplash; nada más.
  const fotos = (Array.isArray(d.fotos) ? d.fotos : [])
    .map((f) => texto(f, 300))
    .filter((f) => f.startsWith('/api/media/') || f.startsWith('/img/') || f.startsWith('https://images.unsplash.com/'))
    .slice(0, 10);
  // Video opcional, misma regla.
  const video = texto(d.video, 300);
  return {
    nombre,
    descripcion: texto(d.descripcion, 1000),
    categoria,
    precio,
    precio_anterior: precioAnterior,
    colores: JSON.stringify(colores),
    tallas: JSON.stringify(tallas),
    fotos: JSON.stringify(fotos),
    video: video.startsWith('/api/media/') ? video : null,
    agotado: d.agotado ? 1 : 0,
    destacado: d.destacado ? 1 : 0,
  };
}

// Crea (id = null) o actualiza un producto.
async function guardarProducto(request, env, id) {
  const v = validarProducto(await leerJson(request));
  if (id === null) {
    // INSERT de un producto nuevo; RETURNING devuelve la fila creada.
    const f = await env.DB.prepare(
      `INSERT INTO productos (nombre, descripcion, categoria, precio, precio_anterior, colores, tallas, fotos, video, agotado, destacado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    ).bind(v.nombre, v.descripcion, v.categoria, v.precio, v.precio_anterior, v.colores, v.tallas, v.fotos, v.video, v.agotado, v.destacado).first();
    return json(filaAProducto(f), 201);
  }
  // UPDATE de un producto existente.
  const f = await env.DB.prepare(
    `UPDATE productos SET nombre = ?, descripcion = ?, categoria = ?, precio = ?, precio_anterior = ?, colores = ?, tallas = ?,
       fotos = ?, video = ?, agotado = ?, destacado = ?, actualizado_en = datetime('now')
     WHERE id = ? AND activo = 1 RETURNING *`,
  ).bind(v.nombre, v.descripcion, v.categoria, v.precio, v.precio_anterior, v.colores, v.tallas, v.fotos, v.video, v.agotado, v.destacado, id).first();
  if (!f) throw new ErrorHttp(404, 'Producto no encontrado');
  return json(filaAProducto(f));
}

// Interruptor "Agotado" de la lista de productos del panel.
async function cambiarAgotado(request, env, id) {
  const d = await leerJson(request);
  const f = await env.DB.prepare(
    "UPDATE productos SET agotado = ?, actualizado_en = datetime('now') WHERE id = ? AND activo = 1 RETURNING *",
  ).bind(d.agotado ? 1 : 0, id).first();
  if (!f) throw new ErrorHttp(404, 'Producto no encontrado');
  return json(filaAProducto(f));
}

// Borrado lógico: el producto se oculta pero los pedidos viejos siguen intactos.
async function borrarProducto(env, id) {
  await env.DB.prepare("UPDATE productos SET activo = 0, actualizado_en = datetime('now') WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------

// Crea un pedido: recalcula precios desde la base (no confía en el navegador) y descuenta el stock.
async function crearPedido(request, env) {
  const d = await leerJson(request);
  // Datos del cliente.
  const cliente = {
    nombre: texto(d.nombre, 80),
    celular: texto(d.celular, 20).replace(/[^\d+ ]/g, ''),
    direccion: texto(d.direccion, 160),
    barrio: texto(d.barrio, 80),
    notas: texto(d.notas, 300),
  };
  if (!cliente.nombre || !cliente.direccion || !cliente.barrio) throw new ErrorHttp(400, 'Completa nombre, dirección y barrio');
  if (cliente.celular.replace(/\D/g, '').length < 7) throw new ErrorHttp(400, 'Escribe un número de celular válido');
  // Método de pago.
  const metodo = d.metodo_pago === 'transferencia' ? 'transferencia' : d.metodo_pago === 'contraentrega' ? 'contraentrega' : null;
  if (!metodo) throw new ErrorHttp(400, 'Elige un método de pago');
  // Productos del carrito.
  const pedidos = Array.isArray(d.items) ? d.items.slice(0, 30) : [];
  if (pedidos.length === 0) throw new ErrorHttp(400, 'El carrito está vacío');

  // Traemos de la base todos los productos involucrados de una vez.
  const ids = [...new Set(pedidos.map((i) => entero(i.id)).filter((x) => x !== null))];
  if (ids.length === 0) throw new ErrorHttp(400, 'El carrito está vacío');
  const { results } = await env.DB.prepare(
    `SELECT * FROM productos WHERE activo = 1 AND id IN (${ids.map(() => '?').join(',')})`,
  ).bind(...ids).all();
  const porId = new Map(results.map((f) => [f.id, f]));

  // Armamos las líneas del pedido y vamos restando stock en memoria.
  const tallasNuevas = new Map(); // id → objeto de tallas actualizado
  const items = [];
  let subtotal = 0;
  for (const i of pedidos) {
    const f = porId.get(entero(i.id));
    if (!f) throw new ErrorHttp(400, 'Un producto del carrito ya no está disponible');
    if (f.agotado === 1) throw new ErrorHttp(409, `"${f.nombre}" está agotado`);
    const cantidad = entero(i.cantidad);
    if (!cantidad || cantidad > 20) throw new ErrorHttp(400, 'Cantidad inválida');
    const talla = texto(i.talla, 10);
    const tallas = tallasNuevas.get(f.id) ?? JSON.parse(f.tallas || '{}');
    if (!(talla in tallas)) throw new ErrorHttp(400, `Talla no válida para "${f.nombre}"`);
    if (tallas[talla] < cantidad) {
      throw new ErrorHttp(409, `Solo quedan ${tallas[talla]} unidades de "${f.nombre}" en talla ${talla}`);
    }
    tallas[talla] -= cantidad;            // Descuenta el stock de esa talla
    tallasNuevas.set(f.id, tallas);       // Guarda el nuevo stock para esta transacción
    const color = texto(i.color, 30);
    items.push({
      id: f.id,
      nombre: f.nombre,
      talla,
      color,
      cantidad,
      precio: f.precio,                   // Precio real según la base
      foto: JSON.parse(f.fotos || '[]')[0] ?? null,
    });
    subtotal += f.precio * cantidad;
  }

  // Domicilio según configuración (gratis desde cierto monto).
  const cfg = await leerConfig(env);
  const costo = entero(cfg.domicilio_costo) ?? 0;
  const gratisDesde = entero(cfg.domicilio_gratis_desde) ?? 0;
  const domicilio = gratisDesde > 0 && subtotal >= gratisDesde ? 0 : costo;
  const total = subtotal + domicilio;
  const codigo = generarCodigo();

  // Guardamos el pedido y el nuevo stock en un solo lote atómico (todo o nada).
  const sentencias = [
    env.DB.prepare(
      `INSERT INTO pedidos (codigo, cliente_nombre, celular, direccion, barrio, notas, metodo_pago, items, subtotal, domicilio, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(codigo, cliente.nombre, cliente.celular, cliente.direccion, cliente.barrio, cliente.notas, metodo,
      JSON.stringify(items), subtotal, domicilio, total),
  ];
  for (const [id, tallas] of tallasNuevas) {
    // La condición "tallas = ?" evita pisar un cambio hecho al mismo tiempo por otra compra.
    sentencias.push(
      env.DB.prepare("UPDATE productos SET tallas = ?, actualizado_en = datetime('now') WHERE id = ? AND tallas = ?")
        .bind(JSON.stringify(tallas), id, porId.get(id).tallas),
    );
  }
  const resultados = await env.DB.batch(sentencias);
  // Si algún UPDATE no tocó filas, otro cliente compró al mismo tiempo: deshacemos el pedido.
  if (resultados.slice(1).some((r) => r.meta.changes !== 1)) {
    await env.DB.prepare('DELETE FROM pedidos WHERE codigo = ?').bind(codigo).run();
    throw new ErrorHttp(409, 'El stock cambió mientras comprabas. Intenta de nuevo.');
  }

  // Respondemos con el resumen para la pantalla de confirmación.
  return json({ codigo, items, subtotal, domicilio, total, metodo_pago: metodo, cliente }, 201);
}

// Datos mínimos de un pedido para la pantalla de confirmación (sin dirección completa).
async function obtenerPedidoPublico(env, codigo) {
  const f = await env.DB.prepare(
    'SELECT codigo, items, subtotal, domicilio, total, metodo_pago, estado, cliente_nombre FROM pedidos WHERE codigo = ?',
  ).bind(codigo).first();
  if (!f) throw new ErrorHttp(404, 'Pedido no encontrado');
  return json({ ...f, items: JSON.parse(f.items) });
}

// Lista de pedidos para el panel, del más reciente al más antiguo.
async function listarPedidos(env, estado) {
  const filtro = ESTADOS.includes(estado) ? estado : null;
  const sql = filtro
    ? 'SELECT * FROM pedidos WHERE estado = ? ORDER BY id DESC LIMIT 300'
    : 'SELECT * FROM pedidos ORDER BY id DESC LIMIT 300';
  const stmt = filtro ? env.DB.prepare(sql).bind(filtro) : env.DB.prepare(sql);
  const { results } = await stmt.all();
  return json(results.map((f) => ({ ...f, items: JSON.parse(f.items) })));
}

// Cambia el estado de un pedido. Si se cancela, devuelve las unidades al stock.
async function cambiarEstado(request, env, id) {
  const d = await leerJson(request);
  if (!ESTADOS.includes(d.estado)) throw new ErrorHttp(400, 'Estado inválido');
  const actual = await env.DB.prepare('SELECT * FROM pedidos WHERE id = ?').bind(id).first();
  if (!actual) throw new ErrorHttp(404, 'Pedido no encontrado');
  if (actual.estado === d.estado) return json(actual);
  // Un pedido cancelado no se reactiva (su stock ya se devolvió).
  if (actual.estado === 'Cancelado') throw new ErrorHttp(409, 'Un pedido cancelado no se puede reactivar');
  const sentencias = [
    env.DB.prepare("UPDATE pedidos SET estado = ?, actualizado_en = datetime('now') WHERE id = ?").bind(d.estado, id),
  ];
  if (d.estado === 'Cancelado') {
    // Devolvemos cada unidad a su talla usando json_set de SQLite.
    for (const it of JSON.parse(actual.items)) {
      sentencias.push(
        env.DB.prepare(
          `UPDATE productos SET tallas = json_set(tallas, '$."' || ? || '"', COALESCE(json_extract(tallas, '$."' || ? || '"'), 0) + ?)
           WHERE id = ?`,
        ).bind(it.talla, it.talla, it.cantidad, it.id),
      );
    }
  }
  await env.DB.batch(sentencias);
  return json({ ok: true, estado: d.estado });
}

// Tarjetas del inicio del panel.
async function resumenAdmin(env) {
  // Ventas del día en hora de Colombia (UTC-5), sin contar cancelados.
  const [nuevos, pendientes, hoy, productos] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM pedidos WHERE estado = 'Nuevo'"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM pedidos WHERE estado = 'Nuevo' AND metodo_pago = 'transferencia'"),
    env.DB.prepare(
      "SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS total FROM pedidos WHERE estado != 'Cancelado' AND date(creado_en, '-5 hours') = date('now', '-5 hours')",
    ),
    env.DB.prepare('SELECT agotado, tallas FROM productos WHERE activo = 1'),
  ]);
  // Cuenta agotados: marcados a mano o sin unidades.
  const agotados = productos.results.filter(
    (f) => f.agotado === 1 || Object.values(JSON.parse(f.tallas || '{}')).reduce((a, b) => a + b, 0) === 0,
  ).length;
  return json({
    pedidos_nuevos: nuevos.results[0].n,
    pendientes_pago: pendientes.results[0].n,
    pedidos_hoy: hoy.results[0].n,
    ventas_hoy: hoy.results[0].total,
    productos_agotados: agotados,
    productos_total: productos.results.length,
  });
}

// ---------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------

// Guarda los ajustes del panel (solo las claves permitidas).
async function guardarConfig(request, env) {
  const d = await leerJson(request);
  const sentencias = [];
  for (const clave of CLAVES_CONFIG) {
    if (!(clave in d)) continue;
    let valor = texto(d[clave], 300);
    // El WhatsApp se guarda solo con dígitos; si es un celular de 10 dígitos se le agrega el 57 de Colombia.
    if (clave === 'whatsapp') {
      valor = valor.replace(/\D/g, '');
      if (valor.length === 10) valor = '57' + valor;
    }
    // Los montos se guardan como enteros.
    if (clave.startsWith('domicilio_')) valor = String(entero(valor.replace(/\D/g, '')) ?? 0);
    sentencias.push(
      env.DB.prepare('INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor')
        .bind(clave, valor),
    );
  }
  if (sentencias.length) await env.DB.batch(sentencias);
  return json(await leerConfig(env));
}

// ---------------------------------------------------------------------
// Fotos y videos (R2)
// ---------------------------------------------------------------------

// Recibe el archivo crudo en el cuerpo de la petición y lo guarda en R2.
async function subirMedia(request, env) {
  // El tipo viene en el encabezado Content-Type (ej: image/jpeg).
  const tipo = (request.headers.get('content-type') || '').split(';')[0].trim();
  const ext = TIPOS_MEDIA[tipo];
  if (!ext) throw new ErrorHttp(415, 'Formato no permitido. Usa JPG, PNG, WEBP, MP4 o WEBM');
  // Revisamos el tamaño declarado antes de leer el archivo.
  const largo = Number(request.headers.get('content-length') || 0);
  const max = tipo.startsWith('video/') ? MAX_VIDEO : MAX_FOTO;
  if (largo > max) throw new ErrorHttp(413, `El archivo supera ${Math.round(max / 1048576)} MB`);
  // Nombre único para no sobrescribir otros archivos.
  const nombre = `${crypto.randomUUID()}.${ext}`;
  // Guardamos en R2 con su tipo para servirlo correctamente.
  const obj = await env.FOTOS.put(nombre, request.body, { httpMetadata: { contentType: tipo } });
  // Verificación final del tamaño real (por si no venía content-length).
  if (obj.size > max) {
    await env.FOTOS.delete(nombre);
    throw new ErrorHttp(413, `El archivo supera ${Math.round(max / 1048576)} MB`);
  }
  return json({ url: `/api/media/${nombre}` }, 201);
}

// Entrega una foto o video desde R2, con caché larga (los nombres nunca se reutilizan).
async function servirMedia(request, env, nombre) {
  // Soporta "Range" para que los videos se puedan adelantar en el celular.
  const obj = await env.FOTOS.get(nombre, { range: request.headers, onlyIf: request.headers });
  if (!obj) return new Response('No encontrado', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);                                    // Content-Type guardado
  headers.set('etag', obj.httpEtag);                                 // Para validar caché
  headers.set('cache-control', 'public, max-age=31536000, immutable'); // Caché de 1 año
  headers.set('accept-ranges', 'bytes');
  // Si el navegador ya tiene la versión actual, no reenviamos el archivo.
  if (!('body' in obj) || !obj.body) return new Response(null, { status: 304, headers });
  // Respuesta parcial (206) cuando se pidió un rango del video.
  if (obj.range && request.headers.has('range')) {
    const { offset = 0, length = obj.size - offset } = obj.range;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set('content-length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('content-length', String(obj.size));
  return new Response(obj.body, { headers });
}
