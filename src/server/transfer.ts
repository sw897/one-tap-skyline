import type { D1Database } from '@cloudflare/workers-types';
import { validateTower } from '../core/tower.ts';
import { RULESET_ID, GEOMETRY_VERSION } from './policy.ts';
const TABLES=['cities','players','runs','buildings'] as const;
const COLUMNS:Record<typeof TABLES[number],string[]>={
  cities:['id','epoch','display_name','ruleset_id','is_test','revision','next_plot','capacity'],
  players:['id','public_id','credential_hash','created_at','expires_at'],
  runs:['id','city_id','player_id','start_key','ruleset_id','rules_json','geometry_version','created_at','expires_at','status','request_hash','trace_json','tower_json','floors','finalize_token','result_kind','previous_json','receipt_json'],
  buildings:['id','city_id','player_id','plot_id','color','name','best_run_id','floors','tower_json','achieved_at'],
};
type Row=Record<string,string|number|null>;
export interface CityDataBundle { version:1;geometryVersion:string;rulesetId:string;exportedAt:string;tables:Record<typeof TABLES[number],Row[]> }
/** Private structured export: credentials are hashes; never publish this bundle. */
export async function exportCityData(db:D1Database):Promise<CityDataBundle>{
  const results=await db.batch(TABLES.map(t=>db.prepare(`SELECT ${COLUMNS[t].join(',')} FROM ${t} ORDER BY id`)));
  return {version:1,geometryVersion:GEOMETRY_VERSION,rulesetId:RULESET_ID,exportedAt:new Date().toISOString(),tables:Object.fromEntries(TABLES.map((t,i)=>[t,results[i].results])) as CityDataBundle['tables']};
}
export function validateBundle(bundle:CityDataBundle){
  if(bundle.version!==1||bundle.geometryVersion!==GEOMETRY_VERSION||bundle.rulesetId!==RULESET_ID)throw new Error('Unsupported data version');
  for(const table of TABLES){
    if(!Array.isArray(bundle.tables[table])||bundle.tables[table].length>100_000)throw new Error('Invalid table');
    for(const row of bundle.tables[table]){
      if(Object.keys(row).sort().join(',')!==[...COLUMNS[table]].sort().join(','))throw new Error('Unknown data columns');
      if(Object.values(row).some(v=>v!==null&&typeof v!=='string'&&typeof v!=='number'))throw new Error('Invalid value');
    }
  }
  for(const row of bundle.tables.buildings){
    const tower=JSON.parse(String(row.tower_json));if(!validateTower(tower)||tower.layers.length!==row.floors)throw new Error('Invalid building geometry');
  }
  for(const row of bundle.tables.runs)if(row.ruleset_id!==RULESET_ID||row.geometry_version!==GEOMETRY_VERSION)throw new Error('Unsupported run version');
}
/** Restore only to an already migrated EMPTY database, in one atomic batch. */
export async function importCityData(db:D1Database,bundle:CityDataBundle){
  validateBundle(bundle);
  const counts=await db.batch(TABLES.map(t=>db.prepare(`SELECT COUNT(*) AS n FROM ${t}`)));
  if(counts.some(r=>Number((r.results[0] as {n:number}).n)!==0))throw new Error('Restore requires empty database');
  const inserts=TABLES.flatMap(t=>bundle.tables[t].map(row=>db.prepare(`INSERT INTO ${t}(${COLUMNS[t].join(',')}) VALUES(${COLUMNS[t].map(()=>'?').join(',')})`).bind(...COLUMNS[t].map(c=>row[c]))));
  if(inserts.length)await db.batch(inserts);
}
