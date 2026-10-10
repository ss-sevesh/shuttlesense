# Running ShuttleSense

## Interface and interactive demo

Node.js 22+ and an installed Chrome browser are sufficient to develop/test the UI.
Install with `npm install`, run `npm run dev` and open `/demo` on loopback port 3000.
Windows PowerShell uses `npm.cmd`/`npx.cmd`. The demo includes generated footage and
sample results; it never downloads weights or performs inference.

## Local analysis environment

The current worker paths target Windows. Tested locally with Python 3.14,
PyTorch 2.11 CUDA 12.8 and an RTX 4060 Laptop GPU with 8 GB VRAM. Other platforms and
CPU-only full inference are not verified. Allow several GB for environments/model
downloads and additional storage for videos, frames and outputs.

Install Python, Node.js, Git, FFmpeg, [Ollama](https://ollama.com/download/windows)
and an NVIDIA driver supporting CUDA 12.8. Start Ollama (or `ollama serve`) before setup.
Confirm `python --version`, `ffmpeg -version` and `nvidia-smi` work.
Then, from the project root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-analysis.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-analysis.ps1 -CheckOnly
$env:PYTHON_EXECUTABLE = "data/hf-racquet-env/Scripts/python.exe"
npm.cmd run dev
```

The script creates local virtual environments, installs pinned libraries and
downloads YOLO, MediaPipe, TrackNet, SegFormer and Qwen files. Reports use the original
Qwen3-4B-Instruct-2507 model with Unsloth's 2.50 GB Q4_K_M GGUF, pinned by revision
and verified SHA256. It is imported into Ollama under a project-specific name;
the separate Qwen vision model remains for loss explanations. Setup does not
change global execution policy, system permissions or GPU drivers. The player and
shuttle environments link to the shared model-runtime packages to avoid duplicate
CUDA installations. Existing local files remain under ignored `data/`.
`-CheckOnly` checks paths, imports, CUDA and the installed Ollama model identity;
it does not download or infer anything.

For an existing environment, install just the new report model with:

```powershell
& data/hf-racquet-env/Scripts/python.exe analysis/download_report_model.py
```

Reports call only `127.0.0.1:11434`, use a 16,384-token context and structured JSON
output. Weights stay warm between calls, then unload to free GPU memory for vision
workers; a five-minute idle lease covers abnormal exits. Every prompt is text; loss photos are
embedded in the downloaded HTML afterwards. Generation duration and actual
requests/timings are saved. If a Hugging Face Xet transfer stalls, rerun the
installer with `$env:HF_HUB_DISABLE_XET = "1"` in that PowerShell process.

The complete fresh-machine installer has not been exercised on a clean machine.
The readiness check is verified against the existing local environments; dependency
or upstream download changes can still require adjustment. Model licenses remain
their upstream authors' terms. Optional legacy BST setup is outside the current UI.

## First real recording

1. Open the workspace, choose **Upload Match** and select a readable MP4/MOV/WebM
   under 100 MB. Use consented footage with the full court visible in the first frame.
2. Choose **Analyze Rallies & Poses**. Mark the four distinct singles-court corners
   where the floor lines are visible; keyboard arrows/Enter are also supported.
3. Keep YOLO, Shuttle, Ground and Body pose enabled. Enable **Near-player ending
   review** for attempt evidence. Required dependencies enable together.
4. Start analysis. Progress and failures are displayed; model work is serialized.
5. Reopen it from **My Matches**, verify rally boundaries and mark outcomes.
   A ground-stop candidate alone does not determine who won.
6. Explain confirmed losses or generate a match report separately. These actions
   use separate local vision/text Qwen models and cache matching evidence.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Missing Python/model error | Run setup `-CheckOnly`; set `PYTHON_EXECUTABLE` before starting the server. |
| No CUDA / GPU out of memory | Check driver and `nvidia-smi`; close your own GPU-heavy apps and retry a short clip. |
| Another analysis running | Wait for the current worker. Do not delete the active lock while it is running. |
| No eligible rallies | Review unresolved windows and save observed boundaries before report generation. |
| No angle | Pose/landmark confidence may be insufficient; Unknown is intentional. |
| No heat before a rally | Live mode only accumulates elapsed time inside selected windows; choose Rally total for the full window. |
| Report does not complete | Start Ollama and rerun `analysis/download_report_model.py`. Context/output failures are explicit; no pose events are silently dropped. |
| Changed boundaries/outcomes | Refresh the report. Cache identity includes current evidence and reviewed windows. |
| Port 3000 busy | Reuse the existing project server or stop that known server before starting another. |

Keep the server on loopback. These APIs are designed for one local user, not public
multi-user hosting. Private outputs are under `data/analysis-jobs/<id>/`; changing
or deleting that folder changes what **My Matches** can reopen.

For the Codex-specific Windows setup error only, follow [AGENTS.md](../AGENTS.md).
Do not run the sandbox repair when commands already work.
