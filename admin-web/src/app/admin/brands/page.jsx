'use client';
import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';

function Modal({title,initial,onSave,onClose}){
  const [name,setName]=useState(initial?.name||'');
  const [slug,setSlug]=useState(initial?.slug||'');
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  function autoSlug(n){return n.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');}
  async function submit(e){
    e.preventDefault();
    if(!name.trim()){setErr('Name is required');return;}
    setSaving(true);setErr('');
    try{await onSave({name:name.trim(),slug:slug||autoSlug(name)});}
    catch(ex){setErr(ex.message||'Failed');}finally{setSaving(false);}
  }
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'var(--surface)',borderRadius:12,padding:28,width:380,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <h3 style={{margin:'0 0 20px',fontSize:17,fontWeight:700}}>{title}</h3>
        {err&&<div style={{background:'rgba(220,38,38,0.1)',color:'var(--error)',padding:'8px 12px',borderRadius:8,fontSize:13,marginBottom:14}}>{err}</div>}
        <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:14}}>
          <label style={{fontSize:13,fontWeight:600,color:'var(--text-2)'}}>Brand Name *
            <input value={name} onChange={e=>{setName(e.target.value);if(!initial)setSlug(autoSlug(e.target.value));}} style={{display:'block',width:'100%',marginTop:6,padding:'9px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',fontSize:14,boxSizing:'border-box'}}/>
          </label>
          <label style={{fontSize:13,fontWeight:600,color:'var(--text-2)'}}>Slug
            <input value={slug} onChange={e=>setSlug(e.target.value)} placeholder="auto-generated" style={{display:'block',width:'100%',marginTop:6,padding:'9px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',fontSize:14,boxSizing:'border-box'}}/>
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

export default function AdminBrandsPage(){
  const [brands,setBrands]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [modal,setModal]=useState(null);
  const [deleting,setDeleting]=useState(null);
  const [search,setSearch]=useState('');
  useEffect(()=>{load();},[]);
  async function load(){setLoading(true);try{const d=await api.get('/admin/brands');setBrands(d.data?.brands||[]);}catch(ex){setError(ex.message||'Failed');}finally{setLoading(false);}};
  async function handleSave(payload){
    if(modal.mode==='new')await api.post('/admin/brands',payload);
    else await api.patch(`/admin/brands/${modal.brand.id}`,payload);
    setModal(null);load();
  }
  async function handleDelete(brand){
    if(!confirm(`Delete "${brand.name}"? This may break products using this brand.`))return;
    setDeleting(brand.id);
    try{await api.delete(`/admin/brands/${brand.id}`);load();}catch(ex){alert(ex.message||'Delete failed');}finally{setDeleting(null);}
  }
  const filtered=brands.filter(b=>!search||b.name.toLowerCase().includes(search.toLowerCase()));
  return(
    <div style={{maxWidth:900,margin:'0 auto',padding:'28px 20px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{margin:0,fontSize:24,fontWeight:800}}>🏷️ Brands</h1>
          <p style={{margin:'4px 0 0',color:'var(--text-2)',fontSize:14}}>{brands.length} brands</p>
        </div>
        <div style={{display:'flex',gap:10}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search brands…" style={{padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',fontSize:14,width:200}}/>
          <button onClick={()=>setModal({mode:'new'})} style={{padding:'9px 18px',borderRadius:8,border:'none',background:'var(--primary)',color:'#fff',cursor:'pointer',fontWeight:700,fontSize:14}}>+ New Brand</button>
        </div>
      </div>
      {error&&<div style={{background:'rgba(220,38,38,0.1)',color:'var(--error)',padding:'12px 16px',borderRadius:8,marginBottom:16}}>{error}</div>}
      {loading?<div style={{textAlign:'center',padding:60,color:'var(--text-2)'}}>Loading…</div>:(
        <div style={{background:'var(--surface)',borderRadius:12,border:'1px solid var(--border)',overflow:'hidden'}}>
          {filtered.length===0?<div style={{textAlign:'center',padding:60,color:'var(--text-2)'}}>{search?'No brands match your search.':'No brands yet. Add one above.'}</div>:(
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead><tr style={{background:'var(--surface-2)'}}>
                {['Name','Slug','Actions'].map(h=><th key={h} style={{padding:'12px 14px',textAlign:'left',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5,color:'var(--text-2)'}}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map((b,i)=>(
                  <tr key={b.id} style={{borderTop:i>0?'1px solid var(--border)':'none'}}>
                    <td style={{padding:'12px 14px',fontWeight:600}}>{b.name}</td>
                    <td style={{padding:'12px 14px',fontSize:13,color:'var(--text-2)',fontFamily:'monospace'}}>{b.slug}</td>
                    <td style={{padding:'12px 14px'}}>
                      <div style={{display:'flex',gap:8}}>
                        <button onClick={()=>setModal({mode:'edit',brand:b})} style={{padding:'5px 12px',borderRadius:7,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',fontSize:13,fontWeight:600}}>Edit</button>
                        <button onClick={()=>handleDelete(b)} disabled={deleting===b.id} style={{padding:'5px 12px',borderRadius:7,border:'1px solid rgba(220,38,38,0.3)',background:'rgba(220,38,38,0.06)',color:'var(--error)',cursor:'pointer',fontSize:13,fontWeight:600,opacity:deleting===b.id?0.5:1}}>{deleting===b.id?'…':'Delete'}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {modal&&<Modal title={modal.mode==='new'?'New Brand':'Edit Brand'} initial={modal.brand} onSave={handleSave} onClose={()=>setModal(null)}/>}
    </div>
  );
}
