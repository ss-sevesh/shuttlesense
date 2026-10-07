# Ground contact and court mapping experiment

The white-shirt player's rectangle is a **bounding box**: it encloses the
person in the image. Its bottom centre is only a position proxy. It is not a
detected shoe contact, and a jumping player's shoes do not lie on the floor.

Six deliberately selected source frames (13, 17, 19, 21, 29 and 35 seconds)
were reviewed using magnified shoe crops. At 13s, an approximate visible support
shoe contact was marked at pixel `(493,563)`. The 29s example was marked airborne;
the other four were uncertain and received no contact coordinates. These labels
are an exploratory assistant review, not independent ground truth or a coverage
estimate. No automatic foot/contact detector was added.

## Mapping check

A **homography** converts points on the perspective court floor into top-down
court coordinates. It cannot correctly map elevated shoes as floor contacts.
Four approximate singles-court corner intersections were marked on the 13s
source image: `(413,241)`, `(873,239)`, `(987,688)`, `(277,692)`.

Six additional service-line intersections, not used to fit the transform, were
checked against the standard court dimensions: singles width 5.18m, length
13.40m, and short service lines 1.98m from the net. See the court diagram in the
[BWF Laws of Badminton](https://extranet.bwf.sport/docs/document-system/81/1466/1470/Section%204.1%20-%20Laws%20of%20Badminton%20-%2026%20April%202025%20V5.0%20(2)%20.pdf).
Only floor-line intersections were used, not the elevated net tape.

The six approximate landmark residuals were 1.8, 1.6, 0.3, 5.0, 6.4 and 7.8cm
(median 3.4cm, maximum 7.8cm). A residual is the distance between a mapped
landmark and its expected position. These numbers measure agreement with manual
pixel picks in one frame; they do **not** establish centimetre-level player
accuracy or calibration stability through a segment.

The 13s manual contact maps to normalized court coordinates
`(0.2772,0.7956)`, with near-side orientation. The tracked box's bottom-centre
proxy `(504,568)` differs from it by approximately 15.3cm after mapping. This is
one example, not a measured average tracking error.

`analysis/court.py` now provides `project_contact`: reviewed grounded points
can be projected; airborne, uncertain and occluded states return no position.
`reference_error_m` reuses the existing transform to check floor landmarks.
These helpers are offline and do not change the desktop UI or its sample data.

## Evidence and checks

Private artifacts remain ignored by Git under `data/feasibility/feet-review/`:

- `calibration-review.jpg`: cyan court border, magenta check landmarks, green
  manual contact, yellow rectangle proxy.
- `review.json`: manual points, statuses and limitations.
- `mapping-results.json`: computed residuals and mapped positions.
- `source-*.jpg` and `feet-*.jpg`: original frames and magnified review crops.
- `check_mapping.py`: reproduces the mapping results and annotated image.

Run `python analysis/test_feasibility.py` for the shared geometry/contact checks.
Locally, `python data/feasibility/feet-review/check_mapping.py` reproduces this
experiment when its private inputs are present.

## Camera stability follow-up

Six 25x25-pixel floor-intersection patches from 13s were compared within local
49x49 search windows in every frame of the manually restarted segment
`[12.466667s,40s)`: 826 frames, 4,956 patch checks. Of those checks, 4,871 had
correlation at least 0.9, and all of those matched at zero pixel displacement.
Every frame had at least four such matches. The remaining 85 patch checks were
below the exploratory threshold and were not counted as stable matches.

This supports a fixed camera mapping within this short segment. It does not
validate the corner picks, player position accuracy, other segments, or automatic
camera-cut detection. A local patch search cannot certify large camera changes;
no automatic acceptance gate was added. The six-frame overlay sheet was also
visually inspected. Private `stability-review.jpg`, `stability-dense.json` and
`check_stability.py` preserve the evidence and reproducible check.

Next, check calibration across other continuous camera segments and annotate more
visible grounded contacts with independent review. Measure position error and
valid-time coverage before producing a real occupancy heatmap. Six deliberately
chosen examples with one accepted contact cannot support a movement heatmap;
camera edits still require separate segments and trail breaks.

## Additional contact review and checkpoint

The review was expanded to twelve selected frames: 13, 15, 17, 19, 21, 23, 25,
27, 29, 31, 35 and 39s. Five approximate visible support-shoe contacts were
accepted (13, 15, 23, 31, 39s); six frames remain uncertain and 29s remains
airborne. Selection was deliberate, so 5/12 is not a valid-time coverage score.
These are assistant annotations requiring independent review, not ground truth.

| Source time | Approximate support contact (pixels) | Distance to box-bottom centre |
| --- | --- | --- |
| 13s | (493,563) | 0.153m |
| 15s | (536,572) | 0.511m |
| 23s | (442,526) | 1.175m |
| 31s | (445,653) | 0.176m |
| 39s | (528,550) | 0.353m |

A support shoe and a body-centre proxy represent different physical points,
especially during a wide stance or lunge. These distances illustrate that
difference; they must not be reported as validated player-position errors. No
average accuracy claim is made. Green dots in private `contact-comparison.jpg`
show approximate support contacts; yellow dots show box-bottom centres. Original
frames and magnified crops were inspected, followed by the annotated sheet.

This completes the exploratory segment checkpoint, not Task 2 or Checkpoint A.
The next session should define the intended movement point (support contact,
foot midpoint, or estimated body-floor position), collect consistent independent
labels, and evaluate an appropriate estimator. The rectangle alone is insufficient
for exact ground-contact claims. No automatic foot detector, heatmap or coaching
claim was added; the desktop frontend remains illustrative and unchanged.

## Two-shoe review protocol

The next narrow experiment uses the **court midpoint of two visible grounded
shoe contacts**. This means halfway between the shoes on the floor, not the
player's body centre or weight-bearing centre. It is a test convention, not a
claim that it is the best movement measure. Its useful coverage must be measured.
Existing one-support-shoe labels cannot be reused as midpoint reference labels.

When both feet are in the air, even if one is lower, neither is a floor contact.
The court transform applies to the floor plane; see the
[OpenCV homography explanation](https://docs.opencv.org/4.x/d9/dab/tutorial_homography.html).
The rectangle tracker can continue during a jump, but that does not establish
the floor position beneath the player. Do not project the lower airborne shoe,
hold the previous position as measured, or draw a measured path across the gap.
With one grounded shoe, that shoe can be a separately named support-contact
measurement; it must not silently replace the two-shoe midpoint.

`project_foot_midpoint` maps the two contacts separately and then averages their
court coordinates. Perspective changes distances, so averaging pixels first
would give a different point. It returns no midpoint for `one_grounded`,
`airborne`, `uncertain` or `occluded`; malformed grounded points are rejected.
It consumes reviewed contacts and does not automatically detect shoes or jumps.

### Reviewer instructions

In plain language, a review means looking at the saved pictures of the white-shirt
player and answering: are both shoes touching the floor, just one, neither, or
is it too hard to tell? When both touch, mark the two places where the soles meet
the floor. We then map those marks onto the court and find the point halfway
between them. A rectangle around the player cannot tell us those exact places.

The video and all 81 pictures already exist locally; the user does not need to
provide another file or know how to edit JSON to understand this step. The packet
is at `data/feasibility/two-shoe-review/`; `source-000404.png` is the first centre
picture. The structured file is for recording a review, not a prerequisite for
discussing the pictures. Assistant visual inspection can help explain them, but
does not supply an independent human reference or establish accuracy.

An independent reviewer is another person who marks the original source without
seeing the assistant's marks or tracker predictions. No reviewer has been
identified yet. Do not describe another assistant pass as independent human review.

1. Copy the private packet into a separate reviewer folder. Keep original blank
   labels, each person's labels, and any later agreed corrections separate.
   Record the reviewer name or private ID in `reviewer`.
2. Review the white-shirt player at the centre frame (`source_frame`). The two
   surrounding frames help judge whether a shoe touches the floor, but mark
   coordinates in the centre frame only. Replay the original video if needed.
   Zoom is allowed; convert picks back to the original 1280x720 pixel coordinates.
3. Replace `pending` with `both_grounded`, `one_grounded`, `airborne`, `occluded`
   or `uncertain`. Use `airborne` only when neither shoe touches the floor; unequal
   foot heights do not change that. Use `uncertain` for blur or unclear contact,
   `occluded` when the needed contacts are hidden. Never infer contact from a
   rectangle edge, shadow alone, or the lowest shoe.
4. For `both_grounded`, mark the middle of each visible sole-to-floor contact
   extent in `shoes_px: [[x1,y1],[x2,y2]]`. A raised heel with a clear forefoot
   contact is marked at that contact, not at the ankle or heel. Either shoe
   order is accepted. Both points must be inside the decoded image. For every
   other status, leave `shoes_px` null and explain the reason in `note`.
5. Finish every scheduled sample, including difficult ones; do not select only
   easy contacts. Keep tracker proposals and old exploratory labels hidden until
   the independent marks are saved. Record status disagreements before agreeing
   corrections; do not discard them to improve a score.

### Prepared local packet

The sampling schedule was fixed before labeling: source frames 404 through 1184
at steps of 30 frames, in the previously reviewed segment `[374,1200)`.
There are 27 centre samples, at decoded timestamps 13.466667 through 39.466667s,
and 81 unmarked PNG images including context at three frames before/after each
sample (0.1s for this source). No context crosses the segment boundary. Unlike
the earlier deliberately selected examples, these samples have a regular
schedule; they still cover only one short tuning segment of one broadcast video.

The private `data/feasibility/two-shoe-review/review.json` records the source
hash, decoded dimensions/timestamps, schedule and blank labels. All 27 remain
`pending`; no new contacts, estimator error or coverage have been measured.
First, middle and final exported centre frames were visually inspected. All 81
PNG images exactly matched their freshly decoded source pixels; all centre
timestamps and the source hash were checked. Deliberately substituting the wrong
pixel-first averaging rule made the midpoint regression fail, as intended.
The exporter uses original footage and never reads tracker results or old marks.
It refuses an existing output directory to protect returned labels.

```sh
python analysis/prepare_foot_review.py videoplayback.mp4 --output data/feasibility/two-shoe-review --start-frame 374 --end-frame 1200 --step-frames 30 --context-frames 3 --player-id white-shirt
python analysis/test_feasibility.py
```

Choose a new private output directory to rerun. The checks cover projection
before averaging, shoe order, missing positions during jumps, invalid points,
and sampling boundaries. They are synthetic checks, not real tracking scores.

After independent labels: report each contact-status count over all 27 samples,
reviewer disagreement, and eligible two-shoe midpoint count. Report valid
predictions over all samples as well as over eligible samples, and position error
only against the same midpoint definition (sample count, median and high-percentile
distance in metres). Uniform samples estimate sampled availability, not exact
valid-time coverage; this small tuning packet cannot establish whole-match quality.
Declare an estimator and any position-error gate before scoring. No gate is agreed
yet. A box-bottom centre may be tested as a midpoint estimator, but remains a proxy
and cannot certify contact status. Broader phone footage, identity review, calibration
checks, and coaching review are still needed. Task 2 and Checkpoint A remain open.

### Check a returned packet

`analysis/check_foot_review.py` checks labels against the untouched blank packet.
It rejects missing/reordered samples, changed source metadata or timestamps,
invalid coordinates, and shoe marks on frames without two grounded contacts.
It reports status counts and the number of labels suitable for midpoint comparison.
`--complete` also requires a reviewer ID and no pending samples. It does not
verify that marks are correct or that a reviewer worked independently, and does
not score a tracker. Preserve the blank file and save edits in a separate folder.

```sh
# Inspect the current blank packet: expected result is 27 pending, zero eligible.
python analysis/check_foot_review.py data/feasibility/two-shoe-review/review.json --original data/feasibility/two-shoe-review/review.json
# After a person has completed a separate copy:
python analysis/check_foot_review.py data/feasibility/two-shoe-review-person/review.json --original data/feasibility/two-shoe-review/review.json --complete
```

The shared synthetic checks exercise accepted labels and rejection of unfinished,
altered, dropped, reordered and malformed labels. A structurally valid packet is
still only a person's observations; it is not proof of tracking accuracy.

## Assistant labels and first RTMPose experiment

At the user's request, Codex visually labeled all 27 scheduled samples using the
81 unmarked source/context images and enlarged shoe crops. No pose or tracker
overlays were shown while labeling. These are **assistant annotations**, not
independent human ground truth. The untouched original packet remains pending;
the completed copy is `data/feasibility/two-shoe-assistant/review.json`.
It records assistant provenance in `reviewer` and a reason for every contact state.

| Assistant contact state | Samples |
| --- | ---: |
| Both grounded | 5 |
| One grounded | 8 |
| Airborne | 1 |
| Uncertain | 11 |
| Occluded | 2 |

The five approximate two-contact labels are:

| Source frame | Contact pixels, either shoe order |
| --- | --- |
| 434 | (580,522), (613,550) |
| 554 | (519,568), (637,567) |
| 674 | (543,570), (644,576) |
| 704 | (478,523), (514,554) |
| 1034 | (670,539), (748,517) |

Only 5/27 samples (18.5%) support this strict midpoint definition under this
assistant review. This is sampled availability in one short segment, not exact
valid-time coverage. Uncertain frames were retained rather than guessed.

`analysis/foot_pose.py` runs the pretrained **RTMPose-m COCO+UBody wholebody**
ONNX release `c8b76419` on timestamp-matched white-player tracker boxes.
This is the 133-keypoint RTMPose-m variant with an official ONNX download in the
[OpenMMLab model zoo](https://github.com/open-mmlab/mmpose/tree/main/projects/rtmpose#wholebody-2d-133-keypoints).
The [model archive](https://download.openmmlab.com/mmpose/v1/projects/rtmposev1/onnx_sdk/rtmpose-m_simcc-ucoco_dw-ucoco_270e-256x192-c8b76419_20230728.zip)
and extracted files are private under `data/models/rtmpose-m-wholebody/`.
Model SHA-256: `94ca58fa2d6c4530b6957ac9548084ebc2fa27ed71e4e01f0b73844306ed01a6`.

Preprocessing follows the downloaded `pipeline.json`: 1.25 box padding,
192x256 affine crop, BGR-to-RGB conversion, and supplied mean/std normalization.
Decoding follows the [official SimCC example](https://github.com/open-mmlab/mmpose/blob/main/projects/rtmpose/examples/onnxruntime/main.py):
axis argmax, split ratio 2, minimum of the two maximum axis responses, inverse
crop mapping. Foot indices 17-22 are the two big toes, small toes and heels in
the [COCO-WholeBody definition](https://github.com/open-mmlab/mmpose/blob/main/configs/_base_/datasets/coco_wholebody.py).
No new Python dependencies or model training were added.

Before scoring, the experiment fixed a simple shoe-contact proxy: average the
big-toe, small-toe and heel pixels separately for each shoe. All six responses
must be >=0.3 and all foot points must be inside the image. This threshold is
not a calibrated probability or ground-contact confidence. The proxy can sit
above the actual sole contact, especially with raised heels.

The model produced proxies for all 27 samples, including the airborne one.
**Ground contact is not automatically detected.** Court projection and error
comparison use the assistant's both-grounded states as a manual gate; all other
samples keep their court midpoint null. Each shoe proxy is projected separately
before averaging. The existing manual corners and 5.18x13.4m court dimensions
were reused; calibration uncertainty is not included in these errors.

| Comparison on the same five assistant midpoint labels | Median | 90th percentile | Maximum |
| --- | ---: | ---: | ---: |
| RTMPose shoe proxy | 0.217m | 0.259m | 0.267m |
| Tracked box bottom centre | 0.211m | 0.334m | 0.358m |

This small conditional comparison does not establish improvement or validated
accuracy. Private `data/feasibility/foot-pose-assistant-01/results.json` preserves
all 133 landmarks/responses, sample timestamps, inference times, source-image and
input hashes, proxy availability and errors. Its 27 overlays and three overview
sheets were visually checked: boxes select the white-shirt player in these
samples, not a certification of full-frame tracker identity. The five eligible
shoe overlays were also inspected. Red dots are landmarks, yellow circles are
proxies, green circles are assistant labels.

```sh
python analysis/check_foot_review.py data/feasibility/two-shoe-assistant/review.json --original data/feasibility/two-shoe-review/review.json --complete
python analysis/test_foot_pose.py
python analysis/test_feasibility.py
python analysis/foot_pose.py --packet data/feasibility/two-shoe-review/review.json --review data/feasibility/two-shoe-assistant/review.json --tracks data/feasibility/white-segment-02/tracks.json --model data/models/rtmpose-m-wholebody/end2end.onnx --corners 413 241 873 239 987 688 277 692 --output data/feasibility/foot-pose-assistant-rerun
```

Use a new output directory on reruns; existing results are never overwritten.
The pose check covers RGB normalization, aspect ratio, inverse coordinate
mapping, SimCC scores, proxy averaging, low responses, out-of-image points and
invalid inputs. Both runnable checks and the completed-label check passed.
Next: decide whether this strict two-grounded-shoe midpoint has useful coverage,
then investigate contact estimation and test on an untouched segment. Independent
human review remains needed for an independent accuracy claim. No real heatmap,
coaching claim or desktop UI change was added; Task 2 and Checkpoint A remain open.

## Shoe-motion contact experiment

The interrupted experiment was resumed after applying the sandbox repair recorded
in `tasks/HANDOFF.md`. `analysis/foot_motion.py` reuses RTMPose on the three original
context images per sample: centre minus three frames, centre, and centre plus
three frames. For each shoe, it takes the larger of the two image displacement
speeds, normalized by the centre tracker box height. A pair is a contact candidate
only when both speeds are below the threshold and all three shoe proxies exist.
This tests **both-grounded versus other definite states**, not individual shoe
contact classification. It never outputs court positions.

The split was source frame 800: 14 earlier tuning samples and 13 later checking
samples. The later samples were excluded from threshold selection. Thresholds
0.1 through 1.5 box heights per second were tried on tuning samples, minimizing
`2 * false positives + false negatives`, with the lowest threshold breaking ties.
The selected threshold was **1.2**. Responses below 0.3 still cause abstention.
Uncertain and occluded labels are excluded from confusion counts; these remain
assistant observations, not independent human ground truth.

| Outcome | Earlier tuning | Later checking |
| --- | ---: | ---: |
| Correct both-grounded candidates | 4 | 1 |
| False both-grounded candidates | 1 | 1 |
| Correct rejections of definite other states | 3 | 3 |
| Missed both-grounded labels | 0 | 0 |
| Missing-proxy abstentions on definite labels | 1 | 0 |
| Uncertain/occluded labels excluded | 5 | 8 |

The later check accepted two definite samples: one was both grounded (frame 1034),
one had a raised trailing shoe (1094). It rejected the only labeled airborne
sample (914). Five additional candidates over all 27 samples had uncertain labels,
so they cannot be counted as correct contacts. These counts are too small for an
accuracy claim; the later check contains only one both-grounded reference.

The motion-only rule fails its intended purpose. The tuning false contact at
frame 494 has maximum shoe speed 0.513 box heights/s, while the both-grounded
frame 554 reaches 1.183. Lowering the threshold enough to reject that raised shoe
would also reject this grounded pair. Image motion, pose jitter and changing
shoe orientation overlap with actual raised-shoe motion.

Three private sequence sheets were inspected with the selected threshold fixed:
frames 482-506 and 1082-1106 around the two false positives, and frames 890-938
around takeoff and landing. Images are shown every two frames; inference uses
context at plus/minus three frames. The sheets show slow raised shoes passing
the rule and predictions changing across the landing. Only the existing centre
frames have saved reference labels: this visual follow-up does not supply dense
contact labels or measured takeoff/landing timing accuracy.

Private results are in `data/feasibility/foot-motion-assistant-01/`; a fresh
rerun in `foot-motion-assistant-02/` reproduced the threshold, counts and sample
predictions. The first folder also holds `sequence-494.jpg`, `sequence-914.jpg`,
`sequence-1094.jpg`, `sequence-check.json` and `inspect_sequences.py`.

```sh
python analysis/test_foot_motion.py
python analysis/foot_motion.py --packet data/feasibility/two-shoe-review/review.json --review data/feasibility/two-shoe-assistant/review.json --tracks data/feasibility/white-segment-02/tracks.json --model data/models/rtmpose-m-wholebody/end2end.onnx --split-frame 800 --output data/feasibility/foot-motion-assistant-rerun
python data/feasibility/foot-motion-assistant-01/inspect_sequences.py
```

The motion check covers displacement, timing, missing proxies, abstention and
false contacts; pose and shared synthetic checks also pass. This is an offline
same-video check using future context, not a new-clip validation. No heatmap
integration is justified. Next: obtain denser contact observations around jumps
and test a different contact cue; reserve a new clip for checking a rule that
first survives tuning. Task 2 and Checkpoint A remain open.

## Coarse movement preview

The user requested a faster prototype and a quick end to the heatmap effort.
Further foot-contact research is deferred. The first usable preview now reuses
the existing player tracker: `analysis/movement_preview.py` projects box-bottom
centres into a 6-column, 8-row grid over a single manually bounded camera segment.
Each frame contributes at most one source-frame duration. Missing proposals,
reseed requests and explicitly rejected identities contribute no occupancy;
off-court positions are reported separately and never clamped into edge cells.
No held positions or interpolated samples are introduced across gaps.

For `[12.466667s,40s)` at 30 fps, all 826 tracker proposals were available:
27.366667 seconds project inside the court and 0.166667 seconds fall outside.
The duration accounting totals 27.533333 seconds. Box positions remain unverified
proposals; these counts are not valid ground-contact time or an accuracy result.
The five outside samples are excluded rather than forced into the heatmap.
Jump bias and stance changes remain in this intentionally approximate preview.

Open `/movement`, or select **View tracked clip movement** from the workspace.
The page displays real local derived data, relative cell shading and duration
accounting, with no sample weakness marker or inferred drill. The original
coaching dashboard still uses fictional demo data. This completes the prototype
heatmap preview, not automatic upload processing or the production accuracy gate.

```sh
python analysis/test_movement_preview.py
python analysis/movement_preview.py --tracks data/feasibility/white-segment-02/tracks.json --corners 413 241 873 239 987 688 277 692 --start 12.466666666666667 --end 40 --fps 30 --side near --output data/feasibility/movement-preview/results.json
```

The exporter refuses to overwrite existing results. Choose a different output
path for reruns; the page reads the canonical local path shown above. Supply FPS
from the source video and only one continuous, calibrated tracking segment.
This preview does not automatically detect camera cuts or new player identities.
The underlying footage, model and results stay ignored by Git; private data is
excluded from Next.js deployment tracing and the page is rendered at request time.
Without local results it shows an unavailable state rather than fictional values.

The occupancy check covers normalization, off-court exclusion, missing frames,
orientation and duplicate rejection. Browser checks cover displayed cell duration,
missing/invalid files, light/dark accessibility and viewport overflow; the existing
dashboard checks still pass. Next: a short pretrained TrackNetV3 experiment for
shuttle-trail replay, followed by upload/replay integration. Precise contacts can
be revisited if a later feature demonstrably needs them.
