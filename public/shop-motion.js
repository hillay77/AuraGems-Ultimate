(function(){
  const renderShopHero=()=>{
    if((new URLSearchParams(location.search).get('page')||'home')!=='shop')return;
    const app=document.getElementById('app');
    const banners=(window.shopMotionBanners||[]).filter(item=>item.active&&item.image);
    if(!app||!banners.length||app.querySelector('.shop-hero'))return;
    const hero=document.createElement('section');
    hero.className='shop-hero';
    hero.innerHTML=banners.map((banner,index)=>`<div class="shop-hero-slide ${index===0?'active':''}" style="background-image:url('${banner.image}')"><div class="shop-hero-slide-copy"><span class="eyebrow">Curated collection</span><h1>Shop AuraGems</h1><p>${banner.subtitle||'Discover pieces selected for your signature style.'}</p></div></div>`).join('')+'<div class="shop-hero-shade"></div>';
    const oldHero=app.querySelector('.page');
    if(oldHero)oldHero.replaceWith(hero);else app.prepend(hero);
    let active=0;
    setInterval(()=>{const slides=hero.querySelectorAll('.shop-hero-slide');if(slides.length<2)return;slides[active].classList.remove('active');active=(active+1)%slides.length;slides[active].classList.add('active')},5000);
  };
  const patch=()=>{if(typeof window.render!=='function'||window.render.__shopMotion)return false;const original=window.render;window.render=function(){original();renderShopHero()};window.render.__shopMotion=true;renderShopHero();return true};
  fetch('/api/store').then(response=>response.json()).then(data=>{window.shopMotionBanners=data.content&&data.content.shopBanners||[];renderShopHero()});
  const observer=new MutationObserver(()=>renderShopHero());
  const watch=()=>{const app=document.getElementById('app');if(app)observer.observe(app,{childList:true});renderShopHero()};
  const timer=setInterval(()=>{if(patch()){clearInterval(timer);watch()}},25);
  setTimeout(watch,1000);
  document.addEventListener('DOMContentLoaded',()=>{patch();renderShopHero()});
})();
