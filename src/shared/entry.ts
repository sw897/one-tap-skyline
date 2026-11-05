export interface EntryInfo {releaseId:string;dayStart:number;resetAt:number;entry:string}
export function mobileEntryUrl(origin:string,info:EntryInfo,city='public',scope:AppScope=ROOT_SCOPE){
 const url=new URL(appPath('/?mode=shared',scope),origin);if(city!=='public')url.searchParams.set('city',city);
 url.searchParams.set('v',info.releaseId);url.searchParams.set('entry',info.entry);return url;
}
export interface UpdateState {starting:boolean;submitting:boolean;photoBusy:boolean;playing:boolean;unsaved:boolean;photoPending:boolean}
export const canUpdate=(s:UpdateState)=>!Object.values(s).some(Boolean);
import {appPath,ROOT_SCOPE,type AppScope} from './app-scope.ts';
