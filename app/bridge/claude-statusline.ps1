param([Parameter(Mandatory=$true)][string]$SnapshotPath)
$ErrorActionPreference = 'Stop'
try {
    $inputJson = [Console]::In.ReadToEnd()
    if ($inputJson.Length -gt 1048576) { throw 'Input too large' }
    $session = $inputJson | ConvertFrom-Json
    $rates = @{}
    if ($null -ne $session.rate_limits) {
        foreach ($property in $session.rate_limits.PSObject.Properties) {
            $row = $property.Value
            if ($null -ne $row -and $null -ne $row.used_percentage -and
                ($row.used_percentage -is [ValueType]) -and [double]$row.used_percentage -ge 0) {
                $rates[$property.Name] = @{
                    used_percentage = [double]$row.used_percentage
                    resets_at = $row.resets_at
                }
            }
        }
    }
    # Only quota fields and model display name leave this process. No tokens, prompts or paths.
    $snapshot = @{
        schemaVersion = 1
        observedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        rateLimits = $rates
        model = [string]$session.model.display_name
    }
    $snapshotDir = Split-Path -Parent $SnapshotPath
    [IO.Directory]::CreateDirectory($snapshotDir) | Out-Null
    $temporaryFile = $SnapshotPath + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    [IO.File]::WriteAllText($temporaryFile, ($snapshot | ConvertTo-Json -Depth 8 -Compress), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $temporaryFile -Destination $SnapshotPath -Force
    $parts = @()
    if ($rates.ContainsKey('five_hour')) { $parts += ('5h: ' + [Math]::Round($rates.five_hour.used_percentage) + '%') }
    if ($rates.ContainsKey('seven_day')) { $parts += ('7d: ' + [Math]::Round($rates.seven_day.used_percentage) + '%') }
    $modelName = [string]$session.model.display_name
    if ($parts.Count -gt 0) { [Console]::WriteLine('ShanGyi | ' + ($parts -join ' | ')) }
    else { [Console]::WriteLine('ShanGyi | ' + $modelName) }
} catch {
    [Console]::Error.WriteLine('ShanGyi bridge error at line ' + $_.InvocationInfo.ScriptLineNumber + ': ' + $_.Exception.GetType().Name)
    [Console]::WriteLine('ShanGyi | waiting for usage')
}
