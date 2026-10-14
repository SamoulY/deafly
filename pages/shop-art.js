import {memeArt} from './meme-art.js?v=1';
export function itemArt(id){
  const meme=memeArt(id);if(meme)return meme;
  const ink='#557d71',cloth='#779faa',gold='#d9b66d',paper='#f0e8cc';let drawing='';
  if(id.startsWith('head-'))drawing=id==='head-crown'?`<path fill="${gold}" d="M13 22l12 10 7-18 9 18 11-10-4 28H17z"/><path d="M18 43h29"/>`:id==='head-beanie'?`<path fill="${cloth}" d="M16 42V32a16 16 0 0132 0v10z"/><rect fill="${ink}" x="12" y="39" width="40" height="10" rx="4"/><circle fill="${paper}" cx="32" cy="14" r="5"/>`:`<path fill="${cloth}" d="M12 40v-6c0-23 34-23 34 0v6z"/><path fill="${ink}" d="M13 39h34l11 7H17z"/>`;
  else if(id.startsWith('face-'))drawing=id==='face-visor'?`<path fill="${cloth}" d="M8 24h48v17c-11 11-37 11-48 0z"/><path d="M9 26h46M18 33l10-3"/>`:id==='face-monocle'?`<circle fill="none" stroke="${gold}" stroke-width="4" cx="27" cy="29" r="15"/><path d="M38 40v13h12"/>`:`<g fill="none" stroke-width="3"><circle cx="18" cy="34" r="11"/><circle cx="46" cy="34" r="11"/><path d="M29 32h6M7 32l-3-10M57 32l3-10"/></g>`;
  else if(id==='body-tie')drawing=`<path fill="${gold}" d="M24 10h16l-3 11H27zM27 24h10l5 28-10 7-10-7z"/>`;
  else if(id==='body-bowtie')drawing=`<path fill="${gold}" d="M8 19l20 9v9L8 47zM56 19l-20 9v9l20 10z"/><rect fill="${cloth}" x="27" y="26" width="10" height="14" rx="3"/>`;
  else if(id==='body-vest')drawing=`<path fill="${cloth}" d="M20 9l12 12L44 9l10 12-7 11v23H17V32l-7-11z"/><path d="M32 21v33"/><g fill="${gold}" stroke="none"><circle cx="36" cy="31" r="2"/><circle cx="36" cy="40" r="2"/><circle cx="36" cy="49" r="2"/></g>`;
  else if(id.startsWith('background-'))drawing=`<path fill="none" stroke="currentColor" d="M8 10h48v45H8zM8 55l10-9h38M18 11v35M25 15v26M33 15v26M41 15v26M49 15v26"/>`;
  else if(id.startsWith('sticker-'))drawing=`<circle fill="${paper}" stroke="${gold}" cx="32" cy="32" r="24"/>`+(id==='sticker-bitcoin'?`<text fill="${ink}" stroke="none" x="32" y="45" text-anchor="middle" font-size="37">₿</text>`:id==='sticker-moon'?`<path fill="${gold}" stroke="none" d="M37 13a21 21 0 100 38 21 21 0 010-38z"/>`:`<path fill="${gold}" stroke="none" d="M32 14l5 12 14 1-11 9 4 14-12-8-12 8 4-14-11-9 14-1z"/>`);
  else if(id==='desk-plant')drawing=`<path fill="${ink}" d="M31 37C10 38 9 15 13 12c15 0 21 11 18 25M33 32c-5-20 9-27 18-24 0 18-6 26-18 24"/><path fill="#c69578" d="M20 37h26l-4 21H24z"/>`;
  else if(id==='desk-coffee')drawing=`<path fill="none" stroke-width="4" d="M46 24h6c14 0 10 21-6 18"/><path fill="${paper}" d="M12 23h34v24a7 7 0 01-7 7H19a7 7 0 01-7-7z"/><ellipse fill="#8a674e" cx="29" cy="24" rx="17" ry="5"/><path fill="none" d="M24 6c-8 8 8 6 0 13M35 5c-8 8 8 6 0 13"/>`;
  else drawing=`<path fill="${gold}" d="M16 55h34v5H16zM27 51V30h7v21zM9 30l14-23h17l14 23z"/><path fill="none" d="M24 35h15"/>`;
  return `<svg viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${drawing}</svg>`;
}
