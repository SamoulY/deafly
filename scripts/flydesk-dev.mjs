import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
export async function startDev({fixture=false,port=8876,apiPort=8787,persist=false}={}) {
 const start=(Math.floor(Date.now()/60000)-200)*60;
 const bindings={PAPER_ONLY:'true',APP_ENV:'dev',ADMIN_USER_IDS:process.env.FLYDESK_ADMIN_USER_IDS||'',ALLOWED_ORIGIN:`http://127.0.0.1:${port},http://localhost:${port}`,...(fixture?{FLYDESK_TEST_MODE:'local-only',FLYDESK_TEST_HISTORY:Array.from({length:120},(_,i)=>({time:start+i*60,open:100+i,high:102+i,low:99+i,close:101+i,volume:10+i}))}:{})};
 const bundle=await build({entryPoints:['worker/src/index.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
 const modules=[{type:'ESModule',path:resolve('worker/bundle.mjs'),contents:bundle.outputFiles[0].text}];
 const mf=new Miniflare(convertV4MiniflareOptions({modules,port:apiPort,host:'127.0.0.1',compatibilityDate:'2026-08-18',bindings,d1Databases:['DB'],d1Persist:persist?'.wrangler/flydesk-d1':false,durableObjectsPersist:persist?'.wrangler/flydesk-live':false,durableObjects:{FLYDESK_LIVE:{className:'FlydeskLive',useSQLite:true}}}));
 const db=await mf.getD1Database('DB');
 await db.exec('CREATE TABLE IF NOT EXISTS local_schema_migrations (name TEXT PRIMARY KEY);');
 for(const file of ['worker/schema.sql',...['0004_raising.sql','0005_raising_training.sql','0006_browser_autonomy.sql','0007_market_source.sql','0008_federation.sql','0009_flydesk.sql','0010_flydesk_auth.sql','0011_flydesk_datasets.sql'].map(f=>'worker/migrations/'+f)]){
   if(await db.prepare('SELECT name FROM local_schema_migrations WHERE name=?').bind(file).first())continue;
   const sql=(await readFile(file,'utf8')).replace(/^\s*--.*$/gm,'').replace(/\r?\n/g,' ');await db.exec(sql);await db.prepare('INSERT INTO local_schema_migrations VALUES (?)').bind(file).run();
 }
 await mf.ready;
 const root=resolve('pages'),server=createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://local').pathname),path=resolve(root,'.'+(name==='/'?'/index.html':name));if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}const data=await readFile(path),mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm'}[extname(path)]||'application/octet-stream';res.writeHead(200,{'content-type':mime,'cross-origin-opener-policy':'same-origin','cross-origin-embedder-policy':'require-corp','cache-control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}});
 await new Promise(r=>server.listen(port,'127.0.0.1',r));
 return {mf,db,url:`http://127.0.0.1:${port}`,close:async()=>{await new Promise(r=>server.close(r));await mf.dispose();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const fixture=process.argv.includes('--fixture'),dev=await startDev({fixture,persist:!fixture});console.log(`${dev.url} · ${fixture?'SYNTHETIC FIXTURE / NO REWARDS / DISPOSABLE DB':'PUBLIC MARKET DATA / PERSISTENT LOCAL DB'}`);process.on('SIGINT',async()=>{await dev.close();process.exit(0);});}
