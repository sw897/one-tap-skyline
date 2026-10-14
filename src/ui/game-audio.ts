import {cueUri} from './cue-wave.ts';
export type LandingCue='trimmed'|'perfect'|'miss';
export interface Tone {frequency:number;end:number;delay:number;length:number;gain:number;type:OscillatorType}
export function cueTones(kind:LandingCue,combo=0,milestone=3):Tone[]{
  const step=Math.min(4,Math.max(0,combo-milestone+1)),pitch=2**(step/12);
  if(kind==='perfect')return [{frequency:660*pitch,end:720*pitch,delay:0,length:.15,gain:.13,type:'triangle'},{frequency:990*pitch,end:1080*pitch,delay:.075,length:.2,gain:.10,type:'sine'}];
  if(kind==='miss')return [{frequency:390,end:230,delay:0,length:.22,gain:.11,type:'triangle'}];
  return [{frequency:460,end:340,delay:0,length:.17,gain:.14,type:'triangle'}];
}
/** Audible phone-range cues, with bounded resumes and no late sound backlog. */
export class GameAudio {
  muted=false;
  private context?:AudioContext;private voices=new Set<OscillatorNode>();
  private generation=0;private disposed=false;
  private media:HTMLAudioElement[]=[];private mediaIndex=0;private mediaTokens=new Map<HTMLAudioElement,number>();
  private cache=new Map<string,string>();private useMedia=false;private primed=false;
  private pending?:{element:HTMLAudioElement;token:number;at:number;preview:boolean};
  private timers=new Set<ReturnType<typeof setTimeout>>();
  private status:(message:string)=>void;
  constructor(status:(message:string)=>void=()=>{}){
    this.status=status;
    try{this.muted=localStorage.getItem('skyline-muted')==='1';}catch{/* optional preference */}
    // iPhone browsers share WebKit's output restrictions. iPad desktop mode also applies.
    this.useMedia=/iPhone|iPad|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
  }
  unlock(){
    if(this.muted||this.disposed||document.hidden)return;
    try{
      if(this.useMedia){
        this.ensureMedia();
        if(!this.primed){this.primed=true;const element=this.media[0];element.src=this.source([]);void element.play().catch(()=>{this.primed=false;});}
        return;
      }
      const audioWindow=window as unknown as {AudioContext?:typeof AudioContext;webkitAudioContext?:typeof AudioContext};
      const Constructor=audioWindow.AudioContext??audioWindow.webkitAudioContext;
      if(!Constructor){this.useMedia=true;this.unlock();return;}
      if(!this.context||this.context.state==='closed')this.context=new Constructor();
      void this.context.resume().catch(()=>{});
    }catch{/* visual fallback */ }
  }
  /** A touch's release is a valid activation even when its pointerdown was rejected. */
  gesture(){
    const pending=this.pending;
    if(!pending||this.disposed||this.muted||document.hidden)return;
    if(performance.now()-pending.at>(pending.preview?1200:150)){pending.element.pause();this.pending=undefined;return;}
    if(pending.element.paused)this.startMedia(pending);
  }
  toggle(){this.muted=!this.muted;try{localStorage.setItem('skyline-muted',this.muted?'1':'0');}catch{/* optional preference */}if(this.muted)this.stop();else this.unlock();return this.muted;}
  landed(kind:LandingCue,combo:number,milestone:number){
    if(this.muted||this.disposed||document.hidden)return;
    if(this.useMedia){this.playMedia(cueTones(kind,combo,milestone),false);return;}
    this.unlock();const ctx=this.context;if(!ctx)return;
    const token=++this.generation,started=performance.now(),tones=cueTones(kind,combo,milestone);
    const play=()=>{if(this.disposed||this.muted||document.hidden||token!==this.generation||performance.now()-started>150||ctx.state!=='running')return;this.play(ctx,tones);};
    if(ctx.state==='running')play();else void ctx.resume().then(play).catch(()=>{});
  }
  preview(){
    if(this.muted){this.status('音效已关闭，请先开启。');return;}
    if(this.disposed||document.hidden)return;
    const tones=[...cueTones('trimmed'),...cueTones('perfect').map(t=>({...t,delay:t.delay+.45}))];
    this.status('正在启动试听…');
    if(this.useMedia){this.playMedia(tones,true);return;}
    this.unlock();if(this.useMedia){this.playMedia(tones,true);return;}
    const ctx=this.context;if(!ctx){this.status('浏览器未能启动音频，请点击试听重试。');return;}
    const token=++this.generation,at=performance.now();
    const timer=this.later(()=>{if(token===this.generation)this.status('浏览器未能启动音频，请点击试听重试。');},1200);
    const play=()=>{if(this.disposed||this.muted||document.hidden||token!==this.generation||performance.now()-at>1200||ctx.state!=='running')return;this.cancelTimer(timer);this.play(ctx,tones);this.status('试听已启动；若无声，请检查媒体音量和蓝牙输出。');};
    if(ctx.state==='running')play();else void ctx.resume().then(play).catch(()=>{if(token===this.generation)this.status('浏览器未能启动音频，请点击试听重试。');});
  }
  private source(tones:Tone[]){const key=JSON.stringify(tones);let uri=this.cache.get(key);if(!uri){uri=cueUri(tones);this.cache.set(key,uri);}return uri;}
  private ensureMedia(){if(this.media.length)return;for(let i=0;i<4;i++){const element=new Audio();element.preload='auto';this.media.push(element);}}
  private playMedia(tones:Tone[],preview:boolean){
    try{
      this.ensureMedia();const element=this.media[this.mediaIndex++%this.media.length];element.pause();element.src=this.source(tones);element.volume=1;
      const pending={element,token:++this.generation,at:performance.now(),preview};this.mediaTokens.set(element,pending.token);this.pending=pending;
      this.startMedia(pending);
    }catch{if(preview)this.status('浏览器未能启动音频，请点击试听重试。');}
  }
  private startMedia(pending:NonNullable<GameAudio['pending']>){
    const {element,token,preview}=pending;
    const timer=this.later(()=>{
      if(this.mediaTokens.get(element)!==token)return;
      element.pause();if(this.pending===pending)this.pending=undefined;
      if(preview&&token===this.generation)this.status('浏览器未能启动音频，请点击试听重试。');
    },preview?1200:150);
    try{void element.play().then(()=>{
      this.cancelTimer(timer);if(this.mediaTokens.get(element)!==token)return;
      if(this.disposed||this.muted||document.hidden||performance.now()-pending.at>(preview?1200:150)){element.pause();return;}
      if(this.pending===pending)this.pending=undefined;
      if(preview&&token===this.generation)this.status('试听已启动；若无声，请检查媒体音量和蓝牙输出。');
    }).catch(()=>{this.cancelTimer(timer);if(preview&&token===this.generation)this.status('浏览器未能启动音频，请点击试听重试。');});}
    catch{this.cancelTimer(timer);if(preview)this.status('浏览器未能启动音频，请点击试听重试。');}
  }
  private later(callback:()=>void,ms:number){const timer=setTimeout(()=>{this.timers.delete(timer);callback();},ms);this.timers.add(timer);return timer;}
  private cancelTimer(timer:ReturnType<typeof setTimeout>){clearTimeout(timer);this.timers.delete(timer);}
  private play(ctx:AudioContext,tones:Tone[]){
    if(this.voices.size+tones.length>8)this.stopVoices();
    for(const tone of tones)try{
      const osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime+tone.delay;osc.type=tone.type;
      osc.frequency.setValueAtTime(tone.frequency,t);osc.frequency.exponentialRampToValueAtTime(tone.end,t+tone.length*.7);
      gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(tone.gain,t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+tone.length);
      osc.connect(gain);gain.connect(ctx.destination);this.voices.add(osc);
      osc.onended=()=>{this.voices.delete(osc);osc.disconnect();gain.disconnect();};osc.start(t);osc.stop(t+tone.length+.01);
    }catch{/* cues never block placement */ }
  }
  private stopVoices(){for(const osc of this.voices)try{osc.stop();}catch{/* already stopped */}this.voices.clear();}
  stop(){this.generation++;this.stopVoices();this.pending=undefined;this.mediaTokens.clear();for(const timer of this.timers)clearTimeout(timer);this.timers.clear();for(const element of this.media)element.pause();}
  dispose(){this.disposed=true;this.stop();for(const element of this.media){element.removeAttribute('src');element.load();}this.media=[];void this.context?.close().catch(()=>{});}
}
export function landingHaptic(kind:LandingCue){
  if(document.hidden||typeof navigator.vibrate!=='function')return false;
  try{return navigator.vibrate(kind==='perfect'?[15,30,15]:kind==='miss'?25:12);}catch{return false;}
}
