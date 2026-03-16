# AgentHub Setup Script (Windows PowerShell)
Write-Host "🚀 AgentHub Setup" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan

# 1. Copy env files
if (-Not (Test-Path "apps/api/.env")) {
    Copy-Item "apps/api/.env.example" "apps/api/.env"
    Write-Host "✓ Created apps/api/.env" -ForegroundColor Green
}
if (-Not (Test-Path "apps/web/.env.local")) {
    Copy-Item "apps/web/.env.local.example" "apps/web/.env.local"
    Write-Host "✓ Created apps/web/.env.local" -ForegroundColor Green
}

# 2. Generate secure keys using Node
$accessSecret = & node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$refreshSecret = & node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$encryptionKey = & node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
$nextAuthSecret = & node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

(Get-Content "apps/api/.env") -replace "change_me_access_secret_32chars_min", $accessSecret | Set-Content "apps/api/.env"
(Get-Content "apps/api/.env") -replace "change_me_refresh_secret_32chars_min", $refreshSecret | Set-Content "apps/api/.env"
(Get-Content "apps/api/.env") -replace "change_me_32_byte_hex_key_here_ok", $encryptionKey | Set-Content "apps/api/.env"
(Get-Content "apps/web/.env.local") -replace "change_me_nextauth_secret_min_32_chars", $nextAuthSecret | Set-Content "apps/web/.env.local"

Write-Host "✓ Generated secure secrets" -ForegroundColor Green

# 3. Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
& pnpm install

# 4. Start Docker services
Write-Host "🐳 Starting PostgreSQL and Redis..." -ForegroundColor Yellow
& docker-compose up -d postgres redis

Start-Sleep -Seconds 8

# 5. Migrations
Write-Host "🗄️  Running database migrations..." -ForegroundColor Yellow
& pnpm db:migrate

# 6. Seed
Write-Host "🌱 Seeding database..." -ForegroundColor Yellow
& pnpm db:seed

Write-Host ""
Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Start the platform:" -ForegroundColor Cyan
Write-Host "  pnpm dev          — Start API + Web in dev mode"
Write-Host "  pnpm worker       — Start task worker (separate terminal)"
Write-Host ""
Write-Host "Open: http://localhost:3000" -ForegroundColor Blue
