$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
New-Item -ItemType Directory -Path backups -Force | Out-Null
$file = "ani-defteri-$((Get-Date).ToString('yyyyMMdd-HHmmss')).dump"
docker compose exec -T db pg_dump -U ani_defteri -d ani_defteri -Fc -f "/tmp/$file"
if ($LASTEXITCODE -ne 0) {throw 'Veritabani yedegi alinamadi.'}
docker compose cp "db:/tmp/$file" "backups/$file"
if ($LASTEXITCODE -ne 0) {throw 'Yedek disari kopyalanamadi.'}
docker compose exec -T db rm "/tmp/$file"
Write-Host "Yedek hazir: backups/$file"
