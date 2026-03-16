#!/usr/bin/env bash
set -e

echo "🚀 AgentHub Setup"
echo "=================="

# 1. Copy env files
if [ ! -f apps/api/.env ]; then
  cp apps/api/.env.example apps/api/.env
  echo "✓ Created apps/api/.env — edit with your settings"
fi
if [ ! -f apps/web/.env.local ]; then
  cp apps/web/.env.local.example apps/web/.env.local
  echo "✓ Created apps/web/.env.local — edit with your settings"
fi

# 2. Generate secure keys
ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
NEXTAUTH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Replace placeholders
sed -i "s/change_me_access_secret_32chars_min/$ACCESS_SECRET/" apps/api/.env
sed -i "s/change_me_refresh_secret_32chars_min/$REFRESH_SECRET/" apps/api/.env
sed -i "s/change_me_32_byte_hex_key_here_ok/$ENCRYPTION_KEY/" apps/api/.env
sed -i "s/change_me_nextauth_secret_min_32_chars/$NEXTAUTH_SECRET/" apps/web/.env.local

echo "✓ Generated secure secrets"

# 3. Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# 4. Start Docker services
echo "🐳 Starting PostgreSQL and Redis..."
docker-compose up -d postgres redis

echo "⏳ Waiting for services to be ready..."
sleep 5

# 5. Run migrations
echo "🗄️  Running database migrations..."
pnpm db:migrate

# 6. Seed database
echo "🌱 Seeding database..."
pnpm db:seed

echo ""
echo "✅ Setup complete!"
echo ""
echo "Start the platform:"
echo "  pnpm dev          — Start API + Web in dev mode"
echo "  pnpm worker       — Start task worker (separate terminal)"
echo "  docker-compose up — Run everything in Docker"
echo ""
echo "Open: http://localhost:3000"
