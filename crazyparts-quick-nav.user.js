// ==UserScript==
// @name         Crazyparts Quick Nav v12
// @namespace    http://tampermonkey.net/
// @version      5.1
// @description  Full nav on Crazyparts; quick-links tab on every other site. Tabs draggable up/down.
// @author       You
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==
(function(){
'use strict';

// ═══════════════════════════════════════════════════════════
// SITE DETECTION
// ═══════════════════════════════════════════════════════════
const IS_CRAZY = location.hostname.includes('crazyparts.com.au');
const BASE     = 'https://www.crazyparts.com.au';
const SRC      = BASE + '/catalogsearch/result/?q=';
const iq       = q => SRC + encodeURIComponent('iquick ' + q);
const SIZES    = ['0.3m','0.5m','1m','2m','3m'];

// ═══════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════
const PFX = 'cpn5_';
function gGet(k,def){ try{const v=GM_getValue(PFX+k);return v!=null?JSON.parse(v):def;}catch{return def;} }
function gSet(k,v){ GM_setValue(PFX+k,JSON.stringify(v)); }

// Migrate v4 data
try{const o=GM_getValue('cpn4_urls');if(o){const e=gGet('urls',{});gSet('urls',Object.assign({},JSON.parse(o),e));}}catch{}

function loadURLs()     { return gGet('urls',{}); }
function saveURLs(o)    { gSet('urls',o); }
function getURL(k,def)  { const u=loadURLs();return(u[k]&&u[k].trim())?u[k]:def; }
function loadSections() { return gGet('sections',[]); }
function saveSections(a){ gSet('sections',a); }
function loadCustomLinks() { return gGet('ql_custom',[]); }
function saveCustomLinks(a){ gSet('ql_custom',a); }

// Quick-link URLs (shared between Crazy panel + other-site panel)
const DEF_LINKS = {
  ql_crazy : BASE,
  ql_sospos: 'https://app.sospos.com.au',
  ql_gsheet: '',
};
function qlUrl(k){ return getURL(k, DEF_LINKS[k]||''); }

// ═══════════════════════════════════════════════════════════
// CABLE + PLUG DATA (Crazyparts only)
// ═══════════════════════════════════════════════════════════
const CABLE_TYPES = [
  {id:'cc',label:'USB-C → USB-C',     q:'usb-c to usb-c cable'},
  {id:'ac',label:'USB-A → USB-C',     q:'usb-a to usb-c cable'},
  {id:'cl',label:'USB-C → Lightning', q:'usb-c to lightning cable'},
  {id:'al',label:'USB-A → Lightning', q:'usb-a to lightning cable'},
];
const PLUGS = [
  {id:'p18',   label:'18W A',      def:iq('18w usb-a wall charger')},
  {id:'p20c',  label:'20W C',      def:iq('20w single usb-c wall charger')},
  {id:'p20ac', label:'20W A+C',    def:iq('20w usb-a usb-c dual wall charger')},
  {id:'p30ac', label:'30W A+C',    def:iq('30w usb-a usb-c wall charger')},
  {id:'p35cc', label:'35W C+C',    def:iq('35w dual usb-c wall charger')},
  {id:'p45ac', label:'45W A+C',    def:iq('45w usb-a usb-c wall charger')},
  {id:'p45c2', label:'45W C²',     def:iq('45w dual usb-c wall charger')},
  {id:'p65ac', label:'65W A+C²',   def:iq('65w usb-a dual usb-c wall charger')},
  {id:'p100',  label:'100W A²+C²', def:iq('100w wall charger adapter')},
];
function cUrl(tid,sz,col){const t=CABLE_TYPES.find(x=>x.id===tid);return getURL(tid+'_'+sz+'_'+col,iq(t.q+' '+sz+' '+col));}
function pUrl(pid){const p=PLUGS.find(x=>x.id===pid);return getURL(pid,p.def);}

// ═══════════════════════════════════════════════════════════
// AJAX CART
// ═══════════════════════════════════════════════════════════
function parseCfg(html){const m=html.match(/new\s+Product\.Config\s*\(\s*(\{[\s\S]+?\})\s*\)/);if(!m)return null;try{return JSON.parse(m[1]);}catch{return null;}}
function findCol(cfg,colour){if(!cfg?.attributes)return null;for(const id in cfg.attributes){const a=cfg.attributes[id];if(/^colo(u)?r$/i.test(a.code||'')){for(const o of(a.options||[])){if(o.label.toLowerCase().trim()===colour.toLowerCase())return{id,val:o.id};}}}return null;}
async function addToCart(url,colour,qty){
  try{
    const r1=await fetch(url,{credentials:'include'});if(!r1.ok)return{ok:false,why:'Page '+r1.status};
    const html=await r1.text();const dom=new DOMParser().parseFromString(html,'text/html');
    const form=dom.querySelector('#product_addtocart_form');if(!form)return{ok:false,why:'No form'};
    const fd=new FormData(form);fd.set('qty',String(qty));
    if(colour){const cfg=parseCfg(html);const col=findCol(cfg,colour);if(col)fd.set('super_attribute['+col.id+']',col.val);
      dom.querySelectorAll('select[name*="super_attribute"]').forEach(s=>{for(const o of s.options)if(o.text.trim().toLowerCase()===colour.toLowerCase())fd.set(s.name,o.value);});}
    const act=form.getAttribute('action')||(BASE+'/checkout/cart/add/');
    const r2=await fetch(act,{method:'POST',body:fd,credentials:'include',redirect:'follow'});
    const h2=await r2.text();const d2=new DOMParser().parseFromString(h2,'text/html');
    const err=d2.querySelector('.error-msg li,.message-error li');
    if(err)return{ok:false,why:err.textContent.trim().slice(0,80)};
    return{ok:true};
  }catch(e){return{ok:false,why:e.message};}
}
async function runQueue(items){
  if(!items.length)return showToast('⚠️ No items with qty > 0');
  showToast('🛒 Starting…',99999);const results=[];
  for(let i=0;i<items.length;i++){
    const it=items[i];showToast(`🛒 ${i+1}/${items.length}: ${it.label}…`,99999);
    results.push({label:it.label,...await addToCart(it.url,it.colour||null,it.qty)});
    await new Promise(r=>setTimeout(r,700));
  }
  const ok=results.filter(r=>r.ok).length,fail=results.filter(r=>!r.ok).length;
  showToast(`✅ ${ok} added${fail?', '+fail+' skipped':''}`,6000);
  if(fail)setTimeout(()=>alert('Skipped:\n'+results.filter(r=>!r.ok).map(r=>`• ${r.label}: ${r.why}`).join('\n')),600);
}
function gatherCart(){
  const items=[];
  panel?.querySelectorAll('.cpn-qty-inp').forEach(inp=>{
    const qty=parseInt(inp.value)||0;
    if(qty>0)items.push({url:inp.dataset.url,colour:inp.dataset.colour,qty,label:inp.dataset.label});
  });
  return items;
}

// ═══════════════════════════════════════════════════════════
// AUTO COLOUR SELECT
// ═══════════════════════════════════════════════════════════
(function(){
  const raw=sessionStorage.getItem('cpn5_ac');if(!raw)return;
  const{colour}=JSON.parse(raw);sessionStorage.removeItem('cpn5_ac');
  let n=0;const t=setInterval(()=>{
    if(++n>20)return clearInterval(t);let hit=false;
    document.querySelectorAll('.configurable-swatch-list li,.swatch-option').forEach(el=>{
      if((el.getAttribute('title')||el.textContent||'').toLowerCase().includes(colour.toLowerCase())){el.click();hit=true;}
    });
    if(!hit)document.querySelectorAll('#product_addtocart_form select option').forEach(o=>{
      if(o.text.trim().toLowerCase()===colour.toLowerCase()){o.selected=true;o.parentElement.dispatchEvent(new Event('change',{bubbles:true}));hit=true;}
    });
    if(hit){clearInterval(t);showToast('✅ Auto-selected: '+colour);}
  },400);
})();
function navCol(url,colour){sessionStorage.setItem('cpn5_ac',JSON.stringify({colour}));location.href=url;}

// ═══════════════════════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════════════════════
document.head.appendChild(Object.assign(document.createElement('style'),{textContent:`
:root{--cn:#1a3a6e;--cn2:#14306a;--cb:#1769c0;--cb2:#1257a8;
  --cl:#eef2f9;--cbr:#cdd6ea;--chv:#dce6f5;
  --ct:#1a2b3c;--cm:#5a6a82;--cw:#fff;
  --pw:295px;--ptab:34px;--pspd:0.26s;}

/* ── Quick-link tab (all sites) ── */
#cpn-ql-tab{position:fixed;right:0;top:16px;z-index:99999999;
  width:var(--ptab);height:130px;background:var(--cn);
  border-radius:4px 0 0 4px;cursor:grab;display:flex;align-items:center;
  justify-content:center;flex-direction:column;gap:3px;
  box-shadow:-3px 0 14px rgba(15,32,60,.3);
  transition:background var(--pspd),right var(--pspd);
  user-select:none;border-left:3px solid var(--cb);}
#cpn-ql-tab:hover{background:var(--cn2);}
#cpn-ql-tab:active{cursor:grabbing;}
#cpn-ql-tab .cpn-drag-dots{color:rgba(255,255,255,.35);font-size:9px;
  letter-spacing:0;line-height:1;pointer-events:none;writing-mode:vertical-rl;}
#cpn-ql-tab span{color:#fff;font-size:10px;font-weight:800;letter-spacing:.15em;
  text-transform:uppercase;writing-mode:vertical-rl;transform:rotate(180deg);
  font-family:'Arial Black',sans-serif;pointer-events:none;}

/* ── Quick-link panel (other sites) ── */
#cpn-ql-panel{position:fixed;right:calc(-1*var(--pw));top:0;height:100vh;width:var(--pw);
  background:var(--cw);z-index:99999999;display:flex;flex-direction:column;
  box-shadow:0 6px 40px rgba(15,32,60,.22);
  transition:right var(--pspd) cubic-bezier(.4,0,.2,1);
  font-family:-apple-system,'Segoe UI',Arial,sans-serif;
  color:var(--ct);border-left:3px solid var(--cb);}
#cpn-ql-panel.open{right:0;}
#cpn-ql-hdr{background:var(--cn);color:#fff;padding:12px 12px 10px;
  display:flex;align-items:center;gap:7px;flex-shrink:0;border-bottom:3px solid var(--cb);}
.cpn-dot{width:8px;height:8px;background:var(--cb);border-radius:50%;flex-shrink:0;}
.cpn-ql-ttl{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;flex:1;}
.cpn-ql-hbtn{width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.12);
  border:none;color:#fff;font-size:11px;cursor:pointer;display:flex;
  align-items:center;justify-content:center;transition:background .15s;flex-shrink:0;}
.cpn-ql-hbtn:hover{background:var(--cb);}
/* link cards */
.cpn-ql-links{flex:1;display:flex;flex-direction:column;padding:12px 12px;gap:10px;
  overflow-y:auto;}
.cpn-ql-card{display:flex;align-items:center;gap:13px;padding:13px 14px;
  text-decoration:none;border-radius:8px;background:var(--cl);
  border:1px solid var(--cbr);transition:transform .15s,box-shadow .15s,border-color .15s;
  position:relative;overflow:hidden;}
.cpn-ql-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;}
.cpn-ql-card:hover{transform:translateX(-3px);box-shadow:3px 3px 16px rgba(15,32,60,.12);border-color:var(--cb);}
.cpn-ql-card .ql-logo{width:38px;height:38px;border-radius:8px;object-fit:contain;
  background:#fff;padding:4px;box-shadow:0 1px 4px rgba(0,0,0,.1);flex-shrink:0;}
.cpn-ql-card .ql-info{flex:1;min-width:0;}
.cpn-ql-card .ql-name{font-size:13px;font-weight:700;color:var(--cn);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cpn-ql-card .ql-sub{font-size:10.5px;color:var(--cm);margin-top:1px;}
.cpn-ql-card .ql-arr{font-size:18px;color:var(--cbr);flex-shrink:0;transition:color .15s;}
.cpn-ql-card:hover .ql-arr{color:var(--cb);}
/* disabled state */
.cpn-ql-card.disabled{opacity:.45;cursor:default;}
.cpn-ql-card.disabled:hover{transform:none;box-shadow:none;}
/* edit area */
.cpn-ql-edit-area{display:none;flex-direction:column;overflow-y:auto;
  background:var(--cl);border-top:2px solid var(--cb);}
.cpn-ql-edit-area.show{display:flex;}
.cpn-ql-edit-section{padding:10px 14px;border-bottom:1px solid var(--cbr);}
.cpn-ql-edit-section label{font-size:10.5px;font-weight:700;color:var(--cm);
  display:block;margin-bottom:3px;}
.cpn-ql-edit-section input{width:100%;box-sizing:border-box;border:1px solid var(--cbr);
  border-radius:3px;padding:5px 8px;font-size:11.5px;font-family:inherit;}
.cpn-ql-edit-section input:focus{outline:none;border-color:var(--cb);}
.cpn-ql-save{display:block;width:calc(100% - 28px);margin:10px 14px 14px;padding:8px;
  background:var(--cb);color:#fff;border:none;border-radius:4px;font-size:12px;
  font-weight:700;cursor:pointer;font-family:inherit;transition:background .15s;}
.cpn-ql-save:hover{background:var(--cb2);}

/* ── Main Crazyparts panel tab ── */
#cpn-tab{position:fixed;right:0;top:16px;z-index:99999999;
  width:var(--ptab);height:130px;background:var(--cn);
  border-radius:4px 0 0 4px;cursor:grab;display:flex;align-items:center;
  justify-content:center;flex-direction:column;gap:3px;
  box-shadow:-3px 0 14px rgba(15,32,60,.3);
  transition:background var(--pspd),right var(--pspd);
  user-select:none;border-left:3px solid var(--cb);}
#cpn-tab:hover{background:var(--cn2);}
#cpn-tab:active{cursor:grabbing;}
#cpn-tab .cpn-drag-dots{color:rgba(255,255,255,.35);font-size:9px;
  letter-spacing:0;line-height:1;pointer-events:none;writing-mode:vertical-rl;}
#cpn-tab span.cpn-tab-lbl{color:#fff;font-size:10.5px;font-weight:800;letter-spacing:.15em;
  text-transform:uppercase;writing-mode:vertical-rl;transform:rotate(180deg);
  font-family:'Arial Black',sans-serif;pointer-events:none;}
#cpn-panel{position:fixed;right:calc(-1*var(--pw));top:0;height:100vh;width:var(--pw);
  background:var(--cw);z-index:99999999;box-shadow:0 6px 40px rgba(15,32,60,.22);
  display:flex;flex-direction:column;transition:right var(--pspd) cubic-bezier(.4,0,.2,1);
  font-family:-apple-system,'Segoe UI',Arial,sans-serif;font-size:13px;
  color:var(--ct);border-left:3px solid var(--cb);}
#cpn-panel.open{right:0;}
#cpn-hdr{background:var(--cn);color:#fff;padding:11px 11px 9px;
  display:flex;align-items:center;gap:7px;flex-shrink:0;border-bottom:3px solid var(--cb);}
.cpn-ttl{font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;flex:1;}
.cpn-hbtn{width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.12);
  border:none;color:#fff;font-size:11px;cursor:pointer;display:flex;
  align-items:center;justify-content:center;transition:background .15s;flex-shrink:0;}
.cpn-hbtn:hover{background:var(--cb);}
.cpn-hbtn.active{background:var(--cb);}
#cpn-scroll{flex:1;overflow-y:auto;overflow-x:hidden;padding:4px 0 20px;}
#cpn-scroll::-webkit-scrollbar{width:4px;}
#cpn-scroll::-webkit-scrollbar-thumb{background:var(--cbr);border-radius:2px;}
.cpn-item{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;
  text-align:left;border:none;background:transparent;cursor:pointer;
  font-family:inherit;font-size:13px;color:var(--ct);text-decoration:none;
  line-height:1.4;position:relative;}
.cpn-item.l0{padding:9px 11px 9px 9px;font-weight:700;font-size:12.5px;
  letter-spacing:.02em;border-bottom:1px solid var(--cbr);color:var(--cn);transition:background .15s;}
.cpn-item.l0:hover{background:var(--chv);}
.cpn-item.l0.active{background:#dce6f5;}
.cpn-item.l0::before{content:'';position:absolute;left:0;top:0;bottom:0;
  width:3px;background:transparent;transition:background .15s;}
.cpn-item.l0:hover::before,.cpn-item.l0.active::before{background:var(--cb);}
.cpn-item.l1{padding:7px 11px 7px 20px;font-weight:600;font-size:12px;
  color:var(--cn);border-bottom:1px solid #edf0f7;transition:background .15s;}
.cpn-item.l1:hover{background:var(--chv);}
.cpn-item.l1.active{background:#dce6f5;}
.cpn-item.l2{padding:6px 11px 6px 30px;font-weight:500;color:#2e4460;
  transition:background .15s;font-size:12.5px;}
.cpn-item.l2:hover{background:var(--chv);}
.cpn-arr{margin-left:auto;font-size:10px;color:var(--cm);transition:transform .2s;flex-shrink:0;}
.cpn-item.active>.cpn-arr{transform:rotate(90deg);}
.cpn-sub{display:none;}.cpn-sub.open{display:block;}
.cpn-bdg{display:inline-block;margin-left:auto;padding:1px 5px;background:var(--cb);
  color:#fff;border-radius:3px;font-size:8px;font-weight:800;
  letter-spacing:.05em;text-transform:uppercase;flex-shrink:0;}
/* cable table */
.cpn-tw{padding:6px 7px 8px 20px;background:#f6f8fd;border-bottom:1px solid var(--cbr);}
.cpn-tw table{width:100%;border-collapse:collapse;font-size:12px;}
.cpn-tw thead tr{background:var(--cn);color:#fff;}
.cpn-tw th{padding:4px 5px;font-weight:700;font-size:10px;letter-spacing:.04em;text-align:center;}
.cpn-tw th:first-child{text-align:left;width:38px;}
.cpn-tw tbody tr{border-bottom:1px solid #dde3f0;}
.cpn-tw tbody tr:last-child{border-bottom:none;}
.cpn-tw tbody tr:hover{background:#edf1fb;}
.cpn-tw td{padding:3px 3px;text-align:center;vertical-align:middle;}
.cpn-tw td:first-child{font-weight:700;color:var(--cn);font-size:11px;text-align:left;padding-left:2px;}
.cpn-tw td .blk{display:inline-block;padding:3px 7px;background:var(--cb);
  color:#fff;border:none;border-radius:3px;font-size:9.5px;font-weight:600;
  cursor:pointer;font-family:inherit;transition:background .12s,transform .1s;}
.cpn-tw td .blk:hover{background:var(--cb2);transform:scale(1.05);}
.cpn-tw td .wht{background:#dce6f5;color:var(--cn);border:1px solid var(--cbr);}
.cpn-tw td .wht:hover{background:var(--chv);}
.cpn-qty-inp{width:42px;border:1px solid var(--cbr);border-radius:3px;
  padding:2px 4px;font-size:11px;font-family:inherit;text-align:center;background:#fff;color:var(--ct);}
.cpn-qty-inp:focus{outline:none;border-color:var(--cb);}
.cpn-cart-add{display:block;width:calc(100% - 20px);margin:8px 10px 0;padding:8px;
  background:var(--cb);color:#fff;border:none;border-radius:4px;font-size:12px;
  font-weight:700;cursor:pointer;font-family:inherit;transition:background .15s;}
.cpn-cart-add:hover{background:var(--cb2);}
/* plug list */
.cpn-pgw{padding:7px 9px 9px;background:#f6f8fd;border-bottom:1px solid var(--cbr);}
.cpn-pgrid{display:flex;flex-direction:column;gap:4px;}
.cpn-pgrid a,.cpn-pgrid button{display:flex;align-items:center;justify-content:space-between;
  padding:8px 14px;background:var(--cn);color:#fff;border-radius:3px;font-size:12px;
  font-weight:700;text-decoration:none;text-align:left;
  transition:background .15s;border:none;cursor:pointer;font-family:inherit;gap:3px;}
.cpn-pgrid a:hover,.cpn-pgrid button:hover{background:var(--cb);}
.cpn-pgrid .cpn-qty-inp{width:52px;}
/* custom section items */
.cpn-cs-item{display:flex;align-items:center;gap:6px;padding:6px 11px 6px 20px;
  border-bottom:1px solid #edf0f7;font-size:12px;color:#2e4460;}
.cpn-cs-item a{color:inherit;text-decoration:none;flex:1;}
.cpn-cs-item a:hover{color:var(--cb);}
.cpn-cstw{padding:5px 7px 7px 20px;background:#f6f8fd;border-bottom:1px solid var(--cbr);}
.cpn-cstw table{width:100%;border-collapse:collapse;font-size:11.5px;}
.cpn-cstw thead tr{background:var(--cn);color:#fff;}
.cpn-cstw th{padding:4px 5px;font-weight:700;font-size:10px;text-align:center;}
.cpn-cstw th:first-child{text-align:left;width:80px;}
.cpn-cstw tbody tr{border-bottom:1px solid #dde3f0;}
.cpn-cstw tbody tr:last-child{border-bottom:none;}
.cpn-cstw tbody tr:hover{background:#edf1fb;}
.cpn-cstw td{padding:3px 3px;text-align:center;vertical-align:middle;}
.cpn-cstw td:first-child{font-weight:600;color:var(--cn);text-align:left;padding-left:2px;}
.cpn-cstw td a,.cpn-cstw td button{display:inline-block;padding:3px 7px;background:var(--cb);
  color:#fff;border:none;border-radius:3px;font-size:9.5px;font-weight:600;cursor:pointer;
  text-decoration:none;font-family:inherit;transition:background .12s;}
.cpn-cstw td a:hover,.cpn-cstw td button:hover{background:var(--cb2);}
/* quick links bar inside Crazy panel */
.cpn-ql-bar{flex-shrink:0;display:flex;gap:8px;padding:9px 10px;
  background:var(--cl);border-top:2px solid var(--cb);}
.cpn-ql-bar a{flex:1;display:flex;align-items:center;gap:8px;padding:8px 10px;
  text-decoration:none;background:#fff;border:1px solid var(--cbr);
  border-radius:7px;transition:border-color .15s,box-shadow .15s;
  position:relative;overflow:hidden;}
.cpn-ql-bar a::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;}
.cpn-ql-bar a:hover{border-color:var(--cb);box-shadow:0 2px 10px rgba(23,105,192,.15);}
.cpn-ql-bar a img{width:22px;height:22px;border-radius:4px;object-fit:contain;flex-shrink:0;}
.cpn-ql-bar a span{font-size:11px;font-weight:700;color:var(--cn);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
/* footer */
#cpn-ftr{flex-shrink:0;padding:7px 11px;background:var(--cl);
  border-top:1px solid var(--cbr);font-size:10.5px;color:var(--cm);text-align:center;}
#cpn-ftr a{color:var(--cb);text-decoration:none;font-weight:600;}
/* MODALS */
.cpn-overlay{display:none;position:fixed;inset:0;z-index:1000000;
  background:rgba(10,20,40,.65);align-items:center;justify-content:center;}
.cpn-overlay.open{display:flex;}
.cpn-modal{background:#fff;border-radius:8px;width:560px;max-width:96vw;
  max-height:90vh;display:flex;flex-direction:column;
  box-shadow:0 12px 60px rgba(10,20,40,.3);overflow:hidden;}
.cpn-mhdr{background:var(--cn);color:#fff;padding:13px 16px 11px;
  display:flex;align-items:center;gap:9px;border-bottom:3px solid var(--cb);flex-shrink:0;}
.cpn-mhdr h2{margin:0;font-size:12.5px;font-weight:800;letter-spacing:.08em;
  text-transform:uppercase;flex:1;}
.cpn-mcls{background:rgba(255,255,255,.15);border:none;color:#fff;width:23px;height:23px;
  border-radius:50%;font-size:13px;cursor:pointer;display:flex;align-items:center;
  justify-content:center;transition:background .15s;}
.cpn-mcls:hover{background:var(--cb);}
.cpn-mscroll{flex:1;overflow-y:auto;padding:14px 16px;}
.cpn-mscroll::-webkit-scrollbar{width:4px;}
.cpn-mscroll::-webkit-scrollbar-thumb{background:var(--cbr);border-radius:2px;}
.cpn-mlbl{font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
  color:var(--cn);margin:12px 0 7px;padding-bottom:4px;border-bottom:2px solid var(--cb);}
.cpn-mlbl:first-child{margin-top:0;}
.cpn-mftr{flex-shrink:0;padding:11px 16px;background:var(--cl);
  border-top:1px solid var(--cbr);display:flex;gap:8px;justify-content:flex-end;}
.cpn-mbtn{padding:6px 16px;border-radius:4px;font-size:12px;font-weight:700;
  cursor:pointer;font-family:inherit;border:none;transition:background .15s;}
.cpn-mbtn.save{background:var(--cb);color:#fff;}
.cpn-mbtn.save:hover{background:var(--cb2);}
.cpn-mbtn.sec{background:#fff;color:var(--cm);border:1px solid var(--cbr);}
.cpn-mbtn.sec:hover{background:var(--chv);}
.cpn-mbtn.del{background:#fff;color:#c0392b;border:1px solid #e8b4b0;}
.cpn-mbtn.del:hover{background:#fef0ef;}
.cpn-etbl{width:100%;border-collapse:collapse;margin-bottom:6px;font-size:12px;}
.cpn-etbl th{background:var(--cl);font-size:10px;font-weight:700;padding:4px 7px;
  color:var(--cn);letter-spacing:.05em;text-transform:uppercase;border:1px solid var(--cbr);}
.cpn-etbl td{padding:3px 5px;border:1px solid var(--cbr);vertical-align:middle;}
.cpn-etbl td:first-child{font-weight:700;font-size:11px;color:var(--cn);
  background:#f8faff;width:48px;white-space:nowrap;}
.cpn-etbl input{width:100%;border:1px solid var(--cbr);border-radius:3px;
  padding:3px 6px;font-size:11px;font-family:inherit;color:var(--ct);box-sizing:border-box;}
.cpn-etbl input:focus{outline:none;border-color:var(--cb);}
.cpn-erow{display:flex;align-items:center;gap:7px;margin-bottom:5px;}
.cpn-erow label{font-weight:700;font-size:11px;color:var(--cn);min-width:72px;}
.cpn-erow input{flex:1;border:1px solid var(--cbr);border-radius:3px;
  padding:4px 7px;font-size:11px;font-family:inherit;color:var(--ct);}
.cpn-erow input:focus{outline:none;border-color:var(--cb);}
/* section editor */
.cpn-sec-block{border:1px solid var(--cbr);border-radius:5px;margin-bottom:10px;overflow:hidden;}
.cpn-sec-hdr{display:flex;align-items:center;gap:6px;padding:7px 9px;
  background:var(--cl);border-bottom:1px solid var(--cbr);}
.cpn-sec-hdr span.name{font-size:12px;font-weight:700;color:var(--cn);flex:1;}
.cpn-sec-body{padding:8px 10px;}
.cpn-sub-block{border:1px solid #e0e5f0;border-radius:4px;margin-bottom:7px;overflow:hidden;}
.cpn-sub-hdr{display:flex;align-items:center;gap:6px;padding:5px 7px;
  background:#f8faff;border-bottom:1px solid #e0e5f0;}
.cpn-sub-hdr span{flex:1;color:var(--cn);font-size:11.5px;font-weight:600;}
.cpn-sub-body{padding:6px 8px;}
.cpn-itm-row{display:flex;align-items:center;gap:5px;margin-bottom:4px;}
.cpn-itm-row input{border:1px solid var(--cbr);border-radius:3px;padding:3px 5px;
  font-size:11px;font-family:inherit;color:var(--ct);}
.cpn-itm-row input.lbl{width:90px;}
.cpn-itm-row input.url{flex:1;}
.cpn-itm-row input:focus{outline:none;border-color:var(--cb);}
.cpn-itm-row .rmv{background:none;border:none;color:#c0392b;font-size:14px;
  cursor:pointer;padding:0 3px;line-height:1;}
.cpn-colhdr-row{display:flex;gap:5px;margin-bottom:6px;align-items:center;}
.cpn-colhdr-row label{font-size:10.5px;font-weight:700;color:var(--cm);min-width:62px;}
.cpn-colhdr-row input{flex:1;border:1px solid var(--cbr);border-radius:3px;
  padding:3px 5px;font-size:11px;font-family:inherit;color:var(--ct);}
.cpn-colhdr-row input:focus{outline:none;border-color:var(--cb);}
.cpn-add-btn{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;
  background:var(--cb);color:#fff;border:none;border-radius:3px;font-size:11px;
  font-weight:600;cursor:pointer;font-family:inherit;margin-top:4px;}
.cpn-add-btn:hover{background:var(--cb2);}
/* reorder buttons */
.cpn-ord-btn{background:none;border:1px solid var(--cbr);border-radius:3px;
  color:var(--cm);font-size:11px;cursor:pointer;padding:1px 4px;line-height:1.2;
  transition:background .12s;}
.cpn-ord-btn:hover{background:var(--chv);color:var(--cn);}
/* io row */
.cpn-io-row{display:flex;gap:7px;margin-top:10px;}
.cpn-io-btn{flex:1;padding:5px;background:var(--cl);color:var(--cn);
  border:1px solid var(--cbr);border-radius:3px;font-size:11px;
  font-weight:700;cursor:pointer;font-family:inherit;text-align:center;}
.cpn-io-btn:hover{background:var(--chv);}
/* toast */
#cpn-toast{position:fixed;top:70px;left:50%;
  transform:translateX(-50%) translateY(-20px);z-index:1000001;
  background:var(--cn);color:#fff;padding:9px 20px;border-radius:6px;
  font-size:12px;font-weight:600;box-shadow:0 4px 20px rgba(0,0,0,.25);
  opacity:0;transition:transform .3s,opacity .3s;pointer-events:none;
  font-family:inherit;border-left:3px solid var(--cb);white-space:nowrap;}
#cpn-toast.show{transform:translateX(-50%) translateY(0);opacity:1;}
`}));

// ═══════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════
const toastEl=Object.assign(document.createElement('div'),{id:'cpn-toast'});
document.body.appendChild(toastEl);
let toastTm;
function showToast(msg,ms=3000){
  toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toastTm);
  if(ms>0&&ms<90000)toastTm=setTimeout(()=>toastEl.classList.remove('show'),ms);
}

// ═══════════════════════════════════════════════════════════
// DRAGGABLE TAB HELPER
// Makes a fixed-position tab element draggable vertically.
// Distinguishes drag from click via a 5px movement threshold.
// Persists the top position to GM storage under `storageKey`.
// Calls `clickCallback()` on a clean click (no significant drag).
// ═══════════════════════════════════════════════════════════
function makeDraggable(el, storageKey, clickCallback) {
  // Restore saved position (clamped to current viewport)
  const savedTop = gGet(storageKey + '_top', null);
  if (savedTop !== null) {
    // Defer clamp until layout is available
    requestAnimationFrame(() => {
      const maxTop = window.innerHeight - el.offsetHeight;
      el.style.top = Math.max(0, Math.min(maxTop, savedTop)) + 'px';
    });
  }

  let startY = 0, startTop = 0, isDragging = false, hasMoved = false;

  el.addEventListener('mousedown', e => {
    if (e.button !== 0) return; // left-click only
    startY    = e.clientY;
    startTop  = el.getBoundingClientRect().top;
    isDragging = true;
    hasMoved   = false;
    e.preventDefault(); // prevent text selection during drag
  });

  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dy = e.clientY - startY;
    if (Math.abs(dy) > 5) hasMoved = true;
    if (hasMoved) {
      const maxTop = window.innerHeight - el.offsetHeight;
      const newTop = Math.max(0, Math.min(maxTop, startTop + dy));
      el.style.top     = newTop + 'px';
      el.style.cursor  = 'grabbing';
      document.body.style.userSelect = 'none'; // prevent text highlights while dragging
    }
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.userSelect = '';
    el.style.cursor = '';

    if (hasMoved) {
      // Persist the final position
      const top = Math.round(el.getBoundingClientRect().top);
      gSet(storageKey + '_top', top);
    } else {
      // Clean click — delegate to the caller
      clickCallback();
    }
  });

  // Touch support (for mobile/tablet)
  el.addEventListener('touchstart', e => {
    startY    = e.touches[0].clientY;
    startTop  = el.getBoundingClientRect().top;
    isDragging = true;
    hasMoved   = false;
  }, {passive: true});

  document.addEventListener('touchmove', e => {
    if (!isDragging) return;
    const dy = e.touches[0].clientY - startY;
    if (Math.abs(dy) > 5) hasMoved = true;
    if (hasMoved) {
      const maxTop = window.innerHeight - el.offsetHeight;
      el.style.top = Math.max(0, Math.min(maxTop, startTop + dy)) + 'px';
    }
  }, {passive: true});

  document.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    if (hasMoved) {
      gSet(storageKey + '_top', Math.round(el.getBoundingClientRect().top));
    } else {
      clickCallback();
    }
  });
}

