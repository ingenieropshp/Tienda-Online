-- =====================================================================
-- SANTOS STORE · Migración 0004: cuentas del panel con correo y contraseña
-- Las contraseñas NUNCA se guardan: solo su huella PBKDF2-SHA256 con sal.
-- =====================================================================

-- Personas que pueden entrar al panel de administración
CREATE TABLE IF NOT EXISTS administradores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,         -- Identificador
  correo       TEXT    NOT NULL UNIQUE COLLATE NOCASE,    -- Correo para entrar (sin distinguir mayúsculas)
  hash         TEXT    NOT NULL,                          -- Huella de la contraseña (hex)
  sal          TEXT    NOT NULL,                          -- Sal aleatoria (hex), distinta por cuenta
  iteraciones  INTEGER NOT NULL,                          -- Vueltas de PBKDF2 usadas al crear la huella
  creado_en    TEXT    NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT  NOT NULL DEFAULT (datetime('now'))
);

-- Sesiones abiertas: se guarda la huella SHA-256 del token, no el token
CREATE TABLE IF NOT EXISTS sesiones (
  token_hash   TEXT    PRIMARY KEY,                       -- SHA-256 del token que va en la cookie
  admin_id     INTEGER NOT NULL REFERENCES administradores(id) ON DELETE CASCADE,
  expira       TEXT    NOT NULL,                          -- Fecha de vencimiento (UTC)
  creado_en    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sesiones_expira ON sesiones (expira);

-- Intentos fallidos de ingreso, para frenar a quien intente adivinar contraseñas
CREATE TABLE IF NOT EXISTS intentos_login (
  clave        TEXT    PRIMARY KEY,                       -- 'correo:<correo>' o 'ip:<ip>'
  fallos       INTEGER NOT NULL DEFAULT 0,                -- Fallos dentro de la ventana
  desde        TEXT    NOT NULL DEFAULT (datetime('now')) -- Inicio de la ventana de 15 minutos
);
