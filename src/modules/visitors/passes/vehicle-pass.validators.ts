import { z } from 'zod';

const trimString = (val: unknown) => (typeof val === 'string' ? val.trim() : val);

export const createVehiclePassSchema = z.object({
  vehicleRegNumber: z.preprocess(trimString, z.string().min(1, 'Vehicle registration is required').max(20)),
  vehicleType: z.enum(['CAR', 'TWO_WHEELER', 'AUTO', 'TRUCK', 'VAN', 'TEMPO', 'BUS']),
  driverName: z.preprocess(trimString, z.string().min(1, 'Driver name is required').max(200)),
  driverMobile: z.preprocess(trimString, z.string().max(15)).optional(),
  purpose: z.preprocess(trimString, z.string().min(1, 'Purpose is required').max(500)),
  visitId: z.string().optional(),
  materialDescription: z.preprocess(trimString, z.string().max(500)).optional(),
  vehiclePhoto: z.string().url().optional(),
  entryGateId: z.string().min(1, 'Entry gate is required'),
  plantId: z.string().min(1, 'Plant is required'),
});

export const vehicleExitSchema = z.object({
  exitGateId: z.string().min(1, 'Exit gate is required'),
});

export const vehiclePassListQuerySchema = z.object({
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
