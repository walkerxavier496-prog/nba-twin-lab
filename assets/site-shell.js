/* Shared phone navigation. Never changes model data or fetches predictions. */
(()=>{'use strict';
  if(typeof document==='undefined'||!document.body)return;
  const root=new URL('../',document.currentScript?.src||location.href);
  const path=location.pathname;
  const entries=[["Live","#live-games","<circle cx=\"12\" cy=\"12\" r=\"8\"/><path d=\"M4 12h16M12 4v16\"/>"],["Players","#live-player-stats","<circle cx=\"12\" cy=\"7\" r=\"4\"/><path d=\"M4 21c0-5 3-8 8-8s8 3 8 8\"/>"],["Predict","predict/","<path d=\"M3 20h18M5 17l4-6 4 3 6-9\"/>"],["Models","challenge/","<path d=\"M4 20V10M10 20V4M16 20v-7M22 20v-10\"/>"],["My Team","team-intelligence/","<path d=\"M12 22s8-4 8-11a8 8 0 0 0-16 0c0 7 8 11 8 11z\"/><circle cx=\"12\" cy=\"11\" r=\"2\"/>"]];
  const nav=document.createElement('nav');
  nav.className='site-bottom-nav';nav.setAttribute('aria-label','Mobile navigation');
  for(const [label,destination,svg] of entries){
    const a=document.createElement('a');
    const href=new URL(destination,root);
    a.href=href.href;a.setAttribute('aria-label',label);
    const canonical=p=>p.endsWith('/index.html')?p.slice(0,-10):p;
    const current=canonical(path),target=canonical(href.pathname);
    const isRoot=current===canonical(root.pathname);
    const active=destination.startsWith('#')?
      isRoot && (location.hash==='#live-player-stats'?label==='Players':label==='Live'):
      current===target || (target.endsWith('/') && current===target.slice(0,-1));
    if(active)a.setAttribute('aria-current','page');
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