// Account balances and item ownership are always read from the website. Only
// this owner's fly preferences are reconciled from this device to the website.
const slots=['head','face','body','background','sticker','desk'];
const validName=name=>typeof name==='string'&&name.trim().length>0&&name.trim().length<=40;
const normalize=(loadout,inventory)=>Object.fromEntries(slots.flatMap(slot=>{
  const item=loadout?.[slot];
  return typeof item==='string'&&inventory.some(row=>row.slot===slot&&row.item_id===item)?[[slot,item]]:[];
}));
const same=(a,b)=>slots.every(slot=>a?.[slot]===b?.[slot]);

export function createFlySync({storage,key,api,onStatus=()=>{}}){
  if(!key)throw Error('Fly owner required');
  const storageKey=`defly.fly.preferences.v1:${key}`,pending=new Set();
  function read(){
    const raw=storage.getItem(storageKey);
    if(!raw)return {version:1};
    let data;try{data=JSON.parse(raw);}catch{throw Error('Local fly data could not be read. It has been kept unchanged.');}
    if(data?.version!==1||(data.name!==undefined&&!validName(data.name))||(data.loadout!==undefined&&(!data.loadout||typeof data.loadout!=='object'||Array.isArray(data.loadout))))throw Error('Local fly data could not be read. It has been kept unchanged.');
    return data;
  }
  function save(fields){const data={...read(),...fields};storage.setItem(storageKey,JSON.stringify(data));return data;}
  function status(field,failed){failed?pending.add(field):pending.delete(field);onStatus(pending.size?'Fly changes are saved on this device. Website sync will retry when you return.':'Account checked with the website. This device keeps your fly.');}
  async function profile(server){
    const local=read();
    if(local.name===undefined){save({name:server.profile.name});status('name',false);return server;}
    let next=server;
    if(local.name!==server.profile.name){
      try{next=await api('/api/flydesk/profile',{method:'POST',body:{name:local.name}});status('name',false);}
      catch{status('name',true);}
    }else status('name',false);
    return {...next,profile:{...next.profile,name:local.name}};
  }
  async function rename(name,server){
    if(!validName(name))throw Error('Name must contain 1 to 40 characters');
    save({name:name.trim()});return profile(server);
  }
  async function room(server){
    const local=read();
    if(local.loadout===undefined){save({loadout:normalize(server.loadout,server.inventory)});status('room',false);return server;}
    const desired=normalize(local.loadout,server.inventory);
    // Selling an item (including on another device) removes it from the local
    // preference too. Reconciliation cannot buy, grant, or restore ownership.
    save({loadout:desired});
    if(same(desired,server.loadout)){status('room',false);return server;}
    try{
      const next=await api('/api/companion/room/loadout',{method:'POST',body:{loadout:desired}});
      save({loadout:normalize(next.loadout,next.inventory)});status('room',false);return next;
    }catch{status('room',true);return {...server,loadout:desired,inventory:server.inventory.map(row=>({...row,equipped:desired[row.slot]===row.item_id?1:0}))};}
  }
  function chooseItem(item,equipped,server){
    const desired=normalize(read().loadout??server.loadout,server.inventory);
    if(equipped)desired[item.slot]=item.item_id;else delete desired[item.slot];
    save({loadout:desired});return room(server);
  }
  let queue=Promise.resolve();
  const native=typeof globalThis.localStorage!=='undefined'&&storage===globalThis.localStorage;
  const serial=task=>(...args)=>{
    const result=queue.then(()=>native&&globalThis.navigator?.locks?.request
      ? navigator.locks.request(storageKey,()=>task(...args)) : task(...args));
    queue=result.catch(()=>{});return result;
  };
  return {profile:serial(profile),rename:serial(rename),room:serial(room),chooseItem:serial(chooseItem)};
}
