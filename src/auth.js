// =====================================================================
// SANTOS STORE · Inicio de sesión del panel con correo y contraseña
// - Contraseñas guardadas como huella PBKDF2-SHA256 con sal aleatoria.
// - Sesión en una cookie HttpOnly con un token aleatorio; en la base solo
//   se guarda la huella SHA-256 del token.
// - Límite de intentos fallidos por correo y por IP.
// =====================================================================

// Vueltas de PBKDF2 (100.000 es el máximo que permite Cloudflare Workers).
const ITERACIONES = 100000;
// Nombre de la cookie de sesión.
const COOKIE = 'ss_sesion';
// Duración de la sesión: 7 días.
const DURACION_SEG = 7 * 24 * 60 * 60;
// Límite de fallos en 15 minutos.
const MAX_FALLOS_CORREO = 5;
const MAX_FALLOS_IP = 20;
const VENTANA_MIN = 15;
// Largo mínimo de contraseña.
const MIN_CONTRASENA = 10;

// Error con código HTTP; lo crea quien importa este archivo.
let ErrorHttp;
export function configurarErrores(Clase) { ErrorHttp = Clase; }

// ---------- Utilidades de bytes ----------

// Bytes → texto hexadecimal.
const aHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
// Texto hexadecimal → bytes.
const deHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
// Bytes aleatorios seguros.
const aleatorio = (n) => crypto.getRandomValues(new Uint8Array(n));

// SHA-256 de un texto, en hex.
async function sha256(texto) {
  return aHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
}

// Calcula la huella PBKDF2 de una contraseña con la sal dada.
async function huella(contrasena, salBytes, iteraciones) {
  // Importa la contraseña como material de clave.
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(contrasena), 'PBKDF2', false, ['deriveBits']);
  // Deriva 256 bits con SHA-256.
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salBytes, iterations: iteraciones }, base, 256);
  return new Uint8Array(bits);
}

// Compara dos arreglos de bytes del mismo largo en tiempo constante.
function igualesBytes(a, b) {
  if (a.length !== b.length) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

// Valida formato básico de correo y lo normaliza.
function limpiarCorreo(c) {
  const correo = String(c ?? '').trim().toLowerCase().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new ErrorHttp(400, 'Escribe un correo válido');
  return correo;
}

// Valida la contraseña nueva.
function validarContrasena(c) {
  const s = String(c ?? '');
  if (s.length < MIN_CONTRASENA) throw new ErrorHttp(400, `La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres`);
  if (s.length > 200) throw new ErrorHttp(400, 'La contraseña es demasiado larga');
  return s;
}

// Crea sal + huella para guardar en la base.
async function crearHuella(contrasena) {
  const sal = aleatorio(16);
  const h = await huella(contrasena, sal, ITERACIONES);
  return { hash: aHex(h), sal: aHex(sal), iteraciones: ITERACIONES };
}

// ---------- Cookies ----------

// Lee el valor de una cookie del encabezado.
function leerCookie(request, nombre) {
  const c = request.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + nombre + '=([^;]+)'));
  return m ? m[1] : null;
}

