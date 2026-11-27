#!/usr/bin/env bash
set -euo pipefail

echo "=== shelf-world-web setup ==="
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required (18+)." >&2
  exit 1
fi

NODE_MAJOR=$(node --version | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js 18+ required (found $(node --version))." >&2
  exit 1
fi
echo "Node $(node --version) detected."
echo ""

echo "Installing dependencies..."
npm install

echo ""
echo "Running full test suite..."
npm test

echo ""
echo "Running GA unit tests..."
npm run test:ga

echo ""
echo "=== Setup complete ==="
echo ""
echo "Useful commands:"
echo "  npm run dev            start dev server"
echo "  npm test               run all tests"
echo "  npm run test:ga        run GA tests only"
echo "  npm run benchmark:dry  quick 5-problem benchmark (~5 s)"
echo "  npm run benchmark      full 100-problem benchmark (~60 s)"
echo ""
echo "Benchmark writes benchmark-results.json and BENCHMARK_REPORT.md."