import type { D1Database,R2Bucket } from '@cloudflare/workers-types';
import type { SharedCityId } from '../shared/protocol.ts';
import type { PhotoDraft } from '../core/photo.ts';
import { DRAFT_TTL_MS,nextShanghaiMidnight,shanghaiMidnight } from '../core/photo.ts';
import { ApiError,hashText,randomId } from './policy.ts';
import { CityStore } from './store.ts';
import { normalizePhoto,readPhotoBytes } from './photo-codec.ts';
interface Context {db?:D1Database;bucket?:R2Bucket;publicWriteOpen:boolean;publicPhotosOpen:boolean;now?:()=>number}
type Asset={id:string;city_id:SharedCityId;player_id:string;upload_key:string;request_hash:string;status:string;created_at:number;expires_at:number;image_key:string;thumbnail_key:string;bytes:number};
type Facade={id:string;asset_id:string|null;version:number};
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Cookie'}});
const parseCity=(x:string|null):SharedCityId=>{if(x==='public'||x==='test'||x==='test-mobile')return x;throw new ApiError(400,'invalid_city');};
const uuid=(x:unknown)=>{if(typeof x!=='string'||!/^[a-f0-9-]{36}$/i.test(x))throw new ApiError(400,'invalid_id');return x;};
async function body(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError(403,'same_origin_required');
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ApiError(415,'json_required');
 const text=await request.text();if(text.length>2048)throw new ApiError(413,'body_too_large');
 try{const v=JSON.parse(text);if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v as Record<string,unknown>;}catch{throw new ApiError(400,'invalid_body');}
}
class Photos {
 constructor(readonly db:D1Database,readonly bucket:R2Bucket){}
 stmt(s:string,...v:(string|number|null)[]){return this.db.prepare(s).bind(...v);}
 async facade(city:SharedCityId,player:string){
  const f=await this.stmt('SELECT b.id,f.asset_id,COALESCE(f.version,0) AS version FROM buildings b LEFT JOIN building_facades f ON f.building_id=b.id WHERE b.city_id=? AND b.player_id=?',city,player).first<Facade>();
  if(!f)throw new ApiError(409,'no_saved_building');return f;
 }
 async deleteFiles(a:Asset){await this.bucket.delete([a.image_key,a.thumbnail_key]);await this.stmt("DELETE FROM photo_assets WHERE id=? AND status IN ('revoked','deleting','failed')",a.id).run();}
 async cleanup(now:number){
  const assets=(await this.stmt("SELECT * FROM photo_assets WHERE created_at<? OR (status!='active' AND expires_at<=?) OR status IN ('revoked','deleting','failed') ORDER BY created_at LIMIT 200",shanghaiMidnight(now),now).all<Asset>()).results;
  if(!assets.length)return {removed:0,pending:0,cutoff:shanghaiMidnight(now)};
  const ids=assets.map(a=>a.id),place=ids.map(()=>'?').join(',');
  const touched=(await this.stmt(`SELECT DISTINCT b.city_id FROM building_facades f JOIN buildings b ON b.id=f.building_id WHERE f.asset_id IN (${place})`,...ids).all<{city_id:SharedCityId}>()).results;
  await this.db.batch([
    this.stmt(`UPDATE building_facades SET asset_id=NULL,version=version+1 WHERE asset_id IN (${place})`,...ids),
    this.stmt(`UPDATE photo_assets SET status='deleting' WHERE id IN (${place})`,...ids),
    ...touched.map(c=>this.stmt('UPDATE cities SET revision=revision+1 WHERE id=?',c.city_id)),
  ]);
  let removed=0;for(const a of assets)try{await this.deleteFiles(a);removed++;}catch{/* rows remain deleting for the next call */}
  return {removed,pending:assets.length-removed,cutoff:shanghaiMidnight(now)};
 }
 async draft(city:SharedCityId,player:string,uploadKey:string,bytes:Uint8Array,now:number):Promise<PhotoDraft>{
  await this.facade(city,player);
  const requestHash=await hashText(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer as ArrayBuffer))).join(','));
  const existing=await this.stmt('SELECT * FROM photo_assets WHERE city_id=? AND player_id=? AND upload_key=?',city,player,uploadKey).first<Asset>();
  if(existing){
   if(existing.request_hash!==requestHash)throw new ApiError(409,'photo_conflict');
   if(!['draft','active'].includes(existing.status)||existing.expires_at<=now)throw new ApiError(410,'photo_expired');
   return {id:existing.id,expiresAt:existing.expires_at,bytes:existing.bytes};
  }
  await new CityStore(this.db).rateLimit('photo-upload:'+player,5,now,600_000);
  const image=normalizePhoto(bytes),id=randomId(),prefix='photos/'+shanghaiMidnight(now)+'/'+id+'/',imageKey=prefix+'image.jpg',thumbKey=prefix+'thumbnail.jpg',expires=Math.min(now+DRAFT_TTL_MS,nextShanghaiMidnight(now));
  await this.stmt("INSERT INTO photo_assets(id,city_id,player_id,upload_key,request_hash,status,created_at,expires_at,image_key,thumbnail_key,bytes,width,height) VALUES(?,?,?,?,?,'uploading',?,?,?,?,?,?,?)",id,city,player,uploadKey,requestHash,now,expires,imageKey,thumbKey,image.image.length,512,768).run();
  try{
   await this.bucket.put(imageKey,image.image,{httpMetadata:{contentType:'image/jpeg',cacheControl:'no-store'}});
   await this.bucket.put(thumbKey,image.thumbnail,{httpMetadata:{contentType:'image/jpeg',cacheControl:'no-store'}});
   const changed=await this.stmt("UPDATE photo_assets SET status='draft' WHERE id=? AND status='uploading' AND expires_at>?",id,Date.now()).run();
   if(!changed.meta.changes)throw new ApiError(410,'photo_expired');
   return {id,expiresAt:expires,bytes:image.image.length};
  }catch(e){
   await this.stmt("UPDATE photo_assets SET status='failed' WHERE id=? AND status!='active'",id).run();
   try{await this.bucket.delete([imageKey,thumbKey]);}catch{}
   throw e;
  }
 }
 async save(city:SharedCityId,player:string,id:string,expected:number,now:number){
  const f=await this.facade(city,player);
  if(f.asset_id===id)return {duplicate:true};
  if(f.version!==expected)throw new ApiError(409,'photo_conflict');
  const a=await this.stmt("SELECT * FROM photo_assets WHERE id=? AND city_id=? AND status='draft' AND expires_at>?",id,city,now).first<Asset>();
  if(!a)throw new ApiError(410,'photo_expired');
  const expires=nextShanghaiMidnight(now);
  await this.db.batch([
   this.stmt('INSERT OR IGNORE INTO building_facades(building_id,asset_id,version) VALUES(?,NULL,0)',f.id),
   this.stmt("UPDATE building_facades SET asset_id=?,version=version+1 WHERE building_id=? AND version=? AND EXISTS(SELECT 1 FROM photo_assets WHERE id=? AND status='draft' AND expires_at>?)",id,f.id,expected,id,now),
   this.stmt("UPDATE photo_assets SET status='active',expires_at=? WHERE id=? AND EXISTS(SELECT 1 FROM building_facades WHERE building_id=? AND asset_id=? AND version=?)",expires,id,f.id,id,expected+1),
   this.stmt("UPDATE photo_assets SET status='revoked' WHERE id=? AND EXISTS(SELECT 1 FROM building_facades WHERE building_id=? AND asset_id=? AND version=?)",f.asset_id,f.id,id,expected+1),
   this.stmt('UPDATE cities SET revision=revision+1 WHERE id=? AND EXISTS(SELECT 1 FROM building_facades WHERE building_id=? AND asset_id=? AND version=?)',city,f.id,id,expected+1),
  ]);
  const current=await this.facade(city,player);if(current.asset_id!==id)throw new ApiError(409,'photo_conflict');
  if(f.asset_id){const old=await this.stmt('SELECT * FROM photo_assets WHERE id=?',f.asset_id).first<Asset>();if(old)try{await this.deleteFiles(old);}catch{}}
  return {duplicate:false};
 }
 async remove(city:SharedCityId,player:string,expected:number){
  const f=await this.facade(city,player);if(!f.asset_id)return {removed:true,pending:false};
  if(f.version!==expected)throw new ApiError(409,'photo_conflict');
  const old=await this.stmt('SELECT * FROM photo_assets WHERE id=?',f.asset_id).first<Asset>();
  await this.db.batch([
   this.stmt('UPDATE building_facades SET asset_id=NULL,version=version+1 WHERE building_id=? AND version=?',f.id,expected),
   this.stmt("UPDATE photo_assets SET status='revoked' WHERE id=? AND EXISTS(SELECT 1 FROM building_facades WHERE building_id=? AND asset_id IS NULL AND version=?)",f.asset_id,f.id,expected+1),
   this.stmt('UPDATE cities SET revision=revision+1 WHERE id=? AND EXISTS(SELECT 1 FROM building_facades WHERE building_id=? AND asset_id IS NULL AND version=?)',city,f.id,expected+1),
  ]);
  const current=await this.facade(city,player);if(current.asset_id||current.version!==expected+1)throw new ApiError(409,'photo_conflict');
  let pending=false;if(old)try{await this.deleteFiles(old);}catch{pending=true;}
  return {removed:true,pending};
 }
}
export async function handlePhotoApi(request:Request,context:Context){
 try{
  if(!context.db||!context.bucket)throw new ApiError(503,'photo_storage_unavailable');
  const url=new URL(request.url),now=(context.now??Date.now)(),photos=new Photos(context.db,context.bucket),store=new CityStore(context.db);
  if(request.method==='GET'&&url.pathname==='/api/photos/cleanup-due'){
   // Public, due-only maintenance. No caller-supplied cutoff, keys or city.
   // Calls after midnight preserve new-day uploads; repeated calls are harmless.
   return json(await photos.cleanup(now));
  }
  const media=/^\/api\/photos\/media\/([a-f0-9-]{36})\/(image|thumbnail)$/i.exec(url.pathname);
  if(request.method==='GET'&&media){
   const a=await photos.stmt("SELECT a.* FROM photo_assets a JOIN building_facades f ON f.asset_id=a.id WHERE a.id=? AND a.status='active' AND a.expires_at>?",media[1],now).first<Asset>();
   if(!a)return json({error:'photo_expired'},404);
   const object=await context.bucket.get(media[2]==='image'?a.image_key:a.thumbnail_key);
   if(!object)return json({error:'photo_unavailable'},404);
   return new Response(object.body as unknown as BodyInit,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  const city=parseCity(url.searchParams.get('city')??'public');
  if(city==='public'&&(!context.publicWriteOpen||!context.publicPhotosOpen))throw new ApiError(403,'photos_closed');
  const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('skyline_player='))?.slice(15);
  const player=token?await store.player(await hashText(token),now):null;
  if(!player)throw new ApiError(401,'session_required');
  if(request.method==='POST'&&url.pathname==='/api/photos/draft'){
   const bytes=await readPhotoBytes(request);
   return json(await photos.draft(city,player.id,uuid(url.searchParams.get('uploadKey')),bytes,now));
  }
  if(request.method==='POST'&&['/api/photos/save','/api/photos/remove'].includes(url.pathname)){
   const v=await body(request),expected=Number(v.version);if(!Number.isSafeInteger(expected)||expected<0)throw new ApiError(400,'invalid_version');
   const result=url.pathname.endsWith('/save')?await photos.save(city,player.id,uuid(v.id),expected,now):await photos.remove(city,player.id,expected);
   const snapshot=await store.snapshot(city,city!=='public'||context.publicWriteOpen,url.searchParams.get('scope')==='all'?undefined:player.id);snapshot.photoWriteOpen=city!=='public'||context.publicPhotosOpen;
   return json({...result,snapshot});
  }
  throw new ApiError(404,'route_not_found');
 }catch(e){return e instanceof ApiError?json({error:e.code},e.status):json({error:'photo_service_unavailable'},503);}
}
