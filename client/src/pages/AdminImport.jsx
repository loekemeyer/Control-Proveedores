import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api, getAdminSecret, setAdminSecret, clearAdminSecret } from '../api.js';
import { parseWorkbook } from '../lib/parseExcel.js';

// Arma el link del proveedor respetando el base de GitHub Pages y el HashRouter.
function supplierLink(token) {
  const base = import.meta.env.BASE_URL || '/';
  return `${window.location.origin}${base}#/c/${token}`;
}

export default function AdminImport() {
  const [authed, setAuthed] = useState(!!getAdminSecret());
  return authed ? (
    <AdminPanel onLogout={() => setAuthed(false)} />
  ) : (
    <Login onOk={() => setAuthed(true)} />
  );
}

function Login({ onOk }) {
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      setAdminSecret(pass);
      await api.login(pass);
      onOk();
    } catch (err) {
      clearAdminSecret();
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container container-narrow">
      <div className="topbar">
        <h1>Control de Proveedores</h1>
      </div>
      <div className="card">
        <h2>Panel de administración</h2>
        <form onSubmit={submit}>
          {error && <div className="error">{error}</div>}
          <div className="field">
            <label>Clave de acceso</label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoFocus
            />
          </div>
          <button disabled={loading || !pass}>{loading ? 'Ingresando…' : 'Ingresar'}</button>
        </form>
      </div>
    </div>
  );
}

function AdminPanel({ onLogout }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const rows = await api.listSessions();
      setSessions(rows || []);
      setError('');
    } catch (err) {
      if (/autoriz/i.test(err.message)) {
        clearAdminSecret();
        onLogout();
        return;
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function logout() {
    clearAdminSecret();
    onLogout();
  }

  return (
    <div className="container">
      <div className="topbar">
        <h1>Control de Proveedores</h1>
        <button className="ghost small" onClick={logout}>
          Salir
        </button>
      </div>

      <ImportWizard onCreated={load} />

      <div className="card">
        <h2>Conteos generados</h2>
        {error && <div className="error">{error}</div>}
        {loading ? (
          <div className="spinner">Cargando…</div>
        ) : sessions.length === 0 ? (
          <p className="muted">Todavía no generaste ningún conteo. Subí un Excel arriba.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Período</th>
                  <th>Estado</th>
                  <th>Avance</th>
                  <th>Link</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <SessionRow key={s.id} s={s} onChange={load} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionRow({ s, onChange }) {
  const link = supplierLink(s.token);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copiá el link:', link);
    }
  }
  async function del() {
    if (!window.confirm(`¿Eliminar el conteo de ${s.supplier_name}?`)) return;
    await api.deleteSession(s.id);
    onChange();
  }

  return (
    <tr>
      <td>
        <strong>{s.supplier_name}</strong>
      </td>
      <td>{s.period || '—'}</td>
      <td>
        <span className={`tag ${s.status === 'enviada' ? 'enviada' : 'abierta'}`}>
          {s.status === 'enviada' ? 'Enviada' : 'Abierta'}
        </span>
      </td>
      <td>
        {s.respondidos}/{s.total_items}
        {s.incorrectos > 0 && (
          <span className="tag incorrecto" style={{ marginLeft: 6 }}>
            {s.incorrectos} incorr.
          </span>
        )}
      </td>
      <td>
        <button className="ghost small" onClick={copy}>
          {copied ? '¡Copiado!' : 'Copiar link'}
        </button>
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <Link to={`/admin/resultados/${s.id}`}>
          <button className="secondary small">Ver</button>
        </Link>{' '}
        <button className="ghost small" onClick={del} style={{ color: 'var(--red)' }}>
          Borrar
        </button>
      </td>
    </tr>
  );
}

function ImportWizard({ onCreated }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [selected, setSelected] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [period, setPeriod] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdLink, setCreatedLink] = useState('');

  const current = suppliers.find((s) => s.sheet === selected);

  async function onParse(e) {
    e.preventDefault();
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const buf = await file.arrayBuffer();
      const found = parseWorkbook(buf);
      if (!found.length) {
        throw new Error(
          'No se detectaron hojas de proveedor (con "Descripción Parte" y una columna "Cajon <Proveedor>").'
        );
      }
      setSuppliers(found);
      setSelected(found[0].sheet);
      setSupplierName(found[0].sheet);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function onSelectSupplier(sheet) {
    setSelected(sheet);
    setSupplierName(sheet);
  }

  async function onCreate() {
    if (!current) return;
    setLoading(true);
    setError('');
    try {
      const { token } = await api.createSession({
        supplier_name: supplierName.trim() || current.sheet,
        period: period.trim(),
        items: current.items,
      });
      setCreatedLink(supplierLink(token));
      setStep(3);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep(1);
    setFile(null);
    setSuppliers([]);
    setSelected('');
    setSupplierName('');
    setPeriod('');
    setCreatedLink('');
    setError('');
  }

  return (
    <div className="card">
      <h2>Nuevo conteo desde Excel</h2>
      {error && <div className="error">{error}</div>}

      {step === 1 && (
        <form onSubmit={onParse}>
          <div className="field">
            <label>Archivo Excel (.xlsx)</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files[0])}
            />
          </div>
          <button disabled={!file || loading}>
            {loading ? 'Leyendo…' : 'Leer proveedores del Excel'}
          </button>
        </form>
      )}

      {step === 2 && current && (
        <div>
          <div className="row">
            <div className="field">
              <label>Hoja / Proveedor detectado</label>
              <select value={selected} onChange={(e) => onSelectSupplier(e.target.value)}>
                {suppliers.map((s) => (
                  <option key={s.sheet} value={s.sheet}>
                    {s.sheet} ({s.itemCount} items)
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Nombre del proveedor</label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Período (opcional)</label>
              <input
                type="text"
                placeholder="Ej: Julio 2026"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>
          </div>

          <h3>Vista previa ({current.items.length} items)</h3>
          <div className="preview-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Descripción Parte</th>
                  <th>Cajón online</th>
                  <th>KG online</th>
                </tr>
              </thead>
              <tbody>
                {current.items.map((it, i) => (
                  <tr key={i}>
                    <td className="muted">{i + 1}</td>
                    <td>{it.descripcion}</td>
                    <td>{it.stock_cajon ?? '—'}</td>
                    <td>{it.stock_kg ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            <button className="secondary" onClick={reset} disabled={loading}>
              Cancelar
            </button>
            <button onClick={onCreate} disabled={loading}>
              {loading ? 'Creando…' : 'Crear conteo y generar link'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <div className="success">
            ¡Conteo creado! Mandale este link al proveedor (WhatsApp, mail, etc.):
          </div>
          <div className="link-box">
            <span style={{ flex: 1 }}>{createdLink}</span>
            <button
              className="small"
              onClick={() => {
                navigator.clipboard
                  .writeText(createdLink)
                  .catch(() => window.prompt('Copiá el link:', createdLink));
              }}
            >
              Copiar
            </button>
          </div>
          <div style={{ marginTop: 14 }}>
            <button className="secondary" onClick={reset}>
              Crear otro conteo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
