import { env } from 'cloudflare:workers';
import { handleApi } from '../../../src/server/service';
export const dynamic='force-dynamic';
const handle=(request:Request)=>handleApi(request,{db:env.DB,bucket:env.BUCKET,publicWriteOpen:env.SKYLINE_PUBLIC_WRITE_OPEN==='1',publicPhotosOpen:env.SKYLINE_PUBLIC_PHOTOS_OPEN==='1',cityName:env.CITY_DISPLAY_NAME});
export const GET=handle;
export const POST=handle;
