import {facadePreviewRects} from '../core/facade.ts';
import {cloneTower,type TowerModel} from '../core/tower.ts';
import type {PhotoDecoration} from '../core/photo.ts';
import {DRAFT_TTL_MS,nextShanghaiMidnight} from '../core/photo.ts';
export interface ChosenPhoto {blob:Blob;preview:PhotoDecoration;uploadKey:string;draftId?:string}
export class PhotoEditor {
 private target?:TowerModel;
 private validTarget:()=>boolean=()=>false;
 private wall!:HTMLCanvasElement;
 private mask!:HTMLCanvasElement;
 private dialog:HTMLDialogElement;
 private canvas:HTMLCanvasElement;
 private input:HTMLInputElement;
 private zoom:HTMLInputElement;
 private consent:HTMLInputElement;
 private image?:CanvasImageSource;
 private closeImage?:()=>void;
 private width=0;private height=0;private scale=1;private x=0;private y=0;
 private drag?:{pointer:number;x:number;y:number};
 private generation=0;private disposed=false;
 private current?:ChosenPhoto;
 private publish=false;
 private context:'result'|'own'='result';
 private urls=new Set<string>();
 constructor(readonly root:HTMLElement,readonly onChoose:(photo:ChosenPhoto,context:'result'|'own')=>void,readonly note:(message:string)=>void){
  const get=<E extends HTMLElement>(id:string)=>root.querySelector('#'+id) as E;
  this.wall=get('photo-wall');this.mask=get('photo-mask');this.dialog=get('photo-dialog');this.canvas=get('photo-canvas');this.input=get('photo-file');this.zoom=get('photo-zoom');this.consent=get('photo-consent');
  this.input.onchange=()=>{const file=this.input.files?.[0];if(file)void this.open(file);this.input.value='';};
  this.zoom.oninput=()=>{this.scale=Number(this.zoom.value);this.paint();};
  this.canvas.onpointerdown=e=>{if(e.isPrimary){this.drag={pointer:e.pointerId,x:e.clientX,y:e.clientY};this.canvas.setPointerCapture(e.pointerId);}};
  this.canvas.onpointermove=e=>{if(this.drag?.pointer!==e.pointerId)return;const bounds=this.canvas.getBoundingClientRect();this.x+=(e.clientX-this.drag.x)*512/bounds.width;this.y+=(e.clientY-this.drag.y)*768/bounds.height;this.drag={pointer:e.pointerId,x:e.clientX,y:e.clientY};this.paint();};
  this.canvas.onpointerup=this.canvas.onpointercancel=()=>{this.drag=undefined;};
  const cancel=()=>{this.generation++;this.dialog.close();this.releaseImage();};
  get('photo-cancel').onclick=cancel;get('photo-cancel-bottom').onclick=cancel;
  this.dialog.oncancel=()=>{this.generation++;this.releaseImage();};
  get('photo-apply').onclick=()=>void this.apply();
 }
 choose(context:'result'|'own',publish:boolean,model:TowerModel,valid:()=>boolean){this.invalidate();this.target=cloneTower(model);this.validTarget=valid;this.context=context;this.publish=publish;this.input.click();}
 invalidate(){this.generation++;this.dialog.close();this.releaseImage();this.target=undefined;this.validTarget=()=>false;}
 get selected(){return this.current;}
 clear(){this.current=undefined;this.invalidate();}
 private releaseImage(){this.closeImage?.();this.closeImage=undefined;this.image=undefined;}
 private async open(file:File){
  if(!this.validTarget())return;
  if(file.size>20*1024*1024){this.note('照片较大，请选择20MB以内的图片。');return;}
  const generation=++this.generation;this.releaseImage();
  try{
   let image:CanvasImageSource,w:number,h:number,release:()=>void;
   try{const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});image=bitmap;w=bitmap.width;h=bitmap.height;release=()=>bitmap.close();}
   catch{
    const url=URL.createObjectURL(file),element=new Image();element.src=url;
    try{await element.decode();}catch{URL.revokeObjectURL(url);throw Error('decode');}
    image=element;w=element.naturalWidth;h=element.naturalHeight;release=()=>URL.revokeObjectURL(url);
   }
   if(this.disposed||generation!==this.generation||!this.validTarget()){release();return;}
   if(!w||!h||w*h>24_000_000){release();throw Error('size');}
   this.image=image;this.width=w;this.height=h;this.closeImage=release;
   this.scale=1;this.x=0;this.y=0;this.zoom.value='1';this.consent.checked=false;
   this.consent.closest<HTMLElement>('label')!.hidden=!this.publish;
   (this.root.querySelector('#photo-error') as HTMLElement).textContent='';
   this.paint();this.dialog.showModal();
  }catch{this.note('这张图片暂时无法处理，请换一张JPEG、PNG或WebP照片。');}
 }
 private paint(){
  if(!this.image)return;const factor=Math.max(512/this.width,768/this.height)*this.scale,w=this.width*factor,h=this.height*factor;
  this.x=Math.max(-(w-512)/2,Math.min((w-512)/2,this.x));this.y=Math.max(-(h-768)/2,Math.min((h-768)/2,this.y));
  const ctx=this.canvas.getContext('2d')!;ctx.fillStyle='#fff';ctx.fillRect(0,0,512,768);ctx.drawImage(this.image,256-w/2+this.x,384-h/2+this.y,w,h);this.paintPreview();
 }
 private paintPreview(){
  if(!this.target)return;
  const rects=facadePreviewRects(this.target),ctx=this.wall.getContext('2d')!,mask=this.mask.getContext('2d')!;
  mask.clearRect(0,0,512,768);mask.fillStyle='rgba(20,39,55,.55)';mask.fillRect(0,0,512,768);
  ctx.fillStyle='#e8f0ed';ctx.fillRect(0,0,this.wall.width,this.wall.height);
  if(!rects.length)return;
  const left=Math.min(...rects.map(r=>r.x)),right=Math.max(...rects.map(r=>r.x+r.width)),height=this.target.layers.length*this.target.layerHeight;
  const scale=Math.min((this.wall.width-24)/(right-left),(this.wall.height-24)/height),ox=(this.wall.width-(right-left)*scale)/2,oy=(this.wall.height-height*scale)/2;
  for(const r of rects){mask.clearRect(r.sx,r.sy,r.sw,r.sh);ctx.drawImage(this.canvas,r.sx,r.sy,r.sw,r.sh,ox+(r.x-left)*scale,oy+(height-r.y-r.height)*scale,r.width*scale,r.height*scale);}
 }
 private async apply(){
  if(!this.validTarget()){this.invalidate();this.note('作品已更新，请重新选择照片。');return;}
  const error=this.root.querySelector('#photo-error') as HTMLElement;
  if(this.publish&&!this.consent.checked){error.textContent='勾选确认后，再使用这张照片。';return;}
  const generation=this.generation;
  try{
   let blob:Blob|null=null;
   for(const quality of [.85,.75,.65,.55]){blob=await new Promise<Blob|null>(resolve=>this.canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=256*1024)break;}
   if(!blob||blob.size>256*1024)throw Error('size');
   if(this.disposed||generation!==this.generation||!this.validTarget())return;
   const id=crypto.randomUUID(),url=URL.createObjectURL(blob);this.urls.add(url);
   const chosen:ChosenPhoto={blob,uploadKey:id,preview:{id,version:1,imageUrl:url,thumbnailUrl:url,expiresAt:Math.min(Date.now()+DRAFT_TTL_MS,nextShanghaiMidnight())}};
   this.current=chosen;this.dialog.close();this.releaseImage();this.onChoose(chosen,this.context);
  }catch{error.textContent='这张照片暂时无法压缩，请换一张或跳过。';}
 }
 dispose(){this.disposed=true;this.generation++;this.releaseImage();for(const url of this.urls)URL.revokeObjectURL(url);this.urls.clear();this.dialog.close();}
}
