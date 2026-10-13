import { cleanName, playerColor } from '../core/city.ts';
import type { D1Database } from '@cloudflare/workers-types';
import type { CompletedRun } from '../core/game.ts';
import type { RunTrace } from '../core/trace.ts';
import type { CitySnapshot, SharedCityId, StartReceipt, SubmissionReceipt } from '../shared/protocol.ts';
import { ApiError, GEOMETRY_VERSION, OFFICIAL_RULES, RULESET_ID, RUN_TTL_MS, randomId } from './policy.ts';
import { nextShanghaiMidnight } from '../core/photo.ts';
import {waterfrontLayout,layoutCapacity,storedLayout,plotLocation,occupiedLayout,type CityLayout} from '../core/layout.ts';
import type {CityEvent} from '../shared/protocol.ts';

export interface PlayerRow { id: string; public_id: string; credential_hash: string; expires_at: number }
export interface RunRow {
  id:string; city_id:SharedCityId; player_id:string; status:string; rules_json:string;
  ruleset_id:string; created_at:number; expires_at:number; request_hash:string|null; receipt_json:string|null;
}
type CityRow={ id:SharedCityId; epoch:string; display_name:string; revision:number; is_test:number; capacity:number; ruleset_id:string;layout_json:string;latest_event:number;first_event:number };
type BuildingRow={ id:string; public_id:string; plot_id:number;color:string;name:string;best_run_id:string;tower_json:string;rank:number };
const buildingJson = (alias='b') => `json_object('playerId',p.public_id,'plotId',${alias}.plot_id,'color',${alias}.color,'name',${alias}.name,'bestRunId',${alias}.best_run_id,'tower',json(${alias}.tower_json),'source','shared')`;

