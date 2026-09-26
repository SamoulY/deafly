export function createSessionClient({ origin, storage, fetch: request = globalThis.fetch, cookieMode = false }) {
  const key = `defly.session:${origin}`;
  let token = storage.getItem(key) || '';
  async function api(path, options = {}) {
    const headers = { 'content-type': 'application/json', ...options.headers };
    if (token) headers['X-Session-Token'] = token;
    const response = await request(origin + path, { ...options, ...(cookieMode?{credentials:"include"}:{}), headers,
      body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body });
    const data = await response.json();
    if (!response.ok) throw Object.assign(new Error(data.message || data.error || 'REQUEST_FAILED'), { status: response.status, code: data.error });
    return data;
  }
  async function create() {
    const previous = token;
    token = '';
    let result;
    try { result = await api('/api/session', { method: 'POST', body: { nickname: 'FlyPilot' } }); }
    catch (error) { token = previous; throw error; }
    if (!result.token) { token = previous; throw new Error('SESSION_TOKEN_MISSING'); }
    token = result.token;
    storage.setItem(key, token);
    return api('/api/state');
  }
  async function restore() {
    if (!token) {if(cookieMode){try{return await api('/api/state');}catch(e){if(e.status!==401)throw e;if(storage.getItem(key+':account')){e.code='SESSION_LOGIN_REQUIRED';e.message='登录已过期，请重新登录以恢复原来的果蝇';throw e;}}}return create();}
    try { return await api('/api/state'); }
    catch (error) {
      if (error.status === 401 || error.status === 403) error.code = 'SESSION_RESET_REQUIRED';
      throw error;
    }
  }
  return { api, restore, reset: create, async account(operation,body={}){const result=await api('/api/account/'+operation,{method:'POST',body});token='';storage.removeItem(key);if(operation==='logout')storage.removeItem(key+':account');else storage.setItem(key+':account',result.username||'registered');return result;} };
}
export function resolveApiOrigin(configured, hostname) {
  return (configured || (['localhost', '127.0.0.1', '[::1]'].includes(hostname)
    ? `http://${hostname}:8787` : 'https://flydesk-v2-trial-worker.testcf-195.workers.dev')).replace(/\/$/, '');
}
