import {messages} from './locales/zh-CN.js?v=3';

const supported = new Set(['en','zh-CN']);
let language = 'en';
try { const saved=globalThis.localStorage?.getItem('defly.language'); language=supported.has(saved)?saved:globalThis.navigator?.language?.startsWith('zh')?'zh-CN':'en'; } catch { /* Storage is optional. */ }
export const locale = () => language==='zh-CN'?'zh-CN':'en-US';
export const getLanguage = () => language;
const patterns=Object.entries(messages).filter(([key])=>key.includes('{')).map(([key,value])=>{
  const names=[];
  const expression=key.split(/(\{\w+\})/).map(part=>{if(/^\{\w+\}$/.test(part)){names.push(part.slice(1,-1));return '(.+?)';}return part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('');
  return {expression:new RegExp('^'+expression+'$'),names,value};
});
export function translate(source, target=language) {
  if(target!=='zh-CN'||!source)return source;
  const key=source.replace(/\s+/g,' ').trim();
  let result=Object.hasOwn(messages,key)?messages[key]:null;
  if(!result)for(const pattern of patterns){const match=key.match(pattern.expression);if(match){result=pattern.value.replace(/\{(\w+)\}/g,(_,name)=>{const part=match[pattern.names.indexOf(name)+1];return part===key?part:translate(part,target);});break;}}
  if(!result&&key.includes(' · ')){const parts=key.split(' · ');const next=parts.map(part=>translate(part,target));if(next.some((part,i)=>part!==parts[i]))result=next.join(' · ');}
  return result?source.replace(/\S[\s\S]*\S|\S/,()=>result):source;
}

// Legacy workspaces write English UI messages directly. Keep those source messages
// alongside their text nodes, without rebuilding controls or touching input values.
// Only the app's UI boundary is observed; user content, code, and raw reports opt out.
const sources=new WeakMap(),attributes=new WeakMap();
const excluded='[data-no-localize],script,style,pre,code,[contenteditable],#companionName,#flyIdentity,#routerPeers,#ninexLeaderboard,#ninexMarkets,#markets';
function textSource(node){const known=sources.get(node);return known&&node.nodeValue===known.rendered?known.source:node.nodeValue;}
export const sourceText = element => [...element.childNodes].map(node=>node.nodeType===3?textSource(node):sourceText(node)).join('');
function localizeText(node){
  if(!node.parentElement||node.parentElement.closest(excluded))return;
  const source=textSource(node),rendered=translate(source);
  sources.set(node,{source,rendered});
  if(node.nodeValue!==rendered)node.nodeValue=rendered;
}
function localizeElement(element){
  if(element.closest(excluded))return;
  // An option without value derives its API value from its label. Freeze it first.
  if(element.tagName==='OPTION'&&!element.hasAttribute('value'))element.setAttribute('value',element.value);
  const known=attributes.get(element)||{};
  for(const name of ['aria-label','title','placeholder']){
    if(!element.hasAttribute(name))continue;
    const current=element.getAttribute(name),source=known[name]?.rendered===current?known[name].source:current,rendered=translate(source);
    known[name]={source,rendered};if(current!==rendered)element.setAttribute(name,rendered);
  }
  attributes.set(element,known);
}
function localizeTree(root){
  if(root.nodeType===3){localizeText(root);return;}
  if(root.nodeType!==1)return;
  localizeElement(root);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  for(let node=walker.nextNode();node;node=walker.nextNode())node.nodeType===3?localizeText(node):localizeElement(node);
}
let boundary=null;
export function setLanguage(next){
  if(!supported.has(next))return;
  language=next;
  try{localStorage.setItem('defly.language',next);}catch{/* Private browsing may disable persistence. */}
  if(typeof document==='undefined')return;
  document.documentElement.lang=next;
  document.querySelectorAll('[data-language-choice]').forEach(select=>select.value=next);
  document.dispatchEvent(new CustomEvent('defly-language-change',{detail:{language:next}}));
  if(boundary)localizeTree(boundary);
}
export function mountLanguage(root){
  boundary=root;document.documentElement.lang=language;
  root.querySelectorAll('[data-language-choice]').forEach(select=>{select.value=language;select.addEventListener('change',()=>setLanguage(select.value));});
  localizeTree(root);
  new MutationObserver(records=>{
    const changed=new Set();
    for(const record of records){if(record.type==='childList')for(const node of record.addedNodes)changed.add(node);else changed.add(record.target);}
    for(const node of changed)if(root.contains(node))localizeTree(node);
  }).observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder']});
  window.addEventListener('storage',event=>{if(event.key==='defly.language'&&supported.has(event.newValue)&&event.newValue!==language)setLanguage(event.newValue);});
}
