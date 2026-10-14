import type {D1Database} from '@cloudflare/workers-types';
import {shanghaiMidnight} from '../core/photo.ts';
import {ensureGameDay} from './daily-reset.ts';
import {ApiError} from './policy.ts';

export interface BoundaryContext {
  db?:D1Database;
  now?:()=>number;
  boundary?:<T>(job:()=>Promise<T>)=>Promise<T>;
  photoIO?:<T>(createdAt:number,job:()=>Promise<T>)=>Promise<T>;
}
/** Capture again after slow input, and reject a day change before committing. */
export async function gameOperation<T>(context:BoundaryContext,job:(now:number,day:Awaited<ReturnType<typeof ensureGameDay>>)=>Promise<T>,expectedDay?:number):Promise<T>{
  const execute=async()=>{
    const now=(context.now??Date.now)(),day=shanghaiMidnight(now);
    if(!context.db)throw new ApiError(503,'storage_unavailable');
    const dayState=await ensureGameDay(context.db,now);
    if(expectedDay!==undefined&&expectedDay!==day)throw new ApiError(410,'city_reset');
    const result=await job(now,dayState);
    if(shanghaiMidnight((context.now??Date.now)())!==day)throw new ApiError(410,'city_reset');
    return result;
  };
  return context.boundary?context.boundary(execute):execute();
}
