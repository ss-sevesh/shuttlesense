# Review a recording

The main workflow is **select rally → inspect replay and movement → review pose
and ending → turn the evidence into a practice report**. The feature walkthrough
in the README demonstrates these controls using generated data.

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
tracking/score gates, so their counts could differ. Shot-type controls are removed
from the interface; legacy results are retained only for compatibility/exports.

## Lost rally evidence

Mark completed outcomes as Won/Lost/Unknown. Only confirmed losses get local ending
explanations. Select a loss, replay the full rally or final seconds, and inspect its
small attempt photo beside the description.

The photo is the closest observed wrist-to-shuttle gap relative to player height
within the final two seconds of continuous valid ending evidence. It is not the
first ground-touch frame or a guaranteed impact. **Why this photo?** explains this.
The ending explanation uses five chronological frames for additional context.

The default highlighted gap uses a wrist proxy. **Mark racket head** lets you select
it manually on the photo; arrow keys move the mark five original image pixels.
The mark is browser-local, saved per analysis/frame and resettable. This is not an
automatic racket detector or a physical distance measurement.

## Match report

**Generate match report** asks the existing local Qwen model to review eligible
rallies. Every eligible hit-pose timestamp and available angle is supplied, along
with outcomes, boundary corrections, movement occupancy/temporal summaries, ending
evidence. Cached loss interpretations stay in the source appendix, not fresh model
prompts. Unknown-ending windows and between-point
pose events remain in the evidence appendix but are excluded from performance advice.

Dense tracks are summarized in chronological one-second bins rather than sending
thousands of raw frames. Long event lists are batched without silently dropping
poses. A hard context failure is shown if the local capacity is exceeded.

The report includes summary, observations, suggested training and uncertainty,
plus each rally review. It covers this recording only. Body angles support possible
intent; they cannot prove what shot the player planned. Advice is experimental.

**Download report** saves a Markdown document you can read or convert to PDF.
**Download AI evidence** saves the source snapshot and actual system/section prompts.
Training is generated from the preceding evidence-grounded summary and observations.
Rally numbers match the selector; window IDs preserve the original detector identity.
**Download reviewed JSON**
keeps original detector data and browser corrections separate. Matching reports
reopen from the local cache; changed windows/outcomes require a refreshed report.
