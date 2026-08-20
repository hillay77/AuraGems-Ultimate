(function(){
  function install(){
    window.saveSettings = async function(e){
      try{
        e.preventDefault();
      }catch(e){}
      const f = (e && e.target) ? e.target : document.querySelector('#panel form') || document.querySelector('form');
      const fd = new FormData(f);
      const content = {
        brand: fd.get('brand'),
        handle: fd.get('handle'),
        announcement: fd.get('announcement'),
        about: fd.get('about'),
        email: (fd.get('email') || '').trim(),
        phone: (fd.get('phone') || '').trim(),
        address: (fd.get('address') || '').trim(),
        whatsapp: (fd.get('whatsapp') || '').replace(/\D/g, ''),
        social: {
          instagram: fd.get('instagram'),
          facebook: fd.get('facebook'),
          tiktok: fd.get('tiktok')
        }
      };
      try{
        const current = await fetch('/api/admin/data',{credentials:'same-origin'}).then(response=>response.json());
        if(current.content && current.content.shopBanners) content.shopBanners = current.content.shopBanners;
        const res = await fetch('/api/admin/content',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(content)});
        if(!res.ok){
          let bodyText='';
          try{ bodyText = await res.text(); }catch(e){ bodyText=''+res.status+' '+res.statusText }
          // If server doesn't accept PUT for some reason, retry with POST
          if(bodyText && bodyText.includes('Cannot PUT')){
            const res2 = await fetch('/api/admin/content',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(content)});
            if(!res2.ok){
              let b2=''; try{ b2=await res2.text() }catch(e){}
              throw new Error('POST fallback failed: '+(b2||res2.status+' '+res2.statusText));
            }
            alert('Settings saved (via POST)');
            if(typeof init==='function') init();
            return;
          }
          let errText='Save failed';
          try{ const j=JSON.parse(bodyText); errText = j.error||bodyText||errText }catch(e){ errText = bodyText||errText }
          throw new Error(errText+' ('+bodyText+')');
        }
        alert('Settings saved');
        if(typeof init==='function') init();
      }catch(err){
        console.error('admin-fix save error',err);
        alert('Failed to save settings: '+err.message);
      }
    };
  }
  const allowEmptyContactFields=()=>document.querySelectorAll('input[name="email"],input[name="phone"],input[name="address"],input[name="whatsapp"]').forEach(field=>field.required=false);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{install();allowEmptyContactFields()}); else {install();allowEmptyContactFields()};
})();
