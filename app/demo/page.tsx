import {AnalysisReview} from '@/components/analysis-review';
import {demoData} from '@/lib/public-demo';
export default function DemoPage(){
  return <main className="saved-analysis main-content"><a className="text-button" href="/">Back to workspace</a><header className="page-heading"><div><span className="intro-label">INTERACTIVE FEATURE DEMO</span><h1>Explore ShuttleSense.</h1><p>Generated court footage and synthetic evidence. No model inference or real match assessment. Outcomes reset on reload.</p></div></header><AnalysisReview data={demoData} videoUrl="/api/demo/video"/></main>;
}
