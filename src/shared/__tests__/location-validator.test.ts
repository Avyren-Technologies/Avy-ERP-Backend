/**
 * Unit tests for location-validator.service.ts
 *
 * Source file: src/shared/services/location-validator.service.ts
 *
 * External dependencies mocked:
 *   - @/shared/utils/config-cache (getCachedLocation)
 *
 * haversineDistance is NOT mocked — the validator uses it internally
 * and we verify end-to-end behaviour.
 */

jest.mock('../../shared/utils/config-cache', () => ({
  getCachedLocation: jest.fn(),
}));

import {
  validateLocationConstraints,
  type PunchData,
} from '@/shared/services/location-validator.service';
import { getCachedLocation } from '@/shared/utils/config-cache';

const mockGetLocation = getCachedLocation as jest.Mock;

// ─── Shared Fixtures ─────────────────────────────────────────────────────────

const LOCATION_ID = 'loc-001';

/** Head Office at Mumbai CST (lat: 18.9400, lng: 72.8347) */
const HQ_LAT = 18.9400;
const HQ_LNG = 72.8347;
const GEO_RADIUS = 100; // 100 metres

function makeLocation(overrides: Record<string, unknown> = {}) {
  return {
    id: LOCATION_ID,
    name: 'Head Office',
    geoEnabled: true,
    geoLat: HQ_LAT,
    geoLng: HQ_LNG,
    geoRadius: GEO_RADIUS,
    allowedDevices: [],
    requireSelfie: false,
    requireLiveLocation: false,
    ...overrides,
  };
}

