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
