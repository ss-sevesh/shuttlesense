# Frames before landing → local AI

Open a saved recording, pause where you observe the shuttle reaching the ground,
and use **Observed landing time** or **Use replay time for landing**. Choose a
time after the first second and before the recording ends. Click **Send
pre-landing frames to AI**.

The server decodes five exact source frames across the preceding second,
approximately 1.0, 0.75, 0.5 and 0.25 seconds earlier, plus the immediately
preceding frame. The selected landing frame itself is excluded. At 30 FPS,
selecting frame 300 sends frames 270, 278, 285, 292 and 299. Fractional offsets
are rounded to integer frame indices.

The existing pinned local Qwen3-VL-2B-Instruct receives these five images in
chronological order and available near-player pose measurements and normalized
court coordinates. Pose context comes from the image time or a sufficiently
recent prior sample; its actual sample time is retained. Missing pose remains
unknown, and a changing near-player identity rejects the selection.

The prompt requests visible posture/movement and court area, followed by one
cautious observed-action-versus-alternative suggestion. It explicitly avoids
inventing contact, landing location, shot type, numerical measurements or a
guaranteed outcome. Shot type stays unknown. If an earlier stroke or return
opportunity is not visible, advice should concern positioning/readiness or state
that evidence is insufficient. Generated descriptions can still be wrong.

This control changes the evidence sent to the LLM. It does not automatically
detect a landing, prove a lost point or replace existing contact coaching.
Selecting a late event can omit the earlier stroke that caused it. Automatic
landing detection and coaching-quality evaluation remain future work.

Outputs persist separately under each job's ignored/private
`landing/<selected-frame>/`: exact JPEGs, evidence, coaching cache and report.
The original analysis result is unchanged. **Download before-landing review**
exports the selected frame, earlier frame indices, pose context, model provenance
and answer. Repeating the same selection reuses matching inference evidence;
changed prompt/model identity invalidates the cache.

The endpoint is loopback-only and checks same-origin POSTs, bounded request
size, integer frames, completed job metadata and source hash. Images are served
only if they belong to the selected report and its analysis identity matches.
The existing full-video lock serializes model work and recovers dead-worker locks.

## Verification

- Three unit tests cover pre-landing frame boundaries, missing/prior-only pose,
  identity changes and prompt requirements.
- Existing coaching tests now also cover before-landing cache reuse, prompt
  version invalidation and preservation of the original contact report.
- The actual local GPU model ran on the saved 40-second clip at a **test anchor
  of 10 seconds**. This timestamp was not independently labeled as a landing.
  Model inference took 34.6 seconds; the first web request took approximately
  44 seconds. A cached repeat took approximately 8.5 seconds on this setup.
- The new browser test checks exact five images, local request protection,
  invalid frames, export, repeat requests, mobile layout and both-theme
  accessibility. An independent audit matched all five JPEGs byte-for-byte to
  separately decoded and identically encoded source frames.
- Independent code review approved after correcting cache invalidation and
  future-pose attribution. Detection accuracy and coaching usefulness were not
  measured.
- All sixteen distinct browser tests passed across verification batches, including
  the existing fresh GPU/CPU upload flows. Typecheck and production build passed.
  The theme checks use the existing reduced-motion preference to inspect settled
  colors. The browser also verified the busy response while another actual video
  analysis was running; that upload was allowed to complete.
