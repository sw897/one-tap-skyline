import {parseRuntimeConfig} from '../config.ts';
export interface RuntimeEnvironment {
  CITY_DISPLAY_NAME?:string; SKYLINE_OPEN_DISTRICTS?:string; SKYLINE_DISTRICT_CAPACITIES?:string;
  SKYLINE_VISUAL_CONFIG?:string;
}
const parse=(value:string|undefined)=>{try{return value?JSON.parse(value):undefined;}catch{return undefined;}};
export function serverRuntime(env:RuntimeEnvironment){
  return parseRuntimeConfig({cityDisplayName:env.CITY_DISPLAY_NAME,
    city:{openDistricts:Number(env.SKYLINE_OPEN_DISTRICTS??6),capacities:parse(env.SKYLINE_DISTRICT_CAPACITIES)},
    visual:parse(env.SKYLINE_VISUAL_CONFIG)});
}
