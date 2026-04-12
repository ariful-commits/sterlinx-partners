const fs=require("fs");
const http=require("http");
const https=require("https");
const webpush=require("web-push");

// ── VAPID configuration ──────────────────────────────────────────────
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
if(!VAPID_PUBLIC||!VAPID_PRIVATE){ console.error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY env vars are required"); process.exit(1); }
webpush.setVapidDetails("mailto:admin@sterlinxglobal.com", VAPID_PUBLIC, VAPID_PRIVATE);

// ── Push subscription store (persisted to disk) ──────────────────────
const SUBS_FILE = "/var/www/sterlinx-partners/push-subscriptions.json";
let subsMap = {}; // { slug: [subscription, ...] }
try { subsMap = JSON.parse(fs.readFileSync(SUBS_FILE,"utf8")); } catch(e){}
function saveSubs(){ try { fs.writeFileSync(SUBS_FILE, JSON.stringify(subsMap)); } catch(e){} }

// ── Sheet proxy cache ────────────────────────────────────────────────
const cache={};
const CACHE_TTL=120000;

function readBody(req){
  return new Promise((resolve,reject)=>{
    const chunks=[];
    req.on("data",d=>chunks.push(d));
    req.on("end",()=>{ try{ resolve(JSON.parse(Buffer.concat(chunks).toString())); }catch(e){ resolve({}); } });
    req.on("error",reject);
  });
}

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

function json(res,status,obj){
  const body=JSON.stringify(obj);
  res.writeHead(status,{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"});
  res.end(body);
}

http.createServer(async(req,res)=>{
  const u=new URL(req.url,"http://localhost");

  // ── GET /push-vapid-key ─────────────────────────────────────────
  if(u.pathname==="/push-vapid-key" && req.method==="GET"){
    return json(res,200,{publicKey:VAPID_PUBLIC});
  }

  // ── POST /push-subscribe ─────────────────────────────────────────
  if(u.pathname==="/push-subscribe" && req.method==="POST"){
    const body=await readBody(req);
    const {slug, subscription}=body;
    if(!slug||!subscription||!subscription.endpoint){return json(res,400,{error:"Invalid"});}
    if(!subsMap[slug]) subsMap[slug]=[];
    // De-duplicate by endpoint
    const exists=subsMap[slug].some(s=>s.endpoint===subscription.endpoint);
    if(!exists) subsMap[slug].push(subscription);
    saveSubs();
    return json(res,200,{ok:true});
  }

  // ── POST /push-notify ────────────────────────────────────────────
  if(u.pathname==="/push-notify" && req.method==="POST"){
    const body=await readBody(req);
    const {slug, title, body:msgBody, url}=body;
    if(!slug){return json(res,400,{error:"slug required"});}
    const subs=subsMap[slug]||[];
    const payload=JSON.stringify({title:title||"Sterlinx Partner Portal", body:msgBody||"You have a new notification.", url:url||"/"});
    const results=await Promise.allSettled(
      subs.map(sub=>webpush.sendNotification(sub,payload))
    );
    // Remove dead subscriptions (410 Gone)
    const dead=new Set();
    results.forEach((r,i)=>{
      if(r.status==="rejected"&&r.reason?.statusCode===410) dead.add(subs[i].endpoint);
    });
    if(dead.size){
      subsMap[slug]=subs.filter(s=>!dead.has(s.endpoint));
      saveSubs();
    }
    const sent=results.filter(r=>r.status==="fulfilled").length;
    return json(res,200,{sent, total:subs.length});
  }

  // ── GET /sheet-proxy ─────────────────────────────────────────────
  if(u.pathname==="/sheet-proxy"){
    const target=u.searchParams.get("url");
    if(!target){res.writeHead(400);return res.end("No URL");}
    return follow(target,res,0);
  }

  // ── Everything else → serve index.html ──────────────────────────
  const html=fs.readFileSync("/var/www/sterlinx-partners/index.html");
  res.writeHead(200,{"Content-Type":"text/html"});
  res.end(html);
}).listen(8080,()=>console.log("Running on 8080"));
