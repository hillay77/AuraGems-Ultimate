(function(){
  const contactHtml=`<section class="page"><h1>Contact Us</h1><p>Reach out to AuraGems & Styles for orders, support, and custom jewelry inquiries.</p></section>`;
  function cleanContactPage(){
    if((new URLSearchParams(location.search).get('page')||'home')!=='contact')return;
    const app=document.getElementById('app');
    if(app&&app.dataset.contactClean!=='true'){app.innerHTML=contactHtml;app.dataset.contactClean='true'}
  }
  function patchRender(){
    if(typeof window.render!=='function'||window.render.__contactPatched)return false;
    const original=window.render;
    window.render=function(){original();cleanContactPage()};
    window.render.__contactPatched=true;
    cleanContactPage();
    return true;
  }
  const timer=setInterval(()=>{if(patchRender())clearInterval(timer)},25);
  document.addEventListener('DOMContentLoaded',()=>{patchRender();cleanContactPage()});
})();
