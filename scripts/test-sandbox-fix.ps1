$ErrorActionPreference = 'Stop'
$testLog = Join-Path ([IO.Path]::GetTempPath()) ('shuttlesense-repair-' + [guid]::NewGuid() + '.log')
$runtime = Join-Path $env:LOCALAPPDATA 'OpenAI/Codex/runtimes/cua_node/test/bin/node_repl.exe'
$testState = [pscustomobject]@{ Stopped = [Collections.Generic.List[int]]::new(); Inspected = 0 }
# Shadow process commands: this check must never inspect or stop real helpers.
function Get-ChildItem { param($LiteralPath, $Filter); [pscustomobject]@{ FullName = $testLog; LastWriteTime = Get-Date } }
function Get-CimInstance {
    param($ClassName, $Filter)
    $testState.Inspected++
    [pscustomobject]@{ ProcessId = 101; ExecutablePath = $runtime }
    [pscustomobject]@{ ProcessId = 102; ExecutablePath = 'C:\unrelated\node_repl.exe' }
}
function Stop-Process { param($Id, [switch]$Force); $testState.Stopped.Add($Id) }
function Assert($condition, $message) { if (-not $condition) { throw $message } }
$repair = Join-Path $PSScriptRoot 'fix-sandbox.ps1'
$failure = "runtime read/execute validation failed: validate runtime read/execute access on ${runtime}: open ACL target: file in use (os error 32)"
try {
    Set-Content -LiteralPath $testLog -Value @($failure, 'setup refresh: processed 2 write roots; errors=[]')
    & $repair
    Assert ($testState.Inspected -eq 0 -and $testState.Stopped.Count -eq 0) 'Resolved failures must not touch processes'
    Set-Content -LiteralPath $testLog -Value $failure
    & $repair -CheckOnly
    Assert ($testState.Stopped.Count -eq 0) 'Dry run stopped a process'
    & $repair
    Assert ($testState.Stopped.Count -eq 1 -and $testState.Stopped[0] -eq 101) 'Wrong helper selection'
    $testState.Stopped.Clear()
    Set-Content -LiteralPath $testLog -Value $failure.Replace('\', '\\')
    & $repair
    Assert ($testState.Stopped.Count -eq 1 -and $testState.Stopped[0] -eq 101) 'JSON-escaped paths failed'
    foreach ($invalid in @($failure.Replace($runtime, 'C:\unrelated\node_repl.exe'), $failure.Replace('os error 32', 'os error 5'))) {
        $testState.Stopped.Clear()
        Set-Content -LiteralPath $testLog -Value $invalid
        $rejected = $false
        try { & $repair } catch { $rejected = $true }
        Assert ($rejected -and $testState.Stopped.Count -eq 0) 'Unsafe runtime or unknown error was accepted'
    }
    Write-Output 'PASS: resolved failures, dry run, exact helper selection, escaped paths and unknown-error rejection'
} finally {
    Remove-Item -LiteralPath $testLog -ErrorAction SilentlyContinue
}
