import type {D1Database,R2Bucket} from '@cloudflare/workers-types';
import type {SharedCityId} from '../shared/protocol.ts';
import {DRAFT_TTL_MS,nextShanghaiMidnight,shanghaiMidnight} from '../core/photo.ts';
import {ApiError,hashText,randomId} from './policy.ts';
import {CityStore} from './store.ts';
import {normalizePhoto,readPhotoBytes} from './photo-codec.ts';
import {gameOperation,type BoundaryContext} from './boundary.ts';
import {credential,ROOT_SCOPE,type AppScope} from '../shared/app-scope.ts';
export interface PhotoContext extends BoundaryContext {db?:D1Database;bucket?:R2Bucket;publicWriteOpen:boolean;publicPhotosOpen:boolean}
type Asset={id:string;city_id:SharedCityId;player_id:string;upload_key:string;request_hash:string;status:string;created_at:number;expires_at:number;image_key:string;thumbnail_key:string;bytes:number};
type Facade={id:string;asset_id:string|null;version:number};
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Cookie'}});
const uuid=(x:unknown)=>{if(typeof x!=='string'||!/^[a-f0-9-]{36}$/i.test(x))throw new ApiError(400,'invalid_id');return x;};
const cityId=(x:string|null):SharedCityId=>{if(x==='public'||x==='test'||x==='test-mobile')return x;throw new ApiError(400,'invalid_city');};
async function body(request:Request){
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError(403,'same_origin_required');
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ApiError(415,'json_required');
  const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'invalid_body');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();throw new ApiError(413,'body_too_large');}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  try{const v=JSON.parse(new TextDecoder().decode(bytes));if(!v||typeof v!=='object'||Array.isArray(v))throw Error();return v as Record<string,unknown>;}catch{throw new ApiError(400,'invalid_body');}
}
class Photos {
  constructor(readonly db:D1Database,readonly bucket:R2Bucket,readonly scope:AppScope=ROOT_SCOPE){}
  stmt(sql:string,...values:(string|number|null)[]){return this.db.prepare(sql).bind(...values);}
  async facade(city:SharedCityId,player:string){
    const f=await this.stmt('SELECT b.id,f.asset_id,COALESCE(f.version,0) AS version FROM buildings b LEFT JOIN building_facades f ON f.building_id=b.id WHERE b.city_id=? AND b.player_id=?',city,player).first<Facade>();
    if(!f)throw new ApiError(409,'no_saved_building');return f;
  }
  async owner(request:Request,now:number){
    const token=credential(request,this.scope);
    const player=token?await new CityStore(this.db,this.scope).player(await hashText(token),now):null;
    if(!player)throw new ApiError(401,'session_required');return player;
  }
  async deleteFiles(asset:Asset,context:PhotoContext){
    await this.bucket.delete([asset.image_key,asset.thumbnail_key]);
    await gameOperation(context,async()=>{await this.stmt("DELETE FROM photo_assets WHERE id=? AND status IN ('revoked','deleting','failed')",asset.id).run();});
  }
}
/** Select/expire inside the DB boundary; file deletion runs after release. */
export async function cleanupPhotos(context:PhotoContext){
  if(!context.db||!context.bucket)throw new ApiError(503,'photo_storage_unavailable');
  const photos=new Photos(context.db,context.bucket);
  const {assets,cutoff}=await gameOperation(context,async now=>{
    const assets=(await photos.stmt("SELECT * FROM photo_assets WHERE created_at<? OR (status!='active' AND expires_at<=?) OR status IN ('revoked','deleting','failed') ORDER BY created_at LIMIT 200",shanghaiMidnight(now),now).all<Asset>()).results;
    if(assets.length){
      const ids=assets.map(a=>a.id),place=ids.map(()=>'?').join(',');
      const touched=(await photos.stmt('SELECT DISTINCT b.city_id FROM building_facades f JOIN buildings b ON b.id=f.building_id WHERE f.asset_id IN ('+place+')',...ids).all<{city_id:SharedCityId}>()).results;
      await context.db!.batch([
        photos.stmt('UPDATE building_facades SET asset_id=NULL,version=version+1 WHERE asset_id IN ('+place+')',...ids),
        photos.stmt("UPDATE photo_assets SET status='deleting' WHERE id IN ("+place+')',...ids),
        ...touched.map(c=>photos.stmt('UPDATE cities SET revision=revision+1 WHERE id=?',c.city_id)),
      ]);
    }
    return {assets,cutoff:shanghaiMidnight(now)};
  });
  let removed=0;for(const asset of assets)try{await photos.deleteFiles(asset,context);removed++;}catch{/* pending rows or old keys remain for retry */}
  return {removed,pending:assets.length-removed,cutoff};
}
export async function handlePhotoApi(request:Request,context:PhotoContext,expectedDay?:number){
  try{
    if(!context.db||!context.bucket)throw new ApiError(503,'photo_storage_unavailable');
    const url=new URL(request.url),bucket=context.bucket,photos=new Photos(context.db,bucket,context.scope);
    const writeDay=expectedDay??(request.method==='POST'?shanghaiMidnight((context.now??Date.now)()):undefined);
    if(request.method==='GET'&&url.pathname==='/api/photos/cleanup-due')return json(await cleanupPhotos(context));
    const media=/^\/api\/photos\/media\/([a-f0-9-]{36})\/(image|thumbnail)$/i.exec(url.pathname);
    if(request.method==='GET'&&media){
      const active=(now:number)=>photos.stmt("SELECT a.* FROM photo_assets a JOIN building_facades f ON f.asset_id=a.id WHERE a.id=? AND a.status='active' AND a.expires_at>? AND (?=0 OR a.city_id='public')",media[1],now,context.scope?.publicOnly?1:0).first<Asset>();
      const asset=await gameOperation(context,active);
      if(!asset)return json({error:'photo_expired'},404);
      const object=await context.bucket.get(media[2]==='image'?asset.image_key:asset.thumbnail_key);
      if(!object)return json({error:'photo_unavailable'},404);
      if(!await gameOperation(context,active))return json({error:'photo_expired'},404);
      return new Response(object.body as unknown as BodyInit,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
    }
    const city=cityId(url.searchParams.get('city')??'public');
    if(city==='public'&&(!context.publicWriteOpen||!context.publicPhotosOpen))throw new ApiError(403,'photos_closed');
    if(request.method==='POST'&&url.pathname==='/api/photos/draft'){
      const bytes=await readPhotoBytes(request),image=normalizePhoto(bytes),uploadKey=uuid(url.searchParams.get('uploadKey'));
      const requestHash=await hashText(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.buffer as ArrayBuffer))).join(','));
      const preparation=await gameOperation(context,async now=>{
        const player=await photos.owner(request,now);await photos.facade(city,player.id);
        const existing=await photos.stmt('SELECT * FROM photo_assets WHERE city_id=? AND player_id=? AND upload_key=?',city,player.id,uploadKey).first<Asset>();
        if(existing){
          if(existing.request_hash!==requestHash)throw new ApiError(409,'photo_conflict');
          if(existing.status==='uploading')throw new ApiError(409,'photo_pending');
          if(!['draft','active'].includes(existing.status)||existing.expires_at<=now)throw new ApiError(410,'photo_expired');
          return {asset:existing,duplicate:true};
        }
        await new CityStore(context.db!).rateLimit('photo-upload:'+player.id,5,now,600_000);
        const id=randomId(),prefix='photos/'+shanghaiMidnight(now)+'/'+id+'/',expires=Math.min(now+DRAFT_TTL_MS,nextShanghaiMidnight(now));
        const asset:Asset={id,city_id:city,player_id:player.id,upload_key:uploadKey,request_hash:requestHash,status:'uploading',created_at:now,expires_at:expires,image_key:prefix+'image.jpg',thumbnail_key:prefix+'thumbnail.jpg',bytes:image.image.length};
        await photos.stmt("INSERT INTO photo_assets(id,city_id,player_id,upload_key,request_hash,status,created_at,expires_at,image_key,thumbnail_key,bytes,width,height) VALUES(?,?,?,?,?,'uploading',?,?,?,?,?,?,?)",id,city,player.id,uploadKey,requestHash,now,expires,asset.image_key,asset.thumbnail_key,asset.bytes,512,768).run();
        return {asset,duplicate:false};
      },writeDay);
      const asset=preparation.asset;
      if(!preparation.duplicate){
        const writing=async()=>{
        try{
          await bucket.put(asset.image_key,image.image,{httpMetadata:{contentType:'image/jpeg',cacheControl:'no-store'}});
          await bucket.put(asset.thumbnail_key,image.thumbnail,{httpMetadata:{contentType:'image/jpeg',cacheControl:'no-store'}});
          await gameOperation(context,async now=>{
            await photos.owner(request,now);
            const changed=await photos.stmt("UPDATE photo_assets SET status='draft' WHERE id=? AND status='uploading' AND expires_at>?",asset.id,now).run();
            if(!changed.meta.changes)throw new ApiError(410,'photo_expired');
          },writeDay);
        }catch(error){
          try{await gameOperation(context,async()=>{await photos.stmt("UPDATE photo_assets SET status='failed' WHERE id=? AND status!='active'",asset.id).run();});}catch{}
          try{await bucket.delete([asset.image_key,asset.thumbnail_key]);}catch{/* prefix/expiry sweep retries */}
          throw error;
        }
        };
        if(context.photoIO)await context.photoIO(asset.created_at,writing);else await writing();
      }
      return json({id:asset.id,expiresAt:asset.expires_at,bytes:asset.bytes});
    }
    if(request.method==='POST'&&['/api/photos/save','/api/photos/remove'].includes(url.pathname)){
      const input=await body(request),expected=Number(input.version);
      if(!Number.isSafeInteger(expected)||expected<0)throw new ApiError(400,'invalid_version');
      const output=await gameOperation(context,async now=>{
        const player=await photos.owner(request,now),f=await photos.facade(city,player.id);
        let result:{duplicate?:boolean;removed?:boolean;pending?:boolean},old:Asset|null=null;
        if(url.pathname.endsWith('/save')){
          const id=uuid(input.id);
          if(f.asset_id===id)result={duplicate:true};
          else{
            if(f.version!==expected)throw new ApiError(409,'photo_conflict');
            const asset=await photos.stmt("SELECT * FROM photo_assets WHERE id=? AND city_id=? AND player_id=? AND status='draft' AND expires_at>?",id,city,player.id,now).first<Asset>();
            if(!asset)throw new ApiError(410,'photo_expired');
            await context.db!.batch([
              photos.stmt('INSERT OR IGNORE INTO building_facades(building_id,asset_id,version) VALUES(?,NULL,0)',f.id),
              photos.stmt("UPDATE building_facades SET asset_id=?,version=version+1 WHERE building_id=? AND version=? AND EXISTS(SELECT 1 FROM photo_assets WHERE id=? AND status='draft' AND expires_at>?)",id,f.id,expected,id,now),
              photos.stmt("UPDATE photo_assets SET status='active',expires_at=? WHERE id=? AND EXISTS(SELECT 1 FROM building_facades WHERE building_id=? AND asset_id=? AND version=?)",nextShanghaiMidnight(now),id,f.id,id,expected+1),
              photos.stmt("UPDATE photo_assets SET status='revoked' WHERE id=? AND EXISTS(SELECT 1 FROM building_facades WHERE building_id=? AND asset_id=? AND version=?)",f.asset_id,f.id,id,expected+1),
              photos.stmt('UPDATE cities SET revision=revision+1 WHERE id=?',city),
            ]);
            if((await photos.facade(city,player.id)).asset_id!==id)throw new ApiError(409,'photo_conflict');
            old=f.asset_id?await photos.stmt('SELECT * FROM photo_assets WHERE id=?',f.asset_id).first<Asset>():null;
            result={duplicate:false};
          }
        }else if(!f.asset_id)result={removed:true,pending:false};
        else{
          if(f.version!==expected)throw new ApiError(409,'photo_conflict');
          old=await photos.stmt('SELECT * FROM photo_assets WHERE id=?',f.asset_id).first<Asset>();
          await context.db!.batch([
            photos.stmt('UPDATE building_facades SET asset_id=NULL,version=version+1 WHERE building_id=? AND version=?',f.id,expected),
            photos.stmt("UPDATE photo_assets SET status='revoked' WHERE id=?",f.asset_id),
            photos.stmt('UPDATE cities SET revision=revision+1 WHERE id=?',city),
          ]);
          result={removed:true,pending:false};
        }
        const snapshot=await new CityStore(context.db!,context.scope).snapshot(city,city!=='public'||context.publicWriteOpen,url.searchParams.get('scope')==='all'?undefined:player.id);
        snapshot.photoWriteOpen=city!=='public'||context.publicPhotosOpen;
        return {result,old,snapshot};
      },writeDay);
      if(output.old)try{await photos.deleteFiles(output.old,context);}catch{output.result.pending=true;}
      await gameOperation(context,async()=>{},writeDay);
      return json({...output.result,snapshot:output.snapshot});
    }
    throw new ApiError(404,'route_not_found');
  }catch(error){return error instanceof ApiError?json({error:error.code},error.status):json({error:'photo_service_unavailable'},503);}
}
