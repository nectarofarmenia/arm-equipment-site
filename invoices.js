/* ArmEquipment portal — admin invoices, calendar and partner income.
   Loaded by portal.html; uses its globals (sb, S, t, esc, fmt, $, toast, refresh, render). */
"use strict";
const IT={
 hy:{tInv:"Հաշիվներ",tCal:"Կալենդար",tInc:"Եկամուտ",newInv:"+ Նոր հաշիվ",invNo:"Հաշիվ",num:"Հաշվի համար",repMonth:"Հաշվետու ամիս",line:"Տող",addLine:"+ Տող",split:"Բաշխում",status:"Կարգավիճակ",note:"Նշումներ (ղեկավարի ուղղումներ և այլն)",word:"Word ֆայլ",copyMail:"Պատճենել նամակի տեքստը",copied:"Պատճենված է",del:"Ջնջել",delQ:"Ջնջե՞լ այս հաշիվը",yes:"Այո, ջնջել",no:"Ոչ",noDate:"Առանց ամսաթվի",noInv:"Դեռ հաշիվ չկա։",
  i_draft:"Սևագիր",i_manager:"Ուղարկված ղեկավարին",i_approved:"Հաստատված",i_accountant:"Ուղարկված հաշվապահին",workDays:"Աշխատանքային օրեր",thisMonth:"այս ամիս",days:"օր",monthWork:"Այս ամսվա աշխատանքները",noWork:"Այս ամիս աշխատանքային օր նշված չէ։",
  yearIncome:"ընդհանուր մուտք",allYears:"Բոլոր տարիները",byMonth:"Ըստ ամիսների",byYear:"Ըստ տարիների",month:"Ամիս",year:"Տարի",sharesT:"Տոկոսների բաշխում",sharesHint:"Տոկոսը հաշվվում է հաշվի ընդհանուր գումարից։ Գումարը պետք է լինի 100%։ Փոփոխությունը վերաբերում է միայն նոր հաշիվներին։",
  person:"Մասնակից",tax:"Հարկ",addPerson:"+ Մասնակից",sum100:"Տոկոսների գումարը պետք է լինի 100%",tplT:"Հաշվի ձևանմուշ",tplClient:"Պատվիրատուի տվյալներ (հաշվի վերևում)",signer:"Ստորագրող",mgrEmail:"Ղեկավարի էլ. հասցե",accEmail:"Հաշվապահի էլ. հասցե",
  fromOrder:"Ստեղծել հաշիվ",undatedNote:"հաշիվ դեռ ամսաթիվ չունի և ամիսների մեջ չի երևում։",needLine:"Ավելացրեք առնվազն մեկ տող",total:"Ընդամենը",orderRef:"Պատվեր",orgs:"Կազմակերպություններ",nInv:"հաշիվ",client:"Կազմակերպություն",allOrgs:"Բոլորը",byClient:"Ըստ կազմակերպությունների",noInvYear:"Այս տարում հաշիվ չկա։",connectDir:"Միացնել համակարգչի պանակը",changeDir:"Փոխել",allowDir:"Թույլատրել",dirOn:"Համակարգչի պանակ",dirOff:"Համակարգչի պանակը միացված չէ",dirHint:"Ընտրեք «Rent Equipment» պանակը։ Հաստատված հաշիվները ինքնաշխատ կպահվեն՝ Կազմակերպություն / Տարի / Ամիս։",dirNo:"Համակարգչի պանակում ուղղակի պահելը աշխատում է Chrome կամ Edge բրաուզերում։ Այստեղ «Պահել պանակում»-ը ֆայլը կներբեռնի։",saveDir:"Պահել պանակում",savedTo:"Պահված է՝ ",dirWrong:"Ընտրեք ընդհանուր «Rent Equipment» պանակը, ոչ թե կազմակերպության պանակը",dirFail:"Չհաջողվեց պահել պանակում",needMonth:"Նշեք հաշվետու ամիսը կամ ամսաթիվը"},
 en:{tInv:"Invoices",tCal:"Calendar",tInc:"Income",newInv:"+ New invoice",invNo:"Invoice",num:"Invoice number",repMonth:"Reporting month",line:"Line",addLine:"+ Line",split:"Split",status:"Status",note:"Notes (manager's corrections etc.)",word:"Word file",copyMail:"Copy email text",copied:"Copied",del:"Delete",delQ:"Delete this invoice?",yes:"Yes, delete",no:"No",noDate:"No date",noInv:"No invoices yet.",
  i_draft:"Draft",i_manager:"Sent to manager",i_approved:"Approved",i_accountant:"Sent to accountant",workDays:"Working days",thisMonth:"this month",days:"days",monthWork:"Work this month",noWork:"No working days this month.",
  yearIncome:"total income",allYears:"All years",byMonth:"By month",byYear:"By year",month:"Month",year:"Year",sharesT:"Partner split",sharesHint:"Percentages are taken from each invoice total and must add up to 100%. Changes apply to new invoices only.",
  person:"Partner",tax:"Tax",addPerson:"+ Partner",sum100:"Percentages must add up to 100%",tplT:"Invoice template",tplClient:"Client details (top of the invoice)",signer:"Signed by",mgrEmail:"Manager's email",accEmail:"Accountant's email",
  fromOrder:"Create invoice",undatedNote:"invoice(s) have no date yet and are not shown by month.",needLine:"Add at least one line",total:"Total",orderRef:"Order",orgs:"Organizations",nInv:"invoices",client:"Organization",allOrgs:"All",byClient:"By organization",noInvYear:"No invoices this year.",connectDir:"Connect computer folder",changeDir:"Change",allowDir:"Allow",dirOn:"Computer folder",dirOff:"Computer folder not connected",dirHint:"Choose the “Rent Equipment” folder. Approved invoices are saved automatically to Organization / Year / Month.",dirNo:"Saving straight into a computer folder works in Chrome or Edge. Here “Save to folder” downloads the file.",saveDir:"Save to folder",savedTo:"Saved to ",dirWrong:"Choose the main “Rent Equipment” folder, not an organization folder",dirFail:"Could not save to the folder",needMonth:"Set the reporting month or a date"}
};
const it=k=>(IT[lang][k]??t(k));
const MONTHS={hy:["Հունվար","Փետրվար","Մարտ","Ապրիլ","Մայիս","Հունիս","Հուլիս","Օգոստոս","Սեպտեմբեր","Հոկտեմբեր","Նոյեմբեր","Դեկտեմբեր"],en:["January","February","March","April","May","June","July","August","September","October","November","December"]};
const WD={hy:["Երկ","Երք","Չրք","Հնգ","Ուրբ","Շբթ","Կիր"],en:["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]};
const DEF_SHARES=[{name:"Արմեն",pct:25},{name:"Հարկ",pct:10,tax:true},{name:"Էմմա",pct:20},{name:"Խաչիկ",pct:45}];
const IS={inv:[],shares:null,tpl:{},edit:null,cal:null,dayPick:null,year:new Date().getFullYear(),pyear:"all",pclient:"all",confirmDel:false,client:null,iyear:null,folders:{},dir:null,dirOk:false,dirInit:false};
const FIRST_YEAR=2013;
const cl=v=>v.client||"Hilton";
const pad=n=>String(n).padStart(2,"0");
const isoD=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const todayIso=isoD(new Date());
const curShares=()=>IS.shares&&IS.shares.length?IS.shares:DEF_SHARES;
const invTotal=v=>(v.lines||[]).reduce((a,l)=>a+(+l.price||0)*(+l.qty||0),0);
const invShares=v=>v.shares&&v.shares.length?v.shares:curShares();
function split(v){const tt=invTotal(v),o={};invShares(v).forEach(s=>o[s.name]=(o[s.name]||0)+Math.round(tt*s.pct/100));return o}
function dayList(v){if(!v.start_date)return[];const out=[],a=new Date(v.start_date+"T12:00"),b=new Date((v.end_date||v.start_date)+"T12:00");for(let d=new Date(a);d<=b&&out.length<62;d.setDate(d.getDate()+1))out.push(isoD(d));return out}
const monthOf=v=>v.month||(v.end_date||v.start_date||"").slice(0,7)||null;
function monthLabel(k){if(!k)return it("noDate");const [y,m]=k.split("-");return MONTHS[lang][+m-1]+" "+y}
function dateText(v){if(!v.start_date)return it("noDate");const a=new Date(v.start_date+"T12:00"),b=new Date((v.end_date||v.start_date)+"T12:00"),M=MONTHS[lang];
  if(v.start_date===(v.end_date||v.start_date))return M[a.getMonth()]+" "+a.getDate()+", "+a.getFullYear();
  if(a.getMonth()===b.getMonth()&&a.getFullYear()===b.getFullYear())return M[a.getMonth()]+" "+a.getDate()+"–"+b.getDate()+", "+a.getFullYear();
  return M[a.getMonth()]+" "+a.getDate()+" – "+M[b.getMonth()]+" "+b.getDate()+", "+b.getFullYear()}
function pNames(){const out=[];curShares().forEach(s=>out.includes(s.name)||out.push(s.name));IS.inv.forEach(v=>invShares(v).forEach(s=>out.includes(s.name)||out.push(s.name)));return out}
const isTax=n=>curShares().some(s=>s.name===n&&s.tax)||IS.inv.some(v=>invShares(v).some(s=>s.name===n&&s.tax));
function agg(list){const o={_total:0};list.forEach(v=>{o._total+=invTotal(v);const s=split(v);for(const k in s)o[k]=(o[k]||0)+s[k]});return o}
function years(){const ys=new Set([new Date().getFullYear()]);IS.inv.forEach(v=>{const m=monthOf(v);if(m)ys.add(+m.slice(0,4))});return[...ys].sort((a,b)=>b-a)}
const ipill=s=>`<span class="pill ist-${esc(s)}">${esc(it("i_"+s))}</span>`;

async function fetchAllInvoices(){const out=[];for(let i=0;i<100000;i+=1000){const {data,error}=await sb.from("invoices").select("*").order("id").range(i,i+999);if(error||!data)break;out.push(...data);if(data.length<1000)break}return out}
async function loadInvoiceData(){
  const [inv,{data:st}]=await Promise.all([fetchAllInvoices(),sb.from("settings").select("*")]);
  IS.inv=inv;const m={};(st||[]).forEach(r=>m[r.key]=r.value);IS.shares=m.shares||null;IS.tpl=m.invoice_template||{};IS.folders=m.client_folders||{};
  if(!IS.dirInit){IS.dirInit=true;await initDir()}
}

/* ----- computer folder (Chrome / Edge: File System Access API) ----- */
const FS_OK=typeof window.showDirectoryPicker==="function";
function idb(){return new Promise((res,rej)=>{const r=indexedDB.open("ae-fs",1);r.onupgradeneeded=()=>r.result.createObjectStore("h");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function idbGet(k){try{const db=await idb();return await new Promise(res=>{const q=db.transaction("h").objectStore("h").get(k);q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null)})}catch(_){return null}}
async function idbSet(k,v){try{const db=await idb();db.transaction("h","readwrite").objectStore("h").put(v,k)}catch(_){}}
async function initDir(){if(!FS_OK)return;IS.dir=await idbGet("root");if(IS.dir){try{IS.dirOk=(await IS.dir.queryPermission({mode:"readwrite"}))==="granted"}catch(_){IS.dir=null;IS.dirOk=false}}}
async function connectDir(){try{const h=await window.showDirectoryPicker({id:"ae-root",mode:"readwrite"});
  if(Object.values(IS.folders).some(f=>f.trim()===h.name.trim())){toast(it("dirWrong"));return false}
  IS.dir=h;IS.dirOk=true;await idbSet("root",h);render();return true}catch(_){return false}}
async function ensureDir(){if(!IS.dir)return false;if(IS.dirOk)return true;try{IS.dirOk=(await IS.dir.requestPermission({mode:"readwrite"}))==="granted"}catch(_){IS.dirOk=false}return IS.dirOk}
async function subDir(parent,want,match){for await(const [n,h] of parent.entries()){if(h.kind==="directory"&&match(n.trim()))return h}return parent.getDirectoryHandle(want,{create:true})}
const clientFolder=c=>(IS.folders[c]||c).trim();
function fileName(v){const s=(v.start_date||(monthOf(v)+"-01")).split("-"),e=(v.end_date||v.start_date||"").split("-");let d=s[1]+"."+s[2];
  if(e.length===3&&e.join("-")!==s.join("-"))d+=(e[1]===s[1]&&e[0]===s[0])?"-"+e[2]:"-"+e[1]+"."+e[2];
  return `Invoice ${String(v.num).replace(/[\\/:*?"<>|]/g,"-")} - ${d}.${(e.length===3?e:s)[0]}.doc`}
function wordBlob(v){return new Blob(["\ufeff"+wordHtml(v)],{type:"application/msword"})}
function download(v){const a=document.createElement("a");a.href=URL.createObjectURL(wordBlob(v));a.download=fileName(v);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}
async function saveToDir(v){const m=monthOf(v);if(!m)throw new Error("nomonth");const [y,mm]=m.split("-"),c=cl(v),cf=clientFolder(c);
  const base=await subDir(IS.dir,cf,n=>n===cf||n.toLowerCase()===c.toLowerCase());
  const yd=await subDir(base,y,n=>n===y);
  const md=await subDir(yd,mm+" "+MONTHS.hy[+mm-1],n=>n===mm||n.startsWith(mm+" "));
  const fn=fileName(v),fh=await md.getFileHandle(fn,{create:true}),w=await fh.createWritable();await w.write(wordBlob(v));await w.close();
  return [cf,y,md.name.trim(),fn].join(" / ")}
async function saveFile(v,quiet){if(!monthOf(v)){toast(it("needMonth"));return}
  if(!FS_OK){if(!quiet)download(v);return}
  if(!IS.dir){if(quiet||!(await connectDir()))return}
  if(!(await ensureDir())){if(!quiet)toast(it("dirFail"));return}
  try{const p=await saveToDir(v);toast(it("savedTo")+p)}catch(err){console.error(err);toast(it("dirFail"))}}

/* ----- views ----- */
function shareCards(a){return `<div class="shares">${pNames().filter(n=>a[n]||curShares().some(s=>s.name===n)).map(n=>{const s=curShares().find(x=>x.name===n);return `<div class="share ${isTax(n)?"tax":""}"><span class="nm">${esc(n)}</span><span class="pc">${s?s.pct+"%":""}</span><span class="amt num">${fmt(a[n])} ${t("amd")}</span></div>`}).join("")}</div>`}
function invCard(v,noClient){return `<button class="inv" data-inv="${v.id}"><span class="ttl">${it("invNo")} #${esc(v.num)}${noClient?"":` · <span class="muted">${esc(cl(v))}</span>`}</span><span class="num ttl">${fmt(invTotal(v))} ${t("amd")}</span><span class="sub">${esc(dateText(v))}${v.order_id?" · "+it("orderRef")+" #"+v.order_id:""}</span><span>${ipill(v.status)}</span></button>`}
function clientStats(){const m={};IS.inv.forEach(v=>{const c=cl(v),o=m[c]=m[c]||{name:c,n:0,tot:0,min:"",max:""},y=(monthOf(v)||"").slice(0,4);o.n++;o.tot+=invTotal(v);if(y){if(!o.min||y<o.min)o.min=y;if(!o.max||y>o.max)o.max=y}});
  return Object.values(m).sort((a,b)=>b.max.localeCompare(a.max)||b.tot-a.tot)}
const clientNames=()=>clientStats().map(c=>c.name);
function dirBar(){if(!FS_OK)return `<p class="muted dirbar">${it("dirNo")}</p>`;
  if(!IS.dir)return `<div class="dirbar row"><span class="muted">📁 ${it("dirOff")}</span><button class="btn sm" id="dirConnect">${it("connectDir")}</button><span class="muted" style="flex-basis:100%">${it("dirHint")}</span></div>`;
  return `<div class="dirbar row"><span>📁 ${it("dirOn")}: <b>${esc(IS.dir.name)}</b></span>${IS.dirOk?"":`<button class="btn sm pri" id="dirAllow">${it("allowDir")}</button>`}<button class="btn sm" id="dirConnect">${it("changeDir")}</button></div>`}
function crumbs(){let h=`<nav class="crumbs"><button data-crumb="root" ${IS.client?"":'aria-current="page"'}>${it("orgs")}</button>`;
  if(IS.client)h+=`<span>›</span><button data-crumb="client" ${IS.iyear?"":'aria-current="page"'}>${esc(IS.client)}</button>`;
  if(IS.iyear)h+=`<span>›</span><button aria-current="page">${IS.iyear}</button>`;return h+`</nav>`}
function vInvoices(){
  if(IS.edit)return vInvEditor();
  let h=`<div class="row" style="margin-bottom:12px">${crumbs()}<span class="sp" style="flex:1"></span><button class="btn pri" id="invNew">${it("newInv")}</button></div>`;
  if(!IS.client){h+=dirBar();
    if(!IS.inv.length)return h+`<div class="empty">${it("noInv")}</div>`;
    return h+`<div class="orgs">${clientStats().map(c=>`<button class="org" data-org="${esc(c.name)}"><span class="fold" aria-hidden="true"></span><b>${esc(c.name)}</b><span class="muted">${c.min&&c.min!==c.max?c.min+"–"+c.max:c.min||it("noDate")} · ${c.n} ${it("nInv")}</span><span class="num amt">${fmt(c.tot)} ${t("amd")}</span></button>`).join("")}</div>`}
  const mine=IS.inv.filter(v=>cl(v)===IS.client);
  if(!IS.iyear){const now=new Date().getFullYear(),last=Math.max(now,...mine.map(v=>+(monthOf(v)||"0").slice(0,4)));let ys=[];for(let y=last;y>=FIRST_YEAR;y--)ys.push(y);
    const a=agg(mine);h+=`<div class="row" style="margin:6px 0 4px"><b class="num" style="font-size:1.6rem">${fmt(a._total)} ${t("amd")}</b><span class="muted">${mine.length} ${it("nInv")}</span></div>`;
    h+=`<div class="months">${ys.map(y=>{const l=mine.filter(v=>(monthOf(v)||"").startsWith(y+"-"));return `<button class="mo ${l.length?"has":""}" data-iy="${y}"><b>📁 ${y}</b><span>${l.length} ${it("nInv")}</span><span class="num">${fmt(agg(l)._total)}</span></button>`}).join("")}</div>`;
    const und=mine.filter(v=>!monthOf(v));if(und.length)h+=`<h2>${it("noDate")}</h2><div class="list">${und.map(v=>invCard(v,1)).join("")}</div>`;
    return h}
  const list=mine.filter(v=>(monthOf(v)||"").startsWith(IS.iyear+"-"));
  if(!list.length)return h+`<div class="empty">${it("noInvYear")}</div>`;
  const a=agg(list);h+=`<div class="row" style="margin:6px 0 4px"><b class="num" style="font-size:1.6rem">${fmt(a._total)} ${t("amd")}</b><span class="muted">${list.length} ${it("nInv")}</span></div>`+shareCards(a);
  const g={};[...list].sort((a,b)=>(b.start_date||"0").localeCompare(a.start_date||"0")||String(b.num).localeCompare(String(a.num),undefined,{numeric:true})).forEach(v=>{const k=monthOf(v);(g[k]=g[k]||[]).push(v)});
  return h+Object.keys(g).sort((a,b)=>b.localeCompare(a)).map(k=>`<h2>📁 ${esc(monthLabel(k))} · <span class="num">${fmt(agg(g[k])._total)}</span> ${t("amd")}</h2><div class="list">${g[k].map(v=>invCard(v,1)).join("")}</div>`).join("");
}
function lineRow(l){return `<div class="iline"><label class="ln">${it("line")}<input class="lName" list="eqNames" value="${esc(l.name||"")}"></label><label>${t("price")}<input class="lPrice" type="number" min="0" inputmode="numeric" value="${l.price??""}"></label><label>${t("qty")}<input class="lQty" type="number" min="0" inputmode="numeric" value="${l.qty??1}"></label><span class="lt num">${fmt((+l.price||0)*(+l.qty||0))}</span><button type="button" class="btn sm danger lX" aria-label="${it("del")}">✕</button></div>`}
function vInvEditor(){
  const v=IS.edit,isNew=!v.id;
  let h=`<div class="row" style="margin-bottom:12px"><button class="btn sm" id="invBack">‹ ${t("back")}</button><h1 style="margin:0">${isNew?it("newInv").replace("+ ",""):it("invNo")+" #"+esc(v.num)}</h1></div>
  <form id="fInv" class="card"><div class="fg"><label>${it("client")}<input id="iClient" list="clNames" value="${esc(cl(v))}" required></label><label>${it("num")}<input id="iNum" value="${esc(v.num)}" required></label><label>${it("repMonth")}<input id="iMonth" type="month" value="${esc(v.month||"")}"></label><label>${t("start")}<input id="iS" type="date" value="${esc(v.start_date||"")}"></label><label>${t("end")}<input id="iE" type="date" value="${esc(v.end_date||"")}"></label></div>
  <datalist id="clNames">${clientNames().map(n=>`<option value="${esc(n)}"></option>`).join("")}</datalist><datalist id="eqNames">${S.equipment.map(e=>`<option value="${esc(e.name_hy)}"></option>`).join("")}</datalist>
  <h2>${t("items")}</h2><div class="ilines" id="iLines">${(v.lines||[]).map(lineRow).join("")}</div><div><button type="button" class="btn sm" id="iAdd">${it("addLine")}</button></div>
  <div class="row" style="margin-top:6px"><span class="muted">${it("total")}</span><b class="num" id="iTot" style="font-size:1.4rem">${fmt(invTotal(v))} ${t("amd")}</b></div><div class="shares" id="iSplit"></div>
  <h2>${it("status")}</h2><div class="filters" id="iSt">${["draft","manager","approved","accountant"].map(s=>`<button type="button" data-ist="${s}" aria-pressed="${(v.status||"draft")===s}">${it("i_"+s)}</button>`).join("")}</div>
  <label>${it("note")}<textarea id="iNote" rows="3">${esc(v.note||"")}</textarea></label>
  <div class="row"><button class="btn pri">${t("save")}</button><button type="button" class="btn" id="iWord">${it("word")}</button><button type="button" class="btn" id="iSaveDir">📁 ${it("saveDir")}</button><button type="button" class="btn" id="iCopy">${it("copyMail")}</button><span class="sp" style="flex:1"></span>${isNew?"":`<button type="button" class="btn danger" id="iDel">${it("del")}</button>`}</div>
  <div id="iConfirm"></div></form>`;
  return h;
}
function readInv(){const v=IS.edit;v.client=$("#iClient").value.trim()||"Hilton";v.num=$("#iNum").value.trim();v.month=$("#iMonth").value||null;v.start_date=$("#iS").value||null;v.end_date=$("#iE").value||v.start_date;v.note=$("#iNote").value;
  v.lines=[...document.querySelectorAll("#iLines .iline")].map(r=>({name:r.querySelector(".lName").value.trim(),price:+r.querySelector(".lPrice").value||0,qty:+r.querySelector(".lQty").value||0}));return v}
function invTotals(){if(!$("#iLines"))return;const v=readInv();document.querySelectorAll("#iLines .iline").forEach((r,i)=>r.querySelector(".lt").textContent=fmt(v.lines[i].price*v.lines[i].qty));$("#iTot").textContent=fmt(invTotal(v))+" "+t("amd");
  const s=split(v);$("#iSplit").innerHTML=invShares(v).map(x=>`<div class="share ${x.tax?"tax":""}"><span class="nm">${esc(x.name)}</span><span class="pc">${x.pct}%</span><span class="amt num">${fmt(s[x.name])}</span></div>`).join("")}

function vCalendar(){
  if(!IS.cal){const d=new Date();IS.cal={y:d.getFullYear(),m:d.getMonth()}}
  const {y,m}=IS.cal,byDay={};IS.inv.forEach(v=>dayList(v).forEach(d=>(byDay[d]=byDay[d]||[]).push(v)));
  const off=(new Date(y,m,1).getDay()+6)%7,n=new Date(y,m+1,0).getDate();
  const mDays=Object.keys(byDay).filter(d=>d.startsWith(y+"-"+pad(m+1))),yDays=Object.keys(byDay).filter(d=>d.startsWith(y+"-"));
  let h=`<div class="row"><button class="btn sm" id="cPrev" aria-label="‹">‹</button><h1 style="margin:0;min-width:170px;text-align:center">${MONTHS[lang][m]} ${y}</h1><button class="btn sm" id="cNext" aria-label="›">›</button><span class="sp" style="flex:1"></span><span class="muted">${it("workDays")}: <b>${mDays.length}</b> ${it("thisMonth")} · <b>${yDays.length}</b> ${y}</span></div>
  <div class="cal">${WD[lang].map(w=>`<div class="dh">${w}</div>`).join("")}${"<div class='c e'></div>".repeat(off)}`;
  for(let d=1;d<=n;d++){const k=y+"-"+pad(m+1)+"-"+pad(d),w=byDay[k];h+=`<button class="c ${w?"w":""} ${k===todayIso?"today":""}" ${w?`data-day="${k}"`:"tabindex='-1'"}>${d}</button>`}
  h+=`</div>`;
  const pick=IS.dayPick&&byDay[IS.dayPick]?IS.dayPick:null;const show=pick?byDay[pick]:[...new Set(mDays.flatMap(d=>byDay[d]))];
  h+=`<h2>${pick?esc(pick):it("monthWork")}</h2>`+(show.length?`<div class="list">${show.map(invCard).join("")}</div>`:`<div class="empty">${it("noWork")}</div>`);
  h+=`<h2>${y}</h2><div class="months">${MONTHS[lang].map((nm2,i)=>{const dd=yDays.filter(d=>d.slice(5,7)===pad(i+1)).length;return `<button class="mo ${dd?"has":""}" data-mo="${i}"><b>${nm2}</b><span>${dd} ${it("days")}</span></button>`}).join("")}</div>`;
  return h;
}

function vIncome(){
  const ys=years(),sel=IS.pyear,pc=IS.pclient,base=pc==="all"?IS.inv:IS.inv.filter(v=>cl(v)===pc);let list=base;if(sel!=="all")list=list.filter(v=>(monthOf(v)||"").startsWith(sel+"-"));
  const a=agg(list),N=pNames();
  let h=`<div class="filters">${["all",...clientNames()].map(c=>`<button data-pc="${esc(c)}" aria-pressed="${pc===c}">${c==="all"?it("allOrgs"):esc(c)}</button>`).join("")}</div><div class="filters">${["all",...ys].map(y=>`<button data-py="${y}" aria-pressed="${String(sel)===String(y)}">${y==="all"?it("allYears"):y}</button>`).join("")}</div>
  <div class="row" style="margin:6px 0 14px"><b class="num" style="font-size:1.9rem">${fmt(a._total)} ${t("amd")}</b><span class="muted">${it("yearIncome")} · ${list.length}</span></div>${shareCards(a)}`;
  if(sel!=="all"){h+=`<h2>${it("byMonth")} · ${sel}</h2><div class="tw"><table><thead><tr><th>${it("month")}</th><th class="r">${it("total")}</th>${N.map(n=>`<th class="r">${esc(n)}</th>`).join("")}<th class="r">${it("days")}</th></tr></thead><tbody>`;
    for(let m=1;m<=12;m++){const l=list.filter(v=>monthOf(v)===sel+"-"+pad(m)),x=agg(l),dd=new Set(l.flatMap(dayList)).size;h+=`<tr><td>${MONTHS[lang][m-1]}</td><td class="r num">${fmt(x._total)}</td>${N.map(n=>`<td class="r num">${fmt(x[n])}</td>`).join("")}<td class="r num">${dd}</td></tr>`}
    h+=`<tr><td><b>${it("total")}</b></td><td class="r num"><b>${fmt(a._total)}</b></td>${N.map(n=>`<td class="r num"><b>${fmt(a[n])}</b></td>`).join("")}<td></td></tr></tbody></table></div>`}
  h+=`<h2>${it("byYear")}</h2><div class="tw"><table><thead><tr><th>${it("year")}</th><th class="r">${it("total")}</th>${N.map(n=>`<th class="r">${esc(n)}</th>`).join("")}</tr></thead><tbody>`;
  ys.forEach(y=>{const x=agg(base.filter(v=>(monthOf(v)||"").startsWith(y+"-")));h+=`<tr><td>${y}</td><td class="r num">${fmt(x._total)}</td>${N.map(n=>`<td class="r num">${fmt(x[n])}</td>`).join("")}</tr>`});
  const und=base.filter(v=>!monthOf(v));if(und.length){const x=agg(und);h+=`<tr><td>${it("noDate")}</td><td class="r num">${fmt(x._total)}</td>${N.map(n=>`<td class="r num">${fmt(x[n])}</td>`).join("")}</tr>`}
  const all=agg(base);h+=`<tr><td><b>${it("allYears")}</b></td><td class="r num"><b>${fmt(all._total)}</b></td>${N.map(n=>`<td class="r num"><b>${fmt(all[n])}</b></td>`).join("")}</tr></tbody></table></div>`;
  if(pc==="all"){h+=`<h2>${it("byClient")}${sel!=="all"?" · "+sel:""}</h2><div class="tw"><table><thead><tr><th>${it("client")}</th><th class="r">${it("nInv")}</th><th class="r">${it("total")}</th>${N.map(n=>`<th class="r">${esc(n)}</th>`).join("")}</tr></thead><tbody>`;
    clientNames().forEach(c=>{const l=list.filter(v=>cl(v)===c);if(!l.length)return;const x=agg(l);h+=`<tr><td>${esc(c)}</td><td class="r num">${l.length}</td><td class="r num">${fmt(x._total)}</td>${N.map(n=>`<td class="r num">${fmt(x[n])}</td>`).join("")}</tr>`});
    h+=`</tbody></table></div>`}
  if(und.length)h+=`<p class="msg info">${und.length} ${it("undatedNote")}</p>`;
  h+=`<h2>${it("sharesT")}</h2><p class="muted">${it("sharesHint")}</p><form id="fShares" class="card"><div id="shRows" class="list">${curShares().map(shRow).join("")}</div><div class="row" style="margin-top:10px"><button type="button" class="btn sm" id="shAdd">${it("addPerson")}</button><span class="sp" style="flex:1"></span><span id="shSum" class="num"></span><button class="btn pri">${t("save")}</button></div></form>`;
  const tp=IS.tpl||{};
  h+=`<h2>${it("tplT")}</h2><form id="fTpl" class="card"><label>${it("tplClient")}<textarea id="tClient" rows="8">${esc(tp.client||"")}</textarea></label><div class="fg"><label>${it("signer")}<input id="tSign" value="${esc(tp.signer||"")}"></label><label>${it("mgrEmail")}<input id="tMgr" type="email" value="${esc(tp.managerEmail||"")}"></label><label>${it("accEmail")}<input id="tAcc" type="email" value="${esc(tp.accountantEmail||"")}"></label></div><div><button class="btn pri">${t("save")}</button></div></form>`;
  return h;
}
function shRow(s){return `<div class="row shr"><input class="shN" value="${esc(s.name)}" style="flex:2;min-width:120px" aria-label="${it("person")}"><input class="shP num" type="number" min="0" max="100" step="0.01" value="${s.pct}" style="flex:1;min-width:80px" aria-label="%"><label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" class="shT" style="width:auto" ${s.tax?"checked":""}>${it("tax")}</label><button type="button" class="btn sm danger shX" aria-label="${it("del")}">✕</button></div>`}
function readShares(){return [...document.querySelectorAll("#shRows .shr")].map(r=>({name:r.querySelector(".shN").value.trim(),pct:+r.querySelector(".shP").value||0,tax:r.querySelector(".shT").checked})).filter(s=>s.name)}
function updSum(){const el=$("#shSum");if(!el)return;const s=readShares().reduce((a,x)=>a+x.pct,0);el.textContent=(+s.toFixed(2))+"%";el.style.color=Math.abs(s-100)<0.001?"var(--ok)":"var(--bad)"}

/* ----- Word / email ----- */
function wordHtml(v){const tp=IS.tpl||{},dt2=dateText(v);
  const rows=v.lines.map(l=>`<tr><td>${esc(l.name).replace(/ \/ /g,"<br>")}</td><td align=center>${fmt(l.price)}</td><td align=center>${l.qty}</td><td align=center>${esc(dt2)}</td><td align=center>${fmt(l.price*l.qty)}</td></tr>`).join("");
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Հաշիվ ${esc(v.num)}</title><style>body{font-family:"Sylfaen","Arial",sans-serif;font-size:12pt}td,th{border:1px solid #000;padding:6pt}table{border-collapse:collapse;width:100%}th{font-style:italic}</style></head><body><p align=center style="font-size:20pt">Հաշիվ # ${esc(v.num)}</p><p>${esc(tp.client||"").replace(/\n/g,"<br>")}</p><table><tr><th>Անուն</th><th>Գին</th><th>Հատ</th><th>Ամսաթիվ</th><th>Ընդ.</th></tr>${rows}<tr><td colspan=3 align=center><b>Ընդ. ${fmt(invTotal(v))} դր.</b></td><td colspan=2 style="border:0"></td></tr></table><br><br><p>______________________________<br>${esc(tp.signer||"")}</p></body></html>`}
function mailText(v){return `Հաշիվ #${v.num}\n${dateText(v)}\n\n`+v.lines.map(l=>`${l.name} — ${fmt(l.price)} × ${l.qty} = ${fmt(l.price*l.qty)} դր.`).join("\n")+`\n\nԸնդ. ${fmt(invTotal(v))} դր.\n\n${(IS.tpl||{}).signer||""}`}
function nextNum(c){const y=String(new Date().getFullYear()),l=IS.inv.filter(v=>(!c||cl(v)===c)&&(monthOf(v)||"").startsWith(y));return String(Math.max(0,...l.map(v=>parseInt(v.num)||0))+1).padStart(3,"0")}
function openInvoice(v){IS.edit=JSON.parse(JSON.stringify(v));IS.confirmDel=false;S.tab="invoices";render();invTotals();scrollTo(0,0)}

/* ----- events ----- */
document.addEventListener("click",async e=>{
  const b=e.target.closest("button");if(!b||!S.profile||!S.profile.is_admin)return;
  if(b.dataset.inv){const v=IS.inv.find(x=>String(x.id)===b.dataset.inv);if(v)openInvoice(v);return}
  if(b.dataset.org){IS.client=b.dataset.org;IS.iyear=null;render();scrollTo(0,0);return}
  if(b.dataset.iy){IS.iyear=+b.dataset.iy;render();scrollTo(0,0);return}
  if(b.dataset.crumb){if(b.dataset.crumb==="root")IS.client=null;IS.iyear=null;render();return}
  if(b.id==="dirConnect"){await connectDir();return}
  if(b.id==="dirAllow"){await ensureDir();render();return}
  if(b.id==="iSaveDir"){await saveFile(readInv(),false);return}
  if(b.dataset.pc){IS.pclient=b.dataset.pc;render();return}
  if(b.id==="invNew"){openInvoice({client:IS.client||"Hilton",num:nextNum(IS.client||"Hilton"),start_date:todayIso,end_date:todayIso,month:null,lines:[{name:"",price:"",qty:1}],status:"draft",note:""});return}
  if(b.dataset.mkinv){const o=S.orders.find(x=>x.id===+b.dataset.mkinv);if(!o)return;const oc=(S.clients.find(c=>c.id===o.client_id)||{}).org||"";openInvoice({client:oc,num:nextNum(oc),start_date:o.start_date,end_date:o.end_date||o.start_date,month:null,order_id:o.id,status:"draft",note:"",lines:(S.items[o.id]||[]).map(i=>({name:i.name_en&&i.name_hy?i.name_en+" / "+i.name_hy:i.name_hy,price:i.price||0,qty:i.qty}))});return}
  if(b.id==="invBack"){IS.edit=null;render();return}
  if(b.id==="iAdd"){readInv();IS.edit.lines.push({name:"",price:"",qty:1});render();invTotals();return}
  if(b.classList.contains("lX")){readInv();const i=[...document.querySelectorAll("#iLines .iline")].indexOf(b.closest(".iline"));IS.edit.lines.splice(i,1);render();invTotals();return}
  if(b.dataset.ist){readInv();IS.edit.status=b.dataset.ist;document.querySelectorAll("#iSt button").forEach(x=>x.setAttribute("aria-pressed",x===b));return}
  if(b.id==="iWord"){download(readInv());return}
  if(b.id==="iCopy"){const txt=mailText(readInv());try{await navigator.clipboard.writeText(txt);toast(it("copied"))}catch(_){const ta=document.createElement("textarea");ta.value=txt;document.body.append(ta);ta.select();try{document.execCommand("copy");toast(it("copied"))}catch(__){}ta.remove()}return}
  if(b.id==="iDel"){$("#iConfirm").innerHTML=`<div class="msg err row">${it("delQ")} <button type="button" class="btn sm danger" id="iDelYes">${it("yes")}</button><button type="button" class="btn sm" id="iDelNo">${it("no")}</button></div>`;return}
  if(b.id==="iDelNo"){$("#iConfirm").innerHTML="";return}
  if(b.id==="iDelYes"){const {error}=await sb.from("invoices").delete().eq("id",IS.edit.id);if(error)return toast(t("errGeneric"));IS.edit=null;toast(t("saved"));await refresh();return}
  if(b.dataset.day){IS.dayPick=IS.dayPick===b.dataset.day?null:b.dataset.day;render();return}
  if(b.dataset.mo){IS.cal.m=+b.dataset.mo;IS.dayPick=null;render();return}
  if(b.id==="cPrev"||b.id==="cNext"){const d=new Date(IS.cal.y,IS.cal.m+(b.id==="cNext"?1:-1),1);IS.cal={y:d.getFullYear(),m:d.getMonth()};IS.dayPick=null;render();return}
  if(b.dataset.py){IS.pyear=b.dataset.py==="all"?"all":+b.dataset.py;render();return}
  if(b.id==="shAdd"){$("#shRows").insertAdjacentHTML("beforeend",shRow({name:"",pct:0}));updSum();return}
  if(b.classList.contains("shX")){b.closest(".shr").remove();updSum();return}
});
document.addEventListener("input",e=>{
  if(e.target.closest("#iLines")){if(e.target.classList.contains("lName")){const eq=S.equipment.find(x=>x.name_hy===e.target.value);if(eq&&eq.price!=null)e.target.closest(".iline").querySelector(".lPrice").value=eq.price}invTotals()}
  if(e.target.closest("#shRows"))updSum();
  if(e.target.id==="iS"&&$("#iE")&&$("#iE").value<e.target.value)$("#iE").value=e.target.value;
});
document.addEventListener("submit",async e=>{
  const f=e.target;if(!["fInv","fShares","fTpl"].includes(f.id))return;e.preventDefault();
  if(f.id==="fInv"){const v=readInv();v.lines=v.lines.filter(l=>l.name);if(!v.lines.length)return toast(it("needLine"));
    const toDir=FS_OK&&IS.dir&&["approved","accountant"].includes(v.status)&&monthOf(v)&&await ensureDir();
    const row={client:v.client,num:v.num,start_date:v.start_date,end_date:v.end_date,month:v.month,lines:v.lines,shares:v.shares&&v.shares.length?v.shares:curShares(),status:v.status||"draft",note:v.note,order_id:v.order_id||null,updated_at:new Date().toISOString()};
    const {error}=v.id?await sb.from("invoices").update(row).eq("id",v.id):await sb.from("invoices").insert(row);
    if(error)return toast(t("errGeneric"));IS.edit=null;const m=monthOf(v);IS.client=v.client;IS.iyear=m?+m.slice(0,4):null;toast(t("saved"));await refresh();
    if(toDir)try{toast(it("savedTo")+await saveToDir(v))}catch(err){console.error(err);toast(it("dirFail"))}return}
  if(f.id==="fShares"){const sh=readShares();if(Math.abs(sh.reduce((a,x)=>a+x.pct,0)-100)>0.001)return toast(it("sum100"));
    const {error}=await sb.from("settings").upsert({key:"shares",value:sh});if(error)return toast(t("errGeneric"));toast(t("saved"));await refresh();return}
  if(f.id==="fTpl"){const {error}=await sb.from("settings").upsert({key:"invoice_template",value:{client:$("#tClient").value,signer:$("#tSign").value.trim(),managerEmail:$("#tMgr").value.trim(),accountantEmail:$("#tAcc").value.trim()}});if(error)return toast(t("errGeneric"));toast(t("saved"));await refresh();return}
});
