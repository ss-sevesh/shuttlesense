import { analysisOptions, type AnalysisOptions } from './analysis-options.ts';
export type Side = "near" | "far";
export type Measurements = { leftElbow: number | null; rightElbow: number | null; leftKnee: number | null; rightKnee: number | null; wristSpeed: number | null };
export type ReviewPerson = { trackId: number; side: Side; box: [number, number, number, number]; court: [number, number]; landmarks: [number, number][]; scores: number[]; poseDetected: boolean; measurements?: Measurements };
export type ContactEvidence = { method: "wrist_distance"; status: string; frame: number | null; seedFrame: number; wrist: "left" | "right"; distancePx: number | null; distanceHeights: number | null; windowFrames: [number, number]; frames: (number | null)[]; measurements: { elbow: number | null; armExtension: number | null; bodyLean: number | null; armElevation: number | null; racketFace: null } };
export type ShotCoaching = { status: "experimental" | "unavailable"; model?: string; revision?: string; evidenceSha256?: string; reason?: string; answer?: { shotType: string; visibleEvidence: string; uncertainty: string; coaching: string } };
export type ReviewShot = { id: number; time: number; side: Side; trackId: number; predictedType: string | null; rawType: string | null; score: number | null; status: string; playStatus: string; reason: string; contact?: ContactEvidence; coaching?: ShotCoaching | null; classificationWindow?: [number,number] };
export type EndingReview = {rallyId:number;endTime:number|null;windowStart:number;windowEnd:number;status:string;summary:string;lastShot:{time:number;type:string|null;status:string}|null;evidence:{frame:number;time:number;distancePx:number;distanceHeights:number;horizontalOffsetPx:number;wristPoint:[number,number];shuttlePoint:[number,number];pose:string}|null};
export type ReviewRally = { id: number; start: number; end: number | null; reviewStop: number; hitCandidates: number; startStatus: string; endStatus: string };
export type GroundLanding = { status: "experimental" | "unavailable"; model: string; revision: string; reason: string; candidates: { frame: number; time: number; point: [number, number]; status: "possible_landing"; holdFrames: number; floorScore: number }[] };
export type ReviewData = {
  videoSha256: string; analysisSha256: string; fileName: string; duration: number; width: number; height: number; fps: number; cached: boolean; poseSampleHz: number;
  samples: { time: number; people: ReviewPerson[] }[];
  shuttle: { time: number; point: [number, number] | null }[];
  shots: ReviewShot[]; rallies: ReviewRally[];
  metrics: { sampleCount: number; nearTracked: number; farTracked: number; nearPoses: number; farPoses: number; shuttleFrames: number; shuttleDetected: number };
  limitations: string[];
  pipelineVersion?: string;
  focusSide?: Side | null;
  groundLanding?: GroundLanding;
  options?: AnalysisOptions;
  sceneSummary?: { courtSegments: [number, number][]; excludedFrames: number };
  courtLines?: { method: string; reason: string; segments: { start: number; end: number; lines: { name: string; points: [number, number][]; support: number }[] }[] };
  hitPoses?: { frame: number; time: number; trackId: number; status: string; pose: string; reason: string; measurements: { elbow: number | null; bodyLean: number | null } }[];
  endingReview?: EndingReview[];
};
export const shotTypes = ["smash", "clear", "drop", "lift", "drive", "net shot", "defensive net shot", "push", "net kill", "crosscourt net shot", "short serve", "long serve"] as const;
export const canonicalShot = (value: string) => value.replace(/_/g," ").replace(/cross-court/g,"crosscourt").replace(/netshot/g,"net shot").replace(/netkill/g,"net kill");
export const readable = (value: string | null | undefined) => value ? value.replace(/_/g, " ").replace(/\bnetshot\b/g, "net shot").replace(/\bnetkill\b/g, "net kill").replace(/\bcrosscourt\b/g, "cross-court").replace(/^./, c => c.toUpperCase()) : "Unknown";
export function reviewReason(value: string) {
  if (/identity|track.*switch/i.test(value)) return "Player identity changed around this contact.";
  if (/missing|tracking|pose/i.test(value)) return "Tracking or body landmarks were missing around this contact.";
  if (/side|mismatch/i.test(value)) return "The predicted player side did not match the contact.";
  if (/threshold/i.test(value)) return "The model score was below the acceptance threshold.";
  if (/unknown.*class/i.test(value)) return "The model predicted an unknown shot class.";
  if (/confidence|threshold|model|unknown/i.test(value)) return "The model could not accept a reliable label for this contact.";
  return "Watch the contact and choose the label you observe.";
}
export function isReviewData(value: unknown): value is ReviewData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ReviewData>;
  try { analysisOptions(data.options); } catch { return false; }
  if (!validNearEvidence(data)) return false;
  if (!validEndingReview(data)) return false;
  return typeof data.videoSha256 === "string" && /^[a-f0-9]{64}$/i.test(data.videoSha256) && typeof data.analysisSha256 === "string" && /^[a-f0-9]{64}$/i.test(data.analysisSha256) && typeof data.fileName === "string" &&
    [data.duration,data.width,data.height,data.fps,data.poseSampleHz].every(value => typeof value === "number" && Number.isFinite(value) && value > 0) &&
    Array.isArray(data.samples) && Array.isArray(data.shuttle) && Array.isArray(data.shots) && data.shots.every(shot => shot && typeof shot === "object" && (shot.classificationWindow === undefined || (Array.isArray(shot.classificationWindow) && shot.classificationWindow.length === 2 && validInterval(shot.classificationWindow[0],shot.classificationWindow[1],data.duration!) && shot.classificationWindow[0] <= shot.time && shot.time < shot.classificationWindow[1])) && validContact(shot.contact, data.duration!, data.fps!) && validCoaching(shot.coaching)) && validGround(data.groundLanding, data.duration!, data.fps!, data.width!, data.height!) && Array.isArray(data.rallies) && Array.isArray(data.limitations) && !!data.metrics && typeof data.metrics === "object";
}
function validEndingReview(data: Partial<ReviewData>) {
  if (data.endingReview === undefined) return true;
  if (!Array.isArray(data.rallies)) return false;
  const point = (p: number[]) => Array.isArray(p) && p.length===2 && p.every(v => Number.isFinite(v) && v>=0 && v<=1);
  return Array.isArray(data.endingReview) && data.endingReview.every(item => {
    if (!item || !Number.isSafeInteger(item.rallyId) || !data.rallies?.some(r => r.id===item.rallyId) || !validInterval(item.windowStart,item.windowEnd,data.duration!) || !['unknown','reach_or_swing_observed','moving_toward_shuttle','opposite_side_no_clear_attempt','no_clear_attempt'].includes(item.status) || typeof item.summary!=='string' || item.summary.length>2000 || (item.endTime!==null && (!Number.isFinite(item.endTime) || item.endTime!==item.windowEnd))) return false;
    if (item.lastShot!==null && (!item.lastShot || !Number.isFinite(item.lastShot.time) || item.lastShot.time<0 || item.lastShot.time>=item.windowEnd || typeof item.lastShot.status!=='string' || (item.lastShot.type!==null && (typeof item.lastShot.type!=='string' || !shotTypes.includes(canonicalShot(item.lastShot.type) as typeof shotTypes[number]))))) return false;
    const e=item.evidence;
    if (item.status==='unknown') return e===null;
    return item.endTime!==null && !!e && Number.isSafeInteger(e.frame) && e.frame>=0 && Number.isFinite(e.time) && Math.abs(e.frame/data.fps!-e.time)<.1/data.fps! && e.time>=item.windowStart && e.time<item.windowEnd && [e.distancePx,e.distanceHeights].every(v => Number.isFinite(v) && v>=0) && Number.isFinite(e.horizontalOffsetPx) && point(e.wristPoint) && point(e.shuttlePoint) && typeof e.pose==='string';
  });
}
function validNearEvidence(data: Partial<ReviewData>) {
  const point = (p: number[]) => Array.isArray(p) && p.length === 2 && p.every(v => Number.isFinite(v) && v >= 0 && v <= 1);
  if (data.courtLines !== undefined) {
    const lines = data.courtLines;
    if (!lines || typeof lines.method !== 'string' || typeof lines.reason !== 'string' || !Array.isArray(lines.segments) || !lines.segments.every(s => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.start >= 0 && s.end > s.start && s.end <= data.duration!+.001 && Array.isArray(s.lines) && s.lines.every(l => l && typeof l.name === 'string' && Array.isArray(l.points) && l.points.length === 2 && l.points.every(point) && Number.isFinite(l.support) && l.support >= 0 && l.support <= 1))) return false;
  }
  return data.hitPoses === undefined || (Array.isArray(data.hitPoses) && data.hitPoses.every(e => e && Number.isSafeInteger(e.frame) && e.frame >= 0 && e.frame < Math.round(data.duration!*data.fps!) && Number.isFinite(e.time) && Math.abs(e.time-e.frame/data.fps!) < .1/data.fps! && Number.isSafeInteger(e.trackId) && ['estimated_contact','swing_candidate'].includes(e.status) && typeof e.pose === 'string' && typeof e.reason === 'string' && e.measurements && [e.measurements.elbow,e.measurements.bodyLean].every(v => v === null || (Number.isFinite(v) && v >= 0 && v <= 180))));
}
function validGround(ground: GroundLanding | undefined, duration: number, fps: number, width: number, height: number) {
  if (ground === undefined) return true;
  if (!ground || typeof ground !== "object" || !["experimental", "unavailable"].includes(ground.status) ||
      ![ground.model, ground.revision, ground.reason].every(value => typeof value === "string") || !Array.isArray(ground.candidates)) return false;
  if (ground.status === "unavailable") return ground.candidates.length === 0;
  return ground.candidates.every(item => item && item.status === "possible_landing" && Number.isSafeInteger(item.frame) && item.frame >= 0 &&
    Number.isFinite(item.time) && item.time >= 0 && item.time < duration && Math.abs(item.time - item.frame / fps) < .1 / fps &&
    Number.isSafeInteger(item.holdFrames) && item.holdFrames >= 3 && Number.isFinite(item.floorScore) && item.floorScore >= 0 && item.floorScore <= 1 &&
    Array.isArray(item.point) && item.point.length === 2 && item.point.every(Number.isFinite) && item.point[0] >= 0 && item.point[0] < width && item.point[1] >= 0 && item.point[1] < height);
}
function validCoaching(coaching: ShotCoaching | null | undefined) {
  if (coaching == null) return true;
  if (typeof coaching !== "object") return false;
  if (coaching.status === "unavailable") return typeof coaching.reason === "string";
  const answer = coaching.answer;
  return coaching.status === "experimental" && !!answer && typeof answer === "object" &&
    [...shotTypes, "unknown"].includes(answer.shotType) && [answer.visibleEvidence, answer.uncertainty, answer.coaching].every(value => typeof value === "string" && value.length > 0 && value.length <= 2000);
}
function validContact(contact: ContactEvidence | undefined, duration: number, fps: number) {
  if (contact === undefined) return true;
  if (!contact || typeof contact !== "object") return false;
  const frame = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < Math.round(duration * fps);
  const angle = (value: unknown) => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 180);
  return contact.method === "wrist_distance" && typeof contact.status === "string" && ["left", "right"].includes(contact.wrist) &&
    (contact.status === "estimated" ? frame(contact.frame) : contact.frame === null) && frame(contact.seedFrame) &&
    [contact.distancePx, contact.distanceHeights].every(value => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0)) &&
    Array.isArray(contact.windowFrames) && contact.windowFrames.length === 2 && contact.windowFrames.every(Number.isSafeInteger) &&
    Array.isArray(contact.frames) && (contact.frame === null ? contact.frames.length === 0 : contact.frames.length === 5 && contact.frames.every((value, index) => value === null ? !frame(contact.frame! + index - 2) : frame(value) && value === contact.frame! + index - 2)) &&
    !!contact.measurements && [contact.measurements.elbow, contact.measurements.armExtension, contact.measurements.bodyLean, contact.measurements.armElevation].every(angle) && contact.measurements.racketFace === null;
}
export function nearestIndex(rows: { time: number }[], time: number, tolerance: number) {
  let low = 0, high = rows.length;
  while (low < high) { const middle = (low + high) >>> 1; if (rows[middle].time < time) low = middle + 1; else high = middle; }
  const index = low === rows.length || (low > 0 && time - rows[low - 1].time < rows[low].time - time) ? low - 1 : low;
  return index >= 0 && Math.abs(rows[index].time - time) <= tolerance ? index : -1;
}
export function movementHeatmap(data: Pick<ReviewData,'samples'|'poseSampleHz'|'duration'>, side: Side, time: number, windows?: [number,number][]) {
  const grid: number[][] = Array.from({length:8}, () => Array(6).fill(0));
  let seconds = 0;
  const intervals: [number,number][] = [];
  for (const [start,end] of (windows ?? [[0,data.duration]]).filter(([start,end])=>validInterval(start,end,data.duration)).sort((a,b)=>a[0]-b[0])) {
    const last = intervals.at(-1);
    if (last && start<=last[1]) last[1]=Math.max(last[1],end);
    else intervals.push([start,end]);
  }
  for (const sample of data.samples) {
    if (sample.time >= time) break;
    for (const person of sample.people) {
      const [x,y] = person.court;
      if (person.side !== side || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) continue;
      const stop = Math.min(sample.time+1/data.poseSampleHz,time,data.duration);
      const weight = intervals.reduce((total,[start,end])=>total+Math.max(0,Math.min(stop,end)-Math.max(sample.time,start)),0);
      grid[Math.min(7,Math.floor(y*8))][Math.min(5,Math.floor(x*6))] += weight;
      seconds += weight;
    }
  }
  const windowSeconds=intervals.reduce((total,[start,end])=>total+Math.max(0,Math.min(end,time)-start),0);
  return {grid,seconds,windowSeconds};
}
export function validInterval(start: number, end: number, duration: number) { return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= duration; }
export type HumanReviews = { shots: Record<string, { label: string; reviewedAt: string }>; rallies: Record<string, { start: number; end: number; reviewedAt: string }> };
export const reviewStorageKey = (data: Pick<ReviewData,"analysisSha256">) => `shuttlesense-reviewed-${data.analysisSha256}`;
export function parseReviews(text: string | null, data: ReviewData): HumanReviews {
  const result: HumanReviews = { shots: {}, rallies: {} };
  try {
    const raw = JSON.parse(text || "null");
    if (!raw || typeof raw !== "object") return result;
    for (const shot of data.shots) {
      const item = raw.shots?.[shot.id];
      const label = typeof item?.label === "string" ? canonicalShot(item.label) : "";
      if (item && [...shotTypes, "not playing", "unknown"].includes(label) && typeof item.reviewedAt === "string") result.shots[shot.id] = { label, reviewedAt: item.reviewedAt };
    }
    for (const rally of data.rallies) {
      const item = raw.rallies?.[rally.id];
      if (item && validInterval(item.start, item.end, data.duration) && typeof item.reviewedAt === "string") result.rallies[rally.id] = { start: item.start, end: item.end, reviewedAt: item.reviewedAt };
    }
  } catch { /* Corrupt browser storage must not hide the model results. */ }
  return result;
}
