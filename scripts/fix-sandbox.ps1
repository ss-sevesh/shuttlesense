param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$log = Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE '.codex/.sandbox') -Filter 'sandbox.*.log' |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $log) { throw 'No sandbox log found. No processes stopped.' }
$events = @(Select-String -LiteralPath $log.FullName -Pattern 'runtime read/execute validation failed:|setup refresh: processed .*errors=\[\]')
$failure = $events | Select-Object -Last 1
if (-not $failure -or $failure.Line -match 'setup refresh: processed .*errors=\[\]') {
    Write-Output 'No unresolved runtime failure. No processes stopped.'
    return
}
if ($failure.Line -notmatch 'runtime read/execute validation failed:.* on (.+?node_repl\.exe):.*os error 32') {
    throw 'The latest runtime failure is not the known file lock. No processes stopped.'
}
$runtimePath = $Matches[1].Replace('\\', '\')
$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'OpenAI/Codex/runtimes/cua_node')) + '\'
if (-not ([IO.Path]::GetFullPath($runtimePath)).StartsWith($runtimeRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Logged runtime is outside the expected Codex runtime directory. No processes stopped.'
}
try {
    $helpers = @(Get-CimInstance Win32_Process -Filter "Name = 'node_repl.exe'" |
        Where-Object { $_.ExecutablePath -eq $runtimePath })
} catch {
    throw 'Cannot inspect helper processes. Run this shortcut with approved execution outside the sandbox. No processes stopped.'
}
Write-Output "Log: $($log.FullName)"
Write-Output "Locked runtime: $runtimePath"
Write-Output "Matching helpers: $($helpers.Count)"
if ($CheckOnly) { Write-Output 'Check only: no processes stopped.'; return }
foreach ($helper in $helpers) { Stop-Process -Id $helper.ProcessId -Force }
Write-Output 'Retry a normal sandbox command immediately, before using browser tools.'
