import type {RuntimeConfig} from '../config.ts';

export function applyPageTheme(config:RuntimeConfig){
  const {branding}=config,style=document.documentElement.style;
  document.title=branding.title;
  document.documentElement.dataset.theme=branding.enabled?'custom':'neutral';
  style.setProperty('--theme-accent',branding.accent);
  const rgb=branding.accent.slice(1).match(/../g)!.map(v=>parseInt(v,16)/255);
  style.setProperty('--theme-accent-ink',rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>.6?'#182b3a':'#ffffff');
}

/** Configured text is always assigned as text, never interpreted as HTML. */
export function applyBranding(root:HTMLElement,config:RuntimeConfig){
  applyPageTheme(config);
  const {branding}=config;
  const set=(selector:string,text:string)=>{const element=root.querySelector<HTMLElement>(selector);if(element)element.textContent=text;};
  const colon=branding.title.indexOf('：');
  set('.brand strong',colon>0?branding.title.slice(0,colon):branding.title);
  set('.brand small',colon>0?branding.title.slice(colon+1):config.cityDisplayName);
  root.querySelector('.brand')?.setAttribute('aria-label',branding.title+' 首页');
  set('#city-name',config.cityDisplayName);
  set('#display-activity',branding.activityLabel);
  if(!branding.enabled)return;
  set('.board-heading .eyebrow',colon>0?branding.title.slice(colon+1):branding.title);
  const eyebrow=root.querySelector('.intro-copy > .eyebrow');
  if(eyebrow){eyebrow.textContent=' '+branding.activityLabel;eyebrow.prepend(document.createElement('span'));}
  const headline=root.querySelector('.intro-copy h1');
  if(headline){
    const comma=branding.headline.indexOf('，');
    headline.textContent=comma>=0?branding.headline.slice(0,comma+1):branding.headline;
    if(comma>=0){const accent=document.createElement('span');accent.textContent=branding.headline.slice(comma+1);headline.append(document.createElement('br'),accent);}
  }
  set('.footer-mark',branding.activityLabel);
  set('.personal-summary > .eyebrow',branding.activityLabel);
  for(const selector of ['.result-title','.compatibility-message']){
    const section=root.querySelector<HTMLElement>(selector);
    if(section&&!section.querySelector('.theme-context')){
      const label=document.createElement('p');label.className='theme-context';
      label.textContent=selector==='.compatibility-message'?branding.title:branding.activityLabel;
      section.prepend(label);
    }
  }
  if(branding.logoUrl){
    const brand=root.querySelector('.brand'),symbol=brand?.querySelector('svg');
    if(brand&&symbol){
      const image=document.createElement('img');image.className='theme-logo';image.alt='';image.src=branding.logoUrl;
      image.onerror=()=>image.replaceWith(symbol);symbol.replaceWith(image);
    }
  }
}
