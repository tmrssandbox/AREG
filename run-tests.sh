#!/bin/bash
set -e

MODE=${1:-all}

case "$MODE" in
  unit)
    echo "Running Lambda unit tests..."
    cd lambda && npm test && cd ..
    ;;
  api)
    echo "Running API integration tests..."
    cd lambda && npm run test:api && cd ..
    ;;
  frontend)
    echo "Running React component tests..."
    cd frontend && npm test && cd ..
    ;;
  e2e)
    echo "Running Playwright e2e smoke tests..."
    cd tests/e2e && npx playwright test && cd ../..
    ;;
  all)
    echo "Running full regression..."
    cd lambda && npm test && npm run test:api && cd ..
    cd frontend && npm test && cd ..
    cd tests/e2e && npx playwright test && cd ../..
    echo "All tests passed."
    ;;
  *)
    echo "Usage: ./run-tests.sh [unit|api|frontend|e2e|all]"
    exit 1
    ;;
esac
