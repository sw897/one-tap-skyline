/** HTML/RSC and game data stay fresh; only fingerprinted successful assets are immutable. */
export function cachePolicy(request:Request,response:Response){
 const headers=new Headers(response.headers),path=new URL(request.url).pathname,type=headers.get('content-type')??'';
 const fingerprinted=/^\/_next\/static\/.*-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|png|jpe?g|webp|svg)$/.test(path);
 if(!headers.has('set-cookie')&&response.status>=200&&response.status<300&&fingerprinted&&!type.includes('html'))headers.set('Cache-Control','public, max-age=31536000, immutable');
 else headers.set('Cache-Control','no-store');
 headers.set('Referrer-Policy','same-origin');
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
