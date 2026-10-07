"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { ArrowRight, ArrowUpRight, CaretRight, ChartLineUp, Check, DownloadSimple, Feather, IconContext, Info, Moon, Play, Question, SquaresFour, Sun, Target, UploadSimple, VideoCamera, X } from "@phosphor-icons/react";
import { formatTime, issues, matchDate, rallies, type Filter, type View } from "@/lib/demo";
import { CourtMap } from "./court-map";
import { MatchReplay } from "./match-replay";
import { PracticePlan } from "./practice-plan";
import { UploadDialog } from "./upload-dialog";

const views: View[] = ["overview", "rallies", "practice", "matches"];
const filters: Filter[] = ["all", "lost", "won"];

export function CoachWorkspace() {
  const [view, setView] = useState<View>("overview");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState(18);
  const [issueFilter, setIssueFilter] = useState<string | null>(null);
  const [heatmapScope, setHeatmapScope] = useState("all");
  const [upload, setUpload] = useState(false);
  const [dark, setDark] = useState(false);
  const [status, setStatus] = useState("");
  const guide = useRef<HTMLDialogElement>(null);
  const replayAnchor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function readUrl() {
      const params = new URLSearchParams(window.location.search);
      setView(views.includes(params.get("view") as View) ? params.get("view") as View : "overview");
      setFilter(filters.includes(params.get("filter") as Filter) ? params.get("filter") as Filter : "all");
      const id = Number(params.get("rally")); setSelectedId(rallies.some(rally => rally.id === id) ? id : 18);
      setIssueFilter(issues.some(issue => issue.id === params.get("issue")) ? params.get("issue") : null);
    }
    readUrl(); window.addEventListener("popstate", readUrl);
    const media = window.matchMedia("(prefers-color-scheme: dark)"); setDark(media.matches);
    const syncTheme = () => setDark(media.matches); media.addEventListener("change", syncTheme);
    return () => { window.removeEventListener("popstate", readUrl); media.removeEventListener("change", syncTheme); };
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = dark ? "dark" : "light"; }, [dark]);
  function updateUrl(values: Record<string, string | null>) {
    const url = new URL(window.location.href); Object.entries(values).forEach(([key, value]) => value === null ? url.searchParams.delete(key) : url.searchParams.set(key, value)); window.history.pushState({}, "", url);
  }
  function changeView(next: View) { setView(next); updateUrl({view: next}); }
  function nav(event: MouseEvent<HTMLAnchorElement>, next: View) { if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return; event.preventDefault(); changeView(next); }
  function evidence(id: string) { const first = rallies.find(rally => rally.issue === id)!; setView("rallies"); setFilter("lost"); setIssueFilter(id); setSelectedId(first.id); updateUrl({ view: "rallies", filter: "lost", issue: id, rally: String(first.id) }); }
  function exportReport() {
    const text = `ShuttleSense | Sample match report\nFictional demo data, not analysis of an uploaded video.\n\nRallies: 24\nWon: 10\nLost: 14\n\n${issues.map(issue => `${issue.title}: ${issue.count} sample rallies\n${issue.description}\nPractice: ${issue.drill}`).join("\n\n")}`;
    const url = URL.createObjectURL(new Blob([text], {type: "text/plain"})); const a = document.createElement("a"); a.href = url; a.download = "shuttlesense-sample-report.txt"; a.click(); URL.revokeObjectURL(url); setStatus("Sample match report downloaded.");
  }
  const selected = rallies.find(rally => rally.id === selectedId)!;
  const visible = rallies.filter(rally => (filter === "all" || rally.outcome === filter) && (!issueFilter || rally.issue === issueFilter));
  const date = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(matchDate);
  const navigation = [{view:"overview" as View, title:"Overview", icon:SquaresFour}, {view:"matches" as View, title:"My Matches", icon:VideoCamera}, {view:"practice" as View, title:"Practice Plan", icon:Target}];
  return <IconContext.Provider value={{ "aria-hidden": true }}><div className="workspace">
    <a href="#main" className="skip-link">Skip to content</a>
    <aside className="sidebar"><a className="brand" href="/?view=overview" onClick={event => nav(event,"overview")} translate="no"><span className="brand-mark"><Feather size={26} weight="bold"/></span>Shuttle<span>Sense</span></a><span className="brand-caption">A little insight. A better game.</span>
      <nav aria-label="Main navigation">{navigation.map(item => <a key={item.view} href={`/?view=${item.view}`} onClick={event => nav(event,item.view)} className={`nav-link ${view === item.view || (item.view === "overview" && view === "rallies") ? "active" : ""}`} aria-current={view === item.view ? "page" : undefined}><item.icon size={21}/><span>{item.title}</span>{item.view === "matches" && <span className="nav-count">1</span>}</a>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-tip"><span className="tip-icon"><ChartLineUp size={25}/></span><h3>Small changes.<br/>Better rallies.</h3><p>Take one thing from your match into your next session.</p><button className="text-button" onClick={() => guide.current?.showModal()}>Recording Tips <ArrowUpRight size={16}/></button></div><button className="help-link" onClick={() => guide.current?.showModal()}><Question size={20}/> Help & Getting Started</button><div className="workspace-profile"><span className="profile-initial">P</span><div><strong>Your Workspace</strong><span>Singles player</span></div><Check size={15}/></div></div>
    </aside>
    <div className="app-body"><header className="topbar"><div className="breadcrumb"><span>Workspace</span><CaretRight size={13}/><strong>{view === "matches" ? "My Matches" : view === "practice" ? "Practice Plan" : "Match Overview"}</strong></div><div className="topbar-actions"><span className="sample-label"><Info size={14}/> Demo workspace</span><button className="icon-button" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => setDark(!dark)}>{dark ? <Sun size={20}/> : <Moon size={20}/>}</button><span className="avatar" aria-label="Player workspace">P</span></div></header>
      <main id="main" className="main-content"><div className="page-heading"><div><div className="intro-label">YOUR GAME, UNDERSTOOD</div><h1>{view === "practice" ? "Make your next session count." : view === "matches" ? "Every match has a lesson." : "See the rally. Find the reason."}</h1><p>{view === "practice" ? "A focused plan built around what needs your attention." : view === "matches" ? "Your match library. A clearer picture of your progress." : "Go beyond the score. Know what to work on next."}</p></div><button className="primary-button" onClick={() => setUpload(true)}><UploadSimple size={18}/>Upload Match</button></div>
      {view === "matches" ? <section className="panel library"><div className="panel-heading"><div><h2>Your Matches</h2><p>1 sample match. Your recordings stay on your device in this preview.</p></div></div><button className="match-library-row" onClick={() => changeView("overview")}><span className="library-thumbnail"><VideoCamera size={30}/></span><span><strong>Evening singles</strong><span>{date} <span className="meta-separator">/</span> 32:18 <span className="meta-separator">/</span> Sample match</span></span><span className="library-result">10 won · 14 lost</span><ArrowUpRight size={23}/></button><div className="library-empty"><UploadSimple size={31}/><h3>Your next match belongs here.</h3><p>Preview a phone video, then explore the sample coaching experience.</p><button className="secondary-button" onClick={() => setUpload(true)}>Choose a Video <ArrowRight size={17}/></button></div></section> : <>
        <section className="match-strip" aria-label="Current match"><div className="match-icon"><VideoCamera size={22}/></div><div className="match-name"><strong>Evening singles</strong><span>{date} <span className="meta-separator">/</span> Singles <span className="meta-separator">/</span> 32:18</span></div><span className="sample-match">Sample match</span><button className="secondary-button export-button" onClick={exportReport}><DownloadSimple size={17}/>Export Report</button></section>
        <nav className="match-tabs" aria-label="Match sections">{[{id:"overview" as View,label:"Overview"},{id:"rallies" as View,label:"Rally Review"},{id:"practice" as View,label:"Practice Plan"}].map(tab => <a key={tab.id} href={`/?view=${tab.id}`} onClick={event => nav(event,tab.id)} className={view === tab.id ? "selected" : ""} aria-current={view === tab.id ? "page" : undefined}>{tab.label}{tab.id === "rallies" && <span>24</span>}</a>)}</nav>
        {view === "practice" ? <PracticePlan/> : <>
          <section className="metrics" aria-label="Sample match summary"><div><span>Total Rallies</span><strong>24<small>rallies played</small></strong></div><div><span>Rallies Won</span><strong>10<small className="metric-positive">42% of rallies</small></strong></div><div><span>Rallies Lost</span><strong>14<small>Room to improve</small></strong></div><div className="priority-metric"><span>Your Main Focus</span><strong>Front-right<small>Recovery & first-step timing <ArrowUpRight size={15}/></small></strong></div></section>
          <div className="review-grid"><div className="review-left" ref={replayAnchor}><MatchReplay rally={selected}/><section className="panel timeline-panel" aria-labelledby="timeline-heading"><div className="panel-heading"><div><h2 id="timeline-heading">The rally breakdown</h2><p>Every point has a story. Pick one.</p></div><div className="filter-group" aria-label="Filter rallies">{filters.map(value => <button key={value} aria-pressed={filter === value} className={filter === value ? "selected" : ""} onClick={() => {setFilter(value); setIssueFilter(null); updateUrl({filter:value,issue:null});}}>{value === "all" ? "All" : value === "lost" ? "Lost" : "Won"}</button>)}</div></div>
            {issueFilter && <div className="active-filter">{issues.find(issue => issue.id === issueFilter)?.title}<button className="text-button" onClick={() => {setIssueFilter(null); updateUrl({issue:null});}}>Clear Filter <X size={14}/></button></div>}
            <div className="rally-bars" aria-label={`${visible.length} sample rallies`}>{visible.map(rally => <button key={rally.id} title={`Rally ${rally.id}: ${rally.outcome}, ${rally.duration} seconds`} aria-label={`Rally ${rally.id}, ${rally.outcome}`} aria-pressed={selectedId === rally.id} className={`rally-bar ${rally.outcome} ${selectedId === rally.id ? "selected" : ""}`} onClick={() => {setSelectedId(rally.id); updateUrl({rally:String(rally.id)});}}><span style={{height:`${24 + rally.duration}px`}}/ ><small>{rally.id}</small></button>)}</div><div className="timeline-footer"><div><span className="legend-swatch won"/>Won<span className="legend-swatch lost"/>Lost</div><span>{visible.length} rallies <span className="meta-separator">/</span> {selected.shots} shots in selected rally</span></div>
            {view === "rallies" && <div className="rally-table"><div className="rally-table-heading"><span>Rally</span><span>Time</span><span>Result</span><span>Review note</span></div>{visible.map(rally => <button key={rally.id} className={`rally-table-row ${selectedId === rally.id ? "selected" : ""}`} onClick={() => {setSelectedId(rally.id); updateUrl({rally:String(rally.id)}); replayAnchor.current?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",block:"start"});}}><strong>{rally.id.toString().padStart(2,"0")}</strong><span>{formatTime(rally.start)}</span><span>{rally.outcome === "won" ? "Won" : "Lost"}</span><span>{issues.find(issue => issue.id === rally.issue)?.title || "Review this rally"}<Play size={13}/></span></button>)}</div>}
          </section></div>
          <div className="review-right"><section className="panel heatmap-panel" aria-labelledby="heatmap-heading"><div className="panel-heading"><div><h2 id="heatmap-heading">Your court coverage</h2><p>Where you spent your time.</p></div><select name="heatmap-scope" aria-label="Heatmap rally scope" value={heatmapScope} onChange={event => setHeatmapScope(event.target.value)}><option value="all">All rallies</option><option value="lost">Lost rallies</option></select></div><CourtMap scope={heatmapScope}/><div className="heatmap-legend"><span>Less time</span><div/><span>More time</span></div><div className="court-focus"><span className="focus-index">1</span><div><strong>Front-right needs attention</strong><span>{heatmapScope === "all" ? "Late arrival in 5 sample rallies" : "5 of 14 lost sample rallies"}</span></div><button className="icon-button" aria-label="Review front-right rallies" onClick={() => evidence("front")}><ArrowUpRight size={19}/></button></div></section><PracticePlan compact onViewPlan={() => changeView("practice")}/></div>
          </div>
          <a className="text-button" href="/movement">View tracked clip movement <ArrowUpRight size={17}/></a>
          <section className="insights-section" aria-labelledby="insights-heading"><div className="insights-heading"><div><h2 id="insights-heading">What changed the point?</h2><p>Patterns worth taking into your next practice.</p></div><span><Info size={15}/>Sample coaching insights</span></div><div className="insight-list">{issues.map((issue,index) => <article className="insight" key={issue.id}><span className="insight-number">{(index+1).toString().padStart(2,"0")}</span><div className="insight-copy"><div><h3>{issue.title}</h3><span>{issue.count} lost rallies</span></div><p>{issue.description}</p><span className="insight-action"><Target size={15}/>{issue.action}</span></div><button className="text-button" onClick={() => evidence(issue.id)}>See the Rallies <ArrowUpRight size={17}/></button></article>)}</div></section>
        </>}
      </>}
      <footer className="page-footer"><span><Feather size={15}/>A little insight goes a long way.</span><p>Demo data & illustrative imagery. No uploaded video has been analyzed.</p></footer><div className="sr-only" role="status">{status}</div>
      </main>
    </div>
    <UploadDialog open={upload} onClose={() => setUpload(false)}/>
    <dialog className="modal guide-modal" ref={guide} aria-labelledby="guide-heading"><div className="modal-header"><span className="modal-mark"><VideoCamera size={24}/></span><button className="icon-button" aria-label="Close recording tips" onClick={() => guide.current?.close()}><X size={22}/></button></div><h2 id="guide-heading">Give your game a clear view.</h2><p className="modal-subtitle">A simple recording setup makes every rally easier to review.</p><ol className="guide-list"><li><strong>Keep your phone still.</strong>Use a stable stand behind the baseline, at a safe distance.</li><li><strong>Capture the whole court.</strong>Record in landscape. Keep both players and all court lines visible.</li><li><strong>Let the match run.</strong>Avoid zooming or moving the camera between rallies.</li><li><strong>Start with singles.</strong>This prototype is designed around 2 players and one court.</li></ol><div className="privacy-note"><Info size={19}/><p>This is a frontend prototype. Rally results and coaching insights are sample data; your chosen video is previewed locally.</p></div><button className="primary-button full-width" onClick={() => {guide.current?.close(); setUpload(true);}}>Choose Your Video <ArrowRight size={18}/></button></dialog>
  </div></IconContext.Provider>;
}