// Encabezado Set-Cookie de la sesión (HttpOnly: el JavaScript de la página no la puede leer).
function cookieSesion(token, maxAge) {
  return `${COOKIE}=${token}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

// ---------- Límite de intentos ----------

// Lanza 429 si el correo o la IP superaron el límite de fallos.
async function revisarLimite(env, correo, ip) {
  const { results } = await env.DB.prepare(
    `SELECT clave, fallos FROM intentos_login WHERE clave IN (?, ?) AND desde > datetime('now', '-${VENTANA_MIN} minutes')`,
  ).bind('correo:' + correo, 'ip:' + ip).all();
  for (const r of results) {
    const max = r.clave.startsWith('ip:') ? MAX_FALLOS_IP : MAX_FALLOS_CORREO;
    if (r.fallos >= max) throw new ErrorHttp(429, `Demasiados intentos. Espera ${VENTANA_MIN} minutos e inténtalo de nuevo.`);
  }
}

// Suma un fallo al correo y a la IP (reinicia la ventana si ya venció).
async function registrarFallo(env, correo, ip) {
  const sql = `INSERT INTO intentos_login (clave, fallos, desde) VALUES (?, 1, datetime('now'))
    ON CONFLICT(clave) DO UPDATE SET
      fallos = CASE WHEN desde > datetime('now', '-${VENTANA_MIN} minutes') THEN fallos + 1 ELSE 1 END,
      desde  = CASE WHEN desde > datetime('now', '-${VENTANA_MIN} minutes') THEN desde ELSE datetime('now') END`;
  await env.DB.batch([env.DB.prepare(sql).bind('correo:' + correo), env.DB.prepare(sql).bind('ip:' + ip)]);
}

// ---------- Sesiones ----------

// Crea una sesión nueva y devuelve el encabezado Set-Cookie.
async function abrirSesion(env, adminId) {
  const token = aHex(aleatorio(32));                  // Token secreto de 256 bits
  await env.DB.batch([
    // Limpia sesiones vencidas de paso.
    env.DB.prepare("DELETE FROM sesiones WHERE expira <= datetime('now')"),
    env.DB.prepare(`INSERT INTO sesiones (token_hash, admin_id, expira) VALUES (?, ?, datetime('now', '+${DURACION_SEG} seconds'))`)
      .bind(await sha256(token), adminId),
  ]);
  return cookieSesion(token, DURACION_SEG);
}

// Devuelve el administrador de la sesión actual, o null.
async function adminDeSesion(request, env) {
  const token = leerCookie(request, COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  return env.DB.prepare(
    `SELECT a.id, a.correo FROM sesiones s JOIN administradores a ON a.id = s.admin_id
     WHERE s.token_hash = ? AND s.expira > datetime('now')`,
  ).bind(await sha256(token)).first();
}

// Exige una sesión válida. Las peticiones que cambian datos además deben traer
// el encabezado "x-panel: 1" (otra página no puede enviarlo sin permiso del navegador).
export async function exigirAdmin(request, env) {
  if (request.method !== 'GET' && request.headers.get('x-panel') !== '1') throw new ErrorHttp(403, 'Petición no permitida');
  const admin = await adminDeSesion(request, env);
  if (!admin) throw new ErrorHttp(401, 'Tu sesión terminó. Vuelve a entrar.');
  return admin;
}

// ---------- Rutas públicas del ingreso ----------

// Atiende /api/admin/estado, /registro, /entrar y /salir. Devuelve null si la ruta es otra.
export async function rutasIngreso(request, env, ruta, json) {
  const m = request.method;
  // IP del visitante (Cloudflare la envía en este encabezado).
  const ip = request.headers.get('cf-connecting-ip') || 'local';

  // ¿Ya existe al menos una cuenta? (la pantalla decide si muestra "Crear cuenta" o "Entrar")
  if (m === 'GET' && ruta === '/api/admin/estado') {
    const fila = await env.DB.prepare('SELECT COUNT(*) AS n FROM administradores').first();
    const admin = await adminDeSesion(request, env);
    return json({ hay_admin: fila.n > 0, sesion: admin ? { correo: admin.correo } : null });
  }

  // Las demás rutas de ingreso solo aceptan POST desde el panel.
  if (m !== 'POST' || !['/api/admin/registro', '/api/admin/entrar', '/api/admin/salir'].includes(ruta)) return null;
  if (request.headers.get('x-panel') !== '1') throw new ErrorHttp(403, 'Petición no permitida');
  const d = await request.json().catch(() => ({}));

  // Crear la PRIMERA cuenta. Solo funciona si no hay ninguna y pide la clave de instalación (secreto ADMIN_CLAVE).
  if (ruta === '/api/admin/registro') {
    if (!env.ADMIN_CLAVE) throw new ErrorHttp(503, 'Falta configurar ADMIN_CLAVE en Cloudflare');
    await revisarLimite(env, 'registro', ip);
    const enc = new TextEncoder();
    const [a, b] = await Promise.all([sha256(String(d.clave_instalacion ?? '')), sha256(env.ADMIN_CLAVE)]);
    if (!igualesBytes(enc.encode(a), enc.encode(b))) {
      await registrarFallo(env, 'registro', ip);
      throw new ErrorHttp(401, 'La clave de instalación no es correcta');
    }
    const correo = limpiarCorreo(d.correo);
    const h = await crearHuella(validarContrasena(d.contrasena));
    // INSERT solo si la tabla está vacía (evita crear una segunda cuenta por esta vía).
    const r = await env.DB.prepare(
      `INSERT INTO administradores (correo, hash, sal, iteraciones)
       SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM administradores) RETURNING id`,
    ).bind(correo, h.hash, h.sal, h.iteraciones).first();
    if (!r) throw new ErrorHttp(409, 'Ya existe una cuenta. Entra con tu correo y contraseña.');
    return json({ ok: true, correo }, 201, { 'set-cookie': await abrirSesion(env, r.id) });
  }

  // Entrar con correo y contraseña.
  if (ruta === '/api/admin/entrar') {
    const correo = String(d.correo ?? '').trim().toLowerCase().slice(0, 120);
    const contrasena = String(d.contrasena ?? '').slice(0, 200);
    await revisarLimite(env, correo, ip);
    const fila = await env.DB.prepare('SELECT id, hash, sal, iteraciones FROM administradores WHERE correo = ?').bind(correo).first();
    // Si el correo no existe, igual calculamos una huella para tardar lo mismo (no revela qué correos existen).
    const sal = fila ? deHex(fila.sal) : aleatorio(16);
    const calculada = await huella(contrasena, sal, fila ? fila.iteraciones : ITERACIONES);
    const ok = fila ? igualesBytes(calculada, deHex(fila.hash)) : false;
    if (!ok) {
      await registrarFallo(env, correo, ip);
      throw new ErrorHttp(401, 'Correo o contraseña incorrectos');
    }
    // Ingreso correcto: se borran los fallos de ese correo.
    await env.DB.prepare('DELETE FROM intentos_login WHERE clave = ?').bind('correo:' + correo).run();
    return json({ ok: true, correo }, 200, { 'set-cookie': await abrirSesion(env, fila.id) });
  }

  // Salir: borra la sesión y la cookie.
  if (ruta === '/api/admin/salir') {
    const token = leerCookie(request, COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sesiones WHERE token_hash = ?').bind(await sha256(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': cookieSesion('', 0) });
  }
  return null;
}

// Cambiar la contraseña de la cuenta con sesión abierta (pide la actual).
export async function cambiarContrasena(request, env, admin, json) {
  const d = await request.json().catch(() => ({}));
  const fila = await env.DB.prepare('SELECT hash, sal, iteraciones FROM administradores WHERE id = ?').bind(admin.id).first();
  const actual = await huella(String(d.actual ?? '').slice(0, 200), deHex(fila.sal), fila.iteraciones);
  if (!igualesBytes(actual, deHex(fila.hash))) throw new ErrorHttp(401, 'La contraseña actual no es correcta');
  const h = await crearHuella(validarContrasena(d.nueva));
  // Guarda la nueva huella y cierra las demás sesiones abiertas.
  await env.DB.batch([
    env.DB.prepare("UPDATE administradores SET hash = ?, sal = ?, iteraciones = ?, actualizado_en = datetime('now') WHERE id = ?")
      .bind(h.hash, h.sal, h.iteraciones, admin.id),
    env.DB.prepare('DELETE FROM sesiones WHERE admin_id = ?').bind(admin.id),
  ]);
  return json({ ok: true }, 200, { 'set-cookie': await abrirSesion(env, admin.id) });
}
