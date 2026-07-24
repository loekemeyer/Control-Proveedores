// Capa de acceso a datos: llama a las funciones RPC cp_* de Supabase.
import { supabase } from './supabaseClient.js';

const SECRET_KEY = 'cp_admin_secret';

export function getAdminSecret() {
  return localStorage.getItem(SECRET_KEY) || '';
}
export function setAdminSecret(s) {
  localStorage.setItem(SECRET_KEY, s);
}
export function clearAdminSecret() {
  localStorage.removeItem(SECRET_KEY);
}

async function rpc(fn, args) {
  let res;
  try {
    res = await supabase.rpc(fn, args);
  } catch (e) {
    throw new Error('No se pudo conectar. Revisá tu conexión a internet.');
  }
  const { data, error } = res;
  if (error) {
    if (/fetch|network|failed to/i.test(error.message || '')) {
      throw new Error('No se pudo conectar. Revisá tu conexión a internet.');
    }
    throw new Error(error.message || 'Error');
  }
  return data;
}

export const api = {
  // ---- Admin ----
  async login(secret) {
    const ok = await rpc('cp_admin_login', { p_secret: secret });
    if (!ok) throw new Error('Clave incorrecta');
    return true;
  },
  createSession({ supplier_name, period, items }) {
    return rpc('cp_admin_create_session', {
      p_secret: getAdminSecret(),
      p_supplier: supplier_name,
      p_period: period || '',
      p_items: items,
    });
  },
  listSessions() {
    return rpc('cp_admin_list_sessions', { p_secret: getAdminSecret() });
  },
  getSession(id) {
    return rpc('cp_admin_get_session', { p_secret: getAdminSecret(), p_id: id });
  },
  deleteSession(id) {
    return rpc('cp_admin_delete_session', { p_secret: getAdminSecret(), p_id: id });
  },

  // ---- Proveedor (por token) ----
  getSupplierSession(token) {
    return rpc('cp_get', { p_token: token });
  },
  saveResponse(token, itemId, patch) {
    return rpc('cp_save', { p_token: token, p_item_id: itemId, p_patch: patch });
  },
  submit(token) {
    return rpc('cp_submit', { p_token: token });
  },
};
