import type {Tone} from './game-audio.ts';

/** Small, original PCM cues: the media path uses the same pitches/envelope as Web Audio. */
export function cueWave(tones:Tone[],rate=44100):Uint8Array{
  const duration=Math.max(.01,...tones.map(t=>t.delay+t.length+.01));
  const count=Math.ceil(duration*rate),bytes=new Uint8Array(44+count*2),view=new DataView(bytes.buffer);
  const text=(at:number,s:string)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i);};
  text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVE');text(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);
  text(36,'data');view.setUint32(40,count*2,true);
  const phases=tones.map(()=>0);
  for(let i=0;i<count;i++){
    let sample=0;
    tones.forEach((tone,index)=>{
      const t=i/rate-tone.delay;if(t<0||t>=tone.length)return;
      const ramp=Math.min(1,t/(tone.length*.7)),frequency=tone.frequency*(tone.end/tone.frequency)**ramp;
      const envelope=t<.008?.0001*(tone.gain/.0001)**(t/.008):tone.gain*(.0001/tone.gain)**((t-.008)/(tone.length-.008));
      const phase=phases[index];sample+=(tone.type==='triangle'?2/Math.PI*Math.asin(Math.sin(phase)):Math.sin(phase))*envelope;
      phases[index]+=2*Math.PI*frequency/rate;
    });
    view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,sample))*32767),true);
  }
  return bytes;
}
export function cueUri(tones:Tone[]):string{
  const bytes=cueWave(tones);let binary='';
  for(let start=0;start<bytes.length;start+=8192)binary+=String.fromCharCode(...bytes.subarray(start,start+8192));
  return 'data:audio/wav;base64,'+btoa(binary);
}