// ═══════════════════════════════════════════════════════════
// QUICK-LINKS PANEL  (shown on ALL sites)
// ═══════════════════════════════════════════════════════════
const QL_DEFS = [
  {key:'ql_crazy',  name:'Crazyparts',   sub:'crazyparts.com.au',  bg:'#1a3a6e',
   fav:'https://www.google.com/s2/favicons?domain=crazyparts.com.au&sz=64'},
  {key:'ql_sospos', name:'SOS POS',      sub:'app.sospos.com.au',  bg:'#1769c0',
   fav:'https://www.google.com/s2/favicons?domain=app.sospos.com.au&sz=64'},
  {key:'ql_gsheet', name:'Google Sheet', sub:'docs.google.com',    bg:'#0f9d58',
   fav:'https://www.google.com/s2/favicons?domain=docs.google.com&sz=64'},
];

let qlOpen=false, qlEditMode=false;
const qlTab=document.createElement('div');
qlTab.id='cpn-ql-tab';
qlTab.innerHTML='<span class="cpn-drag-dots">⠿</span><span>Links</span><span class="cpn-drag-dots">⠿</span>';

const qlPanel=document.createElement('div');
qlPanel.id='cpn-ql-panel';

function buildQlPanel(){
  qlPanel.innerHTML=`
    <div id="cpn-ql-hdr">
      <div class="cpn-dot"></div>
      <div class="cpn-ql-ttl">Quick Links</div>
      <button class="cpn-ql-hbtn" id="ql-edit-tog" title="Edit links">✏️</button>
      <button class="cpn-ql-hbtn" id="ql-cls" title="Close">✕</button>
    </div>
    <div class="cpn-ql-links" id="ql-links"></div>
    <div class="cpn-ql-edit-area" id="ql-edit-area">
      <div style="padding:10px 14px 0;font-size:10.5px;font-weight:800;color:var(--cn);
        letter-spacing:.06em;text-transform:uppercase;border-bottom:2px solid var(--cb);
        padding-bottom:6px;margin-bottom:4px;">Pinned Links</div>
      ${QL_DEFS.map(d=>`
        <div class="cpn-ql-edit-section">
          <label><img src="${d.fav}" style="width:13px;height:13px;vertical-align:middle;border-radius:2px;margin-right:5px">${d.name} URL</label>
          <input data-k="${d.key}" value="${qlUrl(d.key)}" placeholder="${DEF_LINKS[d.key]||'https://'}">
        </div>`).join('')}
      <div style="padding:10px 14px 0;font-size:10.5px;font-weight:800;color:var(--cn);
        letter-spacing:.06em;text-transform:uppercase;border-bottom:2px solid var(--cb);
        padding-bottom:6px;margin:4px 0;">Custom Links</div>
      <div id="ql-custom-list" style="padding:6px 14px 0;"></div>
      <button id="ql-add-link" style="display:flex;align-items:center;gap:6px;
        margin:8px 14px;padding:7px 12px;background:var(--cl);color:var(--cb);
        border:1px dashed var(--cb);border-radius:5px;font-size:11.5px;font-weight:700;
        cursor:pointer;font-family:inherit;width:calc(100% - 28px);">
        + Add Link
      </button>
      <button class="cpn-ql-save" id="ql-save">💾 Save All Links</button>
    </div>`;

  // ── Render link cards ──
  const linksDiv=qlPanel.querySelector('#ql-links');

  function makeCard(url, name, sub, bg, fav){
    const a=document.createElement('a');
    a.className='cpn-ql-card'+(url?'':' disabled');
    a.href=url||'#';
    if(url) smartTarget(a, url);
    const accent=document.createElement('div');
    accent.style.cssText=`position:absolute;left:0;top:0;bottom:0;width:4px;background:${bg};border-radius:8px 0 0 8px;`;
    const img=document.createElement('img');
    img.src=fav; img.className='ql-logo'; img.alt=name;
    img.onerror=()=>img.style.display='none';
    const info=document.createElement('div'); info.className='ql-info';
    info.innerHTML=`<div class="ql-name">${name}</div><div class="ql-sub">${sub}</div>`;
    const arrEl=document.createElement('span'); arrEl.className='ql-arr'; arrEl.textContent='›';
    a.append(accent,img,info,arrEl);
    if(!url){ a.onclick=e=>{e.preventDefault();showToast('⚠️ Set URL in ✏️ edit first');}; }
    return a;
  }

  // Pinned links
  QL_DEFS.forEach(d => linksDiv.appendChild(makeCard(qlUrl(d.key), d.name, d.sub, d.bg, d.fav)));

  // Separator if there are custom links
  const customs = loadCustomLinks();
  if(customs.length){
    const sep=document.createElement('div');
    sep.style.cssText='height:1px;background:var(--cbr);margin:4px 12px;flex-shrink:0;';
    linksDiv.appendChild(sep);
    customs.forEach(cl=>{
      if(!cl.name && !cl.url) return;
      let sub='';
      try{ sub=new URL(cl.url).hostname; }catch{}
      const fav=`https://www.google.com/s2/favicons?domain=${encodeURIComponent(sub)}&sz=64`;
      linksDiv.appendChild(makeCard(cl.url, cl.name||sub, sub, '#5a6a82', fav));
    });
  }

  // ── Edit area: populate custom links list ──
  const customList=qlPanel.querySelector('#ql-custom-list');

  function addCustomRow(item={}){
    const row=document.createElement('div');
    row.style.cssText='display:flex;gap:5px;align-items:center;margin-bottom:6px;';
    const nameInp=Object.assign(document.createElement('input'),{
      placeholder:'Name', value:item.name||'',
      style:'width:85px;border:1px solid var(--cbr);border-radius:3px;padding:4px 6px;font-size:11px;font-family:inherit;flex-shrink:0;'
    });
    const urlInp=Object.assign(document.createElement('input'),{
      placeholder:'https://...', value:item.url||'', type:'url',
      style:'flex:1;border:1px solid var(--cbr);border-radius:3px;padding:4px 6px;font-size:11px;font-family:inherit;'
    });
    [nameInp,urlInp].forEach(i=>i.addEventListener('focus',()=>{i.style.borderColor='var(--cb)';}));
    [nameInp,urlInp].forEach(i=>i.addEventListener('blur',()=>{i.style.borderColor='var(--cbr)';}));
    const rmv=Object.assign(document.createElement('button'),{
      textContent:'×', type:'button',
      style:'background:none;border:none;color:#c0392b;font-size:16px;cursor:pointer;padding:0 3px;line-height:1;flex-shrink:0;'
    });
    rmv.onclick=()=>row.remove();
    row.append(nameInp,urlInp,rmv);
    row._getData=()=>({name:nameInp.value.trim(), url:urlInp.value.trim()});
    customList.appendChild(row);
    return row;
  }

  customs.forEach(cl=>addCustomRow(cl));

  qlPanel.querySelector('#ql-add-link').onclick=()=>{ addCustomRow(); };

  qlPanel.querySelector('#ql-cls').onclick=()=>closeQl();
  qlPanel.querySelector('#ql-edit-tog').onclick=()=>{
    qlEditMode=!qlEditMode;
    qlPanel.querySelector('#ql-links').style.display=qlEditMode?'none':'flex';
    qlPanel.querySelector('#ql-edit-area').classList.toggle('show',qlEditMode);
    qlPanel.querySelector('#ql-edit-tog').classList.toggle('active',qlEditMode);
  };
  qlPanel.querySelector('#ql-save').addEventListener('click',()=>{
    const u=loadURLs();
    qlPanel.querySelectorAll('#ql-edit-area input[data-k]').forEach(inp=>{
      const v=inp.value.trim();if(v)u[inp.dataset.k]=v;else delete u[inp.dataset.k];
    });
    saveURLs(u);
    const customRows=Array.from(customList.querySelectorAll('div'));
    const customData=customRows.map(r=>r._getData?.()).filter(d=>d&&(d.name||d.url));
    saveCustomLinks(customData);
    buildQlPanel();showToast('✅ Links saved!');qlEditMode=false;
  });
}

