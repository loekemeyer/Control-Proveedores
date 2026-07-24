import express from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import db from './db.js';
import { parseWorkbook } from './parseExcel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';

app.use(express.json({ limit: '5mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ---------- Auth admin ----------
function requireAdmin(req, res, next) {
  const pass = req.get('x-admin-password') || req.query.admin_password;
  if (pass && pass === ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'No autorizado' });
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) return res.json({ ok: true });
  return res.status(401).json({ error: 'Contraseña incorrecta' });
});

// ---------- Admin: parsear Excel ----------
app.post('/api/admin/parse', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo Excel' });
  try {
    const suppliers = parseWorkbook(req.file.buffer);
    if (suppliers.length === 0) {
      return res.status(422).json({
        error:
          'No se detectaron hojas de proveedor (con "Descripción Parte" y una columna "Cajon <Proveedor>").',
      });
    }
    res.json({ suppliers });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo leer el Excel: ' + e.message });
  }
});

// ---------- Admin: crear sesion de conteo ----------
app.post('/api/admin/sessions', requireAdmin, (req, res) => {
  const { supplier_name, period, items } = req.body || {};
  if (!supplier_name || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Faltan datos (proveedor o items)' });
  }
  const token = nanoid(24);
  const insertSession = db.prepare(
    'INSERT INTO sessions (supplier_name, period, token) VALUES (?, ?, ?)'
  );
  const insertItem = db.prepare(
    'INSERT INTO items (session_id, ord, descripcion, stock_cajon, stock_kg) VALUES (?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    const info = insertSession.run(supplier_name, period || null, token);
    const sid = info.lastInsertRowid;
    items.forEach((it, i) => {
      insertItem.run(
        sid,
        i,
        String(it.descripcion || '').trim() || `Item ${i + 1}`,
        numOrNull(it.stock_cajon),
        numOrNull(it.stock_kg)
      );
    });
    return sid;
  });
  const sid = tx();
  res.json({ id: sid, token });
});

// ---------- Admin: listar sesiones ----------
app.get('/api/admin/sessions', requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.*,
              (SELECT COUNT(*) FROM items i WHERE i.session_id = s.id) AS total_items,
              (SELECT COUNT(*) FROM items i WHERE i.session_id = s.id AND i.estado IS NOT NULL) AS respondidos,
              (SELECT COUNT(*) FROM items i WHERE i.session_id = s.id AND i.estado = 'incorrecto') AS incorrectos
       FROM sessions s ORDER BY s.id DESC`
    )
    .all();
  res.json({ sessions: rows });
});

// ---------- Admin: detalle de sesion ----------
app.get('/api/admin/sessions/:id', requireAdmin, (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
  const items = db
    .prepare('SELECT * FROM items WHERE session_id = ? ORDER BY ord')
    .all(session.id);
  res.json({ session, items });
});

// ---------- Admin: eliminar sesion ----------
app.delete('/api/admin/sessions/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- Admin: exportar CSV ----------
app.get('/api/admin/sessions/:id/export.csv', requireAdmin, (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
  const items = db
    .prepare('SELECT * FROM items WHERE session_id = ? ORDER BY ord')
    .all(session.id);

  const headers = [
    'Descripción Parte',
    'Stock Online Cajón',
    'Stock Online KG',
    'Estado',
    'Sin Procesar Cajón',
    'Sin Procesar KG',
    'Procesado Cajón',
    'Procesado KG',
    'Comentario',
  ];
  const lines = [headers.join(';')];
  for (const it of items) {
    lines.push(
      [
        it.descripcion,
        fmt(it.stock_cajon),
        fmt(it.stock_kg),
        it.estado || 'sin responder',
        fmt(it.sp_cajon),
        fmt(it.sp_kg),
        fmt(it.pr_cajon),
        fmt(it.pr_kg),
        it.comentario || '',
      ]
        .map(csvCell)
        .join(';')
    );
  }
  const csv = '﻿' + lines.join('\r\n');
  const fname = `conteo_${slug(session.supplier_name)}_${session.id}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.send(csv);
});

// ---------- Proveedor: ver su sesion (por token) ----------
app.get('/api/c/:token', (req, res) => {
  const session = db
    .prepare('SELECT id, supplier_name, period, status FROM sessions WHERE token = ?')
    .get(req.params.token);
  if (!session) return res.status(404).json({ error: 'Link inválido o vencido' });
  const items = db
    .prepare(
      `SELECT id, ord, descripcion, stock_cajon, stock_kg,
              estado, sp_cajon, sp_kg, pr_cajon, pr_kg, comentario
       FROM items WHERE session_id = ? ORDER BY ord`
    )
    .all(session.id);
  res.json({ session, items });
});

// ---------- Proveedor: guardar respuesta de un item ----------
app.post('/api/c/:token/items/:itemId', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(req.params.token);
  if (!session) return res.status(404).json({ error: 'Link inválido' });
  if (session.status === 'enviada') {
    return res.status(409).json({ error: 'Este conteo ya fue enviado y no se puede modificar.' });
  }
  const item = db
    .prepare('SELECT * FROM items WHERE id = ? AND session_id = ?')
    .get(req.params.itemId, session.id);
  if (!item) return res.status(404).json({ error: 'Item no encontrado' });

  const body = req.body || {};
  // Update parcial: solo se tocan los campos presentes en el body.
  const fields = {};

  if ('estado' in body) {
    if (body.estado !== 'correcto' && body.estado !== 'incorrecto') {
      return res.status(400).json({ error: 'Estado inválido' });
    }
    fields.estado = body.estado;
    // Si pasa a "correcto", se limpian las cantidades.
    if (body.estado === 'correcto') {
      fields.sp_cajon = null;
      fields.sp_kg = null;
      fields.pr_cajon = null;
      fields.pr_kg = null;
      fields.comentario = null;
    }
  }

  // Debe existir un estado (ya guardado o en este request) para aceptar cantidades.
  const estadoFinal = 'estado' in fields ? fields.estado : item.estado;
  if (!estadoFinal) {
    return res.status(400).json({ error: 'Primero marcá Correcto o Incorrecto' });
  }

  if (estadoFinal === 'incorrecto' && body.estado !== 'correcto') {
    for (const k of ['sp_cajon', 'sp_kg', 'pr_cajon', 'pr_kg']) {
      if (k in body) fields[k] = numOrNull(body[k]);
    }
    if ('comentario' in body) {
      fields.comentario = (body.comentario || '').toString().slice(0, 500) || null;
    }
  }

  const keys = Object.keys(fields);
  if (keys.length === 0) return res.json({ ok: true });

  const setClause = keys.map((k) => `${k} = ?`).join(', ') + ", updated_at = datetime('now')";
  const values = keys.map((k) => fields[k]);
  db.prepare(`UPDATE items SET ${setClause} WHERE id = ?`).run(...values, item.id);
  res.json({ ok: true });
});

// ---------- Proveedor: enviar (cerrar) el conteo ----------
app.post('/api/c/:token/submit', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(req.params.token);
  if (!session) return res.status(404).json({ error: 'Link inválido' });
  db.prepare(
    "UPDATE sessions SET status = 'enviada', submitted_at = datetime('now') WHERE id = ?"
  ).run(session.id);
  res.json({ ok: true });
});

// ---------- Frontend estatico ----------
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Control Proveedores corriendo en http://localhost:${PORT}`);
});

// ---------- helpers ----------
function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function fmt(n) {
  if (n === null || n === undefined) return '';
  return String(n).replace('.', ',');
}
function csvCell(v) {
  const s = String(v ?? '');
  if (/[";\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function slug(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase();
}
