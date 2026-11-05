import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../src/config.ts';
import { GameSession } from '../src/core/game.ts';
import { RunClock, parseTrace, replayTrace } from '../src/core/trace.ts';

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8);
test('landing consumes overshoot: original review reproduction is frame invariant', () => {
  const play = (segments: number[]) => {
    const g = new GameSession(DEFAULT_CONFIG.game);
    g.advance(1.4); g.place(); for (const dt of segments) g.advance(dt); g.advance(1.31); g.place(); return g;
  };
  const a = play([0.25]), b = play([0.24, 0.01]);
  close(a.elapsed,b.elapsed); close(a.tower.layers[1].depth,b.tower.layers[1].depth);
  close(a.tower.layers[1].z,b.tower.layers[1].z);
});
test('pointer event clock and server replay agree across fine/coarse drawing frames', () => {
  const play = (step: number) => {
    const c = new RunClock(new GameSession(DEFAULT_CONFIG.game,'timed-run'));
    for(let t=step;t<1_400_000;t+=step)c.sync(t); c.place(1_400_000);
    for(let t=1_400_000+step;t<2_960_000;t+=step)c.sync(t); c.place(2_960_000);
    c.sync(3_200_000); c.place(3_200_000); return c;
  };
  const a=play(8_333),b=play(250_000); assert.equal(a.game.phase,'ended');
  for(let i=0;i<a.game.tower.layers.length;i++) for(const key of ['x','z','width','depth'] as const)close(a.game.tower.layers[i][key],b.game.tower.layers[i][key]);
  const replay=replayTrace(DEFAULT_CONFIG.game,a.trace(),'timed-run');
  assert.deepEqual(a.game.tower,b.game.tower);assert.deepEqual(replay.tower,a.game.tower);
  assert.equal(replay.tower.layers.length,a.game.tower.layers.length);
  replay.tower.layers.forEach((l,i)=>{for(const key of ['x','z','width','depth'] as const)close(l[key],a.game.tower.layers[i][key]);});
});
test('pause excludes wall duration; timeout input is rejected before placement', () => {
  const c=new RunClock(new GameSession(DEFAULT_CONFIG.game));c.pause(1_000_000);c.sync(301_000_000);close(c.game.elapsed,1);
  c.resume(301_000_000);c.sync(302_000_000);close(c.game.elapsed,2);
  assert.equal(c.place(360_000_000),null); assert.equal(c.game.phase,'ended');close(c.game.elapsed,60);
  const r=replayTrace(DEFAULT_CONFIG.game,c.trace(),'paused-run');assert.equal(r.reason,'time');close(r.durationSeconds,60);
});
test('trace protocol rejects extra fields, out of order and invalid phase events', () => {
  assert.throws(()=>parseTrace({version:1,events:[],endUs:0,score:99}));
  assert.throws(()=>parseTrace({version:1,events:[{type:'place',atUs:3},{type:'place',atUs:2}],endUs:5}));
  assert.throws(()=>parseTrace({version:1,events:[{type:'place',atUs:1,tower:[]}],endUs:3}));
  assert.throws(()=>replayTrace(DEFAULT_CONFIG.game,{version:1,events:[{type:'resume',atUs:0}],endUs:60e6},'invalid'));
  assert.throws(()=>replayTrace(DEFAULT_CONFIG.game,{version:1,events:[],endUs:5e6},'unfinished'));
});
