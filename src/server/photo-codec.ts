import jpeg from 'jpeg-js';
import { ApiError } from './policy.ts';
const MAX_BYTES=512*1024;
export async function readPhotoBytes(request:Request){
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError(403,'same_origin_required');
  if(request.headers.get('content-type')?.split(';')[0]!=='image/jpeg')throw new ApiError(415,'jpeg_required');
  if(Number(request.headers.get('content-length'))>MAX_BYTES)throw new ApiError(413,'photo_too_large');
  const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'empty_photo');
  let size=0;const parts:Uint8Array[]=[];
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw new ApiError(413,'photo_too_large');}parts.push(value);}
  const result=new Uint8Array(size);let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;
}
export function normalizePhoto(bytes:Uint8Array){
  try{
    if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)throw Error('JPEG required');
    const decoded=jpeg.decode(bytes,{useTArray:true,maxResolutionInMP:1,maxMemoryUsageInMB:64,tolerantDecoding:false});
    if(decoded.width!==512||decoded.height!==768)throw Error('Expected crop size');
    // A new encoding stores pixels only; EXIF/GPS and uploader filenames are not retained.
    const pixels={data:decoded.data,width:decoded.width,height:decoded.height};
    let image=Uint8Array.from(jpeg.encode(pixels,85).data);
    for(const quality of [75,65,55]){if(image.length<=256*1024)break;image=Uint8Array.from(jpeg.encode(pixels,quality).data);}
    if(image.length>256*1024)throw Error('Encoded image exceeds budget');
    const thumb=new Uint8Array(128*192*4);
    for(let y=0;y<192;y++)for(let x=0;x<128;x++)for(let c=0;c<3;c++){
      let sum=0;for(let yy=0;yy<4;yy++)for(let xx=0;xx<4;xx++)sum+=decoded.data[((y*4+yy)*512+x*4+xx)*4+c];
      thumb[(y*128+x)*4+c]=Math.round(sum/16);
    }
    for(let at=3;at<thumb.length;at+=4)thumb[at]=255;
    const thumbnail=Uint8Array.from(jpeg.encode({data:thumb,width:128,height:192},75).data);
    return {image,thumbnail,width:512,height:768};
  }catch{throw new ApiError(400,'invalid_photo');}
}
