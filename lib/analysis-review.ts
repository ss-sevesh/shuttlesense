export type Side = "near" | "far";
export type Measurements = { leftElbow: number | null; rightElbow: number | null; leftKnee: number | null; rightKnee: number | null; wristSpeed: number | null };
export type ReviewPerson = { trackId: number; side: Side; box: [number, number, number, number]; court: [number, number]; landmarks: [number, number][]; scores: number[]; poseDetected: boolean; measurements?: Measurements };
export type ReviewShot = { id: number; time: number; side: Side; trackId: number; predictedType: string | null; rawType: string | null; score: number | null; status: string; playStatus: string; reason: string };
export type ReviewRally = { id: number; start: number; end: number | null; reviewStop: number; hitCandidates: number; startStatus: string; endStatus: string };
export type ReviewData = {
  videoSha256: string; analysisSha256: string; fileName: string; duration: number; width: number; height: number; fps: number; cached: boolean; poseSampleHz: number;
  samples: { time: number; people: ReviewPerson[] }[];
  shuttle: { time: number; point: [number, number] | null }[];
  shots: ReviewShot[]; rallies: ReviewRally[];
  metrics: { sampleCount: number; nearTracked: number; farTracked: number; nearPoses: number; farPoses: number; shuttleFrames: number; shuttleDetected: number };
  limitations: string[];
};
export const shotTypes = ["smash", "clear", "drop", "lift", "drive", "net shot", "defensive net shot", "push", "net kill", "crosscourt net shot", "short serve", "long serve"] as const;
export const canonicalShot = (value: string) => value.replace(/_/g," ").replace(/netshot/g,"net shot").replace(/netkill/g,"net kill");
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
  return typeof data.videoSha256 === "string" && /^[a-f0-9]{64}$/i.test(data.videoSha256) && typeof data.analysisSha256 === "string" && /^[a-f0-9]{64}$/i.test(data.analysisSha256) && typeof data.fileName === "string" &&
    [data.duration,data.width,data.height,data.fps,data.poseSampleHz].every(value => typeof value === "number" && Number.isFinite(value) && value > 0) &&
    Array.isArray(data.samples) && Array.isArray(data.shuttle) && Array.isArray(data.shots) && Array.isArray(data.rallies) && Array.isArray(data.limitations) && !!data.metrics && typeof data.metrics === "object";
}
export function nearestIndex(rows: { time: number }[], time: number, tolerance: number) {
  let low = 0, high = rows.length;
  while (low < high) { const middle = (low + high) >>> 1; if (rows[middle].time < time) low = middle + 1; else high = middle; }
  const index = low === rows.length || (low > 0 && time - rows[low - 1].time < rows[low].time - time) ? low - 1 : low;
  return index >= 0 && Math.abs(rows[index].time - time) <= tolerance ? index : -1;
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
