param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$log = Get-ChildItem -LiteralPath (Join-Path $env:USERPROFILE '.codex/.sandbox') -Filter 'sandbox.*.log' |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $log) { throw 'No sandbox log found. No processes stopped.' }
$failure = Select-String -LiteralPath $log.FullName -Pattern 'runtime read/execute validation failed:.* on (.+?node_repl\.exe):.*os error 32' |
    Select-Object -Last 1
if (-not $failure) { throw 'The latest log has no matching runtime lock. No processes stopped.' }
$runtimePath = $failure.Matches[0].Groups[1].Value.Replace('\\', '\')
$runtimeRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'OpenAI/Codex/runtimes/cua_node')) + '\'
if (-not ([IO.Path]::GetFullPath($runtimePath)).StartsWith($runtimeRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Logged runtime is outside the expected Codex runtime directory. No processes stopped.'
}
$helpers = @(Get-CimInstance Win32_Process -Filter "Name = 'node_repl.exe'" |
    Where-Object { $_.ExecutablePath -eq $runtimePath })
Write-Output "Log: $($log.FullName)"
Write-Output "Locked runtime: $runtimePath"
Write-Output "Matching helpers: $($helpers.Count)"
if ($CheckOnly) { Write-Output 'Check only: no processes stopped.'; return }
foreach ($helper in $helpers) { Stop-Process -Id $helper.ProcessId -Force }
Write-Output 'Retry a normal sandbox command immediately, before using browser tools.'
