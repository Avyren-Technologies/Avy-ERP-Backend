// Storage service for file uploads and cloud storage

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import * as fs from 'fs';
import * as path from 'path';

export class StorageService {
  // Upload file to configured storage
  async uploadFile(file: Express.Multer.File, folder: string = 'uploads'): Promise<string> {
    try {
      if (env.STORAGE_TYPE === 'local') {
        return await this.uploadToLocal(file, folder);
      } else if (env.STORAGE_TYPE === 's3') {
        return await this.uploadToS3(file, folder);
      } else {
        throw new Error(`Unsupported storage type: ${env.STORAGE_TYPE}`);
      }
    } catch (error) {
      logger.error('File upload failed:', error);
      throw error;
    }
  }

  // Delete file from storage
  async deleteFile(fileUrl: string): Promise<void> {
    try {
      if (env.STORAGE_TYPE === 'local') {
        await this.deleteFromLocal(fileUrl);
      } else if (env.STORAGE_TYPE === 's3') {
        await this.deleteFromS3(fileUrl);
      }
    } catch (error) {
      logger.error('File deletion failed:', error);
      throw error;
    }
  }

  // Get file URL
  getFileUrl(fileName: string, folder = 'uploads'): string {
    if (env.STORAGE_TYPE === 'local') {
      return `${env.APP_URL}/files/${folder}/${fileName}`;
    } else if (env.STORAGE_TYPE === 's3') {
      return `https://${env.AWS_S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${folder}/${fileName}`;
    }
    throw new Error(`Unsupported storage type: ${env.STORAGE_TYPE}`);
  }

  // Local storage implementation
  private async uploadToLocal(file: Express.Multer.File, folder: string): Promise<string> {
    const basePath = env.STORAGE_LOCAL_PATH || './uploads';
    const uploadDir = path.join(basePath, folder);

    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const fileName = `${Date.now()}-${file.originalname}`;
    const filePath = path.join(uploadDir, fileName);

    // Move file to destination
    fs.writeFileSync(filePath, file.buffer);

    const fileUrl = this.getFileUrl(fileName, folder);
    logger.info(`File uploaded to local storage: ${fileUrl}`);

    return fileUrl;
  }

  private async deleteFromLocal(fileUrl: string): Promise<void> {
    // Extract filename from URL
    const urlParts = fileUrl.split('/');
    const fileName = urlParts[urlParts.length - 1] || '';
    const folder = urlParts[urlParts.length - 2] || 'uploads';

    const basePath = env.STORAGE_LOCAL_PATH || './uploads';
    const filePath = path.join(basePath, folder, fileName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`File deleted from local storage: ${filePath}`);
    }
  }

  // S3 storage implementation (placeholder)
  private async uploadToS3(file: Express.Multer.File, folder: string): Promise<string> {
    // TODO: Implement AWS S3 upload
    // const AWS = require('aws-sdk');
    // const s3 = new AWS.S3({ ... });

    throw new Error('S3 storage not implemented yet');
  }

  private async deleteFromS3(fileUrl: string): Promise<void> {
    // TODO: Implement AWS S3 deletion
    throw new Error('S3 storage deletion not implemented yet');
  }

  // File validation
  validateFile(file: Express.Multer.File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > (env.MAX_FILE_SIZE || 10485760)) {
      return {
        valid: false,
        error: `File size exceeds maximum allowed size of ${(env.MAX_FILE_SIZE || 10485760)} bytes`,
      };
    }

    // Check file type
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    const allowedTypes = (env.ALLOWED_FILE_TYPES || '.jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx').split(',');
    if (!extension || !allowedTypes.includes(`.${extension}`)) {
      return {
        valid: false,
        error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
      };
    }

    return { valid: true };
  }

  // Get storage statistics
  async getStorageStats(): Promise<{
    type: string;
    totalFiles?: number;
    totalSize?: number;
  }> {
    if (env.STORAGE_TYPE === 'local') {
      // TODO: Calculate local storage stats
      return {
        type: 'local',
        totalFiles: 0,
        totalSize: 0,
      };
    } else {
      // TODO: Calculate S3 storage stats
      return {
        type: 's3',
      };
    }
  }
}

export const storageService = new StorageService();