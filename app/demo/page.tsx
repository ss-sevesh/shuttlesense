import {AnalysisReview} from '@/components/analysis-review';
import {demoData} from '@/lib/public-demo';
export default function DemoPage(){
  return <main className="saved-analysis main-content"><a className="text-button" href="/workspace">Back to workspace</a><header className="page-heading workspace-hero"><div><span className="intro-label">INTERACTIVE FEATURE DEMO</span><h1>Explore your next rally.</h1><p>Generated court footage and synthetic evidence. No model inference or real match assessment. Outcomes reset on reload.</p><span className="hero-photo-note">Illustrative court · synthetic demo below</span></div></header><AnalysisReview data={demoData} videoUrl="/api/demo/video"/></main>;
}
