import { cleanName, playerColor } from '../core/city.ts';
import type { D1Database } from '@cloudflare/workers-types';
import type { CompletedRun } from '../core/game.ts';
import type { RunTrace } from '../core/trace.ts';
import type { CitySnapshot, SharedCityId, StartReceipt, SubmissionReceipt } from '../shared/protocol.ts';
import { ApiError, GEOMETRY_VERSION, OFFICIAL_RULES, RULESET_ID, RUN_TTL_MS, randomId } from './policy.ts';

export interface PlayerRow { id: string; public_id: string; credential_hash: string; expires_at: number }
export interface RunRow {
  id:string; city_id:SharedCityId; player_id:string; status:string; rules_json:string;
  ruleset_id:string; created_at:number; expires_at:number; request_hash:string|null; receipt_json:string|null;
}
type CityRow={ id:SharedCityId; epoch:string; display_name:string; revision:number; is_test:number; capacity:number; ruleset_id:string };
type BuildingRow={ id:string; public_id:string; plot_id:number;color:string;name:string;best_run_id:string;tower_json:string;rank:number };
const buildingJson = (alias='b') => `json_object('playerId',p.public_id,'plotId',${alias}.plot_id,'color',${alias}.color,'name',${alias}.name,'bestRunId',${alias}.best_run_id,'tower',json(${alias}.tower_json),'source','shared')`;

export class CityStore {
  readonly db: D1Database;
  constructor(db:D1Database) { this.db=db; }
  stmt(sql:string,...values:(string|number|null)[]) { return this.db.prepare(sql).bind(...values); }
  async ensureCity(city:SharedCityId,name:string) {
    await this.stmt('INSERT OR IGNORE INTO cities(id,epoch,display_name,ruleset_id,is_test) VALUES(?,?,?,?,?)',city,randomId(),name,RULESET_ID,city==='test'?1:0).run();
    await this.stmt('UPDATE cities SET display_name=? WHERE id=? AND display_name<>?',name,city,name).run();
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
  async snapshot(city:SharedCityId,writeOpen:boolean):Promise<CitySnapshot> {
    const rows=await this.db.batch([
      this.stmt('SELECT * FROM cities WHERE id=?',city),
      this.stmt(`SELECT b.*,p.public_id,RANK() OVER(ORDER BY b.floors DESC) AS rank FROM buildings b JOIN players p ON p.id=b.player_id WHERE b.city_id=? ORDER BY b.floors DESC,b.achieved_at,b.id`,city),
    ]);
    const meta=rows[0].results[0] as unknown as CityRow;
    if(!meta)throw new ApiError(404,'city_not_found');
    const buildings=(rows[1].results as unknown as BuildingRow[]).map(b=>({playerId:b.public_id,plotId:b.plot_id,color:b.color,name:b.name,bestRunId:b.best_run_id,tower:JSON.parse(b.tower_json),source:'shared' as const,rank:b.rank}));
    return {cityId:city,epoch:meta.epoch,revision:meta.revision,name:meta.display_name,isTest:!!meta.is_test,writeOpen,capacity:meta.capacity,buildings};
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
        result_kind=CASE WHEN ?=0 THEN 'zero'
          WHEN EXISTS(SELECT 1 FROM buildings WHERE city_id=runs.city_id AND player_id=runs.player_id) THEN
            CASE WHEN ?> (SELECT floors FROM buildings WHERE city_id=runs.city_id AND player_id=runs.player_id) THEN 'best' ELSE 'unchanged' END
          WHEN (SELECT next_plot>=capacity FROM cities WHERE id=runs.city_id) THEN 'full' ELSE 'first' END
        WHERE id=? AND player_id=? AND status='active' AND expires_at>=?`,hash,JSON.stringify(trace),tower,floors,token,floors,floors,run.id,owner,now),
      this.stmt(`INSERT INTO buildings(id,city_id,player_id,plot_id,color,name,best_run_id,floors,tower_json,achieved_at)
        SELECT ?,r.city_id,r.player_id,c.next_plot+CASE WHEN c.next_plot>=13 THEN 1 ELSE 0 END,
          ?,?,r.id,r.floors,r.tower_json,?
        FROM runs r JOIN cities c ON c.id=r.city_id WHERE r.id=? AND r.finalize_token=? AND r.result_kind='first'`,id,playerColor(player.public_id),cleanName(name),now,run.id,token),
      this.stmt(`UPDATE buildings SET floors=?,tower_json=?,best_run_id=?,achieved_at=?
        WHERE city_id=? AND player_id=? AND floors<? AND EXISTS(SELECT 1 FROM runs WHERE id=? AND finalize_token=? AND result_kind='best')`,floors,tower,run.id,now,city,owner,floors,run.id,token),
      this.stmt(`UPDATE cities SET revision=revision+1,next_plot=next_plot+CASE WHEN (SELECT result_kind FROM runs WHERE id=? AND finalize_token=?)='first' THEN 1 ELSE 0 END
        WHERE id=? AND EXISTS(SELECT 1 FROM runs WHERE id=? AND finalize_token=? AND result_kind IN ('first','best'))`,run.id,token,city,run.id,token),
      this.stmt(`UPDATE runs SET receipt_json=json_object('kind',result_kind,'runId',id,'floors',floors,
        'revision',(SELECT revision FROM cities WHERE id=runs.city_id),'building',json((${currentBuilding})),'previous',json(previous_json))
        WHERE id=? AND finalize_token=?`,run.id,token),
      this.stmt('SELECT * FROM runs WHERE id=? AND player_id=?',run.id,owner),
    ]);
    const final=rows[5].results[0] as unknown as RunRow;
    if(!final||!final.receipt_json)throw new ApiError(410,'run_expired_or_cancelled');
    if(final.request_hash!==hash)throw new ApiError(409,'submission_conflict');
    return {receipt:JSON.parse(final.receipt_json),duplicate:(rows[0].meta.changes??0)===0};
  }
}
