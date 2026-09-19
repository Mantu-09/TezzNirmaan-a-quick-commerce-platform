'use client';
import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';

function Modal({title,initial,categories,onSave,onClose}){
  const [name,setName]=useState(initial?.name||'');
  const [slug,setSlug]=useState(initial?.slug||'');
  const [parentId,setParentId]=useState(initial?.parent_id||'');
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  function autoSlug(n){return n.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');}
  async function submit(e){
    e.preventDefault();
    if(!name.trim()){setErr('Name is required');return;}
    setSaving(true);setErr('');
    try{await onSave({name:name.trim(),slug:slug||autoSlug(name),parent_id:parentId||null});}
    catch(ex){setErr(ex.message||'Failed');}finally{setSaving(false);}
  }
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'var(--surface)',borderRadius:12,padding:28,width:400,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <h3 style={{margin:'0 0 20px',fontSize:17,fontWeight:700}}>{title}</h3>
        {err&&<div style={{background:'rgba(220,38,38,0.1)',color:'var(--error)',padding:'8px 12px',borderRadius:8,fontSize:13,marginBottom:14}}>{err}</div>}
        <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:14}}>
          <label style={{fontSize:13,fontWeight:600,color:'var(--text-2)'}}>Name *
            <input value={name} onChange={e=>{setName(e.target.value);if(!initial)setSlug(autoSlug(e.target.value));}} style={{display:'block',width:'100%',marginTop:6,padding:'9px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',fontSize:14,boxSizing:'border-box'}}/>
          </label>
          <label style={{fontSize:13,fontWeight:600,color:'var(--text-2)'}}>Slug
            <input value={slug} onChange={e=>setSlug(e.target.value)} placeholder="auto-generated" style={{display:'block',width:'100%',marginTop:6,padding:'9px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',fontSize:14,boxSizing:'border-box'}}/>
          </label>
          <label style={{fontSize:13,fontWeight:600,color:'var(--text-2)'}}>Parent Category
            <select value={parentId} onChange={e=>setParentId(e.target.value)} style={{display:'block',width:'100%',marginTop:6,padding:'9px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',fontSize:14}}>
              <option value="">None (top-level)</option>
              {categories.filter(c=>c.id!==initial?.id).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:4}}>
            <button type="button" onClick={onClose} disabled={saving} style={{padding:'9px 18px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',fontSize:14,fontWeight:600}}>Cancel</button>
            <button type="submit" disabled={saving} style={{padding:'9px 20px',borderRadius:8,border:'none',background:'var(--primary)',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700,opacity:saving?0.7:1}}>{saving?'Saving…':'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminCategoriesPage(){
  const [cats,setCats]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [modal,setModal]=useState(null); // null | {mode:'new'} | {mode:'edit',cat}
  const [deleting,setDeleting]=useState(null);
  useEffect(()=>{load();},[]);
  async function load(){setLoading(true);try{const d=await api.get('/admin/categories');setCats(d.data?.categories||[]);}catch(ex){setError(ex.message||'Failed');}finally{setLoading(false);}};
  async function handleSave(payload){
    if(modal.mode==='new')await api.post('/admin/categories',payload);
    else await api.patch(`/admin/categories/${modal.cat.id}`,payload);
    setModal(null);load();
  }
  async function handleDelete(cat){
    if(!confirm(`Delete "${cat.name}"? This may break products using this category.`))return;
    setDeleting(cat.id);
    try{await api.delete(`/admin/categories/${cat.id}`);load();}catch(ex){alert(ex.message||'Delete failed');}finally{setDeleting(null);}
  }
  const parentName=(id)=>cats.find(c=>c.id===id)?.name||'—';
  return(
    <div style={{maxWidth:900,margin:'0 auto',padding:'28px 20px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div>
          <h1 style={{margin:0,fontSize:24,fontWeight:800}}>🗂️ Categories</h1>
          <p style={{margin:'4px 0 0',color:'var(--text-2)',fontSize:14}}>{cats.length} categories</p>
        </div>
        <button onClick={()=>setModal({mode:'new'})} style={{padding:'9px 18px',borderRadius:8,border:'none',background:'var(--primary)',color:'#fff',cursor:'pointer',fontWeight:700,fontSize:14}}>+ New Category</button>
      </div>
      {error&&<div style={{background:'rgba(220,38,38,0.1)',color:'var(--error)',padding:'12px 16px',borderRadius:8,marginBottom:16}}>{error}</div>}
      {loading?<div style={{textAlign:'center',padding:60,color:'var(--text-2)'}}>Loading…</div>:(
        <div style={{background:'var(--surface)',borderRadius:12,border:'1px solid var(--border)',overflow:'hidden'}}>
          {cats.length===0?<div style={{textAlign:'center',padding:60,color:'var(--text-2)'}}>No categories yet. Add one above.</div>:(
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{background:'var(--surface-2)'}}>
                {['Name','Slug','Parent','Actions'].map(h=><th key={h} style={{padding:'12px 14px',textAlign:'left',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5,color:'var(--text-2)'}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {cats.map((c,i)=>(
                  <tr key={c.id} style={{borderTop:i>0?'1px solid var(--border)':'none'}}>
                    <td style={{padding:'12px 14px',fontWeight:600}}>{c.name}</td>
                    <td style={{padding:'12px 14px',fontSize:13,color:'var(--text-2)',fontFamily:'monospace'}}>{c.slug}</td>
                    <td style={{padding:'12px 14px',fontSize:13,color:'var(--text-2)'}}>{c.parent_id?parentName(c.parent_id):'—'}</td>
                    <td style={{padding:'12px 14px'}}>
                      <div style={{display:'flex',gap:8}}>
                        <button onClick={()=>setModal({mode:'edit',cat:c})} style={{padding:'5px 12px',borderRadius:7,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',fontSize:13,fontWeight:600}}>Edit</button>
                        <button onClick={()=>handleDelete(c)} disabled={deleting===c.id} style={{padding:'5px 12px',borderRadius:7,border:'1px solid rgba(220,38,38,0.3)',background:'rgba(220,38,38,0.06)',color:'var(--error)',cursor:'pointer',fontSize:13,fontWeight:600,opacity:deleting===c.id?0.5:1}}>{deleting===c.id?'…':'Delete'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {modal&&<Modal title={modal.mode==='new'?'New Category':'Edit Category'} initial={modal.cat} categories={cats} onSave={handleSave} onClose={()=>setModal(null)}/>}
    </div>
  );
}
