import path from 'node:path';
import os from 'node:os';
import { realpathSync, existsSync } from 'node:fs';

export function privatePath(value) {
  if(!value||!path.isAbsolute(value))throw new Error('Use an absolute path outside the source checkout');
  let existing=path.resolve(value);const suffix=[];
  while(!existsSync(existing)){suffix.unshift(path.basename(existing));const parent=path.dirname(existing);if(parent===existing)throw new Error('Path cannot be resolved');existing=parent;}
  const resolved=path.join(realpathSync(existing),...suffix),checkout=realpathSync(process.cwd());
  const relative=path.relative(checkout,resolved);
  if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw new Error('Runtime data must stay outside the source checkout');
  return resolved;
}
export const statePath=()=>privatePath(process.env.SKYLINE_D1_STATE_PATH??path.join(os.tmpdir(),'one-tap-skyline-d1'));
