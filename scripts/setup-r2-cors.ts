/**
 * One-time script to configure CORS on the R2 bucket.
 * Run: npx ts-node scripts/setup-r2-cors.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';

const accountId = process.env.R2_ACCOUNT_ID!;
const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
const bucket = process.env.R2_BUCKET_NAME || 'avy-erp-files';

const s3 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

async function main() {
  const origins = [
    'http://localhost:3000',
    'http://localhost:3030',
    'http://localhost:5173',
    'https://avy-erp.avyren.in',
    'https://*.avyren.in',
  ];

  console.log(`Setting CORS on bucket "${bucket}" for origins:`, origins);

  await s3.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'PUT', 'HEAD'],
            AllowedOrigins: origins,
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );

  console.log('CORS configured successfully.');
}

main().catch((err) => {
  console.error('Failed to configure CORS:', err);
  process.exit(1);
});
