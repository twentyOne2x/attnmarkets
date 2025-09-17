#!/bin/bash

# attn.markets project setup script
echo "🚀 Setting up attn.markets project..."

# Create root directory
mkdir -p attn-market
cd attn-market

# Initialize git
git init
echo "node_modules/" > .gitignore
echo ".next/" >> .gitignore
echo ".env.local" >> .gitignore
echo "dist/" >> .gitignore

# Create main project structure
mkdir -p apps/landing
mkdir -p apps/dapp
mkdir -p packages/ui

# Landing app structure
cd apps/landing
mkdir -p app/{components,lib,styles}
mkdir -p app/components/{ui,sections}
mkdir -p public/{images,icons}

# Create landing app files
touch package.json
touch tsconfig.json
touch tailwind.config.ts
touch next.config.js
touch app/layout.tsx
touch app/page.tsx
touch app/globals.css
touch app/components/ui/{button,card,navbar}.tsx
touch app/components/sections/{hero,how-it-works,use-cases,roadmap,footer}.tsx
touch app/lib/constants.ts

cd ../../

# dApp structure
cd apps/dapp
mkdir -p app/{components,lib,store,styles}
mkdir -p app/components/{ui,charts,modals,tables}
mkdir -p app/{leaderboard,creator,deposit,mint,redeem,trade}
mkdir -p public/mock

# Create dApp files
touch package.json
touch tsconfig.json
touch tailwind.config.ts
touch next.config.js
touch app/layout.tsx
touch app/page.tsx
touch app/globals.css
touch app/leaderboard/page.tsx
touch app/creator/\[vault\]/page.tsx
touch app/deposit/page.tsx
touch app/mint/page.tsx
touch app/redeem/page.tsx
touch app/trade/page.tsx
touch app/components/ui/{button,card,table,modal}.tsx
touch app/components/charts/fee-chart.tsx
touch app/components/modals/{deposit,mint}-modal.tsx
touch app/components/tables/leaderboard-table.tsx
touch app/lib/{mock-client,format}.ts
touch app/store/index.ts
touch public/mock/{creators,lp_pool,user}.json

cd ../../

# Shared packages
cd packages/ui
mkdir -p src/components
touch package.json
touch tsconfig.json
touch src/components/{button,card,input}.tsx
touch src/index.ts

cd ../../

# Root configuration files
touch package.json
touch pnpm-workspace.yaml
touch turbo.json
touch README.md

echo "✅ Project structure created!"
echo ""
echo "📁 File structure:"
tree -I 'node_modules'

echo ""
echo "🔧 Next steps:"
echo "1. Run the file content script to populate all files"
echo "2. Run pnpm install to install dependencies"
echo "3. Run the dev script to start development servers"
