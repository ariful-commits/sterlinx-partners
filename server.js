const fs=require("fs");
const http=require("http");
const https=require("https");

const cache={};
const CACHE_TTL=120000;

function follow(url,res,n){
  if(n>10){res.writeHead(500);return res.end("Too many redirects");}
  const now=Date.now();
  if(cache[url]&&now-cache[url].ts<CACHE_TTL){
    res.writeHead(200,{"Content-Type":"text/csv","Access-Control-Allow-Origin":"*","X-Cache":"HIT"});
    return res.end(cache[url].body);
  }
  const req=https.get(url,(r)=>{
    if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){
      return follow(r.headers.location,res,n+1);
    }
    const chunks=[];
    r.on("data",d=>chunks.push(d));
    r.on("end",()=>{
      const body=Buffer.concat(chunks).toString();
      cache[url]={body,ts:Date.now()};
      res.writeHead(200,{"Content-Type":"text/csv","Access-Control-Allow-Origin":"*","X-Cache":"MISS"});
      res.end(body);
    });
    r.on("error",(e)=>{res.writeHead(500);res.end(e.message);});
  }).on("error",(e)=>{res.writeHead(500);res.end(e.message);});
  req.setTimeout(10000,()=>{req.destroy();res.writeHead(504);res.end("Upstream timeout");});
}

http.createServer((req,res)=>{
  const u=new URL(req.url,"http://localhost");
  if(u.pathname==="/sheet-proxy"){
    const target=u.searchParams.get("url");
    if(!target){res.writeHead(400);return res.end("No URL");}
    follow(target,res,0);
  } else {
    const html=fs.readFileSync("/var/www/sterlinx-partners/index.html");
    res.writeHead(200,{"Content-Type":"text/html"});
    res.end(html);
  }
}).listen(8080,()=>console.log("Running on 8080"));