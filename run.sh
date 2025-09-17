#!/bin/bash

# attn.markets build and run script
echo "🔧 Building and running attn.markets..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the project root directory"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Build all packages
echo "🏗️  Building packages..."
pnpm build

# Function to kill processes on exit
cleanup() {
    echo "🛑 Stopping development servers..."
    jobs -p | xargs -r kill
    exit
}
trap cleanup SIGINT SIGTERM

# Start development servers in parallel
echo "🚀 Starting development servers..."
echo ""
echo "🌐 Landing page will be available at: http://localhost:3000"
echo "⚡ dApp will be available at: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Start landing page dev server
(
    cd apps/landing
    echo "🏠 Starting landing page on port 3000..."
    pnpm dev
) &

# Start dApp dev server  
(
    cd apps/dapp
    echo "📱 Starting dApp on port 3001..."
    pnpm dev -p 3001
) &

# Wait for all background jobs
wait
