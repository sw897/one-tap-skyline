import './sites-env.mjs';
import { Miniflare } from 'miniflare';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { privatePath,statePath } from './private-state.mjs';
import { exportCityData,importCityData } from '../src/server/transfer.ts';

const [operation,...args]=process.argv.slice(2);
if(!['export','import'].includes(operation)||args.length!==2||args[0]!=='--file')throw new Error('Usage: city-data.mjs export|import --file <absolute private JSON path>');
const file=privatePath(args[1]),config=JSON.parse(await readFile('dist/server/wrangler.json','utf8'));
const binding=config.d1_databases.find(b=>b.binding==='DB');if(!binding)throw new Error('Build must contain the logical DB binding');
const worker=new Miniflare({modules:true,script:'export default {fetch(){return new Response("Local data tool")}}',compatibilityDate:config.compatibility_date,d1Databases:{DB:binding.database_id},d1Persist:path.join(statePath(),'v3','d1')});
try{
  const db=await worker.getD1Database('DB');
  if(operation==='export'){
    const bundle=await exportCityData(db);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(bundle,null,2),{flag:'wx',mode:0o600});
    console.log(JSON.stringify({operation,version:bundle.version,counts:Object.fromEntries(Object.entries(bundle.tables).map(([table,rows])=>[table,rows.length]))}));
  }else{
    const bundle=JSON.parse(await readFile(file,'utf8'));await importCityData(db,bundle);
    const restored=await exportCityData(db);
    console.log(JSON.stringify({operation,version:restored.version,counts:Object.fromEntries(Object.entries(restored.tables).map(([table,rows])=>[table,rows.length]))}));
  }
}finally{await worker.dispose();}
