import {build} from 'vite';
import {buildReleaseId} from '../build/release-id.mjs';
import path from 'node:path';
const root=process.cwd(),release=await buildReleaseId(root),define={__SKYLINE_RELEASE__:JSON.stringify(release)};
await build({configFile:false,root:path.join(root,'node-web'),publicDir:path.join(root,'public'),define,build:{outDir:path.join(root,'node-dist/client'),emptyOutDir:true}});
await build({configFile:false,define,ssr:{noExternal:['jpeg-js']},build:{ssr:path.join(root,'src/node/main.ts'),outDir:path.join(root,'node-dist/server'),emptyOutDir:true,target:'node22',rollupOptions:{output:{entryFileNames:'main.js'}}}});
console.log(JSON.stringify({releaseId:release,target:'node-docker'}));
