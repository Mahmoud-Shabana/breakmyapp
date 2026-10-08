import { createServer } from 'node:http';

const port=4175;
createServer((req,res)=>{
  const url=new URL(req.url ?? '/', 'http://127.0.0.1:'+port);
  if(url.pathname!=='/'){
    res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});
    res.end('Not found');
    return;
  }
  const changed=url.searchParams.get('variant')==='after';
  // Query parameters affect rendering but never the sanitized baseline filename.
  const background=changed?'#184d46':'#17243a';
  const accent=changed?'#ff7a90':'#8ce8c8';
  const html='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<title>BreakMyApp visual regression fixture</title>'+
    '<style>body{margin:0;background:#0d1726;color:white;font:16px system-ui;}'+
    'main{padding:35px;max-width:900px;margin:auto;}'+
    '.card{height:235px;border-radius:18px;background:'+background+
    ';border:5px solid '+accent+';padding:20px}'+
    'h1{font-size:30px;margin:0 0 18px}.badge{padding:8px;background:'+accent+
    ';color:#15232e;border-radius:6px;display:inline-block}</style></head>'+
    '<body><main><h1>Stable text. Different visual appearance.</h1>'+
    '<section class="card"><h2>Visual baseline demonstration</h2>'+
    '<p class="badge">Inspect the highlighted pixels</p>'+
    '<p>Same route; two visual variants.</p></section></main></body></html>';
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(html);
}).listen(port,'127.0.0.1',()=>{
  console.log('Visual fixture: http://127.0.0.1:'+port+'/?variant=before');
  console.log('Compare with:   http://127.0.0.1:'+port+'/?variant=after');
});
