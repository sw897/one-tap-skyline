import { env } from 'cloudflare:workers';
import { handleApi } from '../../../src/server/service';
import {serverRuntime} from '../../../src/server/runtime';
import {waterfrontLayout} from '../../../src/core/layout';
export const dynamic='force-dynamic';
const handle=(request:Request)=>{const config=serverRuntime(env);return handleApi(request,{db:env.DB,bucket:env.BUCKET,publicWriteOpen:env.SKYLINE_PUBLIC_WRITE_OPEN==='1',publicPhotosOpen:env.SKYLINE_PUBLIC_PHOTOS_OPEN==='1',cityName:config.cityDisplayName,layout:waterfrontLayout(config.city.openDistricts,config.city.capacities)});};
export const GET=handle;
export const POST=handle;
