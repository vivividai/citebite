#!/bin/bash
# Check status of all CiteBite services
# Usage: ./scripts/check-status.sh

echo "🔍 CiteBite Services Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check Supabase
echo "📦 Supabase:"
if npx supabase status > /dev/null 2>&1; then
  echo "   ✅ Running"
  echo "   📍 Studio: http://127.0.0.1:54323"
  echo "   📍 API: http://127.0.0.1:54321"
else
  echo "   ❌ Not running"
  echo "   💡 Start: npx supabase start"
fi
echo ""

# Check Redis
echo "📦 Redis:"
if docker ps | grep -q citebite-redis; then
  echo "   ✅ Running"
  echo "   📍 localhost:6379"
else
  if docker ps -a | grep -q citebite-redis; then
    echo "   ⏸️  Stopped (container exists)"
    echo "   💡 Start: docker start citebite-redis"
  else
    echo "   ❌ Not created"
    echo "   💡 Create: docker run -d --name citebite-redis -p 6379:6379 redis:7-alpine"
  fi
fi
echo ""

# Check Next.js (port 3000)
echo "📦 Next.js:"
if lsof -i :3000 > /dev/null 2>&1; then
  echo "   ✅ Running"
  echo "   📍 http://localhost:3000"
else
  echo "   ❌ Not running"
  echo "   💡 Start: npm run dev"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Quick commands:"
echo "  Start all:  ./scripts/start-dev.sh"
echo "  Stop all:   ./scripts/stop-dev.sh"
