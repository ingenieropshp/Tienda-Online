-- =====================================================================
-- SANTOS STORE · Migración 0005: enlaces de invitación para crear cuentas del panel
-- Reemplaza la "clave de instalación". Cada enlace sirve UNA sola vez y vence.
-- Solo se guarda la huella SHA-256 del token, nunca el token.
-- =====================================================================
CREATE TABLE IF NOT EXISTS invitaciones (
  token_hash  TEXT    PRIMARY KEY,                       -- SHA-256 del token que va en el enlace
  expira      TEXT    NOT NULL,                          -- Vence en esta fecha (UTC)
  usado       INTEGER NOT NULL DEFAULT 0,                -- 1 = ya se usó para crear una cuenta
  creado_en   TEXT    NOT NULL DEFAULT (datetime('now'))
);
