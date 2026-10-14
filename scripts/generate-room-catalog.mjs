import {writeFile} from 'node:fs/promises';
import {memeItems} from '../pages/meme-items.js';
const sqlString=s=>"'"+s.replaceAll("'","''")+"'";
const rows=Object.values(memeItems).map(i=>`(${[i.id,i.slot,i.name].map(sqlString).join(',')},${i.price},${i.resale})`);
const classic={'head-cap':20,'head-beanie':40,'head-crown':120,'face-glasses':30,'face-monocle':80,'face-visor':60,'body-tie':10,'body-bowtie':40,'body-vest':90,'background-mint':50,'background-rose':50,'background-graphite':70,'sticker-star':8,'sticker-bitcoin':12,'sticker-moon':16,'desk-lamp':30,'desk-plant':24,'desk-coffee':10};
const prices=Object.entries(classic).map(([id,price])=>`UPDATE room_catalog SET price=${price*10000},resale=${price*5000} WHERE id=${sqlString(id)};`).join('\n');
await writeFile('worker/migrations/0015_meme_shop.sql','-- 48 original meme designs and a total 10,000x price multiplier requested by the owner.\n-- Fixed values make retries safe. Historical receipts, cash and inventory stay unchanged.\nINSERT OR IGNORE INTO room_catalog (id,slot,name,price,resale) VALUES\n'+rows.join(',\n')+';\n'+prices+'\n');
