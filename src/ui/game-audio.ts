export type LandingCue='trimmed'|'perfect'|'miss';
interface Tone {frequency:number;end:number;delay:number;length:number;gain:number;type:OscillatorType}
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
  constructor(){try{this.muted=localStorage.getItem('skyline-muted')==='1';}catch{/* optional preference */}}
  unlock(){
    if(this.muted||this.disposed)return;
    try{
      const audioWindow=window as unknown as {AudioContext?:typeof AudioContext;webkitAudioContext?:typeof AudioContext};
      const Constructor=audioWindow.AudioContext??audioWindow.webkitAudioContext;
      if(!Constructor)return;if(!this.context||this.context.state==='closed')this.context=new Constructor();
      void this.context.resume().catch(()=>{});
    }catch{/* visual fallback */ }
  }
  toggle(){this.muted=!this.muted;try{localStorage.setItem('skyline-muted',this.muted?'1':'0');}catch{/* optional preference */}if(this.muted)this.stop();else this.unlock();return this.muted;}
  landed(kind:LandingCue,combo:number,milestone:number){
    if(this.muted||this.disposed||document.hidden)return;
    this.unlock();const ctx=this.context;if(!ctx)return;
    const token=++this.generation,started=performance.now(),tones=cueTones(kind,combo,milestone);
    const play=()=>{if(this.disposed||this.muted||document.hidden||token!==this.generation||performance.now()-started>150||ctx.state!=='running')return;this.play(ctx,tones);};
    if(ctx.state==='running')play();else void ctx.resume().then(play).catch(()=>{});
  }
  preview(){this.unlock();const ctx=this.context;if(!ctx||this.muted)return;
    const token=++this.generation;void ctx.resume().then(()=>{if(this.disposed||this.muted||document.hidden||token!==this.generation||ctx.state!=='running')return;this.play(ctx,[...cueTones('trimmed'),...cueTones('perfect').map(t=>({...t,delay:t.delay+.45}))]);}).catch(()=>{});
  }
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
  stop(){this.generation++;this.stopVoices();}
  dispose(){this.disposed=true;this.stop();void this.context?.close().catch(()=>{});}
}
export function landingHaptic(kind:LandingCue){
  if(document.hidden||typeof navigator.vibrate!=='function')return false;
  try{return navigator.vibrate(kind==='perfect'?[15,30,15]:kind==='miss'?25:12);}catch{return false;}
}
