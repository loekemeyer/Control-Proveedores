import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';

export default function SupplierCount() {
  const { token } = useParams();
  const [session, setSession] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getSupplierSession(token);
        setSession(data.session);
        setItems(data.items);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const enviada = session && session.status === 'enviada';
  const respondidos = items.filter((i) => i.estado).length;
  const total = items.length;

  function updateItemLocal(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  async function submitAll() {
    const faltan = items.filter((i) => !i.estado).length;
    if (faltan > 0) {
      if (
        !window.confirm(
          `Todavía te faltan ${faltan} items sin marcar. ¿Enviar igual? Después no vas a poder modificar.`
        )
      )
        return;
    } else if (!window.confirm('¿Enviar el conteo? Después no vas a poder modificarlo.')) {
      return;
    }
    setSubmitting(true);
    try {
      await api.submit(token);
      setSession((s) => ({ ...s, status: 'enviada' }));
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="container container-narrow spinner">Cargando…</div>;
  if (error && !session)
    return (
      <div className="container container-narrow">
        <div className="card">
          <div className="error">{error}</div>
        </div>
      </div>
    );

  return (
    <div className="container container-narrow">
      <div className="topbar">
        <div>
          <h1>Control de stock</h1>
          <div className="brand">
            Proveedor: <strong>{session.supplier_name}</strong>
            {session.period ? ` · ${session.period}` : ''}
          </div>
        </div>
      </div>

      {enviada && (
        <div className="success">
          Este conteo ya fue enviado. ¡Gracias! Si necesitás corregir algo, avisale a Loekemeyer.
        </div>
      )}
      {error && <div className="error">{error}</div>}

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Para cada pieza, marcá si el stock que figura es <strong>Correcto</strong> o{' '}
          <strong>Incorrecto</strong>. Si es incorrecto, cargá cuánto tenés realmente en la tabla,
          separando <strong>sin procesar</strong> (crudo), <strong>en ganchera</strong> (en proceso) y{' '}
          <strong>procesado</strong>. Podés cargar en cajón o en kg (se convierte solo).
        </p>
      </div>

      {items.map((it) => (
        <ItemCard
          key={it.id}
          token={token}
          item={it}
          disabled={enviada}
          onLocalChange={updateItemLocal}
          onError={setError}
        />
      ))}

      {!enviada && (
        <div className="sticky-bar">
          <span className="progress">
            {respondidos}/{total} marcados
          </span>
          <button onClick={submitAll} disabled={submitting}>
            {submitting ? 'Enviando…' : 'Enviar conteo'}
          </button>
        </div>
      )}
    </div>
  );
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}
function toNumOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function ItemCard({ token, item, disabled, onLocalChange, onError }) {
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);

  const factor = toNumOrNull(item.kg_x_cajon); // kg por cajón (del Excel)

  // Guarda SOLO los campos del patch (update parcial). Evita pisar con datos viejos.
  async function save(patch) {
    if (!item.estado && !('estado' in patch)) return;
    onLocalChange(item.id, patch); // optimista
    setSaving(true);
    try {
      await api.saveResponse(token, item.id, patch);
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 1200);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function setEstado(estado) {
    if (estado === 'correcto') {
      onLocalChange(item.id, {
        sp_cajon: null, sp_kg: null,
        gn_cajon: null, gn_kg: null,
        pr_cajon: null, pr_kg: null,
        comentario: null,
      });
    }
    save({ estado });
  }

  // Al escribir cajones, autocompleta kg (y viceversa) usando el factor.
  function onCajon(prefix, raw) {
    const patch = { [`${prefix}_cajon`]: raw };
    if (factor && factor > 0) {
      patch[`${prefix}_kg`] = raw === '' ? '' : round3(Number(raw) * factor);
    }
    onLocalChange(item.id, patch);
  }
  function onKg(prefix, raw) {
    const patch = { [`${prefix}_kg`]: raw };
    if (factor && factor > 0) {
      patch[`${prefix}_cajon`] = raw === '' ? '' : round3(Number(raw) / factor);
    }
    onLocalChange(item.id, patch);
  }
  function blurPair(prefix) {
    save({
      [`${prefix}_cajon`]: toNumOrNull(item[`${prefix}_cajon`]),
      [`${prefix}_kg`]: toNumOrNull(item[`${prefix}_kg`]),
    });
  }
  function blurText(field, value) {
    save({ [field]: value === '' ? null : value });
  }

  // Pone en 0 todos los estados (cajones y kg).
  function ponerEnCero() {
    save({
      sp_cajon: 0, sp_kg: 0,
      gn_cajon: 0, gn_kg: 0,
      pr_cajon: 0, pr_kg: 0,
    });
  }

  // Fila de la tabla de estados. Función (no componente) para no perder el foco.
  const fila = (label, color, prefix) => (
    <tr key={prefix}>
      <td style={{ fontWeight: 600, color, whiteSpace: 'nowrap' }}>{label}</td>
      <td>
        <input
          className="cell-input"
          type="number"
          step="any"
          inputMode="decimal"
          value={item[`${prefix}_cajon`] ?? ''}
          disabled={disabled}
          onChange={(e) => onCajon(prefix, e.target.value)}
          onBlur={() => blurPair(prefix)}
        />
      </td>
      <td>
        <input
          className="cell-input"
          type="number"
          step="any"
          inputMode="decimal"
          value={item[`${prefix}_kg`] ?? ''}
          disabled={disabled}
          onChange={(e) => onKg(prefix, e.target.value)}
          onBlur={() => blurPair(prefix)}
        />
      </td>
    </tr>
  );

  return (
    <div className={`item ${item.estado || ''}`}>
      <div className="item-head">
        <div>
          <div className="item-desc">{item.descripcion}</div>
          <div className="item-stock">
            Stock online: {item.stock_cajon ?? 0} cajón · {item.stock_kg ?? 0} kg
          </div>
        </div>
        {saving ? (
          <span className="muted">Guardando…</span>
        ) : savedAt ? (
          <span className="tag correcto">✓</span>
        ) : null}
      </div>

      <div className="item-actions">
        <button
          className={`btn-correcto ${item.estado === 'correcto' ? 'active' : ''}`}
          onClick={() => setEstado('correcto')}
          disabled={disabled}
        >
          ✓ Correcto
        </button>
        <button
          className={`btn-incorrecto ${item.estado === 'incorrecto' ? 'active' : ''}`}
          onClick={() => setEstado('incorrecto')}
          disabled={disabled}
        >
          ✗ Incorrecto
        </button>
      </div>

      {item.estado === 'incorrecto' && (
        <div className="detalle">
          <div className="detalle-head">
            <div className="subt" style={{ margin: 0 }}>¿Cuánto tenés realmente?</div>
            <button className="ghost small" onClick={ponerEnCero} disabled={disabled}>
              En Cero
            </button>
          </div>
          {factor && factor > 0 ? (
            <div className="muted" style={{ margin: '4px 0 8px' }}>
              Cargá en cajones o en kg: se convierte solo (1 cajón = {round3(factor)} kg).
            </div>
          ) : (
            <div className="muted" style={{ margin: '4px 0 8px' }}>
              Cargá en cajones y/o en kg.
            </div>
          )}

          <table className="estados">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Cajón</th>
                <th>KG</th>
              </tr>
            </thead>
            <tbody>
              {fila('Sin procesar', 'var(--amber)', 'sp')}
              {fila('En Ganchera', 'var(--primary)', 'gn')}
              {fila('Procesado', 'var(--green)', 'pr')}
            </tbody>
          </table>

          <div className="field" style={{ marginTop: 10 }}>
            <label>Comentario (opcional)</label>
            <input
              type="text"
              value={item.comentario ?? ''}
              disabled={disabled}
              placeholder="Aclaración…"
              onChange={(e) => onLocalChange(item.id, { comentario: e.target.value })}
              onBlur={(e) => blurText('comentario', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
