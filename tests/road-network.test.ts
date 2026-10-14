import test from 'node:test';
import assert from 'node:assert/strict';
import {waterfrontRoads} from '../src/core/roads.ts';
import {allPlots,districtsFor,waterfrontLayout} from '../src/core/layout.ts';
import {pointPlotDistance} from '../src/core/ground.ts';
import {insideIsland,islandPlan} from '../src/core/island.ts';

for(const layout of [waterfrontLayout(),waterfrontLayout(10,Array(10).fill(16))])test(`${allPlots(layout).length} plots have continuous district-to-loop roads with footprint clearance`,()=>{
  const before=JSON.stringify(allPlots(layout)),network=waterfrontRoads(layout),[ring]=network.roads,avenue=network.roads.find(r=>r.id==='avenue')!,plots=allPlots(layout),island=islandPlan(layout);
  assert.deepEqual(ring.points[0],ring.points.at(-1));
  for(const d of districtsFor(layout)){
    const street=network.roads.find(r=>r.id===`district-${d.id}`)!;
    for(const side of [0,1]){const link=network.roads.find(r=>r.id===`district-${d.id}-link-${side}`)!;
      assert.deepEqual(link.points[0],side?street.points.at(-1):street.points[0]);
      const targets=d.id===5&&side===1?[network.roads.find(r=>r.id==='district-4')!]:[ring,avenue];
      assert.ok(targets.flatMap(r=>r.points).some(p=>p.x===link.points.at(-1)!.x&&p.z===link.points.at(-1)!.z));
    }
  }
  for(const side of [0,1]){const link=network.roads.find(r=>r.id===`avenue-coast-${side}`)!;
    assert.deepEqual(link.points[0],side?avenue.points.at(-1):avenue.points[0]);
    assert.ok(ring.points.some(p=>p.x===link.points.at(-1)!.x&&p.z===link.points.at(-1)!.z));
  }
  for(const road of network.roads)for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.15));
    for(let j=0;j<=steps;j++){const p={x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps};
      assert.ok(insideIsland(island,p.x,p.z),`${road.id} outside island`);
      for(const plot of plots)assert.ok(pointPlotDistance(p,plot)>=road.shoulder/2+.2,`${road.id} crosses plot ${plot.id+1}`);
    }
  }
  assert.ok(network.canal[0].x**2/81+network.canal[0].z**2/31.36<1);
  assert.ok(!insideIsland(island,network.canal.at(-1)!.x,network.canal.at(-1)!.z));
  assert.ok(network.bridges.length>0);
  for(const bridge of network.bridges){assert.ok(Number.isFinite(bridge.length)&&bridge.length>5.5);assert.ok(network.roads.some(r=>r.id===bridge.roadId));
    for(const [index,sign] of [-1,1].entries()){
      const end=bridge.landings[index],start={x:bridge.x+Math.sin(bridge.rotation)*sign*bridge.length/2,z:bridge.z+Math.cos(bridge.rotation)*sign*bridge.length/2};
      const roadDistance=Math.min(...network.roads.flatMap(r=>r.points.slice(1).map((b,i)=>{
        const a=r.points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((end.x-a.x)*dx+(end.z-a.z)*dz)/(dx*dx+dz*dz||1)));
        return Math.hypot(end.x-a.x-t*dx,end.z-a.z-t*dz);
      })));
      assert.ok(roadDistance<1e-6,'ramp must land on a road centerline');
      for(let j=0;j<=30;j++){const p={x:start.x+(end.x-start.x)*j/30,z:start.z+(end.z-start.z)*j/30};
        for(const plot of plots)assert.ok(pointPlotDistance(p,plot)>=bridge.width/2+.15,'curved approach must clear plots');
      }
    }
    for(let i=0;i<=100;i++){const along=(i/100-.5)*(bridge.length+3.6),p={x:bridge.x+Math.sin(bridge.rotation)*along,z:bridge.z+Math.cos(bridge.rotation)*along};
      for(const plot of plots)assert.ok(pointPlotDistance(p,plot)>=bridge.width/2+.15,`bridge on ${bridge.roadId} crosses plot ${plot.id+1}`);
    }
  }
  assert.equal(JSON.stringify(allPlots(layout)),before);
});
