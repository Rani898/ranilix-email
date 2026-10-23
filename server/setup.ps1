# Ranilix Email - one-click server setup for Windows.
# Run it by double-clicking setup.bat in this folder.
# Safe to run again: it reuses the database and file storage if they already exist.

# Native tools print warnings to stderr; "Continue" keeps those from stopping the script.
$ErrorActionPreference = "Continue"
Set-Location -Path $PSScriptRoot

function Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "    $text" -ForegroundColor Green }
function Fail($text) {
  Write-Host ""
  Write-Host "ERROR: $text" -ForegroundColor Red
  Write-Host "Take a screenshot of this window and send it to Claude." -ForegroundColor Yellow
  Read-Host "Press Enter to close"
  exit 1
}
function Check($what) { if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit code $LASTEXITCODE)." } }

# Pull the JSON part out of command output (wrangler can print extra lines around it).
function JsonFrom($text, $open, $close) {
  $start = $text.IndexOf($open); $end = $text.LastIndexOf($close)
  if ($start -lt 0 -or $end -le $start) { return $null }
  return ($text.Substring($start, $end - $start + 1) | ConvertFrom-Json)
}

Write-Host "Ranilix Email - server setup" -ForegroundColor White
Write-Host "This takes a few minutes. Don't close this window."

# 1. Install
Step "1/7  Installing tools (npm install)"
& npm.cmd install --no-fund --no-audit
Check "npm install"
Ok "Installed"

# 2. Log in to Cloudflare (opens the browser once)
Step "2/7  Connecting to your Cloudflare account"
$who = (& npx.cmd wrangler whoami 2>&1 | Out-String)
if ($who -match "not authenticated" -or $who -match "You are not") {
  Write-Host "    A browser window will open. Click 'Allow' there, then come back here."
  & npx.cmd wrangler login
  Check "Cloudflare login"
}
Ok "Connected"

# 3. Database
Step "3/7  Creating the database"
$dbs = JsonFrom (& npx.cmd wrangler d1 list --json 2>&1 | Out-String) "[" "]"
$db = $dbs | Where-Object { $_.name -eq "ranilix-email" } | Select-Object -First 1
if (-not $db) {
  "n" | & npx.cmd wrangler d1 create ranilix-email
  Check "Creating the database"
  $dbs = JsonFrom (& npx.cmd wrangler d1 list --json 2>&1 | Out-String) "[" "]"
  $db = $dbs | Where-Object { $_.name -eq "ranilix-email" } | Select-Object -First 1
}
if (-not $db) { Fail "Couldn't find the database after creating it." }
$dbId = $db.uuid
Ok "Database id: $dbId"

# 4. File storage (for attachments)
Step "4/7  Creating file storage for attachments"
$kvs = JsonFrom (& npx.cmd wrangler kv namespace list 2>&1 | Out-String) "[" "]"
$kv = $kvs | Where-Object { $_.title -match "FILES$" } | Select-Object -First 1
if (-not $kv) {
  "n" | & npx.cmd wrangler kv namespace create FILES
  Check "Creating file storage"
  $kvs = JsonFrom (& npx.cmd wrangler kv namespace list 2>&1 | Out-String) "[" "]"
  $kv = $kvs | Where-Object { $_.title -match "FILES$" } | Select-Object -First 1
}
if (-not $kv) { Fail "Couldn't find the file storage after creating it." }
$kvId = $kv.id
Ok "Storage id: $kvId"

# 5. Save the ids in wrangler.toml
Step "5/7  Saving the settings (wrangler.toml)"
$toml = [IO.File]::ReadAllText("$PSScriptRoot\wrangler.toml")
$toml = [regex]::Replace($toml, '(?m)^database_id = ".*"$', "database_id = `"$dbId`"")
$toml = [regex]::Replace($toml, '(?m)^id = ".*"$', "id = `"$kvId`"")
[IO.File]::WriteAllText("$PSScriptRoot\wrangler.toml", $toml, (New-Object Text.UTF8Encoding $false))
Ok "Saved"

# 6. Tables
Step "6/7  Creating the tables"
& npx.cmd wrangler d1 execute ranilix-email --remote --file=schema.sql --yes
Check "Creating the tables"
Ok "Tables ready"

# 7. Deploy
Step "7/7  Uploading the server"
& npx.cmd wrangler deploy
Check "Uploading the server"
Ok "Uploaded"

# 8. Optional: Resend key for sending to Gmail and other providers
Step "Sending to Gmail and other providers (optional)"
Write-Host "    If you have a Resend API key (starts with re_), paste it here and press Enter."
Write-Host "    To skip, just press Enter."
$secure = Read-Host "    Resend API key" -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ($key -and $key.Trim().Length -gt 0) {
  $key.Trim() | & npx.cmd wrangler secret put RESEND_API_KEY
  Check "Saving the Resend key"
  Ok "Resend key saved. Sending to other providers is on."
} else {
  Ok "Skipped"
}

# 9. Optional: Google client secret for "Connect Gmail"
Step "Connect Gmail with Google (optional)"
Write-Host "    If you have a Google OAuth client secret (starts with GOCSPX-), paste it here and press Enter."
Write-Host "    To skip, just press Enter."
$secure = Read-Host "    Google client secret" -AsSecureString
$gkey = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ($gkey -and $gkey.Trim().Length -gt 0) {
  $gkey.Trim() | & npx.cmd wrangler secret put GOOGLE_CLIENT_SECRET
  Check "Saving the Google secret"
  Ok "Google secret saved."
} else {
  Ok "Skipped"
}

# 10. Optional: Discord bot token
Step "Discord bot (optional)"
Write-Host "    If you have a Discord bot token, paste it here and press Enter."
Write-Host "    To skip, just press Enter."
$secure = Read-Host "    Discord bot token" -AsSecureString
$dkey = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ($dkey -and $dkey.Trim().Length -gt 0) {
  $dkey.Trim() | & npx.cmd wrangler secret put DISCORD_BOT_TOKEN
  Check "Saving the Discord token"
  Ok "Discord token saved."
} else {
  Ok "Skipped"
}

# Check it answers
Step "Checking https://api.ranilix.com (can take a minute the first time)"
$up = $false
for ($i = 0; $i -lt 18 -and -not $up; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "https://api.ranilix.com/" -UseBasicParsing -TimeoutSec 10
    if ($r.Content -match '"ok":true') { $up = $true }
  } catch { Start-Sleep -Seconds 10 }
}
Write-Host ""
if ($up) {
  Write-Host "DONE! The server is live at https://api.ranilix.com" -ForegroundColor Green
} else {
  Write-Host "The server was uploaded, but api.ranilix.com isn't answering yet." -ForegroundColor Yellow
  Write-Host "That's usually just DNS taking a few more minutes."
}
Write-Host "Go back to Claude and write: ready" -ForegroundColor White
Read-Host "Press Enter to close"
