#!/bin/bash
set -e

# 1. Build frontend
npm run build --prefix frontend

# 2. Build and deploy infra (CDK) — only when infra changes
cd cdk && npx tsc && node_modules/.bin/cdk deploy --require-approval never && cd ..

# 3. Sync frontend to S3 (index.html with no-cache so browsers always fetch the latest)
aws s3 sync frontend/dist/ s3://areg-s3-frontend-979952482911 --delete \
  --exclude "index.html"
aws s3 cp frontend/dist/index.html s3://areg-s3-frontend-979952482911/index.html \
  --content-type "text/html" \
  --cache-control "no-cache, no-store, must-revalidate"

# 4. Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id $AREG_CF_ID --paths '/*'

echo 'Deployment complete.'
