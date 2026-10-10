"use client";

import { useId } from "react";

export function CourtMap({ mode = "heatmap", progress = 0, scope = "all", grid, position }: { mode?: "heatmap" | "trail" | "drill"; progress?: number; scope?: string; grid?: number[][]; position?: [number,number] }) {
  const point = { x: 120 + progress * 94, y: 205 - progress * 81 };
  const id = useId();
  return <svg className={`court-map court-${mode}`} viewBox="0 0 280 360" role="img" aria-label={grid ? "Approximate tracked movement heatmap; shaded cells show projected box positions, not verified foot contacts" : mode === "heatmap" ? "Sample movement heatmap: most time near rear-left and base, with front-right marked as the review priority" : mode === "drill" ? "Diagonal drill: move from base to front-right, then recover to base" : "Illustrative player movement trail toward front-right"}>
    <defs>
      <radialGradient id={`heat-${id}`}><stop stopColor="#b9df94" stopOpacity=".9"/><stop offset=".5" stopColor="#8fc678" stopOpacity=".55"/><stop offset="1" stopColor="#7aac7a" stopOpacity="0"/></radialGradient>
      <pattern id={`texture-${id}`} width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".5" fill="currentColor" opacity=".12"/></pattern>
    </defs>
    <rect x="25" y="22" width="230" height="315" rx="3" fill="var(--court)"/>
    <rect x="25" y="22" width="230" height="315" fill={`url(#texture-${id})`}/>
    {/* Fixed seconds scale keeps the first observation faint instead of making it the maximum. */}
    {mode === "heatmap" && (grid ? <g>{grid.flatMap((row, y) => row.map((seconds, x) => seconds > 0 && <rect key={`${y}-${x}`} x={56 + x * 168 / 6} y={38 + y * 283 / 8} width={168 / 6} height={283 / 8} fill="var(--court-highlight)" opacity={.85 * Math.min(seconds / 5, 1)}><title>{`Row ${y + 1}, column ${x + 1}: ${seconds.toFixed(2)} seconds of approximate positions`}</title></rect>))}</g> : <g><ellipse cx={scope === "lost" ? 90 : 107} cy="257" rx="69" ry="60" fill={`url(#heat-${id})`}/><ellipse cx="143" cy="211" rx={scope === "lost" ? 49 : 72} ry="77" fill={`url(#heat-${id})`}/><ellipse cx="195" cy="145" rx="43" ry="36" fill={`url(#heat-${id})`}/></g>)}
    <g stroke="var(--court-line)" strokeWidth="1.1" fill="none"><rect x="40" y="38" width="200" height="283"/><path d="M56 38V321M224 38V321M40 54H240M40 305H240M40 140H240M40 219H240M140 38V140M140 219V321"/></g>
    <path d="M25 180H255" stroke="var(--court-line)" strokeWidth="2" strokeDasharray="3 3"/>
    <text x="140" y="171" textAnchor="middle" fill="var(--court-line)" opacity=".8" fontSize="8" letterSpacing="2">NET</text>
    {position && position.every(v => Number.isFinite(v) && v >= 0 && v <= 1) && <circle data-live-position="true" cx={56+position[0]*168} cy={38+position[1]*283} r="5" fill="#ffe766" stroke="#183522" strokeWidth="2"><title>Current approximate player position</title></circle>}
    {mode === "heatmap" ? <g>{!grid && <><rect x="179" y="190" width="51" height="50" rx="3" fill="none" stroke="var(--court-line)" strokeDasharray="4 3"/><circle cx="205" cy="214" r="10" fill="var(--court-line)"/><text x="205" y="217" textAnchor="middle" fill="var(--court)" fontSize="10" fontWeight="700">1</text></>}<text x="140" y="351" textAnchor="middle" fill="var(--muted)" fontSize="10">YOUR SIDE</text></g> : <g><path d="M120 263L101 224L140 233L213 204L140 263" fill="none" stroke="var(--court-highlight)" strokeWidth="2.5" strokeDasharray="6 4"/><circle cx={mode === "drill" ? 140 : point.x} cy={mode === "drill" ? 263 : point.y + 63} r="7" fill="var(--court-highlight)" stroke="var(--court-line)" strokeWidth="2"/><circle cx="213" cy="204" r="10" fill="none" stroke="var(--court-highlight)" strokeWidth="2"/><text x="140" y="288" textAnchor="middle" fill="var(--court-line)" fontSize="10">BASE</text><text x="204" y="193" textAnchor="middle" fill="var(--court-line)" fontSize="9">FRONT-RIGHT</text></g>}
  </svg>;
}
