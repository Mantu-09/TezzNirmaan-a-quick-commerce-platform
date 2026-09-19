'use client';
import { useState, useEffect } from 'react';
import { api } from '../../../lib/api';
function fmt(paise){return '\u20b9'+(paise/100).toLocaleString('en-IN',{minimumFractionDigits:2});}
function fmtDate(iso){return iso?new Date(iso).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—';}
function StatusBadge({status}){
  const m={pending:{bg:'rgba(245,158,11,0.12)',color:'#d97706',label:'Pending'},processing:{bg:'rgba(59,130,246,0.12)',color:'#2563eb',label:'Processing'},paid:{bg:'rgba(22,163,74,0.12)',color:'#16a34a',label:'Paid'}};
  const s=m[status]||m.pending;
  return <span style={{display:'inline-block',padding:'2px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:s.bg,color:s.color}}>{s.label}</span>;
}
function PayModal({batch,onClose,onDone}){
  const [method,setMethod]=useState('upi');
  const [ref,setRef]=useState('');
  const [notes,setNotes]=useState('');
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  async function submit(e){
    e.preventDefault();
    if(!ref.trim()){setErr('Transaction reference is required');return;}
    setSaving(true);setErr('');
    try{
      await api.patch(`/admin/settlements/${batch.id}/paid`,{payment_method:method,payment_reference:ref.trim(),notes:notes.trim()||undefined});
      onDone();
    }catch(ex){setErr(ex.message||'Failed');}finally{setSaving(false);}
  }
  return(
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:100,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'var(--surface)',borderRadius:12,padding:28,width:420,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
        <h3 style={{margin:'0 0 4px',fontSize:17,fontWeight:700}}>Mark Settlement as Paid</h3>
        <p style={{margin:'0 0 20px',fontSize:13,color:'var(--text-2)'}}>Shop: <strong>{batch.shop_name}</strong> — {fmt(batch.total_paise)}</p>
        {err&&<div style={{background:'rgba(220,38,38,0.1)',color:'var(--error)',padding:'8px 12px',borderRadius:8,fontSize:13,marginBottom:14}}>{err}</div>}
        <form onSubmit={submit} style={{display:'flex',flexDirection:'column',gap:14}}>
          <label style={{fontSize:13,fontWeight:600,color:'var(--text-2)'}}>Payment Method
            <select value={method} onChange={e=>setMethod(e.target.value)} style={{display:'block',width:'100%',marginTop:6,padding:'9px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',fontSize:14}}>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank Transfer (NEFT/IMPS/RTGS)</option>
            </select>
          </label>
          <label style={{fontSize:13,fontWeight:600,color:'var(--text-2)'}}>Transaction Reference *
            <input value={ref} onChange={e=>setRef(e.target.value)} placeholder="UPI Ref / UTR Number" style={{display:'block',width:'100%',marginTop:6,padding:'9px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',fontSize:14,boxSizing:'border-box'}}/>
          </label>
          <label style={{fontSize:13,fontWeight:600,color:'var(--text-2)'}}>Notes (optional)
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} style={{display:'block',width:'100%',marginTop:6,padding:'9px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',fontSize:14,resize:'vertical',boxSizing:'border-box'}}/>
          </label>
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:4}}>
            <button type="button" onClick={onClose} disabled={saving} style={{padding:'9px 18px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',cursor:'pointer',fontSize:14,fontWeight:600}}>Cancel</button>
            <button type="submit" disabled={saving} style={{padding:'9px 20px',borderRadius:8,border:'none',background:'var(--primary)',color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700,opacity:saving?0.7:1}}>{saving?'Saving…':'Mark Paid'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
export default function AdminSettlementsPage(){
  const [settlements,setSettlements]=useState([]);
  const [totalPaise,setTotalPaise]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [payBatch,setPayBatch]=useState(null);
  const [generating,setGenerating]=useState(false);
  const [genMsg,setGenMsg]=useState('');
  useEffect(()=>{load();},[]);
  async function load(){
    setLoading(true);setError('');
    try{const data=await api.get('/admin/settlements/pending');setSettlements(data.batches||[]);setTotalPaise(data.total_outstanding_paise||0);}
    catch(ex){setError(ex.message||'Failed to load');}finally{setLoading(false);}
  }
  async function generate(){
    setGenerating(true);setGenMsg('');
    try{const res=await api.post('/admin/settlements/generate',{});setGenMsg(res.message||'Done');load();}
    catch(ex){setGenMsg(ex.message||'Failed');}finally{setGenerating(false);}
  }
  return(
    <div style={{maxWidth:1100,margin:'0 auto',padding:'28px 20px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{margin:0,fontSize:24,fontWeight:800}}>💰 Shop Settlements</h1>
          <p style={{margin:'4px 0 0',color:'var(--text-2)',fontSize:14}}>Pay shops for completed orders · {settlements.length} batches outstanding</p>
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          {genMsg&&<span style={{fontSize:13,color:'var(--text-2)'}}>{genMsg}</span>}
          <button onClick={generate} disabled={generating} style={{padding:'9px 18px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',cursor:'pointer',fontWeight:600,fontSize:14,opacity:generating?0.7:1}}>{generating?'Running…':'⚡ Run Settlement'}</button>
        </div>
      </div>
      <div style={{background:'rgba(220,38,38,0.06)',border:'1px solid rgba(220,38,38,0.2)',borderRadius:10,padding:'16px 20px',marginBottom:24,display:'flex',alignItems:'center',gap:14}}>
        <span style={{fontSize:28}}>🏦</span>
        <div>
          <div style={{fontSize:13,color:'var(--text-2)',fontWeight:600}}>Total Outstanding</div>
          <div style={{fontSize:26,fontWeight:800,color:'var(--error)'}}>{fmt(totalPaise)}</div>
        </div>
      </div>
      {error&&<div style={{background:'rgba(220,38,38,0.1)',color:'var(--error)',padding:'12px 16px',borderRadius:8,marginBottom:16}}>{error}</div>}
      {loading?(<div style={{textAlign:'center',padding:60,color:'var(--text-2)'}}>Loading…</div>):settlements.length===0?(
        <div style={{textAlign:'center',padding:60,color:'var(--text-2)',background:'var(--surface)',borderRadius:12}}>
          <div style={{fontSize:40,marginBottom:12}}>✅</div>
          <div style={{fontWeight:700,fontSize:16}}>All caught up! No pending settlements.</div>
        </div>
      ):(
        <div style={{background:'var(--surface)',borderRadius:12,border:'1px solid var(--border)',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{background:'var(--surface-2)'}}>
              {['Shop','Period','Orders','Amount','Status','Created','Action'].map(h=>(
                <th key={h} style={{padding:'12px 14px',textAlign:'left',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5,color:'var(--text-2)'}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {settlements.map((b,i)=>(
                <tr key={b.id} style={{borderTop:i>0?'1px solid var(--border)':'none'}}>
                  <td style={{padding:'13px 14px',fontWeight:600,fontSize:14}}>{b.shop_name||b.shop_id?.slice(0,8)}</td>
                  <td style={{padding:'13px 14px',fontSize:13,color:'var(--text-2)'}}>{fmtDate(b.period_start)} – {fmtDate(b.period_end)}</td>
                  <td style={{padding:'13px 14px',fontSize:14}}>{b.order_count??'—'}</td>
                  <td style={{padding:'13px 14px',fontSize:14,fontWeight:700}}>{fmt(b.total_paise)}</td>
                  <td style={{padding:'13px 14px'}}><StatusBadge status={b.status}/></td>
                  <td style={{padding:'13px 14px',fontSize:13,color:'var(--text-2)'}}>{fmtDate(b.created_at)}</td>
                  <td style={{padding:'13px 14px'}}>
                    {b.status!=='paid'?(<button onClick={()=>setPayBatch(b)} style={{padding:'6px 14px',borderRadius:7,border:'none',background:'var(--primary)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Mark Paid</button>):(<span style={{fontSize:12,color:'var(--text-2)'}}>Paid {fmtDate(b.paid_at)}</span>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {payBatch&&<PayModal batch={payBatch} onClose={()=>setPayBatch(null)} onDone={()=>{setPayBatch(null);load();}}/>}
    </div>
  );
}
