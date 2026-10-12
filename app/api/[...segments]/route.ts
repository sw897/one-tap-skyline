import { env } from 'cloudflare:workers';
import { handleApi } from '../../../src/server/service';
export const dynamic='force-dynamic';
const handle=(request:Request)=>handleApi(request,{db:env.DB,publicWriteOpen:env.SKYLINE_PUBLIC_WRITE_OPEN==='1',cityName:env.CITY_DISPLAY_NAME});
export const GET=handle;
export const POST=handle;
