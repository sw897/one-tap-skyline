import {env} from 'cloudflare:workers';
import {handleApi} from '../../src/server/service';
export const dynamic='force-dynamic';
const tools=[
 {name:'game_reset_status',description:'Read the current server date and daily-reset marker. Does not read players or modify data.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true}},
 {name:'reset_game_if_due',description:'Reset all game data only if the server has crossed midnight in Asia/Shanghai; remove older-day photo files. No force/date/city argument. Repeated calls preserve current-day data.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true}},
];
const result=(id:unknown,value:unknown)=>Response.json({jsonrpc:'2.0',id,result:value},{headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request){
 let rpc:{id?:unknown;method?:string;params?:{protocolVersion?:string;name?:string;arguments?:Record<string,unknown>}};
 try{rpc=await request.json();}catch{return Response.json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}},{status:400});}
 const {id,method,params}=rpc;
 if(id===undefined)return new Response(null,{status:204});
 if(method==='initialize')return result(id,{protocolVersion:params?.protocolVersion??'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'skyline-daily-reset',version:'0.4.0'}});
 if(method==='ping')return result(id,{});
 if(method==='tools/list')return result(id,{tools});
 if(method==='tools/call'&&Object.keys(params?.arguments??{}).length===0){
  if(params?.name==='game_reset_status'){
   const state=env.DB?await env.DB.prepare("SELECT day_start FROM game_clock WHERE id='daily'").first():null;
   return result(id,{content:[{type:'text',text:JSON.stringify({serverTime:Date.now(),timezone:'Asia/Shanghai',state})}]});
  }
  if(params?.name==='reset_game_if_due'){
   const response=await handleApi(new Request(new URL('/api/game/reset-due',request.url),{headers:request.headers}),{db:env.DB,bucket:env.BUCKET,publicWriteOpen:env.SKYLINE_PUBLIC_WRITE_OPEN==='1',publicPhotosOpen:env.SKYLINE_PUBLIC_PHOTOS_OPEN==='1',cityName:env.CITY_DISPLAY_NAME});
   const value=await response.json();
   return result(id,{content:[{type:'text',text:JSON.stringify(value)}],isError:!response.ok});
  }
 }
 return Response.json({jsonrpc:'2.0',id,error:{code:-32601,message:'Unsupported tool or method'}},{headers:{'Cache-Control':'no-store'}});
}
