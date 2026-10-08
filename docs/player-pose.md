# ByteTrack and MediaPipe player data

`analysis/player_pose.py` runs YOLO11n-pose person boxes through ByteTrack,
then runs an independent MediaPipe Pose Landmarker VIDEO instance on each
selected player's padded crop. YOLO's pose landmarks are not used as MediaPipe
output. Person detection uses CUDA when available; MediaPipe uses CPU XNNPACK.

The first largest on-court person in each court half is locked to that initial
track ID. Initial court filtering excludes officials. Once selected, a player
can move off court. Missing initial IDs remain missing instead of silently
adopting a replacement ID. Review the initial selection before using a new clip.

```powershell
data/player-pose-env/Scripts/python.exe analysis/player_pose.py videoplayback.mp4 --start 59.633333 --end 74.633333 --corners 413 241 873 239 987 687 276 692 --output data/feasibility/player-pose-01/players.json
data/player-pose-env/Scripts/python.exe analysis/test_player_pose.py
```

The ignored `data/player-pose-env` has MediaPipe 0.10.35 and read-only `.pth`
links to existing Ultralytics/CUDA environments. The official full pose task is
downloaded from Google's MediaPipe model bucket to
`data/models/mediapipe/pose_landmarker_full.task`. No existing environment is
modified. Windows wheels imported and actual inference ran on Python 3.14.7.

JSON has kind `tracked_player_pose`, video SHA256, source FPS/dimensions,
settings, tracking counts and `samples`. Samples carry absolute source time,
source frame index, all detected track IDs and selected `players`. Each player
has side, ID, box `[x,y,width,height]`, global normalized `court_xy` (y=0 far),
33 global pixel `keypoints_xy`, and 33 minimum visibility/presence scores.
A failed pose has empty landmark/score arrays and `pose_detected=false`.
Court coordinates use box-bottom foot approximation; they are not measured
ground contacts or calibrated speeds.

Tracking processes every source frame at a detector size of 960 to reduce small
far-player misses. Pose sampling is 15 Hz, using a rounded source-frame stride.
Both actual rates are written to settings. The runner now accepts the entire
requested video interval. Optional `--far-roi X Y WIDTH HEIGHT` adds a zoomed
person detection pass (minimum detector size 1280), translates boxes into global
coordinates and suppresses duplicates before one ByteTrack update. Small pose
crops are enlarged to at least 256 pixels high; landmark coordinates are mapped
back to the original crop. Enlargement does not restore missing image detail.

Default identity selection still locks initial IDs. `--allow-reacquisition`
permits a provisional new same-half ID only after a 0.5s missing interval and
a unique candidate held for 0.3s. Ambiguous candidates are rejected. Each change
is recorded in `identity_events` and player `identity_segment`; rally preparation
resets and BST windows crossing IDs abstain. MediaPipe VIDEO state is retained
per court half in this mode. Reacquisition does not prove personal identity.
The actual tracker YAML values/hash and detector/pose sizes are recorded.
No edit handling is claimed. Missing samples and
low landmark scores must be respected by shot/rally consumers.

The 59.633333–74.633333s test produced 225 pose samples: near ID 1 tracked and
posed in all 225; far ID 2 tracked in all 225 and posed in 223. The two misses
remain empty. Four pose snapshots were visually checked in ignored
`data/feasibility/player-pose-01/pose-review.jpg`; both real players were selected
and officials were excluded in those snapshots. Total runtime was 51.063s,
including approximately 20s of MediaPipe close/telemetry connection timeouts.
This measures availability, not landmark or tracking accuracy.
