import {mkdir,readFile,writeFile,rename,unlink,readdir,stat,rmdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import type {R2Bucket} from '@cloudflare/workers-types';
import {shanghaiMidnight} from '../core/photo.ts';

const validKey=/^photos\/\d{13}\/[a-f0-9-]{36}\/(?:image|thumbnail)\.jpg$/i;
export class FileBucket {
  constructor(readonly root:string){}
  asR2(){return this as unknown as R2Bucket;}
  private file(key:string){if(!validKey.test(key))throw Error('invalid_object_key');const file=path.resolve(this.root,key);if(!file.startsWith(path.resolve(this.root)+path.sep))throw Error('invalid_object_key');return file;}
  async probe(){await mkdir(this.root,{recursive:true});const file=path.join(this.root,'.probe-'+randomUUID());await writeFile(file,'ok',{flag:'wx'});await readFile(file);await unlink(file);}
  async put(key:string,bytes:Uint8Array,options?:{httpMetadata?:{contentType?:string;cacheControl?:string}}){
    const file=this.file(key),suffix='.'+Date.now()+'.'+randomUUID()+'.tmp',tmp=file+suffix,meta=file+'.metadata.json',tmpMeta=meta+suffix;
    await mkdir(path.dirname(file),{recursive:true});
    try{
      await writeFile(tmp,bytes,{flag:'wx'});await writeFile(tmpMeta,JSON.stringify({createdAt:Date.now(),httpMetadata:options?.httpMetadata??{contentType:'image/jpeg'}}),{flag:'wx'});
      await rename(tmp,file);await rename(tmpMeta,meta);
    }finally{await Promise.all([tmp,tmpMeta].map(p=>unlink(p).catch(e=>{if(e.code!=='ENOENT')throw e;})));}
    return {key};
  }
  async get(key:string){
    const file=this.file(key);
    try{const bytes=await readFile(file);return {key,body:bytes,httpMetadata:{contentType:'image/jpeg',cacheControl:'no-store'}};}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
  }
  async delete(keys:string|string[]){
    for(const key of typeof keys==='string'?[keys]:keys)for(const file of [this.file(key),this.file(key)+'.metadata.json'])try{await unlink(file);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }
  private async allFiles(){
    const files:string[]=[];
    const walk=async(dir:string)=>{for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else if(entry.isFile())files.push(file);}};
    await walk(this.root);return files;
  }
  async list(options:{prefix?:string;limit?:number;cursor?:string}={}){
    const after=options.cursor?Buffer.from(options.cursor,'base64url').toString('utf8'):'',limit=Math.max(1,Math.min(1000,options.limit??1000));
    const keys=(await this.allFiles()).map(p=>path.relative(this.root,p).split(path.sep).join('/')).filter(key=>validKey.test(key)&&key.startsWith(options.prefix??'')&&key>after).sort();
    const page=keys.slice(0,limit);
    return {objects:page.map(key=>({key})),truncated:keys.length>limit,...(keys.length>limit?{cursor:Buffer.from(page.at(-1)!).toString('base64url')}:{})};
  }
  async sweepTemporary(now:number){
    let removed=0,pending=0;
    for(const file of await this.allFiles()){
      const relative=path.relative(this.root,file).split(path.sep).join('/'),day=Number(relative.split('/')[1]);
      const temporary=file.endsWith('.tmp'),sidecar=file.endsWith('.metadata.json');
      if(!temporary&&!sidecar)continue;
      const staleDay=Number.isFinite(day)&&day<shanghaiMidnight(now);
      const staleTemp=temporary&&(await stat(file)).mtimeMs<now-3_600_000;
      let orphan=false;if(sidecar)try{await stat(file.slice(0,-14));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')orphan=true;else throw e;}
      if(staleDay||staleTemp||orphan)try{await unlink(file);removed++;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')pending++;}
    }
    const photos=path.join(this.root,'photos');
    const prune=async(dir:string)=>{
      if(!path.resolve(dir).startsWith(path.resolve(this.root)+path.sep))throw Error('invalid_cleanup_path');
      for(const entry of await readdir(dir,{withFileTypes:true}))if(entry.isDirectory())await prune(path.join(dir,entry.name));
      try{await rmdir(dir);}catch(e){if(!['ENOTEMPTY','ENOENT'].includes((e as NodeJS.ErrnoException).code??''))pending++;}
    };
    try{for(const entry of await readdir(photos,{withFileTypes:true}))if(entry.isDirectory()&&/^\d{13}$/.test(entry.name)&&Number(entry.name)<shanghaiMidnight(now))await prune(path.join(photos,entry.name));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    return {removed,pending};
  }
}
