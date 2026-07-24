// Cliente HTTP simple para la API.

const PASS_KEY = 'admin_password';

export function getAdminPassword() {
  return localStorage.getItem(PASS_KEY) || '';
}
export function setAdminPassword(p) {
  localStorage.setItem(PASS_KEY, p);
}
export function clearAdminPassword() {
  localStorage.removeItem(PASS_KEY);
}

async function handle(res) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'Error ' + res.status);
    err.status = res.status;
    throw err;
  }
  return data;
}

function adminHeaders(extra = {}) {
  return { 'x-admin-password': getAdminPassword(), ...extra };
}

export const api = {
  // Admin
  async login(password) {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    return handle(res);
  },
  async parseExcel(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/admin/parse', {
      method: 'POST',
      headers: adminHeaders(),
      body: fd,
    });
    return handle(res);
  },
  async createSession(payload) {
    const res = await fetch('/api/admin/sessions', {
      method: 'POST',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    return handle(res);
  },
  async listSessions() {
    const res = await fetch('/api/admin/sessions', { headers: adminHeaders() });
    return handle(res);
  },
  async getSession(id) {
    const res = await fetch('/api/admin/sessions/' + id, { headers: adminHeaders() });
    return handle(res);
  },
  async deleteSession(id) {
    const res = await fetch('/api/admin/sessions/' + id, {
      method: 'DELETE',
      headers: adminHeaders(),
    });
    return handle(res);
  },
  async exportCsv(id) {
    const res = await fetch('/api/admin/sessions/' + id + '/export.csv', {
      headers: adminHeaders(),
    });
    if (!res.ok) throw new Error('No se pudo exportar');
    return res.blob();
  },

  // Proveedor
  async getSupplierSession(token) {
    const res = await fetch('/api/c/' + token);
    return handle(res);
  },
  async saveResponse(token, itemId, payload) {
    const res = await fetch(`/api/c/${token}/items/${itemId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return handle(res);
  },
  async submit(token) {
    const res = await fetch(`/api/c/${token}/submit`, { method: 'POST' });
    return handle(res);
  },
};
