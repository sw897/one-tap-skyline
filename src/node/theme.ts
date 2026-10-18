import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {accentColor,displayText,parseBranding} from '../branding.ts';
import type {RuntimeConfig} from '../config.ts';
import {serverRuntime} from '../server/runtime.ts';

export async function loadNodeTheme(env:Record<string,string|undefined>,log:(value:unknown)=>void){
  const base=serverRuntime(env);
  if(!env.SKYLINE_THEME_FILE)return {config:base,logo:null};
  // Validate before opening/migrating the game database or running day maintenance.
  if(!displayText(env.CITY_DISPLAY_NAME,40))throw Error('theme_city_name_invalid');
  const file=path.resolve(env.SKYLINE_THEME_FILE);
  let raw:Record<string,unknown>;
  try{
    if((await stat(file)).size>16_384)throw Error('too_large');
    const parsed:unknown=JSON.parse(await readFile(file,'utf8'));
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('not_object');
    raw=parsed as Record<string,unknown>;
  }catch{throw Error('theme_file_invalid');}
  for(const [key,max] of [['title',64],['activityLabel',32],['headline',80],['pavilionName',32]] as const){
    if(!displayText(raw[key],max))throw Error('theme_field_invalid:'+key);
  }
  if(!accentColor(raw.accent))throw Error('theme_field_invalid:accent');
  let logo:{bytes:Buffer;type:string}|null=null;
  if(raw.logoFile!==undefined){
    if(typeof raw.logoFile!=='string'||!/^logo\.(?:png|jpe?g|webp)$/i.test(raw.logoFile))throw Error('theme_logo_path_invalid');
    try{
      const logoPath=path.join(path.dirname(file),raw.logoFile);
      if((await stat(logoPath)).size>512*1024)throw Error('too_large');
      const bytes=await readFile(logoPath);
      const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
      const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
      const ext=path.extname(raw.logoFile).toLowerCase();
      const type=png&&ext==='.png'?'image/png':jpg&&['.jpg','.jpeg'].includes(ext)?'image/jpeg':webp&&ext==='.webp'?'image/webp':null;
      if(!type)throw Error('invalid_image');
      logo={bytes,type};
    }catch{log({event:'theme_logo_unavailable'});}
  }
  const config:RuntimeConfig={...base,branding:parseBranding({...raw,enabled:true,logoUrl:logo?'/theme/logo':null},base.cityDisplayName)};
  return {config,logo};
}

const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function renderNodeHtml(html:string,config:RuntimeConfig){
  const json=JSON.stringify(config).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
  return html.replace(/<title>[^<]*<\/title>/i,()=>'<title>'+escapeHtml(config.branding.title)+'</title>')
    .replace(/<meta name="theme-color" content="[^"]*">/i,config.branding.enabled?'<meta name="theme-color" content="'+config.branding.accent+'">':'$&')
    .replace('</head>',()=>'<script id="skyline-runtime" type="application/json">'+json+'</script></head>');
}
