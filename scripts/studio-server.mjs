import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../apps/studio/',import.meta.url)));
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8'};
const port=Number(process.env.PORT||4174);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{'allow':'GET, HEAD'});res.end();return;}
  const url=new URL(req.url||'/','http://localhost');
  const path=decodeURIComponent(url.pathname);
  if(path.includes('\0'))throw Error('Invalid path');
  const target=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(target!==root&&!target.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  if(!Object.hasOwn(MIME,extname(target))){res.writeHead(404);res.end();return;}
  const bytes=await readFile(target);
  res.writeHead(200,{'content-type':MIME[extname(target)],
   'content-security-policy':"default-src 'none';script-src 'self';style-src 'self';img-src 'self' data: blob:;connect-src 'none';base-uri 'none';object-src 'none';form-action 'none'",
   'x-content-type-options':'nosniff','cache-control':'no-store'});
  res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log('BreakMyApp Studio running at http://127.0.0.1:'+port));
