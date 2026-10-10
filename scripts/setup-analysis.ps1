param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
function Run-Python([string]$Executable,[string[]]$Arguments) {
  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Python command failed: $Executable" }
}
$runtimePython = Join-Path $projectRoot 'data/hf-racquet-env/Scripts/python.exe'
if ($CheckOnly) {
  foreach ($relative in @('data/hf-racquet-env/Scripts/python.exe','data/player-pose-env/Scripts/python.exe','data/tracknet-env/Scripts/python.exe','data/hf-racquet-baseline/yolo11n-pose.pt','data/models/mediapipe/pose_landmarker_full.task','data/models/tracknetv3/TrackNet_best.pt','data/models/tracknetv3/model.py','data/models/segformer-floor/provenance.json','data/models/shot-coach-qwen3-vl2b/provenance.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $relative))) { throw "Missing: $relative. Run setup without -CheckOnly." }
  }
  Run-Python $runtimePython @('-c',"import torch, transformers, cv2, numpy; print('CUDA available:', torch.cuda.is_available()); assert torch.cuda.is_available(), 'An NVIDIA CUDA GPU is required for the current local report pipeline'")
  Run-Python (Join-Path $projectRoot 'data/player-pose-env/Scripts/python.exe') @('-c',"import mediapipe, ultralytics; print('Player runtime ready')")
  Run-Python (Join-Path $projectRoot 'data/tracknet-env/Scripts/python.exe') @('-c',"import torch, cv2; print('Shuttle runtime ready')")
  Write-Output 'Analysis files and imports ready. This is not an end-to-end accuracy check.'
  exit
}
Get-Command python,ffmpeg -ErrorAction Stop | Out-Null
Write-Output 'Preparing local environments and official pretrained models. Downloads may take several GB.'
if (-not (Test-Path -LiteralPath $runtimePython)) { Run-Python 'python' @('-m','venv','data/hf-racquet-env') }
Run-Python $runtimePython @('-m','pip','install','torch==2.11.0','--index-url','https://download.pytorch.org/whl/cu128')
Run-Python $runtimePython @('-m','pip','install','transformers==4.57.6','huggingface-hub==0.36.2','safetensors==0.8.0','accelerate==1.12.0','numpy==2.5.3','opencv-python==5.0.0.93','pillow==12.3.0','mediapipe==0.10.35','ultralytics==8.4.174','onnxruntime==1.30.0')
$sharedPackages = Join-Path $projectRoot 'data/hf-racquet-env/Lib/site-packages'
foreach ($name in @('player-pose-env','tracknet-env')) {
  $linkedPython = Join-Path $projectRoot "data/$name/Scripts/python.exe"
  if (-not (Test-Path -LiteralPath $linkedPython)) { Run-Python $runtimePython @('-m','venv',"data/$name") }
  $link = Join-Path $projectRoot "data/$name/Lib/site-packages/shuttlesense-runtime.pth"
  [System.IO.File]::WriteAllText($link,$sharedPackages)
}
New-Item -ItemType Directory -Force -Path 'data/hf-racquet-baseline','data/models/mediapipe' | Out-Null
Run-Python $runtimePython @('-c',"from ultralytics import YOLO; YOLO('data/hf-racquet-baseline/yolo11n-pose.pt')")
if (-not (Test-Path -LiteralPath 'data/models/mediapipe/pose_landmarker_full.task')) {
  Invoke-WebRequest 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task' -OutFile 'data/models/mediapipe/pose_landmarker_full.task.partial'
  Move-Item -LiteralPath 'data/models/mediapipe/pose_landmarker_full.task.partial' -Destination 'data/models/mediapipe/pose_landmarker_full.task'
}
Run-Python $runtimePython @('analysis/download_tracknet.py')
Run-Python $runtimePython @('analysis/ground_landing.py','--download')
Run-Python $runtimePython @('analysis/download_shot_coach.py')
Write-Output 'Set $env:PYTHON_EXECUTABLE = "data/hf-racquet-env/Scripts/python.exe", then start the app. Run setup -CheckOnly to check readiness.'
