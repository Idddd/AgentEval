param([string]$OpenSsl = 'openssl')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$tls = Join-Path $root '.artifacts/uat-nemo/mtls'
$null = New-Item -ItemType Directory -Force -Path $tls
function Invoke-OpenSsl {
  & $OpenSsl @args
  if ($LASTEXITCODE -ne 0) { throw 'Failed to generate local NeMo mTLS credentials.' }
}
Push-Location $tls
try {
  $required = @('ca.crt','ca.key','controller.crt','controller.key','runner.crt','runner.key')
  $present = @($required | Where-Object { Test-Path -LiteralPath $_ })
  if ($present.Count -eq $required.Count) { Write-Output 'Existing local NeMo mTLS credentials retained.'; return }
  if ($present.Count) { throw 'An incomplete mTLS credential set already exists; restore it before proceeding.' }
  Invoke-OpenSsl req -new -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -noenc -keyout ca.key -out ca.crt -days 365 -subj '/CN=Marketplace Local NeMo CA' -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign'
  Invoke-OpenSsl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -noenc -keyout controller.key -out controller.csr -subj '/CN=controller' -addext 'subjectAltName=DNS:controller' -addext 'extendedKeyUsage=serverAuth'
  Invoke-OpenSsl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -noenc -keyout runner.key -out runner.csr -subj '/CN=marketplace-uat-local-1' -addext 'extendedKeyUsage=clientAuth'
  Invoke-OpenSsl x509 -req -in controller.csr -CA ca.crt -CAkey ca.key -set_serial 10 -days 180 -copy_extensions copy -out controller.crt
  Invoke-OpenSsl x509 -req -in runner.csr -CA ca.crt -CAkey ca.key -set_serial 11 -days 180 -copy_extensions copy -out runner.crt
  Write-Output 'Local NeMo mTLS credentials generated in the ignored UAT directory.'
} finally { Pop-Location }