function openQl() { qlOpen=true; qlPanel.classList.add('open'); qlTab.style.right='var(--pw)'; }
function closeQl(){ qlOpen=false; qlPanel.classList.remove('open'); qlTab.style.right='0'; }

buildQlPanel();
document.body.appendChild(qlTab);
document.body.appendChild(qlPanel);

// Wire up draggable + click for the QL tab
makeDraggable(qlTab, 'ql_tab', () => qlOpen ? closeQl() : openQl());

// Escape closes ql panel
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeQl(); });

// ═══════════════════════════════════════════════════════════
// NON-CRAZYPARTS: just show ql panel, nothing else
// ═══════════════════════════════════════════════════════════
if(!IS_CRAZY) return;

// ═══════════════════════════════════════════════════════════
// HELPERS  (Crazyparts only)
// ═══════════════════════════════════════════════════════════
function arr(){const s=document.createElement('span');s.className='cpn-arr';s.textContent='›';return s;}
function mkBtn(lbl,cls){const b=document.createElement('button');b.type='button';b.className=cls||'';b.textContent=lbl;return b;}
function toggleSub(btn,sub){
  const open=sub.classList.contains('open');
  btn.parentElement.querySelectorAll(':scope>.cpn-sub.open').forEach(s=>{
    if(s!==sub){s.classList.remove('open');s.previousElementSibling?.classList.remove('active');}
  });
  sub.classList.toggle('open',!open);btn.classList.toggle('active',!open);
}
function reorderBtns(blk){
  const up=Object.assign(document.createElement('button'),{type:'button',textContent:'▲',title:'Move up',className:'cpn-ord-btn'});
  const dn=Object.assign(document.createElement('button'),{type:'button',textContent:'▼',title:'Move down',className:'cpn-ord-btn'});
  up.onclick=e=>{e.stopPropagation();const p=blk.previousElementSibling;if(p)blk.parentNode.insertBefore(blk,p);};
  dn.onclick=e=>{e.stopPropagation();const n=blk.nextElementSibling;if(n)blk.parentNode.insertBefore(n,blk);};
  return[up,dn];
}
function smartTarget(a, url) {
  if (!url) return;
  try {
    const isCrazy = new URL(url).hostname.includes('crazyparts.com.au');
    a.target = isCrazy ? '_self' : '_blank';
    if (!isCrazy) a.rel = 'noopener noreferrer';
  } catch { a.target = '_self'; }
}

