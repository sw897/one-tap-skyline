export interface EntryInfo {releaseId:string;dayStart:number;resetAt:number;entry:string}
export function mobileEntryUrl(origin:string,info:EntryInfo,city='public'){
 const url=new URL('/?mode=shared',origin);if(city!=='public')url.searchParams.set('city',city);
 url.searchParams.set('v',info.releaseId);url.searchParams.set('entry',info.entry);return url;
}
export interface UpdateState {starting:boolean;submitting:boolean;photoBusy:boolean;playing:boolean;unsaved:boolean;photoPending:boolean}
export const canUpdate=(s:UpdateState)=>!Object.values(s).some(Boolean);
