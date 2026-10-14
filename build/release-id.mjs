import {createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
/** Stable per application source; documentation/test-only edits do not invalidate clients. */
export async function buildReleaseId(root){
 const files=[];
 async function walk(dir){for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})){const p=dir+'/'+entry.name;if(entry.isDirectory())await walk(p);else if(/\.(?:ts|tsx|js|mjs|css)$/.test(p))files.push(p);}}
 for(const dir of ['src','app','build','lib','scripts'])await walk(dir);
 files.push('vite.config.ts','next.config.ts','package-lock.json','tsconfig.json');
 const hash=createHash('sha256');for(const p of files.sort()){hash.update(p+'\0');hash.update(await readFile(path.join(root,p)));hash.update('\0');}
 return 'build-'+hash.digest('hex').slice(0,12);
}