// ═══════════════════════════════════════════════════════════
// MAIN PANEL SHELL
// ═══════════════════════════════════════════════════════════
const tab=document.createElement('div');
tab.id='cpn-tab';
tab.innerHTML='<span class="cpn-drag-dots">⠿</span><span class="cpn-tab-lbl">Quick Nav</span><span class="cpn-drag-dots">⠿</span>';
document.body.appendChild(tab);

const panel=document.createElement('div');
panel.id='cpn-panel';
panel.innerHTML=`
  <div id="cpn-hdr">
    <div class="cpn-dot"></div><div class="cpn-ttl">Quick Nav</div>
    <button class="cpn-hbtn" id="cpn-cart-btn" title="Cart Mode">🛒</button>
    <button class="cpn-hbtn" id="cpn-edit-btn" title="Edit URLs">✏️</button>
    <button class="cpn-hbtn" id="cpn-sec-btn" title="Manage Sections">⚙️</button>
    <button class="cpn-hbtn" id="cpn-close" title="Close">✕</button>
  </div>
  <div class="cpn-ql-bar" id="cpn-ql-bar"></div>
  <div id="cpn-scroll"></div>
  <div id="cpn-ftr"><a href="${BASE}">crazyparts.com.au</a> · ✏️ URLs · ⚙️ sections · 🛒 cart</div>`;
