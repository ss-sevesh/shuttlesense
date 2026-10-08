# Pretrained BST shot experiment

`analysis/bst_shots.py` runs an actual trained **BST-0** checkpoint from the
[official BST repository](https://github.com/Va6lue/BST-Badminton-Stroke-type-Transformer).
It does not use the discarded Hugging Face racquet pipeline. The isolated CUDA
Python environment happens to be named `data/hf-racquet-env`; only its installed
PyTorch is reused.

Pinned source revision: `fb9b310bf4c8a8e3d89c75e61bc06a7ac3de62df`.
Checkpoint: `bst_0_JnB_bone_between_2_hits_with_max_limits_seq_100_merged_2.pt`.
Public Drive file ID: `1OA63gWshMGO5WT2HIshjwMAL1T5jNjIa`, linked from the authors'
[ShuttleSet weight folder](https://drive.google.com/drive/folders/1D4172WZDJWPvpJdpaHDhy_cA-s8F-zR5).
Checkpoint SHA-256: `c4d41bb8248f0f79f7a7182ac2b38ec021ef51edd4978dfa31d17291b530afc8`.
Loading requires this exact hash, `weights_only=True` and strict state matching.

## Inputs and model behavior

For each candidate hit, the adapter selects a window from the previous hit to
the next hit plus 0.25 seconds, capped at 1.5 seconds before and 1.75 seconds
after the hit. At clip edges it uses the authors' half-second fallback. The
candidate-hit detector is our heuristic, not part of BST. Therefore incorrect
hit times or players also affect shot predictions.

Both players appear in far/top then near/bottom order. MediaPipe's 33 image
landmarks are mapped to COCO's 17-joint order using indices
`[0,2,5,7,8,11,12,13,14,15,16,23,24,25,26,27,28]`. The eye centers are approximated
by MediaPipe indices 2 and 5. Landmarks below 0.5 visibility become missing.
Joints use the authors' bbox-diagonal normalization and bbox-center alignment.
Nineteen bone vectors are appended, giving 72 features per player. The shuttle
coordinates divide by source width and height. The official stride and zero
padding policy produces a 100-frame sequence with a valid-length mask.

The selected **BST-0 backbone consumes poses and shuttle trajectories only**.
Court positions are validated and prepared but are not used by this variant;
the AP variants add player-position modulation. The public example references
BST-CG-AP; this experiment deliberately loads the available BST-0 checkpoint
with its own matching architecture rather than claiming to run CG-AP.

There are 25 merged classes: unknown, twelve top-player shots and twelve
bottom-player shots. The twelve translated names are net shot, defensive net
shot, smash, lift, clear, drive, drop, push, net kill, cross-court net shot,
short serve and long serve. Raw Chinese labels and class IDs are retained.
Windows containing more than one tracked ID on either court side are excluded
from classifier inference with `shot_status: identity_switch`.
Scores are **uncalibrated softmax scores**, not measured probabilities of being
correct. Results below 0.5, unknown-class predictions and player-side mismatches
remain `shot_type: unknown`; the raw model prediction remains reviewable.

## Run and checks

The ignored `data/bst-official/model/` folder contains unchanged downloaded
`bst.py`, `tempose.py` and an empty `__init__.py`. The checkpoint is alongside
that folder. Dependencies in the isolated CUDA environment are PyTorch,
`positional-encodings==6.0.4` and `torchinfo==1.8.0`. Downloaded source and weights
are intentionally not committed.

```powershell
data/hf-racquet-env/Scripts/python.exe analysis/bst_shots.py --poses data/feasibility/player-pose-01/players.json --shuttle data/feasibility/serve-tracknet-unedited-01/shuttle.json --hits data/feasibility/tracked-rallies-02/results.json --output data/feasibility/tracked-rallies-02/shots.json
python analysis/test_bst_shots.py
```

The report records source video hash, exact input-file hashes, checkpoint hash,
window times, input tracking quality, raw class and review status. Eight offline
adapter tests cover normalization, joint ordering, missing data, bad inputs,
stride/padding, player order and identity-switch rejection. A private reference check also compares our
normalization and sequence policy directly against the pinned upstream functions.

Actual 15-second demo: 15 candidate windows passed tracking-quality checks and
were classified on the RTX 4060 GPU in 0.56 seconds including model setup. Six
received accepted experimental labels; nine remained unknown due to class-none,
side mismatch or low score. These counts concern predictions, not verified hits
or measured classification accuracy.

## Limits

The checkpoint was trained with MMPose, while this experiment uses MediaPipe;
joint semantics and detector/crop differences introduce an unvalidated domain
shift. Pose samples are 15 fps and aligned by nearest sample (maximum 75 ms)
to the 30 fps raw shuttle grid. Missing pose frames are zeroed, and both players
must be present in at least 70% of a window. No long-gap pose interpolation is
performed. The user still needs to verify shot times, labels and rally boundaries.
BST classifies candidate stroke windows; it is not a standalone rally detector.
