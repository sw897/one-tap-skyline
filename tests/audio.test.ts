import test from 'node:test';
import assert from 'node:assert/strict';
import {GameAudio,cueTones} from '../src/ui/game-audio.ts';
import {cueWave} from '../src/ui/cue-wave.ts';

test('media PCM has a valid mono WAV header, audible samples and distinct bounded cues',()=>{
  const signatures=[];
  for(const kind of ['trimmed','perfect','miss'] as const){
    const bytes=cueWave(cueTones(kind)),view=new DataView(bytes.buffer);
    assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'RIFF');assert.equal(view.getUint32(4,true),bytes.length-8);
    assert.equal(view.getUint32(24,true),44100);assert.equal(view.getUint16(22,true),1);assert.equal(view.getUint16(34,true),16);
    assert.equal(view.getUint32(40,true),bytes.length-44);
    let energy=0,peak=0;for(let i=44;i<bytes.length;i+=2){const value=view.getInt16(i,true)/32767;energy+=value*value;peak=Math.max(peak,Math.abs(value));}
    assert.ok(Math.sqrt(energy/((bytes.length-44)/2))>.01);assert.ok(peak>.09&&peak<1);
    signatures.push(bytes.length);
  }
  assert.equal(new Set(signatures).size,3);assert.deepEqual(cueWave(cueTones('perfect',8)),cueWave(cueTones('perfect',100)));
});

class Media{
  static all:Media[]=[];static blocked=false;
  src='';preload='';volume=1;paused=true;plays=0;
  constructor(){Media.all.push(this);}
  play(){this.plays++;if(Media.blocked)return Promise.reject(new Error('NotAllowedError'));this.paused=false;return Promise.resolve();}
  pause(){this.paused=true;}removeAttribute(){this.src='';}load(){}
}
async function environment(iphone:boolean,run:()=>Promise<void>|void,context?:unknown){
  const values={window:{AudioContext:context},document:{hidden:false},navigator:{userAgent:iphone?'iPhone':'Chrome',platform:'',maxTouchPoints:0},localStorage:{getItem:()=>null,setItem:()=>{}},Audio:Media};
  const old=new Map<string,PropertyDescriptor|undefined>();Media.all=[];Media.blocked=false;
  for(const [key,value] of Object.entries(values)){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
  try{await run();}finally{for(const [key,descriptor] of old){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}}
}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};

test('iPhone preview requests actual media playback and reports request success',async()=>environment(true,async()=>{
  const status:string[]=[],audio=new GameAudio(s=>status.push(s));
  audio.preview();await settle();assert.equal(Media.all.length,4);assert.ok(Media.all[0].src.startsWith('data:audio/wav;base64,'));
  assert.equal(Media.all[0].plays,1);assert.ok(status.at(-1)?.startsWith('试听已启动'));audio.dispose();
}));
test('rejected touch-down media playback can retry on touch-end without placing another floor',async()=>environment(true,async()=>{
  const audio=new GameAudio();Media.blocked=true;audio.landed('perfect',3,3);await settle();
  assert.equal(Media.all[0].plays,1);assert.equal(Media.all[0].paused,true);
  Media.blocked=false;audio.gesture();await settle();assert.equal(Media.all[0].plays,2);assert.equal(Media.all[0].paused,false);audio.dispose();
}));
test('muting, hiding and disposal prevent later queued cues or previews',async()=>environment(true,async()=>{
  const status:string[]=[],audio=new GameAudio(s=>status.push(s));Media.blocked=true;audio.landed('trimmed',0,3);await settle();
  audio.toggle();Media.blocked=false;audio.gesture();audio.preview();assert.equal(Media.all[0].plays,1);assert.ok(status.at(-1)?.includes('已关闭'));
  audio.toggle();audio.stop();Object.defineProperty(document,'hidden',{value:true,writable:true});const before=Media.all.reduce((n,a)=>n+a.plays,0);audio.landed('miss',0,3);audio.preview();audio.gesture();
  assert.equal(Media.all.reduce((n,a)=>n+a.plays,0),before);Object.defineProperty(document,'hidden',{value:false,writable:true});audio.dispose();audio.preview();assert.ok(Media.all.every(a=>a.paused&&a.src===''));
}));
test('four media voices stay bounded and stop clears active playback',async()=>environment(true,async()=>{
  const audio=new GameAudio();for(let i=0;i<30;i++){audio.landed('perfect',i,3);await settle();}
  assert.equal(Media.all.length,4);assert.ok(Media.all.some(a=>!a.paused));audio.stop();assert.ok(Media.all.every(a=>a.paused));audio.dispose();
}));
test('a running Web Audio preview does not wait for another resume promise',async()=>{
  class RunningContext{
    state='running';currentTime=0;resumeCalls=0;resume(){this.resumeCalls++;return new Promise<void>(()=>{});}close(){return Promise.resolve();}
    createOscillator(){return {type:'sine',frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){},start(){},stop(){},onended:null};}
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
  }
  await environment(false,()=>{const messages:string[]=[],audio=new GameAudio(s=>messages.push(s));audio.preview();assert.ok(messages.at(-1)?.startsWith('试听已启动'));audio.dispose();},RunningContext);
});
test('missing Web Audio uses media, and failed preview exposes a retry message',async()=>environment(false,async()=>{
  const messages:string[]=[],audio=new GameAudio(s=>messages.push(s));audio.unlock();Media.blocked=true;audio.preview();await settle();
  assert.ok(messages.at(-1)?.includes('重试'));audio.dispose();
}));
test('a held touch never replays an expired landing cue',async t=>environment(true,async()=>{
  let now=0;t.mock.method(performance,'now',()=>now);
  const audio=new GameAudio();Media.blocked=true;audio.landed('trimmed',0,3);await settle();
  now=151;Media.blocked=false;audio.gesture();assert.equal(Media.all[0].plays,1);assert.equal(Media.all[0].paused,true);audio.dispose();
}));
test('unsettled media playback times out and cannot start sound late',async t=>environment(true,async()=>{
  t.mock.timers.enable({apis:['setTimeout']});let now=0;t.mock.method(performance,'now',()=>now);
  let resolve:()=>void=()=>{};t.mock.method(Media.prototype,'play',function(this:Media){this.plays++;return new Promise<void>(r=>{resolve=r;});});
  const messages:string[]=[],audio=new GameAudio(s=>messages.push(s));audio.preview();now=1201;t.mock.timers.tick(1200);
  assert.equal(Media.all[0].paused,true);assert.ok(messages.at(-1)?.includes('重试'));resolve();await settle();assert.equal(Media.all[0].paused,true);assert.ok(messages.at(-1)?.includes('重试'));audio.dispose();
}));