document.body.appendChild(panel);
const scroll=panel.querySelector('#cpn-scroll');

// Build quick-link bar at the bottom of Crazy panel
function buildQlBar(){
  const bar=panel.querySelector('#cpn-ql-bar');
  bar.innerHTML='';
  QL_DEFS.slice(1).forEach(d=>{
    const url=qlUrl(d.key);
    const a=document.createElement('a');
    a.href=url||'#';
    if(!url){ a.onclick=e=>{e.preventDefault();showToast('⚠️ Set URL in ✏️ edit first');}; a.style.opacity='.5'; }
    else smartTarget(a, url);
    const ac=document.createElement('div');
    ac.style.cssText=`position:absolute;left:0;top:0;bottom:0;width:3px;background:${d.bg};border-radius:7px 0 0 7px;`;
    const img=document.createElement('img');
    img.src=d.fav; img.alt=d.name;
    img.onerror=()=>img.style.display='none';
    const lbl=document.createElement('span'); lbl.textContent=d.name;
    a.append(ac,img,lbl);
    bar.appendChild(a);
  });
}
buildQlBar();

// ═══════════════════════════════════════════════════════════
// MENU BUILD
// ═══════════════════════════════════════════════════════════
let cartMode=false;

function buildCableTable(type){
  const wrap=document.createElement('div');wrap.className='cpn-tw cpn-sub';
  const tbl=document.createElement('table');
  const hdrs=cartMode?'<th>Size</th><th>⬛ Qty</th><th>⬜ Qty</th>'
                     :'<th>Size</th><th>⬛ Black</th><th>⬜ White</th>';
  tbl.innerHTML=`<thead><tr>${hdrs}</tr></thead>`;
  const tb=document.createElement('tbody');
  SIZES.forEach(sz=>{
    const tr=document.createElement('tr');
    const szTd=document.createElement('td');szTd.textContent=sz;tr.appendChild(szTd);
    [['black','blk'],['white','wht']].forEach(([col,cls])=>{
      const td=document.createElement('td');
      if(cartMode){
        const inp=document.createElement('input');
        inp.type='number';inp.min='0';inp.max='999';inp.className='cpn-qty-inp';inp.placeholder='0';
        inp.dataset.url=cUrl(type.id,sz,col);
        inp.dataset.colour=col==='black'?'Black':'White';
        inp.dataset.label=`${type.label} ${sz} ${col}`;
        td.appendChild(inp);
      }else{
        const btn=document.createElement('button');
        btn.textContent='Buy';btn.className=cls;
        btn.onclick=()=>navCol(cUrl(type.id,sz,col),col==='black'?'Black':'White');
        td.appendChild(btn);
      }
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  tbl.appendChild(tb);wrap.appendChild(tbl);return wrap;
}

function buildPlugGrid(){
  const wrap=document.createElement('div');wrap.className='cpn-pgw cpn-sub';
  const grid=document.createElement('div');grid.className='cpn-pgrid';
  PLUGS.forEach(p=>{
    if(cartMode){
      const btn=document.createElement('button');btn.textContent=p.label;
      const inp=document.createElement('input');
      inp.type='number';inp.min='0';inp.max='999';inp.className='cpn-qty-inp';inp.placeholder='Qty';
      inp.dataset.url=pUrl(p.id);inp.dataset.colour='';inp.dataset.label=`iQuick ${p.label}`;
      btn.appendChild(inp);btn.addEventListener('click',e=>{if(e.target!==inp)inp.focus();});
      grid.appendChild(btn);
    }else{
      const a=document.createElement('a');a.textContent=p.label;a.href=pUrl(p.id);
      smartTarget(a, pUrl(p.id));
      a.addEventListener('click',e=>{e.preventDefault();location.href=pUrl(p.id);});
      grid.appendChild(a);
    }
  });
  wrap.appendChild(grid);return wrap;
}

function buildCustomSection(sec){
  const outer=document.createElement('div');outer.className='cpn-sub';
  (sec.subs||[]).forEach(sub=>{
    const sbtn=mkBtn(sub.label,'cpn-item l1');sbtn.appendChild(arr());outer.appendChild(sbtn);
    const ssub=document.createElement('div');ssub.className='cpn-sub';
    if(sub.type==='table'){
      const tw=document.createElement('div');tw.className='cpn-cstw';
      const cols=sub.cols||['Item','Link'];
      const tbl=document.createElement('table');
      tbl.innerHTML=`<thead><tr>${cols.map((c,i)=>`<th${i===0?' style="text-align:left"':''}>${c}</th>`).join('')}</tr></thead>`;
      const tb=document.createElement('tbody');
      (sub.rows||[]).forEach(row=>{
        const tr=document.createElement('tr');
        const lTd=document.createElement('td');lTd.textContent=row.label;tr.appendChild(lTd);
        (row.urls||[]).forEach((u,i)=>{
          const td=document.createElement('td');
          if(u){
            const colLabel=cols[i+1]||'Link';
            if(cartMode){
              const inp=document.createElement('input');
              inp.type='number';inp.min='0';inp.max='999';inp.className='cpn-qty-inp';
              inp.placeholder='0';inp.dataset.url=u;inp.dataset.colour='';
              inp.dataset.label=`${row.label} – ${colLabel}`;td.appendChild(inp);
            }else{
              const a=document.createElement('a');a.href=u;a.textContent=colLabel;
              smartTarget(a,u); td.appendChild(a);
            }
          }
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);tw.appendChild(tbl);ssub.appendChild(tw);
    }else{
      (sub.items||[]).forEach(it=>{
        const row=document.createElement('div');row.className='cpn-cs-item';
        const a=document.createElement('a');a.href=it.url||'#';a.textContent=it.label;
        smartTarget(a, it.url); row.appendChild(a);
        if(cartMode&&it.url){
          const inp=document.createElement('input');
          inp.type='number';inp.min='0';inp.max='999';inp.className='cpn-qty-inp';
          inp.placeholder='0';inp.dataset.url=it.url;inp.dataset.colour='';
          inp.dataset.label=it.label;inp.style.width='40px';row.appendChild(inp);
        }
        ssub.appendChild(row);
      });
    }
    outer.appendChild(ssub);
    sbtn.addEventListener('click',()=>toggleSub(sbtn,ssub));
  });
  return outer;
}

function buildMenu(){
  scroll.innerHTML='';
  if(cartMode){
    const caBtn=mkBtn('🛒 Add All to Cart','cpn-cart-add');
    caBtn.addEventListener('click',()=>runQueue(gatherCart()));
    scroll.appendChild(caBtn);
  }
  // Cables
  const cBtn=mkBtn('🔌 Phone Charger Cables','cpn-item l0');
  cBtn.appendChild(Object.assign(document.createElement('span'),{className:'cpn-bdg',textContent:'iQuick'}));
  cBtn.appendChild(arr());scroll.appendChild(cBtn);
  const cSub=document.createElement('div');cSub.className='cpn-sub';
  CABLE_TYPES.forEach(type=>{
    const tb=mkBtn(type.label,'cpn-item l1');tb.appendChild(arr());cSub.appendChild(tb);
    const tw=buildCableTable(type);cSub.appendChild(tw);
    tb.addEventListener('click',()=>toggleSub(tb,tw));
  });
  const mLink=document.createElement('a');
  mLink.className='cpn-item l1';mLink.textContent='Micro USB';
  const mUrl=getURL('micro_url',iq('micro usb cable'));
  mLink.href=mUrl; smartTarget(mLink, mUrl);
  cSub.appendChild(mLink);
  scroll.appendChild(cSub);
  cBtn.addEventListener('click',()=>toggleSub(cBtn,cSub));
  // Plugs
  const pBtn=mkBtn('⚡ Wall Plugs','cpn-item l0');
  pBtn.appendChild(Object.assign(document.createElement('span'),{className:'cpn-bdg',textContent:'iQuick'}));
  pBtn.appendChild(arr());scroll.appendChild(pBtn);
  const pSub=buildPlugGrid();scroll.appendChild(pSub);
  pBtn.addEventListener('click',()=>toggleSub(pBtn,pSub));
  // Custom sections
  loadSections().forEach(sec=>{
    const sBtn=mkBtn((sec.icon||'📦')+' '+sec.label,'cpn-item l0');
    sBtn.appendChild(arr());scroll.appendChild(sBtn);
    const sSub=buildCustomSection(sec);scroll.appendChild(sSub);
    sBtn.addEventListener('click',()=>toggleSub(sBtn,sSub));
  });
}
buildMenu();

// Cart mode toggle
panel.querySelector('#cpn-cart-btn').addEventListener('click',()=>{
  cartMode=!cartMode;
  panel.querySelector('#cpn-cart-btn').classList.toggle('active',cartMode);
  buildMenu();
  showToast(cartMode?'🛒 Cart mode ON':'🔗 Browse mode ON');
});

// ═══════════════════════════════════════════════════════════
// EDIT URLs MODAL
// ═══════════════════════════════════════════════════════════
const editOvl=Object.assign(document.createElement('div'),{className:'cpn-overlay',id:'cpn-edit-ovl'});
document.body.appendChild(editOvl);

function renderEditModal(){
  const urls=loadURLs();const gv=k=>urls[k]||'';
  editOvl.innerHTML=`
  <div class="cpn-modal">
    <div class="cpn-mhdr"><h2>✏️ Edit Product URLs</h2><button class="cpn-mcls" id="e-cls">✕</button></div>
    <div class="cpn-mscroll">
      <p style="font-size:11.5px;color:var(--cm);margin:0 0 10px">
        Paste direct product URLs. Blank = default search. <strong>Saved in Tampermonkey storage.</strong>
      </p>
      <div class="cpn-mlbl">🔗 Quick Links (SOS POS + Google Sheet)</div>
      ${QL_DEFS.slice(1).map(d=>`
        <div class="cpn-erow">
          <label>${d.icon||''} ${d.name}</label>
          <input data-k="${d.key}" value="${gv(d.key)}" placeholder="${DEF_LINKS[d.key]||'https://'}">
        </div>`).join('')}
      <div class="cpn-mlbl" style="margin-top:12px">🔌 Cables</div>
      ${CABLE_TYPES.map(t=>`
        <div class="cpn-mlbl" style="font-size:10px;color:var(--cb);border-bottom:1px solid var(--cbr);margin-top:8px">${t.label}</div>
        <table class="cpn-etbl">
          <thead><tr><th>Size</th><th>⬛ Black URL</th><th>⬜ White URL</th></tr></thead>
          <tbody>${SIZES.map(sz=>`
            <tr>
              <td>${sz}</td>
              <td><input data-k="${t.id+'_'+sz+'_black'}" value="${gv(t.id+'_'+sz+'_black')}" placeholder="default: search"></td>
              <td><input data-k="${t.id+'_'+sz+'_white'}" value="${gv(t.id+'_'+sz+'_white')}" placeholder="default: search"></td>
            </tr>`).join('')}
          </tbody>
        </table>`).join('')}
      <div class="cpn-mlbl" style="margin-top:12px">⚡ Wall Plugs</div>
      ${PLUGS.map(p=>`
        <div class="cpn-erow">
          <label>${p.label}</label>
          <input data-k="${p.id}" value="${gv(p.id)}" placeholder="default: search">
        </div>`).join('')}
      <div class="cpn-mlbl" style="margin-top:12px">Export / Import</div>
      <div class="cpn-io-row">
        <button class="cpn-io-btn" id="e-exp">⬇️ Export JSON</button>
        <label class="cpn-io-btn" style="cursor:pointer">⬆️ Import JSON<input type="file" accept=".json" style="display:none" id="e-imp"></label>
      </div>
    </div>
    <div class="cpn-mftr">
      <button class="cpn-mbtn sec" id="e-rst">Reset All</button>
      <button class="cpn-mbtn save" id="e-sav">💾 Save</button>
    </div>
  </div>`;
  editOvl.querySelector('#e-cls').onclick=()=>editOvl.classList.remove('open');
  editOvl.querySelector('#e-rst').onclick=()=>{
    if(confirm('Reset all custom URLs?')){saveURLs({});renderEditModal();buildMenu();buildQlBar();buildQlPanel();showToast('🔄 Reset');}
  };
  editOvl.querySelector('#e-sav').onclick=()=>{
    const u=loadURLs();
    editOvl.querySelectorAll('input[data-k]').forEach(inp=>{
      const v=inp.value.trim();if(v)u[inp.dataset.k]=v;else delete u[inp.dataset.k];
    });
    saveURLs(u);editOvl.classList.remove('open');buildMenu();buildQlBar();buildQlPanel();showToast('✅ Saved!');
  };
  editOvl.querySelector('#e-exp').onclick=()=>{
    const blob=new Blob([JSON.stringify({urls:loadURLs(),sections:loadSections(),ql_custom:loadCustomLinks()},null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='crazyparts_nav_config.json';a.click();
  };
  editOvl.querySelector('#e-imp').onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    const r=new FileReader();r.onload=ev=>{
      try{const d=JSON.parse(ev.target.result);
        if(d.urls)saveURLs(d.urls);
        if(d.sections)saveSections(d.sections);
        if(d.ql_custom)saveCustomLinks(d.ql_custom);
        renderEditModal();buildMenu();buildQlBar();buildQlPanel();showToast('✅ Imported!');}
      catch{showToast('❌ Invalid JSON');}
    };r.readAsText(f);
  };
  editOvl.addEventListener('mousedown',e=>{if(e.target===editOvl)editOvl.classList.remove('open');});
}
panel.querySelector('#cpn-edit-btn').onclick=()=>{renderEditModal();editOvl.classList.add('open');};

// ═══════════════════════════════════════════════════════════
// SECTION EDITOR MODAL
// ═══════════════════════════════════════════════════════════
const secOvl=Object.assign(document.createElement('div'),{className:'cpn-overlay',id:'cpn-sec-ovl'});
document.body.appendChild(secOvl);

function genId(){return 's'+Date.now()+Math.random().toString(36).slice(2,5);}

function buildItemRow(item){
  const row=document.createElement('div');row.className='cpn-itm-row';
  const lInp=Object.assign(document.createElement('input'),{className:'lbl',placeholder:'Label',value:item.label||''});
  const uInp=Object.assign(document.createElement('input'),{className:'url',placeholder:'URL',value:item.url||''});
  const rmv=Object.assign(document.createElement('button'),{className:'rmv',textContent:'×',type:'button'});
  rmv.onclick=()=>row.remove();
  row.append(lInp,uInp,rmv);
  row._getItem=()=>({label:lInp.value.trim(),url:uInp.value.trim()});
  return row;
}

function buildTableRowEl(rowData,colCount){
  const row=document.createElement('div');row.className='cpn-itm-row';
  const lbl=Object.assign(document.createElement('input'),{className:'lbl',placeholder:'Row label',value:rowData.label||''});
  row.appendChild(lbl);
  const urlInputs=[];
  for(let i=0;i<colCount;i++){
    const ui=Object.assign(document.createElement('input'),{className:'url',placeholder:'URL '+(i+1),value:(rowData.urls||[])[i]||''});
    row.appendChild(ui);urlInputs.push(ui);
  }
  const rmv=Object.assign(document.createElement('button'),{className:'rmv',textContent:'×',type:'button'});
  rmv.onclick=()=>row.remove();row.appendChild(rmv);
  row._getRow=()=>({label:lbl.value.trim(),urls:urlInputs.map(u=>u.value.trim())});
  return row;
}

function buildSubEditor(sub,secBody){
  const blk=document.createElement('div');blk.className='cpn-sub-block';
  const hdr=document.createElement('div');hdr.className='cpn-sub-hdr';
  const nameInp=Object.assign(document.createElement('input'),{value:sub.label||'',placeholder:'Subsection name',
    style:'flex:1;border:1px solid var(--cbr);border-radius:3px;padding:2px 5px;font-size:11px;font-family:inherit;'});
  const typeSelect=document.createElement('select');
  typeSelect.style='border:1px solid var(--cbr);border-radius:3px;padding:2px 4px;font-size:11px;font-family:inherit;';
  ['list','table'].forEach(t=>{const o=document.createElement('option');o.value=t;o.textContent=t==='list'?'List':'Table';if(sub.type===t)o.selected=true;typeSelect.appendChild(o);});
  const [subUp,subDn]=reorderBtns(blk);
  const delSubBtn=Object.assign(document.createElement('button'),{textContent:'✕',type:'button',className:'rmv'});
  delSubBtn.onclick=()=>blk.remove();
  hdr.append(subUp,subDn,nameInp,typeSelect,delSubBtn);
  blk.appendChild(hdr);

  const body=document.createElement('div');body.className='cpn-sub-body';blk.appendChild(body);

  function renderSubBody(){
    body.innerHTML='';
    if(typeSelect.value==='table'){
      const colHdrDiv=document.createElement('div');
      colHdrDiv.innerHTML='<div style="font-size:10.5px;font-weight:700;color:var(--cm);margin-bottom:4px">Column headers:</div>';
      const colInputs=[];
      const colHdrRow=document.createElement('div');colHdrRow.className='cpn-colhdr-row';
      (sub.cols||['Item','Link 1']).forEach((c,i)=>{
        const ci=Object.assign(document.createElement('input'),{value:c,placeholder:'Col '+(i+1)});
        ci.style='flex:1;border:1px solid var(--cbr);border-radius:3px;padding:3px 5px;font-size:11px;font-family:inherit;';
        colHdrRow.appendChild(ci);colInputs.push(ci);
      });
      const addCol=Object.assign(document.createElement('button'),{textContent:'+ Col',type:'button',className:'cpn-add-btn'});
      const remCol=Object.assign(document.createElement('button'),{textContent:'- Col',type:'button',className:'cpn-add-btn',style:'background:var(--cm)'});
      addCol.onclick=()=>{if(colInputs.length<4){const ci=Object.assign(document.createElement('input'),{placeholder:'Col '+(colInputs.length+1),value:''});ci.style='flex:1;border:1px solid var(--cbr);border-radius:3px;padding:3px 5px;font-size:11px;font-family:inherit;';colHdrRow.appendChild(ci);colInputs.push(ci);}};
      remCol.onclick=()=>{if(colInputs.length>2)colHdrRow.removeChild(colInputs.pop());};
      colHdrDiv.append(colHdrRow,Object.assign(document.createElement('div'),{style:'display:flex;gap:4px;margin-top:3px;'}));
      colHdrDiv.lastChild.append(addCol,remCol);
      body.appendChild(colHdrDiv);
      const rowsDiv=document.createElement('div');rowsDiv.style='margin-top:6px';
      rowsDiv.innerHTML='<div style="font-size:10.5px;font-weight:700;color:var(--cm);margin-bottom:3px">Rows:</div>';
      (sub.rows||[]).forEach(r=>rowsDiv.appendChild(buildTableRowEl(r,colInputs.length-1)));
      const addRow=Object.assign(document.createElement('button'),{textContent:'+ Add Row',type:'button',className:'cpn-add-btn'});
      addRow.onclick=()=>{const ri=buildTableRowEl({},colInputs.length-1);rowsDiv.insertBefore(ri,addRow);};
      rowsDiv.appendChild(addRow);body.appendChild(rowsDiv);
      blk._getSub=()=>({id:sub.id||genId(),label:nameInp.value.trim(),type:'table',
        cols:colInputs.map(c=>c.value.trim()||'Col'),
        rows:Array.from(rowsDiv.querySelectorAll('.cpn-itm-row')).map(r=>r._getRow?.()),});
    }else{
      const itemsDiv=document.createElement('div');
      (sub.items||[]).forEach(it=>itemsDiv.appendChild(buildItemRow(it)));
      const addItm=Object.assign(document.createElement('button'),{textContent:'+ Add Item',type:'button',className:'cpn-add-btn'});
      addItm.onclick=()=>itemsDiv.insertBefore(buildItemRow({}),addItm);
      itemsDiv.appendChild(addItm);body.appendChild(itemsDiv);
      blk._getSub=()=>({id:sub.id||genId(),label:nameInp.value.trim(),type:'list',
        items:Array.from(itemsDiv.querySelectorAll('.cpn-itm-row')).map(r=>r._getItem?.()),});
    }
  }
  renderSubBody();
  typeSelect.addEventListener('change',()=>{sub.type=typeSelect.value;renderSubBody();});
  secBody.appendChild(blk);
  return blk;
}

function renderSectionEditor(){
  const secs=loadSections();
  secOvl.innerHTML='';
  const modal=document.createElement('div');modal.className='cpn-modal';
  modal.innerHTML=`
    <div class="cpn-mhdr"><h2>⚙️ Manage Custom Sections</h2><button class="cpn-mcls" id="s-cls">✕</button></div>
    <div class="cpn-mscroll" id="s-body"></div>
    <div class="cpn-mftr">
      <button class="cpn-mbtn sec" id="s-add">+ Add Section</button>
      <button class="cpn-mbtn save" id="s-sav">💾 Save</button>
    </div>`;
  secOvl.appendChild(modal);
  const sbody=modal.querySelector('#s-body');

  function addSectionBlock(sec){
    const blk=document.createElement('div');blk.className='cpn-sec-block';
    const hdr=document.createElement('div');hdr.className='cpn-sec-hdr';
    const iconInp=Object.assign(document.createElement('input'),{value:sec.icon||'📦',
      style:'width:32px;border:1px solid var(--cbr);border-radius:3px;padding:2px 3px;font-size:13px;text-align:center;font-family:inherit;'});
    const nameInp=Object.assign(document.createElement('input'),{value:sec.label||'',placeholder:'Section name',
      style:'flex:1;border:1px solid var(--cbr);border-radius:3px;padding:3px 6px;font-size:12px;font-family:inherit;'});
    const [secUp,secDn]=reorderBtns(blk);
    const delBtn=Object.assign(document.createElement('button'),{type:'button',className:'cpn-mbtn del',textContent:'Delete',style:'padding:3px 8px;font-size:10px;'});
    delBtn.onclick=()=>blk.remove();
    hdr.append(secUp,secDn,iconInp,nameInp,delBtn);
    blk.appendChild(hdr);
    const body=document.createElement('div');body.className='cpn-sec-body';
    (sec.subs||[]).forEach(sub=>buildSubEditor(sub,body));
    const addSubBtn=Object.assign(document.createElement('button'),{textContent:'+ Add Subsection',type:'button',className:'cpn-add-btn'});
    addSubBtn.onclick=()=>buildSubEditor({id:genId(),label:'New Subsection',type:'list',items:[]},body);
    body.appendChild(addSubBtn);blk.appendChild(body);
    blk._getSec=()=>({id:sec.id||genId(),icon:iconInp.value.trim()||'📦',label:nameInp.value.trim(),
      subs:Array.from(body.querySelectorAll('.cpn-sub-block')).map(b=>b._getSub?.()).filter(Boolean),});
    sbody.appendChild(blk);
  }

  secs.forEach(addSectionBlock);
  modal.querySelector('#s-cls').onclick=()=>secOvl.classList.remove('open');
  modal.querySelector('#s-add').onclick=()=>addSectionBlock({id:genId(),icon:'📦',label:'New Section',subs:[]});
  modal.querySelector('#s-sav').onclick=()=>{
    const saved=Array.from(sbody.querySelectorAll('.cpn-sec-block')).map(b=>b._getSec?.()).filter(Boolean);
    saveSections(saved);secOvl.classList.remove('open');buildMenu();showToast('✅ Sections saved!');
  };
  secOvl.addEventListener('mousedown',e=>{if(e.target===secOvl)secOvl.classList.remove('open');});
}
panel.querySelector('#cpn-sec-btn').onclick=()=>{renderSectionEditor();secOvl.classList.add('open');};

// ═══════════════════════════════════════════════════════════
// PANEL OPEN / CLOSE
// ═══════════════════════════════════════════════════════════
let isOpen=false;
function openPanel() {isOpen=true; panel.classList.add('open'); tab.style.right='var(--pw)';}
function closePanel(){isOpen=false;panel.classList.remove('open');tab.style.right='0';}

// Wire up draggable + click for the main Crazy tab
makeDraggable(tab, 'cpn_tab', () => isOpen ? closePanel() : openPanel());

panel.querySelector('#cpn-close').addEventListener('click',closePanel);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){closePanel();editOvl.classList.remove('open');secOvl.classList.remove('open');}
});

// Auto-close when cart opens
(function watchCart(){
  document.addEventListener('click',function(e){
    if(!isOpen)return;
    if(panel.contains(e.target))return;
    let node=e.target;
    for(let i=0;i<6;i++){
      if(!node)break;
      const id=(node.id||'').toLowerCase();
      const cls=(typeof node.className==='string'?node.className:'').toLowerCase();
      const src=(node.tagName==='IMG'?node.src||'':'').toLowerCase();
      const href=(node.href||'').toLowerCase();
      if(src.includes('cart')||id.includes('cart')||cls.includes('cart')||
         href.includes('/checkout/cart')||href.includes('/checkout/onepage')){
        setTimeout(()=>{if(isOpen)closePanel();},200);return;
      }
      node=node.parentElement;
    }
  },true);

  let cartWas=false;
  const obs=new MutationObserver(()=>{
    const vis=[...(document.querySelectorAll('[id*="mini-cart"],[id*="minicart"],[id*="header-cart"],[class*="mini-cart"],[class*="minicart"],[class*="header-cart"]'))]
      .some(el=>{
        if(el.offsetHeight<40||el.offsetWidth<80)return false;
        const st=window.getComputedStyle(el);
        return st.display!=='none'&&st.visibility!=='hidden'&&parseFloat(st.opacity)>0.1;
      });
    if(vis&&!cartWas&&isOpen)closePanel();
    cartWas=vis;
  });
  function startObs(){
    const root=document.querySelector('#header,.header-container,header')||document.body;
    obs.observe(root,{childList:true,subtree:true,attributes:true,
      attributeFilter:['class','style','aria-expanded','aria-hidden','hidden']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startObs);
  else startObs();
})();

})();