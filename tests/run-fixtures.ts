import { GameSession } from '../src/core/game.ts';
import { RunClock } from '../src/core/trace.ts';
import { topLayer } from '../src/core/tower.ts';
import { OFFICIAL_RULES } from '../src/server/policy.ts';

/** Real protocol events derived by advancing the common engine, never a score POST. */
export function makeTrace(floors:number,seed=0) {
  const clock=new RunClock(new GameSession(OFFICIAL_RULES));let atUs=0;
  for(let floor=0;floor<floors;floor++){
    const game=clock.game,top=topLayer(game.tower),axis=game.activeAxis,size=axis==='x'?'width':'depth';
    const sign=Math.sign(game.movingPosition-top[axis]);
    const offset=((floor+seed)%4<2?1:-1)*top[size]*0.055;
    const distance=(game.movingPosition-top[axis]-offset)*sign;
    atUs+=Math.round(distance/game.speed*1e6);
    if(!clock.place(atUs))throw new Error('Fixture placement ignored');
    atUs+=Math.round(game.config.dropSeconds*1e6);clock.sync(atUs);
  }
  if(clock.place(atUs)?.kind!=='miss')throw new Error('Fixture expected final miss');
  return {trace:clock.trace(),completed:clock.game.result()!};
}
