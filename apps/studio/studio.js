import {parseReport,compareReports,filterFindings,makeIssue} from './analysis.mjs';
const $=s=>document.querySelector(s);
const state={current:null,baseline:null,comparison:null,selected:null,sample:true,query:'',severity:'all',change:'all'};
const demo=(id,ruleId,severity,title,description,width,selector='',confidence='needs-review')=>({
 id,ruleId,severity,title,description,viewport:{width,height:width<600?812:900},selector,confidence,evidence:{detail:'Illustrative finding. Import real report.json to inspect an actual scan.'}
});
function sampleReport(){
 return {schemaVersion:1,toolVersion:'0.1.0',browser:'chromium',target:'https://example.local/dashboard',
 finishedAt:'2026-10-08T11:04:00Z',findings:[
 demo('a','runtime.uncaught-error','high','Uncaught JavaScript error','TypeError: Cannot read properties of undefined (reading map)',1440,'','confirmed'),
 demo('b','layout.horizontal-overflow','medium','Horizontal page overflow detected','Document is 42px wider than the viewport',375,'.dashboard-grid'),
 demo('c','resources.http-error','medium','Missing hero image','image at https://example.local/hero.webp (HTTP 404)',375),
 demo('d','resources.network-error','medium','Failed stylesheet','stylesheet at https://example.local/theme.css (net::ERR_CONNECTION_REFUSED)',1440),
 demo('e','layout.horizontal-overflow','low','Possible overflow in pricing table','Page extends 7px beyond the viewport',768,'.pricing-table'),
 demo('f','navigation.http-error','high','Page returned HTTP 500','Main document returned HTTP 500',375,'','confirmed')
 ]};
}
function sampleBaseline(){return {...sampleReport(),findings:[
 sampleReport().findings[0],demo('old','resources.http-error','medium','Old missing image','image at https://example.local/old.webp (HTTP 404)',375)
]};}
function el(tag,value,cls){const e=document.createElement(tag);e.textContent=String(value??'');if(cls)e.className=cls;return e;}
let timer;
function toast(message){const e=$('#toast');e.textContent=message;e.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>e.classList.remove('show'),3500);}
function refresh(){
 state.comparison=compareReports(state.current,state.baseline);
 const c=state.comparison.counts;
 $('#count-total').textContent=c.total;$('#count-high').textContent=c.high;
 $('#count-new').textContent=state.baseline?c.new:'—';
 $('#count-resolved').textContent=state.baseline?c.resolved:'—';
 $('#report-name').textContent=state.sample?'Sample workspace':'Imported scan';
 $('#report-target').textContent=state.sample?'Illustrative data · not a live scan':state.current.target;
 renderList();
}
function listItem(f,index){
 const card=el('button','','issue');card.type='button';
 if(state.selected===index)card.classList.add('selected');
 const head=el('div','','issue-header');head.append(el('strong',f.title),el('span','↗'));
 const meta=el('div','','meta');meta.append(el('span',f.severity.toUpperCase(),'tag '+f.severity),
 el('span',f.change.toUpperCase(),'tag '+f.change),el('span',f.viewport.width+' × '+f.viewport.height),
 f.pageUrl ? el('span',new URL(f.pageUrl).pathname) : el('span',''),
 el('span',f.ruleId));
 card.append(head,el('p',f.description,'issue-desc'),meta);
 card.addEventListener('click',()=>{state.selected=index;renderList();showDetail(f);});
 return card;
}
function renderList(){
 const visible=filterFindings(state.comparison.findings,state);
 $('#total-visible').textContent=visible.length;
 const list=$('#items');list.replaceChildren();
 if(!visible.length){list.append(el('div','No matching findings. Try another filter or import a scan.','no-items'));return;}
 visible.forEach(f=>list.append(listItem(f,state.comparison.findings.indexOf(f))));
}
function detailRow(container,label,value){
 const div=el('div','','detail-row');div.append(el('span',label),el('strong',value));container.append(div);
}
function download(contents,name){
 const href=URL.createObjectURL(new Blob([contents],{type:'text/markdown;charset=utf-8'}));
 const link=el('a','');link.href=href;link.download=name;document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(href),1000);
}
function showDetail(f){
 const box=$('#inspector');box.replaceChildren(el('span','INSPECTION DETAILS','subheading'),el('h3',f.title),el('p',f.description));
 detailRow(box,'Severity',f.severity.toUpperCase());detailRow(box,'Confidence',f.confidence);
 detailRow(box,'Change',f.change);detailRow(box,'Viewport',f.viewport.width+' × '+f.viewport.height);
 detailRow(box,'Rule ID',f.ruleId);
 if(f.pageUrl)detailRow(box,'Page',f.pageUrl);
 if(f.selector)detailRow(box,'Element',f.selector);
 if(f.evidence?.detail)box.append(el('div',String(f.evidence.detail),'evidence'));
 if(f.evidence?.screenshot)box.append(el('p','Screenshot: '+f.evidence.screenshot+'. Open the original scanner HTML report to see images.'));
 const actions=el('div','','detail-actions');const copy=el('button','Copy GitHub issue');
 copy.addEventListener('click',async()=>{
 const value=makeIssue(f,state.current.target);
 try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(value);toast('GitHub issue copied');}
 catch{download(value,'breakmyapp-issue.md');toast('Issue downloaded as Markdown');}
 });
 const save=el('button','↓ Export issue .md');save.addEventListener('click',()=>download(makeIssue(f,state.current.target),'breakmyapp-issue.md'));
 actions.append(copy,save);box.append(actions);
}
async function importFile(file,isBaseline){
 if(!file)return;
 if(file.size>10*1024*1024){toast('File too large (10 MB maximum)');return;}
 try{
 const parsed=parseReport(await file.text());
 if(isBaseline)state.baseline=parsed;else{state.current=parsed;state.sample=false;}
 state.selected=null;refresh();$('#inspector').replaceChildren(el('div','Select a finding to inspect evidence.','empty'));
 toast((isBaseline?'Baseline':'Scan')+' loaded — '+parsed.findings.length+' findings');
 }catch(error){toast(error.message||'Invalid report');}
}
$('#load-scan').addEventListener('click',()=>$('#scan-file').click());
$('#load-baseline').addEventListener('click',()=>$('#baseline-file').click());
$('#scan-file').addEventListener('change',e=>{importFile(e.target.files[0],false);e.target.value='';});
$('#baseline-file').addEventListener('change',e=>{importFile(e.target.files[0],true);e.target.value='';});
$('#try-sample').addEventListener('click',()=>{
 state.current=sampleReport();state.baseline=sampleBaseline();state.sample=true;
 state.selected=null;$('#change').value='all';state.change='all';refresh();toast('Sample comparison loaded — demo data');
});
$('#search').addEventListener('input',e=>{state.query=e.target.value;renderList();});
$('#severity').addEventListener('change',e=>{state.severity=e.target.value;renderList();});
$('#change').addEventListener('change',e=>{state.change=e.target.value;renderList();});
$('#download-summary').addEventListener('click',()=>{
 const c=state.comparison.counts;
 const lines=['# BreakMyApp Studio report','','Target: '+state.current.target,
 state.sample?'Note: DEMO DATA':'Imported scan report',
 '', 'Active: '+c.total+' | High: '+c.high+' | Medium: '+c.medium+' | Low: '+c.low,
 state.baseline?'New: '+c.new+' | Resolved: '+c.resolved:'No baseline provided','',
 ...state.comparison.findings.map(f=>'- ['+f.severity.toUpperCase()+' / '+f.change+'] '+f.title+' — '+f.ruleId)];
 download(lines.join('\n'),'breakmyapp-summary.md');toast('Summary exported');
});
function view(kind){
 for(const name of ['overview','findings','compare'])$('#nav-'+name).classList.toggle('active',kind===name);
 $('#crumb').textContent=kind==='overview'?'Overview':kind==='findings'?'Findings':'Compare scans';
 if(kind==='compare'&&!state.baseline)$('#baseline-file').click();
 if(kind==='overview')window.scrollTo({top:0,behavior:'smooth'});
 else $('#findings').scrollIntoView({behavior:'smooth'});
}
for(const name of ['overview','findings','compare'])$('#nav-'+name).addEventListener('click',()=>view(name));
document.addEventListener('keydown',e=>{
 if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){e.preventDefault();$('#search').focus();}
 if(e.key==='Escape'&&document.activeElement===$('#search')){$('#search').value='';state.query='';renderList();$('#search').blur();}
});
state.current=sampleReport();refresh();
