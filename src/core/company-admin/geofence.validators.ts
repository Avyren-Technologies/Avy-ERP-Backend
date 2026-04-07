import { z } from 'zod';

export const createGeofenceSchema = z.object({
  name: z.string().min(1, 'Geofence name is required').max(100, 'Name must be 100 chars or less'),
  lat: z.number().min(-90, 'Latitude must be >= -90').max(90, 'Latitude must be <= 90'),
  lng: z.number().min(-180, 'Longitude must be >= -180').max(180, 'Longitude must be <= 180'),
  radius: z.number().int().min(10, 'Minimum radius is 10 meters').max(10000, 'Maximum radius is 10,000 meters (10km)').default(100),
  address: z.string().max(500).optional(),
  isDefault: z.boolean().optional(),
});

export const updateGeofenceSchema = createGeofenceSchema.partial();
