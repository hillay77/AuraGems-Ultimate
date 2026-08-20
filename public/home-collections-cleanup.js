(function(){
  const removeOldTiles=()=>document.querySelectorAll('.collections .tile').forEach(tile=>{const title=tile.querySelector('h2,h3')?.textContent.trim();if(title==='Signature Scents'||title==='Evening Edit')tile.remove()});
  const observer=new MutationObserver(removeOldTiles);
  const start=()=>{const app=document.getElementById('app');if(app)observer.observe(app,{childList:true,subtree:true});removeOldTiles()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
