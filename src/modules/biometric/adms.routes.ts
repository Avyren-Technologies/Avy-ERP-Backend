import { Router, Request, Response } from 'express';
import { admsService } from './adms.service';
import { logger } from '../../config/logger';

const router = Router();

/**
 * GET /iclock/cdata — Device handshake
 * The device sends its serial number as ?SN=xxx
 */
router.get('/cdata', async (req: Request, res: Response) => {
  try {
    const serialNumber = (req.query.SN as string) || '';
    const configText = await admsService.handleHandshake(serialNumber);

    res.status(200).contentType('text/plain').send(configText);
  } catch (err) {
    logger.error('[ADMS] Unhandled error in GET /cdata:', err);
    res.status(200).contentType('text/plain').send('OK');
  }
});

/**
 * POST /iclock/cdata — Punch data push
 * The device posts ATTLOG lines in the body with ?SN=xxx
 */
router.post('/cdata', async (req: Request, res: Response) => {
  try {
    const serialNumber = (req.query.SN as string) || '';
    const body = typeof req.body === 'string' ? req.body : String(req.body || '');

    const result = await admsService.handlePunchPush(serialNumber, body);
    logger.info(`[ADMS] POST /cdata from ${serialNumber}: stored=${result.stored}, duplicates=${result.duplicates}`);

    res.status(200).contentType('text/plain').send('OK');
  } catch (err) {
    logger.error('[ADMS] Unhandled error in POST /cdata:', err);
    res.status(200).contentType('text/plain').send('OK');
  }
});

/**
 * POST /iclock/devicecmd — Device command acknowledgement
 */
router.post('/devicecmd', (_req: Request, res: Response) => {
  res.status(200).contentType('text/plain').send('OK');
});

/**
 * GET /iclock/getrequest — Device polls for pending commands
 */
router.get('/getrequest', (_req: Request, res: Response) => {
  res.status(200).contentType('text/plain').send('OK');
});

export { router as admsRoutes };
