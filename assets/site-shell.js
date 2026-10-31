/* Shared phone navigation. Never changes model data or fetches predictions. */
(()=>{'use strict';
  if(typeof document==='undefined'||!document.body)return;
  const root=new URL('../',document.currentScript?.src||location.href);
  const path=location.pathname;
  // Keep the five primary product destinations aligned with the desktop header.
  const entries=[
    ["Games","#live-games","<circle cx=\"12\" cy=\"12\" r=\"8\"/><path d=\"M4 12h16M12 4v16\"/>"],
    ["Predictions","predict/","<path d=\"M3 20h18M5 17l4-6 4 3 6-9\"/>"],
    ["League","league/","<path d=\"M4 19V7l8-4 8 4v12z\"/><path d=\"M4 19h16M12 3v16\"/>"],
    ["Players","player-stats/","<path d=\"M4 21v-3a8 8 0 0 1 16 0v3\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/>"],
    ["Model Lab","challenge/","<path d=\"M4 19V5m0 14h16M7 15l4-4 3 2 5-7\"/>"]
  ];
  const nav=document.createElement('nav');
  nav.className='site-bottom-nav';nav.setAttribute('aria-label','Mobile navigation');
  for(const [label,destination,svg] of entries){
    const a=document.createElement('a');
    const href=new URL(destination,root);
    a.href=href.href;a.setAttribute('aria-label',label);
    const canonical=p=>p.endsWith('/index.html')?p.slice(0,-10):p;
    const current=canonical(path),target=canonical(href.pathname);
    const isRoot=current===canonical(root.pathname);
    const active=label==='Games'?(isRoot||current.includes('/game/')):
      label==='Predictions'?/\/predict\//.test(current)||/\/challenge\/daily\.html$/.test(current):
      label==='Model Lab'?/\/(challenge|models|audit)\//.test(current)&&!/\/challenge\/daily\.html$/.test(current):
      label==='Players'?/\/(player-stats|player)\//.test(current):
      /\/(league|team|team-intelligence)\//.test(current);
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