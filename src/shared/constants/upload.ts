import { env } from '../../config/env';

export type FileCategory =
  | 'company-logo'
  | 'employee-photo'
  | 'employee-document'
  | 'education-certificate'
  | 'prev-employment-doc'
  | 'expense-receipt'
  | 'attendance-photo'
  | 'hr-letter'
  | 'recruitment-doc'
  | 'candidate-document'
  | 'training-material'
  | 'training-certificate'
  | 'payslip'
  | 'salary-revision'
  | 'offboarding-doc'
  | 'transfer-letter'
  | 'policy-document'
  | 'billing-invoice'
  | 'induction-content';

export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

export const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
];

export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export const ALL_MIME_TYPES = [...IMAGE_MIME_TYPES, ...DOCUMENT_MIME_TYPES];

interface CategoryConfig {
  allowedMimeTypes: string[];
  maxSizeEnvKey: 'UPLOAD_MAX_IMAGE_SIZE' | 'UPLOAD_MAX_DOCUMENT_SIZE' | 'UPLOAD_MAX_VIDEO_SIZE';
  keyTemplate: string;
}

export const FILE_CATEGORY_CONFIG: Record<FileCategory, CategoryConfig> = {
  'company-logo': {
    allowedMimeTypes: IMAGE_MIME_TYPES,
    maxSizeEnvKey: 'UPLOAD_MAX_IMAGE_SIZE',
    keyTemplate: '{companyId}/company/logo.{ext}',
  },
  'employee-photo': {
    allowedMimeTypes: IMAGE_MIME_TYPES,
    maxSizeEnvKey: 'UPLOAD_MAX_IMAGE_SIZE',
    keyTemplate: '{companyId}/employees/{entityId}/photo.{ext}',
  },
  'employee-document': {
    allowedMimeTypes: ALL_MIME_TYPES,
    maxSizeEnvKey: 'UPLOAD_MAX_DOCUMENT_SIZE',
    keyTemplate: '{companyId}/employees/{entityId}/documents/{filename}',
  },
  'education-certificate': {
    allowedMimeTypes: ALL_MIME_TYPES,
    maxSizeEnvKey: 'UPLOAD_MAX_DOCUMENT_SIZE',
    keyTemplate: '{companyId}/employees/{entityId}/education/{filename}',
  },
  'prev-employment-doc': {
    allowedMimeTypes: ALL_MIME_TYPES,
    maxSizeEnvKey: 'UPLOAD_MAX_DOCUMENT_SIZE',
    keyTemplate: '{companyId}/employees/{entityId}/prev-employment/{filename}',
  },
  'expense-receipt': {
    allowedMimeTypes: [...IMAGE_MIME_TYPES, 'application/pdf'],
    maxSizeEnvKey: 'UPLOAD_MAX_DOCUMENT_SIZE',
    keyTemplate: '{companyId}/expenses/{entityId}/{filename}',
  },
  'attendance-photo': {
    allowedMimeTypes: IMAGE_MIME_TYPES,
    maxSizeEnvKey: 'UPLOAD_MAX_IMAGE_SIZE',
    keyTemplate: '{companyId}/attendance/{entityId}/{filename}',
  },
  'hr-letter': {
    allowedMimeTypes: ['application/pdf'],
    maxSizeEnvKey: 'UPLOAD_MAX_DOCUMENT_SIZE',
    keyTemplate: '{companyId}/hr-letters/{entityId}.pdf',
  },
  'recruitment-doc': {
    allowedMimeTypes: ALL_MIME_TYPES,
    maxSizeEnvKey: 'UPLOAD_MAX_DOCUMENT_SIZE',
    keyTemplate: '{companyId}/recruitment/{entityId}/{filename}',
  },
  'candidate-document': {
    allowedMimeTypes: ALL_MIME_TYPES,
    maxSizeEnvKey: 'UPLOAD_MAX_DOCUMENT_SIZE',
    keyTemplate: '{companyId}/recruitment/{entityId}/documents/{filename}',
  },
  'training-material': {
    allowedMimeTypes: ALL_MIME_TYPES,
    maxSizeEnvKey: 'UPLOAD_MAX_DOCUMENT_SIZE',
    keyTemplate: '{companyId}/training/{entityId}/{filename}',
  },
  'training-certificate': {
    allowedMimeTypes: ALL_MIME_TYPES,
    maxSizeEnvKey: 'UPLOAD_MAX_DOCUMENT_SIZE',
    keyTemplate: '{companyId}/training/certificates/{entityId}.{ext}',
  },
  'payslip': {
    allowedMimeTypes: ['application/pdf'],
    maxSizeEnvKey: 'UPLOAD_MAX_DOCUMENT_SIZE',
    keyTemplate: '{companyId}/payroll/{entityId}.pdf',
  },
  'salary-revision': {
    allowedMimeTypes: ['application/pdf'],
    maxSizeEnvKey: 'UPLOAD_MAX_DOCUMENT_SIZE',
    keyTemplate: '{companyId}/payroll/revisions/{entityId}.pdf',
  },
  'offboarding-doc': {
    allowedMimeTypes: ['application/pdf'],
    maxSizeEnvKey: 'UPLOAD_MAX_DOCUMENT_SIZE',
    keyTemplate: '{companyId}/offboarding/{entityId}/{filename}',
  },
  'transfer-letter': {
    allowedMimeTypes: ['application/pdf'],
    maxSizeEnvKey: 'UPLOAD_MAX_DOCUMENT_SIZE',
    keyTemplate: '{companyId}/transfers/{entityId}.pdf',
  },
  'policy-document': {
    allowedMimeTypes: ALL_MIME_TYPES,
    maxSizeEnvKey: 'UPLOAD_MAX_DOCUMENT_SIZE',
    keyTemplate: '{companyId}/policies/{entityId}.{ext}',
  },
  'billing-invoice': {
    allowedMimeTypes: ['application/pdf'],
    maxSizeEnvKey: 'UPLOAD_MAX_DOCUMENT_SIZE',
    keyTemplate: '{companyId}/billing/{entityId}.pdf',
  },
  'induction-content': {
    allowedMimeTypes: [...VIDEO_MIME_TYPES, ...IMAGE_MIME_TYPES, 'application/pdf'],
    maxSizeEnvKey: 'UPLOAD_MAX_VIDEO_SIZE',
    keyTemplate: '{companyId}/inductions/{entityId}/{filename}',
  },
};

export function getMaxFileSize(category: FileCategory): number {
  const config = FILE_CATEGORY_CONFIG[category];
  return env[config.maxSizeEnvKey];
}

export function getExtensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  };
  return map[mimeType] || 'bin';
}

export function getExtensionFromFilename(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || 'bin';
}

export function getMimeFromExtension(ext: string): string {
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
  };
  return map[ext] || 'application/octet-stream';
}
