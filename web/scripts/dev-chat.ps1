# Start the local dev server with the configured Nebius key.
$previousKey = $env:NEBIUS_API_KEY
if (-not $previousKey -and $env:DOWNWIND_SECRETS_FILE) {
    $line = Get-Content -LiteralPath $env:DOWNWIND_SECRETS_FILE -Encoding utf8 |
        Where-Object { $_ -match '^\s*NEBIUS_API_KEY\s*=' } | Select-Object -First 1
    if ($line) { $env:NEBIUS_API_KEY = ($line -split '=', 2)[1].Trim() }
}
Push-Location (Join-Path $PSScriptRoot '..')
try { npm run dev -- -p 3125 }
finally {
    Pop-Location
    $env:NEBIUS_API_KEY = $previousKey
}
