import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, getAdminSecret } from '../api.js';

export default function AdminResults() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    try {
      const data = await api.getSession(Number(id));
      setSession(data.session);
      setItems(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [id]);

  function download() {
    const csv = buildCsv(items);
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conteo_${slug(session.supplier_name)}_${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!getAdminSecret())
    return (
      <div className="container">
        <div className="card">
          <div className="error">Necesitás iniciar sesión.</div>
          <Link to="/admin">Ir al panel</Link>
        </div>
      </div>
    );
  if (loading) return <div className="container spinner">Cargando…</div>;
  if (error)
    return (
      <div className="container">
        <div className="card">
          <div className="error">{error}</div>
          <Link to="/admin">Volver</Link>
        </div>
      </div>
    );

  const incorrectos = items.filter((i) => i.estado === 'incorrecto');
  const correctos = items.filter((i) => i.estado === 'correcto');
  const pendientes = items.filter((i) => !i.estado);

  return (
    <div className="container">
      <div className="topbar">
        <div>
          <h1>{session.supplier_name}</h1>
          <div className="brand">
            {session.period || 'Sin período'} ·{' '}
            <span className={`tag ${session.status === 'enviada' ? 'enviada' : 'abierta'}`}>
              {session.status === 'enviada' ? 'Enviada' : 'Abierta'}
            </span>
          </div>
        </div>
        <div>
          <Link to="/admin">
            <button className="secondary small">← Volver</button>
          </Link>{' '}
          <button className="small" onClick={download}>
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <Stat label="Total" value={items.length} />
        <Stat label="Correctos" value={correctos.length} color="var(--green)" />
        <Stat label="Incorrectos" value={incorrectos.length} color="var(--red)" />
        <Stat label="Sin responder" value={pendientes.length} color="var(--muted)" />
      </div>

      <div className="card">
        <h2>Detalle</h2>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th>Stock online</th>
                <th>Estado</th>
                <th>Sin procesar</th>
                <th>Procesado</th>
                <th>Comentario</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.descripcion}</td>
                  <td className="muted">
                    {it.stock_cajon ?? 0} cj · {it.stock_kg ?? 0} kg
                  </td>
                  <td>
                    <EstadoTag estado={it.estado} />
                  </td>
                  <td>{it.estado === 'incorrecto' ? cantidad(it.sp_cajon, it.sp_kg) : '—'}</td>
                  <td>{it.estado === 'incorrecto' ? cantidad(it.pr_cajon, it.pr_kg) : '—'}</td>
                  <td className="muted">{it.comentario || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
      <div className="muted">{label}</div>
    </div>
  );
}

function EstadoTag({ estado }) {
  if (estado === 'correcto') return <span className="tag correcto">Correcto</span>;
  if (estado === 'incorrecto') return <span className="tag incorrecto">Incorrecto</span>;
  return <span className="tag pendiente">Pendiente</span>;
}

function cantidad(cajon, kg) {
  const parts = [];
  if (cajon !== null && cajon !== undefined) parts.push(`${cajon} cj`);
  if (kg !== null && kg !== undefined) parts.push(`${kg} kg`);
  return parts.length ? parts.join(' · ') : '0';
}

// --- Exportación CSV (para Excel argentino: separador ';' y coma decimal) ---
function buildCsv(items) {
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
        num(it.stock_cajon),
        num(it.stock_kg),
        it.estado || 'sin responder',
        num(it.sp_cajon),
        num(it.sp_kg),
        num(it.pr_cajon),
        num(it.pr_kg),
        it.comentario || '',
      ]
        .map(cell)
        .join(';')
    );
  }
  return lines.join('\r\n');
}
function num(n) {
  if (n === null || n === undefined) return '';
  return String(n).replace('.', ',');
}
function cell(v) {
  const s = String(v ?? '');
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function slug(s) {
  return String(s || 'conteo')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .toLowerCase();
}
