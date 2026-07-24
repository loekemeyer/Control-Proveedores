-- Esquema de la base de datos (SQLite)

CREATE TABLE IF NOT EXISTS sessions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_name  TEXT NOT NULL,
  period         TEXT,                      -- ej. "Julio 2026"
  token          TEXT NOT NULL UNIQUE,      -- link secreto del proveedor
  status         TEXT NOT NULL DEFAULT 'abierta',  -- abierta | enviada
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at   TEXT
);

CREATE TABLE IF NOT EXISTS items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ord          INTEGER NOT NULL,
  descripcion  TEXT NOT NULL,
  stock_cajon  REAL,
  stock_kg     REAL,
  -- Respuesta del proveedor:
  estado       TEXT,          -- null (sin responder) | correcto | incorrecto
  sp_cajon     REAL,          -- sin procesar (crudo) - cajones
  sp_kg        REAL,          -- sin procesar (crudo) - kg
  pr_cajon     REAL,          -- procesado - cajones
  pr_kg        REAL,          -- procesado - kg
  comentario   TEXT,
  updated_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_items_session ON items(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
