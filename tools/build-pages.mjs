import {build} from 'vite';
import {createHash} from 'node:crypto';
import {readFile,readdir,mkdir,copyFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildReleaseId} from '../build/release-id.mjs';
import {demoBasePath} from '../pages-web/demo-state.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.resolve(root,'pages-dist');
if(path.dirname(out)!==root||path.basename(out)!=='pages-dist')throw Error('Invalid Pages output directory');
const args=new Map();for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i],value=process.argv[i+1];if(!['--base-path','--site-url'].includes(key)||value===undefined||args.has(key))throw Error('Invalid Pages build arguments');args.set(key,value);}
const base=demoBasePath(args.get('--base-path')??'/one-tap-skyline/');
let site;
if(args.has('--site-url')){
  site=new URL(args.get('--site-url'));
  if(!['https:','http:'].includes(site.protocol)||site.username||site.password||site.search||site.hash||demoBasePath(site.pathname)!==base)throw Error('Invalid public demo URL');
  if(site.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(site.hostname))throw Error('Public demo requires HTTPS');
  site.pathname=base;
}
const sourceRelease=await buildReleaseId(root),hash=createHash('sha256');hash.update(sourceRelease+'\0'+base+'\0');
for(const file of ['index.html','main.ts','style.css','demo-state.ts'])hash.update(await readFile(path.join(root,'pages-web',file)));
hash.update(await readFile(fileURLToPath(import.meta.url)));hash.update(await readFile(path.join(root,'tsconfig.pages.json')));
const releaseId='pages-'+hash.digest('hex').slice(0,12);
await build({configFile:false,root:path.join(root,'pages-web'),publicDir:false,base,
  define:{__SKYLINE_RELEASE__:JSON.stringify(releaseId),__PAGES_DEMO_RELEASE__:JSON.stringify(releaseId)},
  plugins:[{name:'demo-canonical-url',transformIndexHtml(html){return site?html.replace('</head>',`  <link rel="canonical" href="${site.href}">\n</head>`):html;}}],
  build:{outDir:out,emptyOutDir:true,target:'es2022'}});
await mkdir(out,{recursive:true});
const deployment=base==='/'?{gameId:'skyline',basePath:'/',publicOnly:false}:{gameId:base.slice(1,-1),basePath:base,publicOnly:false};
await writeFile(path.join(out,'runtime-config.json'),JSON.stringify({deployment})+'\n');
await copyFile(path.join(root,'LICENSE'),path.join(out,'LICENSE.txt'));
await copyFile(path.join(root,'public/THIRD_PARTY_NOTICES.txt'),path.join(out,'THIRD_PARTY_NOTICES.txt'));
await writeFile(path.join(out,'.nojekyll'),'');
await writeFile(path.join(out,'demo-build.json'),JSON.stringify({releaseId,sourceReleaseId:sourceRelease,basePath:base,mode:'public-simulation',backend:false,commit:process.env.GITHUB_SHA??null})+'\n');
const names=await readdir(out);if(names.some(name=>['server','db','photos','data'].includes(name)))throw Error('Non-static data in Pages artifact');
console.log(JSON.stringify({target:'pages-simulation',releaseId,sourceReleaseId:sourceRelease,basePath:base,siteUrl:site?.href??null,outDir:'pages-dist'}));
