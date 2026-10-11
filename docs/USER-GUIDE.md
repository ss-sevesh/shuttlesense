# Review a recording

Start at **http://127.0.0.1:3000**. Choose **Enter workspace**, add an optional
browser-local display name or continue as a guest, then use **Upload Match**.
The workspace lives at **/workspace**; the **Website** link returns to the landing
page. Upload, mark the four singles-court corners, select analysis features, and
start processing. Once ready, review the rallies and mark outcomes before generating
a report in **Practice Plan**. Saved full reviews return to the same recording in
**Rally Review**. Existing root links with `view` or `analysis` still work.

The main workflow is **select rally → inspect replay and movement → review pose
and ending → turn the evidence into a practice report**. The feature walkthrough
in the README demonstrates these controls using generated data.

The workspace's **Overview**, **Rally Review** and **Practice Plan** share the
selected real recording. **My Matches** reopens locally saved analyses. Overview
counts completed/verified windows and user-marked outcomes, without sample scores.
Upload a recording, mark the court and choose features; completion opens its full
review page. Optional BST and near-player ending switches remain separate from AI.

Dark mode uses black surfaces with green controls. Both report models receive the
selected recording's own timestamps and shuttle evidence, with no fixed match examples.
Missing detections remain unknown; unsupported model wording is rejected rather
than treated as a measured cause of loss.

## Rally movement

**Selected rally** chooses the completed or user-verified interval. **Live** shows
only the portion reached by playback; before the start it is empty, after the end
it stops growing. Rewinding rebuilds it. The yellow position dot appears only while
playback is inside a selected window. **Rally total** shows the whole interval.

Check **Combine rallies**, then check which intervals contribute. Live mode combines
their elapsed portions; Rally total combines their full durations. Overlapping
windows are merged before counting, so the same time is never counted twice.
Leaving all intervals unchecked intentionally produces an empty map.

Heat is approximate player-box occupancy. Intensity increases from 0 to 5 seconds per
cell, then saturates; hover a cell for its exact tracked seconds. Standing during a
rally counts; standing or walking outside selected windows does not. Missing tracking
does not contribute time. The map covers only the near player's evidence.

## Replay and pose

Toggle player boxes, body pose, shuttle and near-side white-line overlays independently.
**Show attempt** and **Show pose** pause at their evidence timestamps and scroll the
video into view. **Replay** includes the surrounding movement instead of pausing at
contact. Fitted court markings remain estimates, not verified in/out boundaries.

Expand **Technical details: poses & rally boundaries**. Pose rows page five at a time.
**View body angles** shows both shoulders, elbows, wrists, hips, knees and ankles,
plus available contact-body measurements. Low-confidence, degenerate or missing
landmarks stay Unknown. Measurements use the exact saved frame/player identity and
original image aspect ratio. These are 2D projections, not clinical joint measurements.
Wrist angles use index-finger landmarks; racket-face angle is unavailable.

Hit poses are swing/contact candidates. Old shot labels used a separate model and
tracking/score gates, so their counts could differ. Optional BST classification is
available at upload; no all-shot coaching list is mixed into the loss review.

## Lost rally evidence

Mark completed outcomes as Won/Lost/Unknown. Only confirmed losses get local ending
explanations. Select a loss, replay the full rally or final seconds, and inspect its
small attempt photo beside the description.

The photo is the closest observed wrist-to-shuttle gap relative to player height
within the final two seconds of continuous valid ending evidence. It is not the
first ground-touch frame or a guaranteed impact. **Why this photo?** explains this.
The ending explanation uses five chronological frames, including the exact attempt
photo, after the previous near hit and within the rally/court segment. The vision
model sees crops preserving the near player and tracked shuttle plus same-frame
image relations. Missing detections remain unknown. Camera-left/right describes
the image, not forehand/backhand or a ground landing location.

The default highlighted gap uses a wrist proxy. **Mark racket head** lets you select
it manually on the photo; arrow keys move the mark five original image pixels.
The mark is browser-local, saved per analysis/frame and resettable. This is not an
automatic racket detector or a physical distance measurement.

## Match report

**Generate match report** asks local Qwen3-4B-Instruct-2507 to review text evidence for eligible
rallies. Every eligible hit-pose timestamp and available angle is supplied, along
with outcomes, boundary corrections, movement occupancy/temporal summaries, ending
evidence, and same-frame shuttle/player relations at poses and across the ending.
Observations must discuss the ending-photo timestamp and tracked shuttle separation
or camera side; posture alone cannot establish lateness or a missed return.
Cached loss interpretations stay in the source appendix, not fresh model
prompts. Unknown-ending windows and between-point
pose events remain in the evidence appendix but are excluded from performance advice.

Dense tracks are summarized in chronological one-second bins rather than sending
thousands of raw frames. Long event lists are batched without silently dropping
poses. A hard context failure is shown if the local capacity is exceeded.

The model receives no photos: one structured review per rally plus a recording
summary when context fits. Generation time is displayed. A response gets one automatic
wording correction if validation fails; all calls are logged. The finished report includes
summary, observations, suggested training and uncertainty, plus each rally review.
Small exact attempt photos accompany confirmed lost rallies with usable ending
evidence; these are attached after generation. They use the same selection condition
and optional manual racket mark as the loss review, not a first-ground-touch frame.
It covers this recording only. Body angles support possible
intent; they cannot prove what shot the player planned. Advice is experimental.

**Save as PDF** opens the browser print dialog for a designed A4 report: recording
overview, a fresh page for each rally, exact attempt photos, practice focus and
numbered footers. Choose Save as PDF with default margins; the report supplies its
own page size and page numbers. Chrome is the verified print browser.
**Download report** saves the same layout as portable offline HTML with embedded
loss photos and highlighted image gaps. Long reviews can continue onto extra pages.
A photo-download failure is shown rather than saving an incomplete file.
**Download AI evidence** saves the source snapshot, pinned model provenance, actual
text requests and inference timings. Training is grounded in the same rally evidence.
Rally numbers match the selector; window IDs preserve the original detector identity.
**Download reviewed JSON**
keeps original detector data and browser corrections separate. Matching reports
reopen from the local cache; changed windows/outcomes require a refreshed report.
## Website and local entry

Open `/welcome` for the ShuttleSense website and `/login` for the local entry
screen. Enter a display name or choose Continue as guest. The workspace header
shows the saved name; click it to change players. Guest entry clears only that
name, preserving recordings, reviewed outcomes and annotations. If local storage
is blocked, guest access remains available. This is a local convenience screen,
not authentication or access control. No password, email or account request is sent.

The editorial page uses embedded illustrative badminton imagery and diagrams;
they are not tracking results. Its features link to the actual workspace and
synthetic demo. The full-screen menu and recording-tips dialog support Escape and
keyboard focus, and motion respects the system reduced-motion setting. Font and
smooth-scroll CDNs are optional for navigation; the core analysis stays local.

Fresh analyses keep rally outcomes as Unknown. The detected rally count and replay
buttons are available before marking outcomes; zero marked losses does not mean
zero detected rallies. Use Replay selected rally or either detected replay button.
The live heatmap starts empty outside rally time; Rally total shows full coverage.

The selected completed rally shows its available exact attempt photo, same-frame
shuttle/pose description and an optional practice suggestion beside the video.
Possible intent remains uncertain. How rally ended plays only the final three
seconds of the selected window; Replay selected rally plays the full window.
Confirmed losses can additionally use the separate local vision explanation.
Report overview counts come from reviewed metadata; confirmed-loss photos remain
attached after text generation in the illustrated HTML/PDF exports.