export class CityStore {
  readonly db: D1Database;
  constructor(db:D1Database) { this.db=db; }
  stmt(sql:string,...values:(string|number|null)[]) { return this.db.prepare(sql).bind(...values); }
  async ensureCity(city:SharedCityId,name:string,layout:CityLayout=waterfrontLayout()) {
    await this.stmt('INSERT OR IGNORE INTO cities(id,epoch,display_name,ruleset_id,is_test,capacity,layout_json) VALUES(?,?,?,?,?,?,?)',city,randomId(),name,RULESET_ID,city!=='public'?1:0,layoutCapacity(layout),JSON.stringify(layout)).run();
    // Development iteration applies the current map immediately, without deleting game data.
    for(let attempt=0;attempt<3;attempt++){
      const row=await this.stmt('SELECT next_plot,capacity,layout_json,display_name FROM cities WHERE id=?',city).first<{next_plot:number;capacity:number;layout_json:string;display_name:string}>();
      if(!row)throw new ApiError(404,'city_not_found');
      const desired=occupiedLayout(layout,row.next_plot),capacity=layoutCapacity(desired),layoutJson=JSON.stringify(desired);
      if(row.layout_json===layoutJson&&row.capacity===capacity&&row.display_name===name)return;
      const updated=await this.stmt(`UPDATE cities SET display_name=?,layout_json=?,capacity=?,revision=revision+1 WHERE id=? AND next_plot<=? AND (layout_json<>? OR capacity<>? OR display_name<>?)`,name,layoutJson,capacity,city,capacity,layoutJson,capacity,name).run();
      if(updated.meta.changes)return;
    }
    throw new ApiError(503,'service_unavailable');
  }
  async rateLimit(bucket:string,limit:number,now:number,windowMs:number) {
    const key=bucket+':'+Math.floor(now/windowMs);
    const rows=await this.db.batch([
      this.stmt('DELETE FROM rate_limits WHERE expires_at < ?',now),
      this.stmt('INSERT INTO rate_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count',key,now+windowMs),
    ]);
    if(Number((rows[1].results[0] as {count:number}).count)>limit)throw new ApiError(429,'rate_limited');
  }
  async player(hash:string,now:number) { return this.stmt('SELECT * FROM players WHERE credential_hash=? AND expires_at>?',hash,now).first<PlayerRow>(); }
  async createPlayer(id:string,publicId:string,hash:string,now:number,expires:number) {
    await this.stmt('INSERT INTO players(id,public_id,credential_hash,created_at,expires_at) VALUES(?,?,?,?,?)',id,publicId,hash,now,expires).run();
    return {id,public_id:publicId,credential_hash:hash,expires_at:expires};
  }
  async currentName(city:SharedCityId,owner:string){return (await this.stmt('SELECT name FROM buildings WHERE city_id=? AND player_id=?',city,owner).first<{name:string}>())?.name;}
  async snapshot(city:SharedCityId,writeOpen:boolean,owner?:string,after?:number):Promise<CitySnapshot> {
    const rows=await this.db.batch([
      this.stmt('SELECT c.*,(SELECT COUNT(*) FROM buildings WHERE city_id=c.id) AS total_buildings,COALESCE((SELECT MAX(id) FROM city_events WHERE city_id=c.id),0) AS latest_event,COALESCE((SELECT MIN(id) FROM city_events WHERE city_id=c.id),0) AS first_event FROM cities c WHERE id=?',city),
      owner ? this.stmt(`SELECT b.*,p.public_id,1+(SELECT COUNT(*) FROM buildings other WHERE other.city_id=b.city_id AND other.floors>b.floors) AS rank FROM buildings b JOIN players p ON p.id=b.player_id WHERE b.city_id=? AND b.player_id=?`,city,owner) :
        this.stmt(`SELECT b.*,p.public_id,RANK() OVER(ORDER BY b.floors DESC) AS rank FROM buildings b JOIN players p ON p.id=b.player_id WHERE b.city_id=? ORDER BY b.floors DESC,b.achieved_at,b.id`,city),
      this.stmt(`SELECT b.id,COALESCE(f.version,0) AS version,a.id AS asset_id,a.expires_at,a.status FROM buildings b LEFT JOIN building_facades f ON f.building_id=b.id LEFT JOIN photo_assets a ON a.id=f.asset_id WHERE b.city_id=? AND (? IS NULL OR b.player_id=?)`,city,owner??null,owner??null),
      owner?this.stmt('SELECT * FROM city_events WHERE 0') : after===undefined?this.stmt('SELECT * FROM city_events WHERE city_id=? ORDER BY id DESC LIMIT 40',city):this.stmt('SELECT * FROM city_events WHERE city_id=? AND id>? ORDER BY id LIMIT 40',city,after),
    ]);
    const meta=rows[0].results[0] as unknown as CityRow;
    if(!meta)throw new ApiError(404,'city_not_found');
    const appearances=new Map((rows[2].results as unknown as {id:string;version:number;asset_id:string|null;expires_at:number;status:string}[]).map(a=>[a.id,a]));
    const buildings=(rows[1].results as unknown as BuildingRow[]).map(b=>{const a=appearances.get(b.id);return {playerId:b.public_id,plotId:b.plot_id,color:b.color,name:b.name,bestRunId:b.best_run_id,tower:JSON.parse(b.tower_json),source:'shared' as const,rank:b.rank,appearanceVersion:a?.version??0,photo:a?.asset_id&&a.status==='active'&&a.expires_at>Date.now()?{id:a.asset_id,version:a.version,imageUrl:'/api/photos/media/'+a.asset_id+'/image',thumbnailUrl:'/api/photos/media/'+a.asset_id+'/thumbnail',expiresAt:a.expires_at}:null};});
    const layout=storedLayout(meta.layout_json,meta.capacity);
    type EventRow={id:number;epoch:string;revision:number;run_id:string;kind:'first'|'best';player_public_id:string;plot_id:number;name:string;previous_floors:number;floors:number;global_record:number;created_at:number};
    const events=(rows[3].results as unknown as EventRow[]).map(e=>({id:e.id,epoch:e.epoch,revision:e.revision,runId:e.run_id,kind:e.kind,playerId:e.player_public_id,plotId:e.plot_id,name:e.name,previousFloors:e.previous_floors,floors:e.floors,globalRecord:!!e.global_record,createdAt:e.created_at} satisfies CityEvent));
    if(after===undefined)events.reverse();
    return {cityId:city,epoch:meta.epoch,revision:meta.revision,name:meta.display_name,isTest:!!meta.is_test,writeOpen,capacity:meta.capacity,buildings,scope:owner?'own':'all',totalBuildings:Number((meta as CityRow&{total_buildings:number}).total_buildings),resetAt:nextShanghaiMidnight(),layout,...(owner?{ownLocation:buildings[0]?plotLocation(buildings[0].plotId,layout):undefined}:{events,latestEventId:meta.latest_event,eventGap:after!==undefined&&after>0&&meta.first_event>after+1})};
  }
  async activeRun(city:SharedCityId,player:string,now:number) {
    await this.stmt("UPDATE runs SET status='expired' WHERE city_id=? AND player_id=? AND status='active' AND expires_at<?",city,player,now).run();
    return this.stmt("SELECT id FROM runs WHERE city_id=? AND player_id=? AND status='active'",city,player).first<{id:string}>();
  }
  async start(city:SharedCityId,player:string,startKey:string,replace:string|null,now:number):Promise<StartReceipt> {
    const id=randomId();
    const rows=await this.db.batch([
      this.stmt("UPDATE runs SET status='expired' WHERE city_id=? AND player_id=? AND status='active' AND expires_at<?",city,player,now),
      this.stmt("UPDATE runs SET status='cancelled' WHERE id=? AND city_id=? AND player_id=? AND status='active' AND NOT EXISTS(SELECT 1 FROM runs WHERE city_id=? AND player_id=? AND start_key=?)",replace,city,player,city,player,startKey),
      this.stmt(`INSERT INTO runs(id,city_id,player_id,start_key,ruleset_id,rules_json,geometry_version,created_at,expires_at)
        SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM runs WHERE city_id=? AND player_id=? AND start_key=?)
        AND NOT EXISTS(SELECT 1 FROM runs WHERE city_id=? AND player_id=? AND status='active')`,id,city,player,startKey,RULESET_ID,JSON.stringify(OFFICIAL_RULES),GEOMETRY_VERSION,now,now+RUN_TTL_MS,city,player,startKey,city,player),
      this.stmt('SELECT * FROM runs WHERE city_id=? AND player_id=? AND start_key=?',city,player,startKey),
    ]);
    const run=rows[3].results[0] as unknown as RunRow|undefined;
    if(!run)throw new ApiError(409,'active_run_exists');
    if(run.status!=='active')throw new ApiError(409,'start_key_finished');
    return {runId:run.id,expiresAt:run.expires_at,rules:JSON.parse(run.rules_json),rulesetId:run.ruleset_id};
  }
  async getRun(id:string,player:string,now:number):Promise<RunRow> {
    await this.stmt("UPDATE runs SET status='expired' WHERE id=? AND player_id=? AND status='active' AND expires_at<?",id,player,now).run();
    const run=await this.stmt('SELECT * FROM runs WHERE id=? AND player_id=?',id,player).first<RunRow>();
    if(!run)throw new ApiError(404,'run_not_found'); return run;
  }
  async cancel(id:string,player:string) {
    await this.stmt("UPDATE runs SET status='cancelled' WHERE id=? AND player_id=? AND status='active'",id,player).run();
  }
  async submit(run:RunRow,player:PlayerRow,name:string,trace:RunTrace,completed:CompletedRun,hash:string,now:number):Promise<{receipt:SubmissionReceipt;duplicate:boolean}> {
    const token=randomId(),floors=completed.tower.layers.length,tower=JSON.stringify(completed.tower),id=randomId();
    const owner=player.id,city=run.city_id;
    const currentBuilding=`SELECT ${buildingJson()} FROM buildings b JOIN players p ON p.id=b.player_id WHERE b.city_id=runs.city_id AND b.player_id=runs.player_id`;
    const rows=await this.db.batch([
      this.stmt(`UPDATE runs SET status='completed',request_hash=?,trace_json=?,tower_json=?,floors=?,finalize_token=?,
        previous_json=(${currentBuilding}),
        previous_max_floors=COALESCE((SELECT MAX(floors) FROM buildings WHERE city_id=runs.city_id),0),
        result_kind=CASE WHEN ?=0 THEN 'zero'
          WHEN EXISTS(SELECT 1 FROM buildings WHERE city_id=runs.city_id AND player_id=runs.player_id) THEN
            CASE WHEN ?> (SELECT floors FROM buildings WHERE city_id=runs.city_id AND player_id=runs.player_id) THEN 'best' ELSE 'unchanged' END
          WHEN (SELECT next_plot>=capacity FROM cities WHERE id=runs.city_id) THEN 'full' ELSE 'first' END
        WHERE id=? AND player_id=? AND status='active' AND expires_at>=?`,hash,JSON.stringify(trace),tower,floors,token,floors,floors,run.id,owner,now),
      this.stmt(`INSERT INTO buildings(id,city_id,player_id,plot_id,color,name,best_run_id,floors,tower_json,achieved_at)
        SELECT ?,r.city_id,r.player_id,c.next_plot+CASE WHEN c.next_plot>=13 THEN 1 ELSE 0 END,
          ?,?,r.id,r.floors,r.tower_json,?
        FROM runs r JOIN cities c ON c.id=r.city_id WHERE r.id=? AND r.finalize_token=? AND r.result_kind='first'`,id,playerColor(player.public_id),cleanName(name),now,run.id,token),
      this.stmt(`UPDATE buildings SET floors=?,tower_json=?,best_run_id=?,achieved_at=?,name=?
        WHERE city_id=? AND player_id=? AND floors<? AND EXISTS(SELECT 1 FROM runs WHERE id=? AND finalize_token=? AND result_kind='best')`,floors,tower,run.id,now,cleanName(name),city,owner,floors,run.id,token),
      this.stmt(`UPDATE cities SET revision=revision+1,next_plot=next_plot+CASE WHEN (SELECT result_kind FROM runs WHERE id=? AND finalize_token=?)='first' THEN 1 ELSE 0 END
        WHERE id=? AND EXISTS(SELECT 1 FROM runs WHERE id=? AND finalize_token=? AND result_kind IN ('first','best'))`,run.id,token,city,run.id,token),
      this.stmt(`INSERT OR IGNORE INTO city_events(city_id,epoch,revision,run_id,kind,player_public_id,plot_id,name,previous_floors,floors,global_record,created_at)
        SELECT r.city_id,c.epoch,c.revision,r.id,r.result_kind,p.public_id,b.plot_id,b.name,
          COALESCE(json_array_length(json_extract(r.previous_json,'$.tower.layers')),0),r.floors,
          CASE WHEN r.previous_max_floors>0 AND r.floors>r.previous_max_floors THEN 1 ELSE 0 END,?
        FROM runs r JOIN cities c ON c.id=r.city_id JOIN players p ON p.id=r.player_id JOIN buildings b ON b.city_id=r.city_id AND b.player_id=r.player_id
        WHERE r.id=? AND r.finalize_token=? AND r.result_kind IN ('first','best')`,now,run.id,token),
      this.stmt('DELETE FROM city_events WHERE city_id=? AND id NOT IN(SELECT id FROM city_events WHERE city_id=? ORDER BY id DESC LIMIT 200)',city,city),
      this.stmt(`UPDATE runs SET receipt_json=json_object('kind',result_kind,'runId',id,'floors',floors,
        'revision',(SELECT revision FROM cities WHERE id=runs.city_id),'building',json((${currentBuilding})),'previous',json(previous_json))
        WHERE id=? AND finalize_token=?`,run.id,token),
      this.stmt('SELECT * FROM runs WHERE id=? AND player_id=?',run.id,owner),
    ]);
    const final=rows[rows.length-1].results[0] as unknown as RunRow;
    if(!final||!final.receipt_json)throw new ApiError(410,'run_expired_or_cancelled');
    if(final.request_hash!==hash)throw new ApiError(409,'submission_conflict');
    return {receipt:JSON.parse(final.receipt_json),duplicate:(rows[0].meta.changes??0)===0};
  }
}
