# Dot-source this file to enable Wrangler in the current PowerShell session.
$credentialPath = Join-Path $env:LOCALAPPDATA 'DeFly/cloudflare-token.dpapi'
$secureToken = Get-Content -LiteralPath $credentialPath -ErrorAction Stop | ConvertTo-SecureString -ErrorAction Stop
$env:CLOUDFLARE_API_TOKEN = [Net.NetworkCredential]::new('', $secureToken).Password
$env:CLOUDFLARE_ACCOUNT_ID = '195eca5460da6b1ff32998d01587182d'
$secureToken = $null
Write-Output 'Cloudflare credentials loaded for this process. Do not print environment variables.'
