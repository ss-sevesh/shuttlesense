"use client";

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { ArrowRight, ArrowUpRight, Feather, IconContext, Moon, SquaresFour, Sun, Target, UploadSimple, VideoCamera, X } from '@phosphor-icons/react';
import { AnalysisReview } from './analysis-review';
import { MatchReport } from './match-report';
import { UploadDialog } from './upload-dialog';
import { isReviewData, parseReviews, reviewStorageKey, type HumanReviews, type ReviewData } from '@/lib/analysis-review';

const sections = [
  {id:'overview',label:'Overview',icon:SquaresFour},
  {id:'rallies',label:'Rally Review',icon:VideoCamera},
  {id:'practice',label:'Practice Plan',icon:Target},
  {id:'matches',label:'My Matches',icon:VideoCamera},
] as const;
type View = typeof sections[number]['id'];

export function CoachWorkspace({savedAnalyses=[]}:{savedAnalyses?:{id:string;name:string}[]}) {
  const [view,setView]=useState<View>('overview');
  const [selected,setSelected]=useState(savedAnalyses[0]?.id ?? '');
  const [data,setData]=useState<ReviewData|null>(null);
  const [outcomes,setOutcomes]=useState<Record<number,string>>({});
  const [reviews,setReviews]=useState<HumanReviews>({shots:{},rallies:{}});
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const [upload,setUpload]=useState(false);
  const [dark,setDark]=useState(false);
  const [playerName,setPlayerName]=useState('');
  const guide=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const read=()=>{
      const params=new URLSearchParams(location.search);
      const next=params.get('view');
      setView(sections.some(s=>s.id===next)?next as View:'overview');
      const id=params.get('analysis');
      if(savedAnalyses.some(a=>a.id===id))setSelected(id!);
    };
    read();window.addEventListener('popstate',read);
    try{const saved=JSON.parse(localStorage.getItem('shuttlesense-local-player') ?? 'null');if(typeof saved?.name==='string'&&saved.name.trim()&&saved.name.length<=60)setPlayerName(saved.name);}catch{/* Local entry is optional. */}
    setDark(matchMedia('(prefers-color-scheme: dark)').matches);
    return()=>window.removeEventListener('popstate',read);
  },[savedAnalyses]);
  useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';},[dark]);
  useEffect(()=>{
    if(!selected || view==='matches')return;
    const controller=new AbortController();setLoading(true);setError('');setData(null);
    async function load() {
      try {
        const response=await fetch('/api/analysis/'+selected,{signal:controller.signal});
        const result=await response.json();
        if(!response.ok || !isReviewData(result.result))throw new Error('This recording could not be loaded. Open another saved analysis or reload to retry.');
        const saved=await fetch('/api/analysis/'+selected+'/landing?losses=1',{signal:controller.signal});
        if(!saved.ok)throw new Error('Saved rally outcomes could not be loaded.');
        const markings=await saved.json();
        if(markings.analysisSha256!==result.result.analysisSha256)throw new Error('Saved outcomes do not match this recording.');
        setOutcomes(markings.outcomes);setData(result.result);
        try{setReviews(parseReviews(localStorage.getItem(reviewStorageKey(result.result)),result.result));}
        catch{setReviews({shots:{},rallies:{}});}
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Recording could not be loaded.');}
      finally{if(!controller.signal.aborted)setLoading(false);}
    }
    void load();return()=>controller.abort();
  },[selected,view]);
  function navigate(next:View,id=selected) {
    setView(next);setSelected(id);
    const url=new URL(location.href);url.searchParams.set('view',next);
    if(id)url.searchParams.set('analysis',id);
    history.pushState({},'',url);
  }
  function nav(event:MouseEvent<HTMLAnchorElement>,next:View) {
    if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();navigate(next);
  }
  const current=sections.find(s=>s.id===view)!;
  const completed=data?.rallies.filter(r=>r.end!==null || reviews.rallies[r.id]) ?? [];
  const lost=completed.filter(r=>outcomes[r.id]==='lost').length;
  const won=completed.filter(r=>outcomes[r.id]==='won').length;
  const titles={overview:'Own your next rally.',rallies:'See the whole attempt.',practice:'Make the next one count.',matches:'Your game. On record.'};
  const descriptions={overview:'Choose a recording to see reviewed outcomes and the evidence available.',rallies:'Replay the near player, tracked shuttle and final attempt together.',practice:'Generate a recording-specific review and an optional drill from its shuttle and player evidence.',matches:'Analyses and footage saved locally on this computer.'};
  return <IconContext.Provider value={{'aria-hidden':true}}><div className="workspace real-workspace" data-view={view}>
    <a href="#main" className="skip-link">Skip to content</a>
    <aside className="sidebar"><a className="brand" href="/workspace?view=overview" onClick={e=>nav(e,'overview')}><span className="brand-mark"><Feather size={26}/></span>Shuttle<span>Sense</span></a><span className="brand-caption">Review a rally. Build your next session.</span>
      <nav aria-label="Main navigation">{sections.map(s=><a className={'nav-link '+(view===s.id?'active':'')} key={s.id} href={'/workspace?view='+s.id+(selected?'&analysis='+selected:'')} onClick={e=>nav(e,s.id)} aria-current={view===s.id?'page':undefined}><s.icon size={21}/><span>{s.label}</span>{s.id==='matches'&&<span className="nav-count">{savedAnalyses.length}</span>}</a>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-tip"><h3>One rally at a time.</h3><p>Watch the shuttle, inspect the attempt, then choose one thing to practise.</p><button className="text-button" onClick={()=>guide.current?.showModal()}>Recording tips <ArrowUpRight size={16}/></button></div><span className="help-link">Local analysis · near player</span></div>
    </aside>
    <div className="app-body"><header className="topbar"><div className="breadcrumb"><span>Workspace /</span><strong>{current.label}</strong></div><div className="topbar-actions"><a className="text-button workspace-website" href="/">Website <ArrowUpRight size={14}/></a><a className="text-button workspace-player" href="/login" aria-label={playerName?`Local profile: ${playerName}`:'Local login'}>{playerName||'Local login'}</a><button className="icon-button" aria-label={dark?'Switch to light theme':'Switch to dark theme'} onClick={()=>setDark(!dark)}>{dark?<Sun size={20}/>:<Moon size={20}/>}</button></div></header>
      <main id="main" className="main-content"><div className="page-heading workspace-hero"><div><div className="intro-label">SHUTTLESENSE · {current.label.toUpperCase()}</div><h1>{titles[view]}</h1><p>{descriptions[view]}</p><span className="hero-photo-note">Illustrative court · your recording below</span></div><button className="primary-button" onClick={()=>setUpload(true)}><UploadSimple size={18}/>Upload Match</button></div>
        {view==='matches'?<section className="panel library"><div className="panel-heading"><div><h2>Saved analyses</h2><p>{savedAnalyses.length} recordings · original videos stay on this computer</p></div></div>{savedAnalyses.map(a=><a className="match-library-row" key={a.id} href={'/review/'+a.id}><span className="library-thumbnail"><VideoCamera size={28}/></span><span><strong>{a.name}</strong><span>Local recording · analysis ready</span></span><span className="library-result">Review rallies</span><ArrowUpRight size={20}/></a>)}{!savedAnalyses.length&&<div className="library-empty"><h3>No recordings yet</h3><p>Upload a match to track its shuttle, divide rallies and review the near player.</p><button className="secondary-button" onClick={()=>setUpload(true)}>Choose a Video <ArrowRight size={17}/></button></div>}</section>:<>
          {savedAnalyses.length>0?<div className="recording-selector"><label htmlFor="workspace-recording">Recording</label><select id="workspace-recording" value={selected} onChange={e=>navigate(view,e.target.value)}>{savedAnalyses.map(a=><option value={a.id} key={a.id}>{a.name} · {a.id.slice(0,8)}</option>)}</select><a className="text-button" href={'/review/'+selected}>Open full review <ArrowUpRight size={16}/></a></div>:<section className="panel workspace-empty"><VideoCamera size={32}/><h2>Start with your own match</h2><p>Upload a video, mark the court, then review its rallies and shuttle evidence here.</p><button className="primary-button" onClick={()=>setUpload(true)}>Choose Video <UploadSimple size={17}/></button></section>}
          {loading&&<p className="workspace-loading" role="status">Loading recording and saved outcomes…</p>}
          {error&&<p role="alert" className="inline-error">{error}</p>}
          {data&&!loading&&!error&&<>
            {view==='overview'&&<><section className="metrics" aria-label="Recording summary"><div><span>Reviewable rallies</span><strong>{completed.length}<small>estimated rally divisions</small></strong></div><div><span>Marked losses</span><strong>{lost}<small>near-player outcome</small></strong></div><div><span>Marked wins</span><strong>{won}<small>{completed.length-lost-won} unknown outcomes</small></strong></div><div><span>Recording length</span><strong>{data.duration.toFixed(1)} s<small>{data.width} × {data.height} · {data.fps.toFixed(0)} fps</small></strong></div></section><section className="panel recording-next"><div><span className="intro-label">NEXT · REVIEW THE EVIDENCE</span><h2>{lost?lost+' marked losses to inspect':completed.length ? completed.length+' rally windows ready to replay' : 'Check your rally windows'}</h2><p>Compare the tracked shuttle with the near player's movement and exact attempt photo. Mark outcomes yourself; the ground model does not decide the winner.</p><button className="primary-button" onClick={()=>navigate('rallies')}>Review rallies <ArrowRight size={18}/></button></div><ol><li><strong>Replay</strong><span>Watch the full rally and its final seconds.</span></li><li><strong>Inspect</strong><span>Check shuttle separation, pose and the attempt frame.</span></li><li><strong>Practise</strong><span>Generate a review tied to these recording timestamps.</span></li></ol></section></>}
            {view==='rallies'&&<AnalysisReview key={data.analysisSha256} data={data} videoUrl={'/api/analysis/'+selected+'/video'} showReport={false}/>}
            {view==='practice'&&<div className="analysis-review"><MatchReport key={data.analysisSha256} data={data} videoUrl={'/api/analysis/'+selected+'/video'} reviews={reviews} outcomes={outcomes}/></div>}
          </>}
        </>}
        <footer className="page-footer"><span><Feather size={15}/>Built around the shuttle and the near player.</span><p>Tracking and coaching are estimates. Outcomes are your markings.</p></footer>
      </main>
    </div>
    <UploadDialog open={upload} onClose={()=>setUpload(false)}/>
    <dialog className="modal guide-modal" ref={guide} aria-labelledby="guide-heading"><div className="modal-header"><span className="modal-mark"><VideoCamera size={24}/></span><button className="icon-button" aria-label="Close recording tips" onClick={()=>guide.current?.close()}><X size={22}/></button></div><h2 id="guide-heading">Keep the shuttle in view</h2><p className="modal-subtitle">A fixed landscape view helps keep court calibration and player identity consistent.</p><ol className="guide-list"><li><strong>Show the full singles court.</strong>Keep the near player, both baselines and the shuttle visible.</li><li><strong>Keep the camera still.</strong>Avoid zooms and cuts during play.</li><li><strong>Mark the four court corners.</strong>Choose the singles boundaries on a clear court frame.</li><li><strong>Review before interpreting.</strong>Check rally boundaries and mark Lost, Won or Unknown yourself.</li></ol><button className="primary-button full-width" onClick={()=>{guide.current?.close();setUpload(true);}}>Choose Your Video <ArrowRight size={18}/></button></dialog>
  </div></IconContext.Provider>;
}
