param(
  [string]$WorkerName = "tdone-remix",
  [string]$EnvironmentName = "",
  [switch]$SkipLogin,
  [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"

function Get-PlainTextFromSecureString {
  param([System.Security.SecureString]$Secure)

  if ($null -eq $Secure) {
    return ""
  }

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Invoke-WranglerSecretPut {
  param(
    [string]$SecretName,
    [string]$SecretValue
  )

  $args = @("wrangler", "secret", "put", $SecretName, "--name", $WorkerName)
  if (-not [string]::IsNullOrWhiteSpace($EnvironmentName)) {
    $args += @("--env", $EnvironmentName)
  }

  $SecretValue | npx @args
}

$requiredSecrets = @(
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESET_PIN_SECRET",
  "CRON_SECRET",
  "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "LINE_CHANNEL_ACCESS_TOKEN",
  "LINE_ADMIN_API_KEY"
)

Write-Host "=== TDOne Remix Cloudflare Setup ===" -ForegroundColor Cyan
Write-Host "Worker: $WorkerName" -ForegroundColor Yellow
if (-not [string]::IsNullOrWhiteSpace($EnvironmentName)) {
  Write-Host "Environment: $EnvironmentName" -ForegroundColor Yellow
}

if (-not $SkipLogin) {
  Write-Host "`nStep 1/4: Login to Cloudflare" -ForegroundColor Green
  npx wrangler login
}

Write-Host "`nStep 2/4: Configure required secrets" -ForegroundColor Green
foreach ($secretName in $requiredSecrets) {
  Write-Host "- Enter value for $secretName" -ForegroundColor DarkGray
  $secureInput = Read-Host -AsSecureString "$secretName"
  $secretValue = Get-PlainTextFromSecureString -Secure $secureInput

  if ([string]::IsNullOrWhiteSpace($secretValue)) {
    throw "Secret '$secretName' cannot be empty."
  }

  Invoke-WranglerSecretPut -SecretName $secretName -SecretValue $secretValue
}

Write-Host "`nStep 3/4: Validate project" -ForegroundColor Green
npm run typecheck
npm run build

if (-not $SkipDeploy) {
  Write-Host "`nStep 4/4: Deploy worker" -ForegroundColor Green
  npm run deploy
}

Write-Host "`n=== Post-deploy cron endpoint test command ===" -ForegroundColor Cyan
Write-Host "Use this command to verify cleanup endpoint with CRON_SECRET:" -ForegroundColor DarkGray
Write-Host 'curl -H "Authorization: Bearer <CRON_SECRET>" https://tdone-erp.com/api/cron/cleanup-cancelled-leave-files' -ForegroundColor White

Write-Host "`nDone." -ForegroundColor Cyan
