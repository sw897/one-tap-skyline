/** A decoration only: tower geometry and score are independent. */
export interface PhotoDecoration { id:string; version:number; imageUrl:string; thumbnailUrl:string; expiresAt:number }
export interface PhotoDraft { id:string; expiresAt:number; bytes:number }
export const DAY_MS=86_400_000;
export const DRAFT_TTL_MS=4*3_600_000;
export const PHOTO_TTL_MS=24*3_600_000;
export function shanghaiMidnight(now=Date.now()){return Math.floor((now+8*3_600_000)/DAY_MS)*DAY_MS-8*3_600_000;}
export function nextShanghaiMidnight(now=Date.now()){return shanghaiMidnight(now)+DAY_MS;}
export function photoKey(photo?:PhotoDecoration|null){return photo&&photo.expiresAt>Date.now()?photo.id+':'+photo.version:'';}
