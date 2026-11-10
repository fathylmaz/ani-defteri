$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
function New-HexSecret([int]$Length) {
    $bytes = New-Object byte[] $Length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
}
if (-not (Test-Path -LiteralPath '.env')) {
    $template = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '.env.example'))
    $template = $template.Replace('GENERATE_SECRET',(New-HexSecret 48)).Replace('GENERATE_PASSWORD',(New-HexSecret 32))
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'),$template,(New-Object System.Text.UTF8Encoding($false)))
}
docker info --format '{{.ServerVersion}}'
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop calismiyor. Docker Desktop uygulamasini acip tekrar deneyin.' }
docker compose up -d --build --wait --wait-timeout 300
if ($LASTEXITCODE -ne 0) { throw 'Baslatma tamamlanamadi. docker compose logs --tail 80 komutunu inceleyin.' }
Write-Host 'Ani Defteri: http://localhost:3000'
Start-Process 'http://localhost:3000'
