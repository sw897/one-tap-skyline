export const WATERFRONT_VERSION = 'waterfront-1';
export const DEFAULT_DISTRICT_CAPACITIES = [10, 12, 14, 11, 13, 16, 16, 16, 16, 16];
export interface CityLayout { version: 'waterfront-1' | 'legacy-grid'; districtCount: number; capacities: number[] }
export interface District { id: number; name: string; x: number; z: number; rotation: number; capacity: number }
export interface PlotLocation { x: number; z: number; rotation: number; districtId: number; districtName: string; number: number }
const DISTRICTS = [
  ['海湾广场', -33, -1, -.12], ['公园街区', -3, -24, .16], ['滨水商务', 29, -15, -.2],
  ['运河里', 37, 18, .24], ['绿荫街区', 1, 18, -.12], ['桥畔街区', -34, 33, -.3],
  ['林荫西岸', -62, -31, .22], ['晴空街区', 37, -49, .1], ['东岸花园', 68, 39, -.2], ['白帆街区', -67, 41, .08],
] as const;
export function waterfrontLayout(count = 6, capacities: number[] = DEFAULT_DISTRICT_CAPACITIES): CityLayout {
  const districtCount = Number.isInteger(count) && count >= 1 && count <= 10 ? count : 6;
  return {version: WATERFRONT_VERSION, districtCount, capacities: DEFAULT_DISTRICT_CAPACITIES.map((fallback, i) => Number.isInteger(capacities[i]) && capacities[i] >= 10 && capacities[i] <= 16 ? capacities[i] : fallback)};
}
export const legacyLayout = (capacity = 60): CityLayout => ({version:'legacy-grid', districtCount:1, capacities:[capacity]});
export const layoutCapacity = (layout: CityLayout) => layout.capacities.slice(0, layout.districtCount).reduce((sum, n) => sum + n, 0);
export function storedLayout(value: string, capacity: number): CityLayout {
  try { const input = JSON.parse(value); if (input.version === WATERFRONT_VERSION && Number.isInteger(input.districtCount) && input.districtCount >= 1 && input.districtCount <= 10 && Array.isArray(input.capacities) && input.capacities.length === 10 && input.capacities.every((n:unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 10 && n <= 16)) {const layout = waterfrontLayout(input.districtCount,input.capacities); if (layoutCapacity(layout) === capacity) return layout;} } catch { /* Today's pre-P5 city keeps its original positions until daily reset. */ }
  return legacyLayout(capacity);
}
export function districtsFor(layout: CityLayout): District[] {
  if (layout.version === 'legacy-grid') return [{id:1, name:'今日街区', x:0, z:0, rotation:0, capacity:layoutCapacity(layout)}];
  return DISTRICTS.slice(0,layout.districtCount).map(([name,x,z,rotation],i)=>({id:i+1,name,x,z,rotation,capacity:layout.capacities[i]}));
}
export function districtPoint(district: District, x: number, z: number) {
  return {x:district.x + Math.cos(district.rotation)*x + Math.sin(district.rotation)*z, z:district.z - Math.sin(district.rotation)*x + Math.cos(district.rotation)*z};
}
export const streetCurve = (x:number) => .008 * x * x;
export function plotLocation(plotId: number, layout: CityLayout): PlotLocation | undefined {
  if (!Number.isInteger(plotId) || plotId < 0 || plotId === 13) return;
  let ordinal = plotId > 13 ? plotId - 1 : plotId;
  if (ordinal >= layoutCapacity(layout)) return;
  if (layout.version === 'legacy-grid') {
    const side=Math.max(4,Math.ceil(Math.sqrt(layoutCapacity(layout)+1)));
    return {x:(plotId%side-(side-1)/2)*4.6,z:(Math.floor(plotId/side)-(side-1)/2)*4.6,rotation:0,districtId:1,districtName:'今日街区',number:ordinal+1};
  }
  for (const d of districtsFor(layout)) {
    if (ordinal >= d.capacity) { ordinal -= d.capacity; continue; }
    const firstRow = Math.ceil(d.capacity/2), row = ordinal < firstRow ? 0 : 1;
    const slot = row === 0 ? ordinal : ordinal-firstRow, count = row === 0 ? firstRow : d.capacity-firstRow;
    const x=(slot-(count-1)/2)*3.9, z=(row===0?4.9:-4.9)+streetCurve(x), p=districtPoint(d,x,z);
    return {...p,rotation:d.rotation - Math.atan(.016*x)+(row===0?Math.PI:0),districtId:d.id,districtName:d.name,number:ordinal+1};
  }
}
export function allPlots(layout: CityLayout) {
  return Array.from({length:layoutCapacity(layout)},(_,ordinal)=>{const id=ordinal+(ordinal>=13?1:0);return {id,...plotLocation(id,layout)!};});
}
export function layoutBounds(layout: CityLayout) {
  const points=allPlots(layout); const minX=Math.min(...points.map(p=>p.x))-6,maxX=Math.max(...points.map(p=>p.x))+6,minZ=Math.min(...points.map(p=>p.z))-6,maxZ=Math.max(...points.map(p=>p.z))+6;
  return {minX,maxX,minZ,maxZ,x:(minX+maxX)/2,z:(minZ+maxZ)/2,width:maxX-minX,depth:maxZ-minZ};
}
