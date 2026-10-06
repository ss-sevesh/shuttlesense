export type View = "overview" | "rallies" | "practice" | "matches";
export type Outcome = "won" | "lost";
export type Filter = "all" | Outcome;

export const issues = [
  { id: "front", title: "Late to the front-right", count: 5, label: "Footwork", description: "In this sample, a delayed first step left you reaching for the shuttle rather than meeting it early.", action: "Work on your diagonal recovery", drill: "Diagonal recovery", duration: 8 },
  { id: "base", title: "Stayed away from your base", count: 4, label: "Positioning", description: "The reviewed sample shows you staying at the back after a shot, leaving more court to cover on the next return.", action: "Reset after every shot", drill: "Base-position shadow footwork", duration: 6 },
  { id: "clear", title: "Clears landed too short", count: 3, label: "Shot depth", description: "In the annotated sample, short clears gave your opponent an opportunity to attack. This needs landing evidence in a real analysis.", action: "Aim for the back tramline", drill: "Deep-clear targets", duration: 10 },
] as const;

const won = new Set([1, 3, 4, 7, 9, 11, 14, 17, 20, 23]);
const front = new Set([2, 6, 12, 18, 24]);
const base = new Set([5, 10, 16, 21]);
const clear = new Set([8, 15, 22]);
export const rallies = Array.from({ length: 24 }, (_, index) => {
  const id = index + 1;
  const issue = front.has(id) ? "front" : base.has(id) ? "base" : clear.has(id) ? "clear" : null;
  return { id, outcome: (won.has(id) ? "won" : "lost") as Outcome, start: index * 73 + 12, duration: [18, 26, 14, 32, 21, 29][index % 6], shots: [8, 12, 6, 16, 10, 14][index % 6], issue };
});
export type Rally = typeof rallies[number];
export const matchDate = new Date("2026-10-05T12:00:00Z");
export const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

export const drills = [
  { id: "front", title: "Diagonal recovery", subtitle: "Get to the front-right, then get back.", minutes: 8, sets: "4 sets × 45 sec", focus: "Footwork", steps: ["Start at your base with knees soft and your racket up.", "Split-step, then move diagonally to the front-right. Lunge in balance.", "Push back to your base. Reset before the next repetition.", "Work for 45 seconds; rest for 45 seconds. Repeat 4 times."], cue: "Finish each recovery balanced, ready to move either way." },
  { id: "clear", title: "Deep-clear targets", subtitle: "Create space with a deeper clear.", minutes: 10, sets: "3 sets × 10 shots", focus: "Shot depth", steps: ["Place a safe, flat target inside the back tramline.", "Ask a partner to feed comfortable high shuttles.", "Hit 10 clears toward the target and note where they land.", "Rest between sets. Prioritize a relaxed contact over force."], cue: "Aim to land 7 of 10 clears in your chosen rear-court target." },
  { id: "base", title: "Base-position shadow", subtitle: "Make recovery part of every shot.", minutes: 6, sets: "3 sets × 60 sec", focus: "Positioning", steps: ["Mark a base appropriate for your practice pattern.", "Shadow a shot to one corner, without a shuttle.", "Recover to your base and split-step before moving again.", "Alternate corners for 60 seconds, then rest for 60 seconds."], cue: "Return in balance every time. Reduce speed if form slips." },
] as const;
