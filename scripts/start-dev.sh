#!/bin/bash
# CiteBite Development Environment Startup Script
# Usage: ./scripts/start-dev.sh

set -e

echo "🚀 Starting CiteBite Development Environment"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker Desktop first."
  exit 1
fi

echo "✅ Docker is running"
echo ""

# Step 1: Start Supabase
echo "📦 [1/3] Starting Supabase..."
npx supabase start

# Check if Supabase started successfully
if [ $? -eq 0 ]; then
  echo "✅ Supabase is running"
else
  echo "❌ Supabase failed to start"
  exit 1
fi
echo ""

# Step 2: Start Redis (if not already running)
echo "📦 [2/3] Starting Redis..."
if docker ps | grep -q citebite-redis; then
  echo "✅ Redis is already running"
else
  if docker ps -a | grep -q citebite-redis; then
    docker start citebite-redis > /dev/null 2>&1
    echo "✅ Redis started"
  else
    docker run -d --name citebite-redis -p 6379:6379 redis:7-alpine > /dev/null 2>&1
    echo "✅ Redis created and started"
  fi
fi
echo ""

# Step 3: Start Next.js
echo "📦 [3/3] Starting Next.js dev server..."
echo "   Open http://localhost:3000 in your browser"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 All services are running!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Services:"
echo "  • Next.js:  http://localhost:3000"
echo "  • Supabase Studio: http://127.0.0.1:54323"
echo "  • PostgreSQL: localhost:54322"
echo "  • Redis: localhost:6379"
echo ""
echo "Press Ctrl+C to stop Next.js (Supabase and Redis will keep running)"
echo ""

# Start Next.js in foreground
npm run dev
