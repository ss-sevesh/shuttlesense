import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { connection } from "next/server";
import { CourtMap } from "@/components/court-map";

type Preview = { version: number; kind: string; player_id: string; start_s: number; end_s: number; grid_seconds: number[][]; mapped_s: number; outside_s: number; missing_s: number; proposal_samples: number; contact_verified: boolean };

export default async function MovementPage() {
  await connection(); // Keep private analysis out of prerendered build artifacts.
  let data: Preview | null = null;
  let message = "No movement analysis is available yet.";
  try {
    const result: Preview = JSON.parse(await readFile(join(process.cwd(), "data/feasibility/movement-preview/results.json"), "utf8"));
    if (result.version !== 1 || result.kind !== "approximate_box_movement" || result.contact_verified !== false ||
        typeof result.player_id !== "string" || result.player_id.length > 100 ||
        ![result.start_s, result.end_s, result.mapped_s, result.outside_s, result.missing_s, result.proposal_samples].every(value => typeof value === "number" && Number.isFinite(value) && value >= 0) ||
        result.end_s <= result.start_s || !Number.isInteger(result.proposal_samples) ||
        !Array.isArray(result.grid_seconds) || result.grid_seconds.length !== 8 ||
        !result.grid_seconds.every(row => Array.isArray(row) && row.length === 6 && row.every(value => typeof value === "number" && Number.isFinite(value) && value >= 0)) ||
        Math.abs(result.grid_seconds.flat().reduce((sum, value) => sum + value, 0) - result.mapped_s) > 1e-6 ||
        Math.abs(result.mapped_s + result.outside_s + result.missing_s - (result.end_s - result.start_s)) > 1e-6) {
      throw new Error("Invalid movement preview");
    }
    data = result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("Movement preview could not be read", error);
      message = "Movement analysis could not be loaded. Please regenerate this clip’s analysis.";
    }
  }
  return <main id="main" className="main-content movement-preview">
    <a className="text-button" href="/">← Back to workspace</a>
    <div className="page-heading"><div><div className="intro-label">TRACKED CLIP · APPROXIMATE</div><h1>Movement from your clip.</h1><p>Coarse player positions from the white-shirt tracking experiment.</p></div></div>
    {data ? <div className="movement-preview-grid">
      <section className="panel heatmap-panel" aria-labelledby="movement-heading">
        <div className="panel-heading"><div><h2 id="movement-heading">Approximate court coverage</h2><p>{data.start_s.toFixed(2)}–{data.end_s.toFixed(2)}s · {data.player_id}</p></div></div>
        <CourtMap grid={data.grid_seconds}/>
        <div className="heatmap-legend"><span>Less time</span><div/><span>More time</span></div>
      </section>
      <section className="panel movement-details" aria-labelledby="clip-heading"><h2 id="clip-heading">About this clip</h2>
        <p>The map projects the bottom centre of the player’s tracking box onto broad court cells. Jumping and wide stances can shift that estimate.</p>
        <dl><dt>Clip duration</dt><dd>{(data.end_s - data.start_s).toFixed(2)}s</dd><dt>Positions inside court</dt><dd>{data.mapped_s.toFixed(2)}s</dd><dt>Positions outside court</dt><dd>{data.outside_s.toFixed(2)}s</dd><dt>Missing positions</dt><dd>{data.missing_s.toFixed(2)}s</dd><dt>Tracked samples</dt><dd>{data.proposal_samples}</dd></dl>
        <p>Outside and missing positions are excluded from the map. Shading is relative to the busiest cell.</p>
        <p><strong>Approximate positions, not verified foot contacts.</strong> Player identity has only been spot-checked. This clip does not establish a weakness or prescribe a drill.</p>
      </section>
    </div> : <section className="panel movement-details"><h2>Movement preview unavailable</h2><p>{message}</p></section>}
  </main>;
}
