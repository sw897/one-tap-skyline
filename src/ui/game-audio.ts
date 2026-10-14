/** Small synthesized cues: no audio asset, timer dependency, or delayed backlog. */
export class GameAudio {
  muted=false;
  private context?:AudioContext;
  private voices=new Set<OscillatorNode>();
  constructor(){try{this.muted=localStorage.getItem('skyline-muted')==='1';}catch{/* storage can be unavailable */}}
  unlock(){
    if(this.muted)return;
    try{this.context??=new AudioContext();void this.context.resume().catch(()=>{});}catch{/* silent fallback */}
  }
  toggle(){this.muted=!this.muted;try{localStorage.setItem('skyline-muted',this.muted?'1':'0');}catch{/* optional preference */}if(this.muted)this.stop();else this.unlock();return this.muted;}
  landed(perfect:boolean,combo:number,milestone:number){
    const ctx=this.context;if(this.muted||document.hidden||ctx?.state!=='running')return;
    // Bound simultaneous voices even during rapid taps.
    if(this.voices.size>=4)this.stop();
    try{
      const osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime;
      const step=perfect?Math.min(4,Math.max(0,combo-milestone+1)):0;
      osc.type=perfect?'sine':'triangle';osc.frequency.setValueAtTime(perfect?520*2**(step/12):170,t);
      osc.frequency.exponentialRampToValueAtTime(perfect?700*2**(step/12):95,t+.09);
      gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(perfect?.055:.032,t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+.15);
      osc.connect(gain);gain.connect(ctx.destination);this.voices.add(osc);
      osc.onended=()=>{this.voices.delete(osc);osc.disconnect();gain.disconnect();};osc.start(t);osc.stop(t+.16);
    }catch{/* sound never blocks placement */}
  }
  stop(){for(const osc of this.voices)try{osc.stop();}catch{/* already stopped */}this.voices.clear();}
  dispose(){this.stop();void this.context?.close().catch(()=>{});}
}
