#!/bin/bash
# CiteBite Development Environment Stop Script
# Usage: ./scripts/stop-dev.sh

echo "🛑 Stopping CiteBite Development Environment"
echo ""

# Stop Supabase
echo "📦 [1/2] Stopping Supabase..."
npx supabase stop
echo "✅ Supabase stopped"
echo ""

# Stop Redis
echo "📦 [2/2] Stopping Redis..."
docker stop citebite-redis > /dev/null 2>&1
echo "✅ Redis stopped"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All services stopped"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "To start again: ./scripts/start-dev.sh"
