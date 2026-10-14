import path from 'node:path';
import {createGameServer} from './runtime.ts';
const origin=process.env.PUBLIC_ORIGIN;
if(!origin)throw Error('PUBLIC_ORIGIN_required');
const runtime=await createGameServer({origin,dataRoot:path.resolve(process.env.SKYLINE_DATA_ROOT??'/data'),webRoot:path.resolve('node-dist/client'),migrations:path.resolve('drizzle'),env:process.env});
runtime.server.listen(Number(process.env.PORT??8080),'0.0.0.0',()=>console.log(JSON.stringify({event:'started',port:Number(process.env.PORT??8080)})));
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>{void runtime.close().then(()=>process.exit(0));});
