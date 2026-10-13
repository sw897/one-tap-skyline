import type {D1Database,R2Bucket} from '@cloudflare/workers-types';
import {shanghaiMidnight,nextShanghaiMidnight} from '../core/photo.ts';
import {randomId} from './policy.ts';
export async function ensureGameDay(db:D1Database,now=Date.now()){
 const day=shanghaiMidnight(now);
 let marker=await db.prepare("SELECT day_start FROM game_clock WHERE id='daily'").first<{day_start:number}>();
 if(!marker){
  const previous=await db.prepare('SELECT MAX(stamp) AS stamp FROM (SELECT MAX(created_at) AS stamp FROM runs UNION ALL SELECT MAX(created_at) FROM players)').first<{stamp:number|null}>();
  const initial=previous?.stamp?Math.min(day,shanghaiMidnight(previous.stamp)):day;
  await db.prepare("INSERT OR IGNORE INTO game_clock(id,day_start) VALUES('daily',?)").bind(initial).run();
  marker=await db.prepare("SELECT day_start FROM game_clock WHERE id='daily'").first<{day_start:number}>();
 }
 if(marker!.day_start>=day)return {reset:false,dayStart:day,resetAt:nextShanghaiMidnight(now)};
 const token=randomId(),tables=['city_events','building_facades','photo_assets','buildings','runs','players','rate_limits','cities'];
 const rows=await db.batch([
  db.prepare("UPDATE game_clock SET reset_token=? WHERE id='daily' AND day_start<?").bind(token,day),
  ...tables.map(table=>db.prepare(`DELETE FROM ${table} WHERE EXISTS(SELECT 1 FROM game_clock WHERE id='daily' AND reset_token=?)`).bind(token)),
  db.prepare("UPDATE game_clock SET day_start=? WHERE id='daily' AND reset_token=?").bind(day,token),
 ]);
 return {reset:Boolean(rows[0].meta.changes),dayStart:day,resetAt:nextShanghaiMidnight(now)};
}
export async function removePastDayFiles(bucket:R2Bucket,now=Date.now()){
 const day=shanghaiMidnight(now);let cursor:string|undefined,removed=0;
 do{
  const page=await bucket.list({prefix:'photos/',limit:1000,...(cursor?{cursor}:{})});
  const keys=page.objects.filter(o=>{const stamp=Number(o.key.split('/')[1]);return Number.isFinite(stamp)&&stamp<day;}).map(o=>o.key);
  if(keys.length){await bucket.delete(keys);removed+=keys.length;}
  cursor=page.truncated?page.cursor:undefined;
 }while(cursor);
 return {removed,dayStart:day};
}
