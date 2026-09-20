import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const dirs=['worker/src','pages'];let count=0;
for(const dir of dirs)for(const f of await readdir(dir)){
 if(!/\.(mjs|js)$/.test(f)||f==='vendor-three.js')continue;
 const r=spawnSync(process.execPath,['--check',`${dir}/${f}`],{encoding:'utf8'});
 if(r.status!==0){process.stderr.write(r.stderr);process.exit(r.status||1);}count++;
}
console.log(`Syntax checked ${count} application modules`);
