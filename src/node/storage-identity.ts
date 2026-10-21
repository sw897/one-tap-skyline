import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

/** Storage identity is infrastructure metadata, independent of the daily game data. */
export async function bindStorageIdentity(directories:string[],gameId:string){
  const marker='.game-id';
  // Inspect every mount before creating a marker or touching the game database.
  const states=await Promise.all(directories.map(async directory=>{
    const file=path.join(directory,marker);
    try{
      if((await readFile(file,'utf8'))!==gameId+'\n')throw Error('storage_identity_mismatch');
      return {directory,file,exists:true};
    }catch(error){
      if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
    }
    let entries:string[];
    try{entries=await readdir(directory);}catch(error){
      if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
      entries=[];
    }
    // Only the original game may register its pre-existing, unmarked volumes.
    if(entries.length&&gameId!=='skyline')throw Error('storage_identity_missing');
    return {directory,file,exists:false};
  }));
  for(const state of states)if(!state.exists){
    await mkdir(state.directory,{recursive:true});
    try{await writeFile(state.file,gameId+'\n',{flag:'wx',mode:0o600});}
    catch(error){
      if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
      if((await readFile(state.file,'utf8'))!==gameId+'\n')throw Error('storage_identity_mismatch');
    }
  }
}
