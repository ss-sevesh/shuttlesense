# Local upload demo

Run `npm.cmd run dev`, open http://127.0.0.1:3000, choose **Upload Match**,
and select a video. Click **Mark court corners** on its first frame: far-left,
far-right, near-right, near-left singles-court corners. Click **Show boxes &
heatmap**, then play the video. Yellow boxes represent the near side and blue
boxes the far side. The selector changes the heatmap side.

The local Node route runs `analysis/upload_demo.py` using the existing Python
OpenCV, NumPy, ONNX Runtime and `data/models/yolox_tiny.onnx` installation.
No new dependencies or GPU setup are needed. `PYTHON_EXECUTABLE` can point to
the environment containing these packages if the default Python lacks them.

YOLOX detects people at 5 Hz for the first 30 seconds. A homography maps each
box's bottom centre to an 8-by-6 court grid; accumulated sampled time shades
the heatmap. Detections outside the marked court are excluded. Far-side
coordinates rotate so that the selected side is shown at the bottom.
Video playback selects the latest fresh sample; boxes disappear outside the
analyzed interval. The heatmap covers the whole analyzed interval.

This is a fixed-camera demonstration with approximate positions. It does not
maintain player identities, detect edits, identify shoe contacts, or use TrackNet.
Use full-court footage without cuts or side changes. The existing dashboard's
sample statistics remain illustrative and are not replaced by this result.

Analysis accepts non-empty MP4, MOV or WebM up to 100 MB and no larger than 4K;
preview alone supports 500 MB. One local job runs at a time, with a 90-second
processing timeout. The endpoint accepts same-origin loopback requests only.
Temporary uploaded copies are deleted after success or failure. Results live
in the open browser dialog and are not persisted. This endpoint is not intended
for shared hosting.

Checks: `python analysis/test_upload_demo.py`, `npm.cmd run test:ui`, and
`npm.cmd run build`. The real-footage browser test runs when the private
`videoplayback.mp4` and detector are present, otherwise it skips. It checks
150 samples, visible boxes at 1 second, side-dependent grids, no boxes after
30 seconds, temporary-file cleanup, both themes and browser errors.
