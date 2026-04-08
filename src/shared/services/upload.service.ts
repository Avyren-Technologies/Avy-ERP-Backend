import { v4 as uuidv4 } from 'uuid';
import { ApiError } from '../errors';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { r2Service } from './r2.service';
import {
  FileCategory,
  FILE_CATEGORY_CONFIG,
  getMaxFileSize,
  getExtensionFromFilename,
  getExtensionFromMime,
} from '../constants/upload';

export interface UploadRequest {
  companyId: string;
  category: FileCategory;
  entityId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
}

export interface UploadResponse {
  uploadUrl: string;
  key: string;
  expiresIn: number;
}

export interface DownloadUrlResponse {
  downloadUrl: string;
  expiresIn: number;
}

class UploadService {
  async requestUpload(req: UploadRequest): Promise<UploadResponse> {
    const config = FILE_CATEGORY_CONFIG[req.category];
    if (!config) {
      throw ApiError.badRequest(`Invalid file category: ${req.category}`);
    }

    // Validate MIME type
    if (!config.allowedMimeTypes.includes(req.contentType)) {
      throw ApiError.badRequest(
        `File type "${req.contentType}" is not allowed for category "${req.category}". Allowed: ${config.allowedMimeTypes.join(', ')}`,
      );
    }

    // Validate file size
    const maxSize = getMaxFileSize(req.category);
    if (req.fileSize > maxSize) {
      const maxMB = (maxSize / (1024 * 1024)).toFixed(0);
      throw ApiError.badRequest(
        `File size ${(req.fileSize / (1024 * 1024)).toFixed(1)} MB exceeds maximum of ${maxMB} MB`,
      );
    }

    const key = this.buildKey(req);

    const expiresIn = env.R2_UPLOAD_URL_EXPIRY_SECONDS;
    const uploadUrl = await r2Service.getPresignedUploadUrl(
      key,
      req.contentType,
      expiresIn,
    );

    logger.info('Pre-signed upload URL generated', {
      category: req.category,
      key,
      companyId: req.companyId,
    });

    return { uploadUrl, key, expiresIn };
  }

  async getDownloadUrl(
    key: string,
    requestingCompanyId: string,
  ): Promise<DownloadUrlResponse> {
    const keyCompanyId = key.split('/')[0];
    if (keyCompanyId !== requestingCompanyId) {
      throw ApiError.forbidden('Access denied to this file');
    }

    const expiresIn = env.R2_DOWNLOAD_URL_EXPIRY_SECONDS;
    const downloadUrl = await r2Service.getPresignedDownloadUrl(key, expiresIn);

    return { downloadUrl, expiresIn };
  }

  async getDownloadUrlAdmin(key: string): Promise<DownloadUrlResponse> {
    const expiresIn = env.R2_DOWNLOAD_URL_EXPIRY_SECONDS;
    const downloadUrl = await r2Service.getPresignedDownloadUrl(key, expiresIn);
    return { downloadUrl, expiresIn };
  }

  async deleteFile(key: string): Promise<void> {
    await r2Service.deleteObject(key);
  }

  private buildKey(req: UploadRequest): string {
    const config = FILE_CATEGORY_CONFIG[req.category];
    const ext = getExtensionFromFilename(req.fileName) || getExtensionFromMime(req.contentType);
    const uniqueFilename = `${uuidv4()}.${ext}`;

    const key = config.keyTemplate
      .replace('{companyId}', req.companyId)
      .replace('{entityId}', req.entityId)
      .replace('{ext}', ext)
      .replace('{filename}', uniqueFilename);

    return key;
  }
}

export const uploadService = new UploadService();
