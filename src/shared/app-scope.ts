/** Root defaults belong to the unchanged Sites contract; Docker supplies its scope. */
export interface AppScope {gameId:string;basePath:string;publicOnly:boolean}
export const ROOT_SCOPE:AppScope={gameId:'skyline',basePath:'/',publicOnly:false};
export function gameScope(gameId:string,allowTestCities=false):AppScope{
  if(!/^[a-z][a-z0-9-]{0,31}$/.test(gameId))throw Error('invalid_game_id');
  return {gameId,basePath:`/${gameId}/`,publicOnly:!allowTestCities};
}
export function parseAppScope(value:unknown):AppScope{
  if(value===undefined)return {...ROOT_SCOPE};
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('invalid_app_scope');
  const raw=value as Record<string,unknown>;
  if(raw.gameId==='skyline'&&raw.basePath==='/'&&raw.publicOnly===false)return {...ROOT_SCOPE};
  const scope=gameScope(String(raw.gameId),raw.publicOnly===false);
  if(raw.basePath!==scope.basePath||typeof raw.publicOnly!=='boolean')throw Error('invalid_app_scope');
  return scope;
}
export function appPath(route:string,scope:AppScope=ROOT_SCOPE){
  if(!route.startsWith('/')||route.startsWith('//')||route.includes('\\'))throw Error('invalid_app_route');
  return scope.basePath==='/'?route:scope.basePath.slice(0,-1)+route;
}
export function cookiePolicy(scope:AppScope=ROOT_SCOPE){
  return {name:scope.basePath==='/'?'skyline_player':scope.gameId+'_session',path:scope.basePath};
}
export function credential(request:Request,scope:AppScope=ROOT_SCOPE){
  const {name}=cookiePolicy(scope);
  const matches=(request.headers.get('cookie')??'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
  if(matches.length!==1)return undefined;
  const token=matches[0].slice(name.length+1);
  return /^[a-f0-9]{64}$/.test(token)?token:undefined;
}
export function assertParameters(url:URL,scope:AppScope){
  if(scope.basePath==='/')return;
  const seen=new Set<string>();
  for(const key of url.searchParams.keys()){if(seen.has(key))throw Error('ambiguous_parameters');seen.add(key);}
  if(scope.publicOnly&&url.searchParams.has('city')&&url.searchParams.get('city')!=='public')throw Error('invalid_city');
}
let browserScope:AppScope={...ROOT_SCOPE};
export function setBrowserScope(scope:AppScope){browserScope=scope;}
export const browserPath=(route:string)=>appPath(route,browserScope);
export const preferenceKey=(key:string)=>browserScope.basePath==='/'?'skyline-'+key:browserScope.gameId+':'+key;
