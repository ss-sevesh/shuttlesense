"use client";
import {useEffect,useState,type FormEvent} from 'react';
import {isReviewData,parseReviews,reviewStorageKey,type ReviewData} from '@/lib/analysis-review';
import type {ChatAnswer} from '@/lib/chat-policy';
type Entry=ChatAnswer&{question:string;createdAt:string;evidenceHash:string};
export function CoachChat({savedAnalyses}:{savedAnalyses:{id:string;name:string}[]}) {
  const [analysisId,setAnalysisId]=useState(''),[data,setData]=useState<ReviewData|null>(null),[entries,setEntries]=useState<Entry[]>([]),[question,setQuestion]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[fresh,setFresh]=useState('');
  useEffect(()=>{const id=new URLSearchParams(location.search).get('analysis');if(id&&savedAnalyses.some(a=>a.id===id))setAnalysisId(id);},[savedAnalyses]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');setData(null);setEntries([]);setFresh('');
    async function load() {
      const response=await fetch('/api/chat'+(analysisId?'?analysis='+analysisId:''),{signal:controller.signal});const result=await response.json();if(!response.ok)throw new Error(result.error);
      let recording=null;
      if(analysisId){const response=await fetch('/api/analysis/'+analysisId,{signal:controller.signal});const result=await response.json();if(!response.ok||!isReviewData(result.result))throw new Error('Selected recording unavailable.');recording=result.result;}
      if(!controller.signal.aborted){setEntries(result.history);setData(recording);}
    }
    void load().catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
  },[analysisId]);
  async function send(event:FormEvent) {
    event.preventDefault();if(busy||loading||!question.trim())return;setBusy(true);setError('');
    try {
      let rallies={};if(data){try{rallies=parseReviews(localStorage.getItem(reviewStorageKey(data)),data).rallies;}catch{throw new Error('Reviewed boundaries are unavailable in this browser. Open the full review and retry.');}}
      const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({analysisId,rallies,question})});const result=await response.json();if(!response.ok)throw new Error(result.error);
      setEntries(previous=>[...previous,result.entry]);setFresh(result.entry.createdAt);setQuestion('');
    }catch(e){setError(e instanceof Error?e.message:'Chat unavailable.');}finally{setBusy(false);}
  }
  async function remove() {
    setBusy(true);setError('');try{const response=await fetch('/api/chat'+(analysisId?'?analysis='+analysisId:''),{method:'DELETE'});const result=await response.json();if(!response.ok)throw new Error(result.error);setEntries([]);setFresh('');}catch(e){setError(e instanceof Error?e.message:'Deletion failed.');}finally{setBusy(false);}
  }
  const suggestions=analysisId?['What are the marked outcomes?','What does this report describe?','What evidence is unavailable?']:['Draft a weekly practice schedule','Give general food examples','What is a split step?'];
  return <section className="panel coach-chat"><h2>Coach Chat</h2><p>Local answers with visible sources. Choose a recording explicitly; it is not assumed to be your player history. Exact facts use direct lookup. Optional models are needed for prose retrieval.</p><label className="profile-field">Chat context<select value={analysisId} disabled={busy} onChange={e=>{setAnalysisId(e.target.value);const url=new URL(location.href);if(e.target.value)url.searchParams.set('analysis',e.target.value);else url.searchParams.delete('analysis');history.replaceState({},'',url);}}><option value="">General coaching — no recording</option>{savedAnalyses.map(a=><option key={a.id} value={a.id}>{a.name} · {a.id.slice(0,8)}</option>)}</select></label><p><a href="/workspace?view=profile">Edit player profile</a> · Details go directly into each request. Chats are separate local files; delete them here to remove their text.</p>
    {loading&&<p role="status">Loading chat context…</p>}{!loading&&!entries.length&&<p>No saved answers yet. Ask about evidence, or try a suggested question.</p>}
    <div className="chat-suggestions">{suggestions.map(q=><button type="button" className="secondary-button" disabled={busy||loading} key={q} onClick={()=>setQuestion(q)}>{q}</button>)}</div>
    <ol className="chat-history" aria-label="Chat history">{entries.map((entry,index)=><li key={entry.createdAt+'-'+index}><h3>{entry.question}</h3><p className="chat-provenance">{entry.createdAt===fresh?'Answer from the context selected when sent':'Historical saved answer — re-ask to check current evidence and profile'}</p><p className="chat-answer">{entry.answer}</p>{entry.sources.length>0&&<ul aria-label="Answer sources">{entry.sources.map(s=><li key={s.id}>{s.url?<a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>:s.time!==undefined&&analysisId?<a href={`/review/${analysisId}?rally=${s.rallyId}&time=${s.time}`}>{s.title} · {s.time.toFixed(3)} s</a>:<span>{s.title}</span>}<small> {s.kind==='generated_interpretation'?'Generated interpretation':s.kind==='reference'?'Reviewed reference':'Original evidence / user markings'}{s.reviewedAt?' · reviewed '+s.reviewedAt:''}</small><details><summary>View source text</summary><p>{s.text}</p>{s.attribution&&<p>{s.attribution}</p>}</details></li>)}</ul>}</li>)}</ol>
    <form onSubmit={send}><label className="profile-field">Your question<textarea className="chat-question" value={question} maxLength={1000} rows={3} required disabled={busy||loading} onChange={e=>setQuestion(e.target.value)}/></label><div className="profile-actions"><button className="primary-button" disabled={busy||loading||!question.trim()}>{busy?'Working locally…':'Ask coach'}</button><button className="secondary-button" type="button" disabled={busy||loading||!entries.length} onClick={remove}>Delete this chat</button></div></form>{busy&&<p role="status">Checking current evidence and profile. Model answers may take a minute.</p>}{error&&<p className="inline-error" role="alert">{error}</p>}
    <p>Chat does not diagnose, give medical clearance or determine impacts and loss causes. Food examples and draft sessions use checked guidance rather than unrestricted model advice.</p>
  </section>;
}
