const reply=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
export async function handleRoom(request,env,user){
  const db=env.DB,path=new URL(request.url).pathname;
  await db.prepare('INSERT OR IGNORE INTO room_profiles VALUES (?,?)').bind(user.id,Math.floor(Date.now()/1000)).run();
  async function state(){
    const [catalog,inventory,portfolio,history]=await db.batch([
      db.prepare('SELECT * FROM room_catalog ORDER BY slot,price,id'),
      db.prepare('SELECT item_id,slot,equipped FROM room_inventory WHERE user_id=?').bind(user.id),
      db.prepare('SELECT cash,revision FROM portfolios WHERE user_id=?').bind(user.id),
      db.prepare('SELECT t.*,c.name FROM room_transactions t JOIN room_catalog c ON c.id=t.item_id WHERE user_id=? ORDER BY created_at DESC,t.rowid DESC LIMIT 50').bind(user.id),
    ]);
    return {items:catalog.results,inventory:inventory.results,loadout:Object.fromEntries(inventory.results.filter(x=>x.equipped).map(x=>[x.slot,x.item_id])),cash:portfolio.results[0]?.cash,history:history.results};
  }
  if(request.method==='GET'&&path==='/api/companion/room')return reply(await state());
  if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  const text=await request.text();if(text.length>2048)return reply({error:'REQUEST_TOO_LARGE'},413);
  let body;try{body=JSON.parse(text);}catch{return reply({error:'INVALID_REQUEST'},422);}
  if(!body||typeof body.item_id!=='string')return reply({error:'INVALID_ITEM'},422);
  const item=await db.prepare('SELECT * FROM room_catalog WHERE id=?').bind(body.item_id).first();
  if(!item)return reply({error:'INVALID_ITEM'},422);
  if(path==='/api/companion/room/equip'){
    if(typeof body.equipped!=='boolean')return reply({error:'INVALID_REQUEST'},422);
    if(!await db.prepare('SELECT 1 FROM room_inventory WHERE user_id=? AND item_id=?').bind(user.id,item.id).first())return reply({error:'ITEM_NOT_OWNED'},409);
    // Ownership is checked again inside the transaction, including concurrent sales.
    const results=await db.batch([
      db.prepare('UPDATE room_inventory SET equipped=0 WHERE user_id=? AND slot=? AND EXISTS(SELECT 1 FROM room_inventory WHERE user_id=? AND item_id=?)').bind(user.id,item.slot,user.id,item.id),
      db.prepare('UPDATE room_inventory SET equipped=? WHERE user_id=? AND item_id=?').bind(body.equipped?1:0,user.id,item.id),
    ]);
    if(!results[1].meta.changes)return reply({error:'ITEM_NOT_OWNED'},409);
    return reply(await state());
  }
  if(path!=='/api/companion/room/trade')return reply({error:'NOT_FOUND'},404);
  if(!['BUY','SELL'].includes(body.operation)||typeof body.idempotency_key!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(body.idempotency_key))return reply({error:'INVALID_REQUEST'},422);
  const previous=()=>db.prepare('SELECT * FROM room_transactions WHERE user_id=? AND idempotency_key=?').bind(user.id,body.idempotency_key).first();
  const receipt=async row=>row.item_id!==item.id||row.operation!==body.operation?reply({error:'IDEMPOTENCY_CONFLICT'},409):reply({...await state(),receipt:row});
  const saved=await previous();if(saved)return receipt(saved);
  try{
    await db.prepare('INSERT INTO room_transactions(id,user_id,item_id,operation,amount,idempotency_key,created_at) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),user.id,item.id,body.operation,body.operation==='BUY'?-item.price:item.resale,body.idempotency_key,Math.floor(Date.now()/1000)).run();
  }catch(error){
    const saved=await previous();if(saved)return receipt(saved);
    const code=['INSUFFICIENT_CASH','ALREADY_OWNED','ITEM_NOT_OWNED'].find(c=>error.message.includes(c));
    if(code)return reply({error:code},409);throw error;
  }
  return receipt(await previous());
}
