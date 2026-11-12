# Starts the dev server with the Nebius key in this process's memory only (chat enabled locally).
# The key is read from the secrets file outside OneDrive. It is never printed and no file is written.
$secrets = 'C:\Users\Brian\.secrets\downwind.env'
$line = Get-Content -Encoding utf8 $secrets | Where-Object { $_ -match '^\s*NEBIUS_API_KEY\s*=' } | Select-Object -First 1
if (-not $line) { Write-Error 'NEBIUS_API_KEY not found in the secrets file'; exit 1 }
$env:NEBIUS_API_KEY = ($line -split '=', 2)[1].Trim()
if (-not $env:NEBIUS_API_KEY) { Write-Error 'NEBIUS_API_KEY is empty'; exit 1 }
Write-Host 'Chat enabled for this process only. Starting the dev server...'
Set-Location (Join-Path $PSScriptRoot '..')
npm run dev -- -p 3125
