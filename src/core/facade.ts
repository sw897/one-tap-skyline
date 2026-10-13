import type { TowerModel } from './tower.ts';

/** One continuous picture over the complete front wall, clipped to each real floor. */
export function fullWallFacade(model: TowerModel, offset = .032) {
  const positions: number[] = [], uvs: number[] = [];
  if (!model.layers.length) return { positions, uvs };
  const left = Math.min(...model.layers.map(l => l.x - l.width / 2));
  const right = Math.max(...model.layers.map(l => l.x + l.width / 2));
  const width = right - left, height = model.layers.length * model.layerHeight;
  // Normalized photos are 512x768. Cover the wall without stretching a portrait.
  const aspect=width/height,uSpan=Math.min(1,aspect/(2/3)),vSpan=Math.min(1,(2/3)/aspect);
  model.layers.forEach((layer, i) => {
    const x0 = layer.x - layer.width / 2, x1 = layer.x + layer.width / 2;
    const y0 = i * model.layerHeight, y1 = (i + 1) * model.layerHeight;
    const z = layer.z + layer.depth / 2 + offset;
    positions.push(x0,y0,z, x1,y0,z, x1,y1,z, x0,y0,z, x1,y1,z, x0,y1,z);
    const u0=.5+((x0-left)/width-.5)*uSpan,u1=.5+((x1-left)/width-.5)*uSpan;
    const v0=.5+(y0/height-.5)*vSpan,v1=.5+(y1/height-.5)*vSpan;
    uvs.push(u0,v0, u1,v0, u1,v1, u0,v0, u1,v1, u0,v1);
  });
  return { positions, uvs };
}
