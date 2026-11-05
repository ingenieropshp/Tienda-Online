-- =====================================================================
-- DUVAN STORE · Migración 0001: tablas iniciales de la tienda
-- Ejecutar con:  npx wrangler d1 migrations apply tienda-virtual-db --remote
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabla de productos del catálogo
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS productos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,      -- Identificador único del producto
  nombre          TEXT    NOT NULL,                       -- Nombre visible, ej: "Camisa Oxford"
  descripcion     TEXT    NOT NULL DEFAULT '',            -- Descripción corta para el detalle
  categoria       TEXT    NOT NULL,                       -- Camisas, Pantalones, Vestidos, Zapatos, Accesorios
  precio          INTEGER NOT NULL CHECK (precio >= 0),   -- Precio actual en pesos (sin decimales)
  precio_anterior INTEGER CHECK (precio_anterior IS NULL OR precio_anterior >= 0), -- Precio antes del descuento (NULL = sin descuento)
  colores         TEXT    NOT NULL DEFAULT '[]',          -- JSON: [{"nombre":"Negro","hex":"#111111"}]
  tallas          TEXT    NOT NULL DEFAULT '{}',          -- JSON con stock por talla: {"S":3,"M":5}
  fotos           TEXT    NOT NULL DEFAULT '[]',          -- JSON: lista de URLs de fotos
  video           TEXT,                                   -- URL de un video con modelo (opcional)
  agotado         INTEGER NOT NULL DEFAULT 0,             -- 1 = marcado agotado a mano desde el panel
  destacado       INTEGER NOT NULL DEFAULT 0,             -- 1 = aparece en "Lo más vendido"
  activo          INTEGER NOT NULL DEFAULT 1,             -- 0 = oculto (borrado lógico)
  creado_en       TEXT    NOT NULL DEFAULT (datetime('now')), -- Fecha de creación (UTC)
  actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now'))  -- Última modificación (UTC)
);

-- Índice para filtrar rápido por categoría en el catálogo
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos (categoria, activo);

-- ---------------------------------------------------------------------
-- Tabla de pedidos que hacen los clientes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,      -- Número interno
  codigo          TEXT    NOT NULL UNIQUE,                -- Código para el cliente, ej: DS-1A2B3C
  cliente_nombre  TEXT    NOT NULL,                       -- Nombre del cliente
  celular         TEXT    NOT NULL,                       -- Celular / WhatsApp del cliente
  direccion       TEXT    NOT NULL,                       -- Dirección de entrega
  barrio          TEXT    NOT NULL,                       -- Barrio o municipio
  notas           TEXT    NOT NULL DEFAULT '',            -- Indicaciones adicionales
  metodo_pago     TEXT    NOT NULL CHECK (metodo_pago IN ('contraentrega','transferencia')), -- Forma de pago elegida
  items           TEXT    NOT NULL,                       -- JSON con los productos pedidos (precio congelado)
  subtotal        INTEGER NOT NULL,                       -- Suma de productos
  domicilio       INTEGER NOT NULL DEFAULT 0,             -- Costo del domicilio
  total           INTEGER NOT NULL,                       -- subtotal + domicilio
  estado          TEXT    NOT NULL DEFAULT 'Nuevo'
                  CHECK (estado IN ('Nuevo','Pago confirmado','Despachado','Entregado','Cancelado')), -- Estado del pedido
  creado_en       TEXT    NOT NULL DEFAULT (datetime('now')), -- Fecha del pedido (UTC)
  actualizado_en  TEXT    NOT NULL DEFAULT (datetime('now'))  -- Último cambio de estado (UTC)
);

-- Índice para listar pedidos por estado y fecha en el panel
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos (estado, creado_en);

-- ---------------------------------------------------------------------
-- Configuración editable desde el panel (clave → valor)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,                                 -- Nombre del ajuste
  valor TEXT NOT NULL                                     -- Valor del ajuste (texto)
);

-- Valores iniciales de ejemplo (se cambian desde Panel → Configuración)
INSERT OR IGNORE INTO configuracion (clave, valor) VALUES
  ('whatsapp',        '573000000000'),                          -- Número con indicativo 57, sin + ni espacios
  ('direccion',       'Apartadó, Antioquia (dirección por confirmar)'), -- Ubicación de la tienda
  ('mapa',            'Apartadó, Antioquia'),                   -- Texto que se busca en Google Maps
  ('horario',         'Lunes a sábado 9:00 a. m. – 8:00 p. m. · Domingos 10:00 a. m. – 2:00 p. m.'),
  ('domicilio_costo', '5000'),                                  -- Costo del domicilio en pesos
  ('domicilio_gratis_desde', '150000'),                         -- Envío gratis desde este subtotal (0 = nunca)
  ('zonas',           'Apartadó, Carepa, Chigorodó y Turbo. Entregas el mismo día o al día siguiente.'),
  ('nequi',           '300 000 0000'),                          -- Número Nequi para transferencias
  ('daviplata',       '300 000 0000'),                          -- Número Daviplata
  ('instagram',       'https://instagram.com/'),                -- Enlace de Instagram
  ('facebook',        'https://facebook.com/'),                 -- Enlace de Facebook
  ('tiktok',          'https://tiktok.com/');                   -- Enlace de TikTok
