const fs=require('fs');
const http=require('http');
const https=require('https');

function follow(url,res,n){
  if(n>10){res.writeHead(500);return res.end('Too many redirects');}
  https.get(url,(r)=>{
    if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){
      return follow(r.headers.location,res,n+1);
    }
    res.writeHead(200,{'Content-Type':'text/csv','Access-Control-Allow-Origin':'*'});
    r.pipe(res);
  }).on('error',(e)=>{res.writeHead(500);res.end(e.message);});
}

http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/sheet-proxy'){
    const target=u.searchParams.get('url');
    if(!target){res.writeHead(400);return res.end('No URL');}
    follow(target,res,0);
  } else {
    const html=fs.readFileSync('/var/www/sterlinx-partners/index.html');
    res.writeHead(200,{'Content-Type':'text/html'});
    res.end(html);
  }
}).listen(8080,()=>console.log('Running on 8080'));
