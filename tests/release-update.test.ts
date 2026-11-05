import test from 'node:test';import assert from 'node:assert/strict';
import {ReleaseUpdate} from '../src/ui/release-update.ts';
import {RELEASE_ID} from '../src/release.ts';
test('actual update prompt preserves entry and cannot reload while a run or photo is pending',async()=>{
 const before={document:globalThis.document,window:globalThis.window,location:globalThis.location,fetch:globalThis.fetch};let replaced='',state={starting:false,submitting:false,photoBusy:false,playing:true,unsaved:false,photoPending:false};
 const nodes=new Map<string,any>();for(const id of ['#release-update','#release-update-button','#release-update-note'])nodes.set(id,{hidden:true,disabled:false,textContent:'',onclick:null});
 globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}} as unknown as Document;
 globalThis.window={addEventListener(){},removeEventListener(){}} as unknown as Window&typeof globalThis;
 globalThis.location={href:'https://skyline.test/?mode=shared&entry=admitted&v=older',replace:(url:string)=>{replaced=url;}} as unknown as Location;
 let fail=false;globalThis.fetch=async()=>{if(fail)throw Error('simulated metadata outage');return Response.json({releaseId:RELEASE_ID+'-new',dayStart:1,resetAt:2,entry:'daily-current'});};
 let metadata=0;const updates=new ReleaseUpdate({querySelector:(id:string)=>nodes.get(id)} as unknown as HTMLElement,'public',()=>state,()=>metadata++);
 try{assert.equal(await updates.check(),false);assert.equal(metadata,1);const button=nodes.get('#release-update-button');assert.equal(button.disabled,true);button.onclick();assert.equal(replaced,'');state={...state,playing:false,photoPending:true};updates.paint();assert.equal(button.disabled,true);state={...state,photoPending:false};updates.paint();assert.equal(button.disabled,false);button.onclick();const url=new URL(replaced);assert.equal(url.searchParams.get('v'),RELEASE_ID+'-new');assert.equal(url.searchParams.get('entry'),'admitted');fail=true;assert.equal(await updates.check(),false);}finally{updates.dispose();Object.assign(globalThis,before);}
});
