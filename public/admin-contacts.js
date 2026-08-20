const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
async function contacts(){
  const items=await api('/api/admin/contacts');
  panel.innerHTML=`<h2>Contacts</h2>${items.length?`<table><tr><th>Name</th><th>Email</th><th>Message</th><th>Received</th><th></th></tr>${items.map(contact=>`<tr><td><input data-field="name" value="${escapeHtml(contact.name)}"></td><td><input data-field="email" type="email" value="${escapeHtml(contact.email)}"></td><td><textarea data-field="message" rows="3">${escapeHtml(contact.message)}</textarea></td><td>${escapeHtml(new Date(contact.createdAt).toLocaleString())}</td><td><button onclick="saveContact(${contact.id},this)">Save</button> <button onclick="deleteContact(${contact.id})">Delete</button></td></tr>`).join('')}</table>`:'<p>No contact messages yet.</p>'}`;
}
async function saveContact(id,button){
  const row=button.closest('tr');
  const body=Object.fromEntries([...row.querySelectorAll('[data-field]')].map(field=>[field.dataset.field,field.value]));
  await api('/api/admin/contacts/'+id,{method:'PUT',body:JSON.stringify(body)});
  await contacts();
}
async function deleteContact(id){
  if(!confirm('Delete this contact message?'))return;
  await api('/api/admin/contacts/'+id,{method:'DELETE'});
  await contacts();
}
