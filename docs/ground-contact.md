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
