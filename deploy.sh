#!/bin/bash
set -e

# 1. Build frontend
npm run build --prefix frontend

# 2. Deploy infra (CDK) — only when infra changes
cd cdk && node_modules/.bin/cdk deploy --require-approval never && cd ..

# 3. Sync frontend to S3
aws s3 sync frontend/dist/ s3://areg-s3-frontend --delete

# 4. Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id $AREG_CF_ID --paths '/*'

echo 'Deployment complete.'
