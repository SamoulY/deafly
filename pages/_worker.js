// First-party API cookies work on mobile browsers that block third-party cookies.
// This proxy has one fixed upstream; it never accepts a destination from a client.
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
    if(!['GET','POST','OPTIONS'].includes(request.method))return new Response('METHOD_NOT_ALLOWED',{status:405});
    const target=new URL('https://flydesk-v2-trial-worker.testcf-195.workers.dev');target.pathname=url.pathname;target.search=url.search;
    const headers=new Headers(request.headers);
    const session=headers.get('cookie')?.match(/(?:^|;\s*)flydesk_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    headers.delete('cookie');headers.delete('host');
    if(session)headers.set('cookie','flydesk_session='+session);
    try{
      const result=await env.DEFLY_API.fetch(new Request(target,{method:request.method,headers,body:request.method==='POST'?request.body:undefined,duplex:'half',redirect:'manual'}));
      const responseHeaders=new Headers(result.headers);responseHeaders.set('cache-control','no-store');
      return new Response(result.body,{status:result.status,headers:responseHeaders});
    }catch{return Response.json({error:'SERVICE_UNAVAILABLE'},{status:503,headers:{'cache-control':'no-store'}});}
  },
};
