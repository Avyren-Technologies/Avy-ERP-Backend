/**
 * Location Validator Service
 *
 * Validates location constraints for attendance punches. This is a "fail fast"
 * layer (Layer 3) — if the geo-fence or device restriction check fails, there
 * is no point evaluating shift timing or attendance rules.
 *
 * Checks (in order):
 *   1. Geo-fence: haversine distance from location centre
 *   2. Device restriction: allowedDevices array
 *   3. Selfie requirement: requireSelfie flag
 *   4. Live location requirement: requireLiveLocation flag
 *
 * Per design spec Section 6.4.
 */

import type { Location } from '@prisma/client';
import { getCachedLocation } from '../utils/config-cache';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PunchData {
  latitude?: number;
  longitude?: number;
  source: string; // AttendanceSource or DeviceType value
  selfieUrl?: string;
}

export interface LocationValidationResult {
  valid: boolean;
  reason?: string;
}

// ─── Haversine Distance ─────────────────────────────────────────────────────

interface LatLng {
  lat: number;
  lng: number;
}

/** Earth's mean radius in metres. */
const EARTH_RADIUS_METRES = 6_371_000;

/**
 * Calculate the great-circle distance between two lat/lng points using the
 * haversine formula. Returns distance in metres.
 *
 * @param a - First point (latitude/longitude in decimal degrees)
 * @param b - Second point (latitude/longitude in decimal degrees)
 * @returns Distance in metres (always non-negative)
 */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const sinHalfDLat = Math.sin(dLat / 2);
  const sinHalfDLng = Math.sin(dLng / 2);

  const h =
    sinHalfDLat * sinHalfDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinHalfDLng * sinHalfDLng;

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_METRES * c;
}

// ─── Main Validator ─────────────────────────────────────────────────────────

/**
 * Validate location constraints for an attendance punch.
 *
 * If no locationId is provided, validation passes (employee is not assigned to
 * a specific location). If the location record cannot be found, validation also
 * passes (graceful degradation — location may have been deleted).
 *
 * @param locationId - The location the employee is punching at (nullable)
 * @param punch      - Punch data including GPS coordinates, source, selfie URL
 * @returns Validation result with optional reason string on failure
 */
export async function validateLocationConstraints(
  locationId: string | null,
  punch: PunchData,
): Promise<LocationValidationResult> {
  // No location assigned — pass through
  if (!locationId) {
    return { valid: true };
  }

  const location: Location | null = await getCachedLocation(locationId);

  // Location not found — graceful pass (may have been deleted)
  if (!location) {
    return { valid: true };
  }

  // ── 1. Geo-fence Check (fail fast) ──

  if (location.geoEnabled && punch.latitude != null && punch.longitude != null) {
    const locLat = parseFloat(String(location.geoLat));
    const locLng = parseFloat(String(location.geoLng));

    if (Number.isFinite(locLat) && Number.isFinite(locLng)) {
      const distance = haversineDistance(
        { lat: locLat, lng: locLng },
        { lat: punch.latitude, lng: punch.longitude },
      );

      const radiusMetres = location.geoRadius ?? 50;

      if (distance > radiusMetres) {
        return {
          valid: false,
          reason: `Outside geo-fence: ${Math.round(distance)}m > ${radiusMetres}m`,
        };
      }
    }
  }

  // ── 2. Device Restriction Check ──

  const allowedDevices = location.allowedDevices;
  if (allowedDevices && allowedDevices.length > 0) {
    if (!allowedDevices.includes(punch.source as any)) {
      return {
        valid: false,
        reason: `Device ${punch.source} not allowed at ${location.name}`,
      };
    }
  }

  // ── 3. Selfie Requirement ──

  if (location.requireSelfie === true && !punch.selfieUrl) {
    return {
      valid: false,
      reason: 'Selfie required at this location',
    };
  }

  // ── 4. Live Location Requirement ──

  if (location.requireLiveLocation === true && (punch.latitude == null || punch.longitude == null)) {
    return {
      valid: false,
      reason: 'Live location required at this location',
    };
  }

  return { valid: true };
}
