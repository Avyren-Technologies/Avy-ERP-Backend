import { Router } from 'express';
import { uploadController } from './upload.controller';

const uploadRoutes = Router();
uploadRoutes.post('/request', uploadController.requestUpload);
uploadRoutes.post('/download-url', uploadController.getDownloadUrl);

const uploadPlatformRoutes = Router();
uploadPlatformRoutes.post('/request', uploadController.requestUploadPlatform);
uploadPlatformRoutes.post('/download-url', uploadController.getDownloadUrlPlatform);

export { uploadRoutes, uploadPlatformRoutes };
