/* Shared phone navigation. Never changes model data or fetches predictions. */
(()=>{'use strict';
  if(typeof document==='undefined'||!document.body)return;
  const root=new URL('../',document.currentScript?.src||location.href);
  const path=location.pathname;
  const entries=[["Home","","<path d=\"m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z\"/>"],["Games","predict/","<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"3\"/><path d=\"M3 9h18M9 3v18M15 9v12\"/>"],["Daily","challenge/daily.html","<rect x=\"3\" y=\"4\" width=\"18\" height=\"17\" rx=\"2\"/><path d=\"M8 2v4M16 2v4M3 10h18M8 15h.01M12 15h.01M16 15h.01\"/>"],["Models","challenge/","<path d=\"M4 20V10M10 20V4M16 20v-7M22 20v-10\"/><path d=\"M2 20h22\"/>"],["Audit","audit/","<path d=\"M9 4h6l1 2h3v15H5V6h3z\"/><path d=\"m9 14 2 2 4-4\"/>"]];
  const nav=document.createElement('nav');
  nav.className='site-bottom-nav';nav.setAttribute('aria-label','Mobile navigation');
  for(const [label,destination,svg] of entries){
    const a=document.createElement('a');
    const href=new URL(destination,root);
    a.href=href.href;a.setAttribute('aria-label',label);
    const canonical=p=>p.endsWith('/index.html')?p.slice(0,-10):p;
    const target=canonical(href.pathname);
    const current=canonical(path);
    const trimmed=p=>p.endsWith('/')?p.slice(0,-1):p;
    if(current===target || (!destination.endsWith('.html') && trimmed(current)===trimmed(target)))a.setAttribute('aria-current','page');
    a.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+svg+'</svg><span>'+label+'</span>';
    nav.append(a);
  }
  document.body.append(nav);
  if(!document.querySelector('.site-skip')&&!document.querySelector('.skip')&&document.querySelector('main')){
    const skip=document.createElement('a');skip.className='site-skip';skip.textContent='Skip to content';skip.href='#site-main';
    if(!document.querySelector('#site-main'))document.querySelector('main').id='site-main';
    document.body.prepend(skip);
  }
})();