// Append-only human demonstrations. Nothing here executes a trade or trains a model.
const reply = (body, status = 200) => Response.json(body, {status, headers:{'cache-control':'no-store'}});
const seconds = () => Math.floor(Date.now() / 1000);
export async function handleCompanion(request, env, user, {observation}) {
  const path = new URL(request.url).pathname;
  const db = env.DB;
  if (request.method === 'GET' && path === '/api/companion') {
    // Read one consistent account/decision view even while the fly commits a step.
    const [portfolios, decisions, lessons] = await db.batch([
      db.prepare('SELECT * FROM portfolios WHERE user_id=?').bind(user.id),
      db.prepare("SELECT id, action, server_price, fee, state_json, created_at FROM decisions WHERE user_id=? AND symbol='BTCUSD' AND json_extract(state_json,'$.source')='BROWSER_NEURAL' ORDER BY created_at DESC, rowid DESC LIMIT 100").bind(user.id),
      db.prepare('SELECT l.id, l.action, l.created_at, c.snapshot_json FROM companion_lessons l JOIN companion_contexts c ON c.id=l.context_id WHERE l.user_id=? ORDER BY l.created_at DESC, l.rowid DESC LIMIT 100').bind(user.id),
    ]);
    return reply({portfolio:portfolios.results[0]||null, decisions:decisions.results.map(({state_json,...row})=>({...row,portfolio:JSON.parse(state_json)})), lessons:lessons.results.map(({snapshot_json,...row})=>({...row,context:JSON.parse(snapshot_json)}))});
  }
  if (request.method === 'POST' && path === '/api/companion/contexts') {
    // Freeze the actual view before the user chooses to save it. Clients cannot supply a price.
    const market = await observation(env);
    const portfolio = await db.prepare('SELECT * FROM portfolios WHERE user_id=?').bind(user.id).first();
    const context = {id:crypto.randomUUID(),symbol:'BTCUSD',market,portfolio,created_at:seconds(),expires_at:seconds()+600};
    await db.prepare('INSERT INTO companion_contexts VALUES (?,?,?,?,?)').bind(context.id,user.id,JSON.stringify(context),context.created_at,context.expires_at).run();
    return reply(context,201);
  }
  if (request.method === 'POST' && path === '/api/companion/lessons') {
    if (Number(request.headers.get('content-length')) > 2048) return reply({error:'REQUEST_TOO_LARGE'},413);
    const text = await request.text();
    if (text.length > 2048) return reply({error:'REQUEST_TOO_LARGE'},413);
    let body;
    try { body = JSON.parse(text); } catch { return reply({error:'INVALID_DEMONSTRATION'},422); }
    if (!body || !['BUY','SELL','HOLD'].includes(body.action) || typeof body.context_id !== 'string' || body.context_id.length>64 || typeof body.idempotency_key !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.idempotency_key)) return reply({error:'INVALID_DEMONSTRATION'},422);
    const previous = () => db.prepare('SELECT * FROM companion_lessons WHERE user_id=? AND idempotency_key=?').bind(user.id,body.idempotency_key).first();
    const receipt = row => row.action === body.action && row.context_id === body.context_id ? reply({lesson:row,training_applied:false}) : reply({error:'IDEMPOTENCY_CONFLICT'},409);
    const saved = await previous();
    if (saved) return receipt(saved);
    const context = await db.prepare('SELECT * FROM companion_contexts WHERE id=? AND user_id=?').bind(body.context_id,user.id).first();
    if (!context) return reply({error:'CONTEXT_NOT_FOUND'},404);
    if (context.expires_at < seconds()) return reply({error:'CONTEXT_EXPIRED'},409);
    await db.prepare('INSERT OR IGNORE INTO companion_lessons VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),user.id,context.id,body.action,body.idempotency_key,seconds()).run();
    const result = await previous();
    return result ? receipt(result) : reply({error:'CONTEXT_ALREADY_TAUGHT'},409);
  }
  return reply({error:'NOT_FOUND'},404);
}
