import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

class R2Service {
  private client: S3Client | null = null;
  private bucket: string;

  constructor() {
    this.bucket = env.R2_BUCKET_NAME;
  }

  private getClient(): S3Client {
    if (this.client) return this.client;

    const accountId = env.R2_ACCOUNT_ID;
    const endpoint = env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

    if (!endpoint || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 configuration is incomplete. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.');
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
      // R2 does not support AWS SDK v3 CRC32 checksums
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

    logger.info('R2 client initialized', { bucket: this.bucket, endpoint });
    return this.client;
  }

  async getPresignedUploadUrl(
    key: string,
    contentType: string,
    expiresIn?: number,
  ): Promise<string> {
    const client = this.getClient();
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(client, command, {
      expiresIn: expiresIn ?? env.R2_UPLOAD_URL_EXPIRY_SECONDS,
    });
  }

  async getPresignedDownloadUrl(
    key: string,
    expiresIn?: number,
  ): Promise<string> {
    const client = this.getClient();
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(client, command, {
      expiresIn: expiresIn ?? env.R2_DOWNLOAD_URL_EXPIRY_SECONDS,
    });
  }

  async headObject(key: string): Promise<boolean> {
    try {
      const client = this.getClient();
      await client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const client = this.getClient();
    await client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    logger.info('R2 object deleted', { key });
  }

  async uploadBuffer(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    const client = this.getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    logger.info('R2 object uploaded', { key, size: buffer.length });
  }

  async configureCors(allowedOrigins: string[]): Promise<void> {
    const client = this.getClient();
    await client.send(
      new PutBucketCorsCommand({
        Bucket: this.bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ['*'],
              AllowedMethods: ['GET', 'PUT', 'HEAD'],
              AllowedOrigins: allowedOrigins,
              ExposeHeaders: ['ETag'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
    logger.info('R2 CORS configured', { bucket: this.bucket, origins: allowedOrigins });
  }

  isConfigured(): boolean {
    return !!(
      (env.R2_ACCOUNT_ID || env.R2_ENDPOINT) &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY
    );
  }
}

export const r2Service = new R2Service();
