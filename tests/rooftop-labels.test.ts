import test from 'node:test';import assert from 'node:assert/strict';
import {CityLabels} from '../src/ui/city-labels.ts';import {fixtureTower} from '../src/core/tower.ts';
test('names stay at roof anchors without layout reads, leader lines or count substitutions',()=>{
 const previous=globalThis.document;const nodes:any[]=[];let focused='';
 const root={append(n:any){nodes.push(n);}} as unknown as HTMLElement;
 globalThis.document={createElement(){return {hidden:false,textContent:'',title:'',style:{transform:''},classList:{toggle(){}},remove(){},getBoundingClientRect(){throw Error('No layout reads allowed');}};},createElementNS(){throw Error('No leader lines allowed');}} as unknown as Document;
 try{const labels=new CityLabels(root,id=>focused=id),building={playerId:'one',plotId:1,name:'模拟楼名',color:'#75aaff',tower:fixtureTower(12),bestRunId:'one',source:'fixture' as const,rank:1};labels.set([building]);labels.update(1,()=>({x:120,y:80,visible:true}));assert.equal(nodes.length,1);assert.equal(nodes[0].textContent,building.name);assert.equal(nodes[0].style.transform,'translate(120px,80px) translate(-50%,-100%)');nodes[0].onclick();assert.equal(focused,'one');labels.update(2,()=>({x:0,y:0,visible:false}));assert.equal(nodes[0].hidden,true);labels.clear();}finally{globalThis.document=previous;}
});
