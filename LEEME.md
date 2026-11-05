# DUVAN STORE · tienda-virtual

Tienda online de ropa en **Cloudflare Workers** con base de datos **D1** y fotos en **R2**.

- Tienda: `https://tienda-virtual.<tu-subdominio>.workers.dev/`
- Panel de administración: `https://tienda-virtual.<tu-subdominio>.workers.dev/admin/`

## Qué incluye

| Parte | Archivos |
|---|---|
| API (servidor) | `src/index.js` |
| Base de datos | `migrations/0001_inicial.sql` (tablas) y `migrations/0002_productos_ejemplo.sql` (13 productos de ejemplo) |
| Tienda | `public/index.html`, `public/js/tienda.js`, `public/css/tienda.css` |
| Panel | `public/admin/index.html`, `public/js/admin.js`, `public/css/admin.css` |
| Configuración de Cloudflare | `wrangler.jsonc` |

Funciones: inicio con banner, categorías, ofertas y más vendidos; catálogo con filtros por categoría, color, talla y precio; detalle con galería y video; carrito; pedido contraentrega o transferencia/QR con WhatsApp; confirmación con número de pedido; página de información con mapa. El panel tiene resumen del día, pedidos con estados (Nuevo, Pago confirmado, Despachado, Entregado, Cancelado), productos con interruptor de agotado, subida de fotos y video, stock por talla, y la configuración de la tienda (WhatsApp, dirección, horario, domicilio, Nequi, Daviplata y redes).

El stock se descuenta al hacer el pedido y vuelve si el pedido se cancela.

## Publicar desde GitHub (recomendado)

Cada `git push` a `main` publica la tienda automáticamente.

1. En Cloudflare → **Storage & databases → D1** → *Create database* → nombre `tienda-virtual-db`. Copia su **Database ID** en `wrangler.jsonc` (campo `database_id`) y haz commit.
2. En **R2** → *Create bucket* → nombre `tienda-virtual-fotos`.
3. En **Workers & Pages** → *Create* → *Import a repository* → elige el repositorio `Tienda-Online`.
   - Nombre del proyecto: `tienda-virtual`
   - Build command: *(vacío)*
   - Deploy command: `npm run publicar` (crea las tablas si faltan y publica)
4. Cuando termine el primer despliegue: Worker `tienda-virtual` → **Settings → Variables and Secrets** → *Add* → tipo **Secret**, nombre `ADMIN_CLAVE`, valor = la clave del panel.
5. Abre la URL `*.workers.dev` que aparece en el Worker.

## Publicar desde tu computador (alternativa)

Requisitos: Node.js 20 o superior.

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar sesión en Cloudflare (abre el navegador)
npx wrangler login

# 3. Crear la base de datos y copiar el "database_id" que aparece en wrangler.jsonc
npx wrangler d1 create tienda-virtual-db

# 4. Crear el bucket de fotos
npx wrangler r2 bucket create tienda-virtual-fotos

# 5. Crear las tablas y los productos de ejemplo
npm run db:remoto

# 6. Guardar la clave del panel (te la pide escrita, no queda en el código)
npx wrangler secret put ADMIN_CLAVE

# 7. Publicar
npm run publicar
```

Para actualizar después de un cambio solo hay que repetir el paso 7.

## Probar en tu computador

```bash
cp .dev.vars.example .dev.vars   # y cambia la clave
npm run db:local
npm run dev                      # abre http://localhost:8787
```

## Antes de entregar a Duvan

1. Entrar a `/admin/` → **Configuración** y poner el WhatsApp real, la dirección, el horario, el costo del domicilio, Nequi, Daviplata y las redes.
2. En **Productos**, reemplazar los productos de ejemplo por los reales con sus fotos (o eliminarlos).