function punchAt(lat: number, lng: number, extras: Partial<PunchData> = {}): PunchData {
  return { latitude: lat, longitude: lng, source: 'MOBILE', ...extras };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('validateLocationConstraints', () => {

  // ── No locationId ─────────────────────────────────────────────────────────

  describe('no locationId', () => {
    it('should return valid when locationId is null', async () => {
      const result = await validateLocationConstraints(null, punchAt(18.94, 72.83));
      expect(result.valid).toBe(true);
      expect(mockGetLocation).not.toHaveBeenCalled();
    });
  });

  // ── Location not found (deleted / soft-deleted) ───────────────────────────

  describe('location not found', () => {
    it('should return valid when location cannot be found in DB (graceful degradation)', async () => {
      mockGetLocation.mockResolvedValue(null);
      const result = await validateLocationConstraints(LOCATION_ID, punchAt(18.94, 72.83));
      expect(result.valid).toBe(true);
    });
  });

  // ── Geo-fence check ───────────────────────────────────────────────────────

  describe('geo-fence validation', () => {
    it('should return valid when punch is within geo-fence radius (50 m away)', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({ geoRadius: 100 }));
      // ~50 m north of HQ
      const result = await validateLocationConstraints(
        LOCATION_ID,
        punchAt(HQ_LAT + 0.00045, HQ_LNG),
      );
      expect(result.valid).toBe(true);
    });

    it('should return invalid when punch is outside geo-fence radius', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({ geoRadius: 50 }));
      // ~200 m away
      const result = await validateLocationConstraints(
        LOCATION_ID,
        punchAt(HQ_LAT + 0.0018, HQ_LNG),
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Outside geo-fence');
      expect(result.reason).toMatch(/\d+m/); // Should include distance in metres
    });

    it('should skip geo-fence check when geoEnabled=false', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({ geoEnabled: false }));
      // Far away, but geo is disabled
      const result = await validateLocationConstraints(
        LOCATION_ID,
        punchAt(0, 0), // Completely different point
      );
      expect(result.valid).toBe(true);
    });

    it('should skip geo-fence check when punch has no GPS coordinates', async () => {
      mockGetLocation.mockResolvedValue(makeLocation());
      // No lat/lng in punch
      const result = await validateLocationConstraints(LOCATION_ID, {
        source: 'BIOMETRIC',
      });
      expect(result.valid).toBe(true);
    });

    it('should use default radius of 50m when geoRadius is null', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({ geoRadius: null, geoEnabled: true }));
      // ~60 m away (outside the default 50 m radius)
      const result = await validateLocationConstraints(
        LOCATION_ID,
        punchAt(HQ_LAT + 0.00054, HQ_LNG),
      );
      expect(result.valid).toBe(false);
    });
  });

  // ── Device restriction check ──────────────────────────────────────────────

  describe('device restriction', () => {
    it('should return valid when allowedDevices is empty (all devices allowed)', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({ allowedDevices: [], geoEnabled: false }));
      const result = await validateLocationConstraints(
        LOCATION_ID,
        { source: 'MOBILE' },
      );
      expect(result.valid).toBe(true);
    });

    it('should return valid when device source is in allowedDevices', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({
        allowedDevices: ['MOBILE', 'BIOMETRIC'],
        geoEnabled: false,
      }));
      const result = await validateLocationConstraints(
        LOCATION_ID,
        { source: 'MOBILE' },
      );
      expect(result.valid).toBe(true);
    });

    it('should return invalid when device source is not in allowedDevices', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({
        allowedDevices: ['BIOMETRIC'],
        geoEnabled: false,
      }));
      const result = await validateLocationConstraints(
        LOCATION_ID,
        { source: 'MOBILE' },
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not allowed');
    });
  });

  // ── Selfie requirement ────────────────────────────────────────────────────

  describe('selfie requirement', () => {
    it('should return valid when selfie is required and provided', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({
        requireSelfie: true,
        geoEnabled: false,
        allowedDevices: [],
      }));
      const result = await validateLocationConstraints(
        LOCATION_ID,
        { source: 'MOBILE', selfieUrl: 'https://cdn.avyerp.com/selfies/abc.jpg' },
      );
      expect(result.valid).toBe(true);
    });

    it('should return invalid when selfie is required but not provided', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({
        requireSelfie: true,
        geoEnabled: false,
        allowedDevices: [],
      }));
      const result = await validateLocationConstraints(
        LOCATION_ID,
        { source: 'MOBILE' }, // no selfieUrl
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Selfie required');
    });

    it('should return valid when selfie is NOT required even without selfieUrl', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({
        requireSelfie: false,
        geoEnabled: false,
      }));
      const result = await validateLocationConstraints(
        LOCATION_ID,
        { source: 'MOBILE' },
      );
      expect(result.valid).toBe(true);
    });
  });

  // ── Live location requirement ─────────────────────────────────────────────

  describe('live location requirement', () => {
    it('should return valid when live location is required and coordinates are provided', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({
        requireLiveLocation: true,
        geoEnabled: false,
        allowedDevices: [],
        requireSelfie: false,
      }));
      const result = await validateLocationConstraints(
        LOCATION_ID,
        { source: 'MOBILE', latitude: 18.94, longitude: 72.83 },
      );
      expect(result.valid).toBe(true);
    });

    it('should return invalid when live location is required but coordinates are missing', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({
        requireLiveLocation: true,
        geoEnabled: false,
        allowedDevices: [],
        requireSelfie: false,
      }));
      const result = await validateLocationConstraints(
        LOCATION_ID,
        { source: 'MOBILE' }, // no lat/lng
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Live location required');
    });

    it('should return invalid when only latitude is provided (longitude missing)', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({
        requireLiveLocation: true,
        geoEnabled: false,
        allowedDevices: [],
        requireSelfie: false,
      }));
      const result = await validateLocationConstraints(
        LOCATION_ID,
        { source: 'MOBILE', latitude: 18.94 }, // longitude is undefined
      );
      expect(result.valid).toBe(false);
    });
  });

  // ── Check order: geo-fence fails before device check ─────────────────────

  describe('fail-fast order', () => {
    it('should fail on geo-fence before checking device restriction', async () => {
      mockGetLocation.mockResolvedValue(makeLocation({
        geoEnabled: true,
        geoRadius: 50,
        allowedDevices: ['BIOMETRIC'],
      }));
      // Far away AND wrong device — should fail on geo-fence first
      const result = await validateLocationConstraints(
        LOCATION_ID,
        punchAt(0, 0, { source: 'MOBILE' }),
      );
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('geo-fence');
    });
  });
});
