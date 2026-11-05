import {defineConfig,type ViteDevServer} from 'vite';
import path from 'node:path';
import {buildReleaseId} from './build/release-id.mjs';
import {DEFAULT_CONFIG} from './src/config.ts';

/** Isolated practice frontend. Shared play is served by the Node runtime. */
export default defineConfig(async()=>({
  root:path.resolve('node-web'),
  publicDir:path.resolve('public'),
  define:{__SKYLINE_RELEASE__:JSON.stringify(await buildReleaseId(process.cwd()))},
  server:{host:'127.0.0.1',port:5173,strictPort:true},
  plugins:[{
    name:'local-practice',
    configureServer(server:ViteDevServer){
      server.middlewares.use((request,response,next)=>{
        if(request.url==='/'){
          response.writeHead(302,{Location:'/?mode=practice'});response.end();return;
        }
        if(request.url?.split('?')[0]==='/runtime-config.json'){
          response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
          response.end(JSON.stringify(DEFAULT_CONFIG));return;
        }
        next();
      });
    },
  }],
}));
