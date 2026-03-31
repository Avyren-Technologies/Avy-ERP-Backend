/**
 * Unit tests for haversineDistance()
 *
 * Source file: src/shared/services/location-validator.service.ts (haversineDistance export)
 *
 * haversineDistance is a pure mathematical function — no mocks needed.
 * Reference distances are taken from well-known coordinate pairs and
 * validated against a tolerance appropriate for the use-case (geo-fencing).
 *
 * Tolerance applied:
 *   - Long distances (cities): ±5 km
 *   - Short distances (geo-fence): ±2 m
 */

import { haversineDistance } from '@/shared/services/location-validator.service';

// ─── Known Reference Points ──────────────────────────────────────────────────

const MUMBAI    = { lat: 19.0760, lng: 72.8777 };
const DELHI     = { lat: 28.6139, lng: 77.2090 };
const BANGALORE = { lat: 12.9716, lng: 77.5946 };
// ~350 km from Bangalore for a mid-range test
const CHENNAI   = { lat: 13.0827, lng: 80.2707 };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('haversineDistance', () => {
  describe('same point', () => {
    it('should return 0 for identical coordinates', () => {
      expect(haversineDistance(MUMBAI, MUMBAI)).toBe(0);
    });

    it('should return 0 for (0,0) to (0,0)', () => {
      expect(haversineDistance({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBe(0);
    });
  });

  describe('city-level distances', () => {
    it('should compute Mumbai to Delhi as approximately 1,150 km', () => {
      const dist = haversineDistance(MUMBAI, DELHI);
      // Actual ~1,153 km; allow ±5 km tolerance
      expect(dist).toBeGreaterThan(1_148_000);
      expect(dist).toBeLessThan(1_158_000);
    });

    it('should compute Bangalore to Chennai as approximately 350 km', () => {
      const dist = haversineDistance(BANGALORE, CHENNAI);
      // Actual ~335 km
      expect(dist).toBeGreaterThan(330_000);
      expect(dist).toBeLessThan(340_000);
    });

    it('should be symmetric (A→B == B→A)', () => {
      const ab = haversineDistance(MUMBAI, DELHI);
      const ba = haversineDistance(DELHI, MUMBAI);
      expect(Math.abs(ab - ba)).toBeLessThan(0.001);
    });
  });

  describe('geo-fence-relevant short distances', () => {
    it('should return approximately 50 m for a ~50 m offset', () => {
      // 0.00045 degrees latitude ≈ ~50 m
      const a = { lat: 19.0760, lng: 72.8777 };
      const b = { lat: 19.07645, lng: 72.8777 };
      const dist = haversineDistance(a, b);
      expect(dist).toBeGreaterThan(40);
      expect(dist).toBeLessThan(60);
    });

    it('should return approximately 100 m for a ~100 m offset', () => {
      const a = { lat: 19.0760, lng: 72.8777 };
      const b = { lat: 19.07690, lng: 72.8777 };
      const dist = haversineDistance(a, b);
      expect(dist).toBeGreaterThan(90);
      expect(dist).toBeLessThan(110);
    });

    it('should return approximately 500 m for a ~500 m offset', () => {
      const a = { lat: 19.0760, lng: 72.8777 };
      const b = { lat: 19.08050, lng: 72.8777 };
      const dist = haversineDistance(a, b);
      expect(dist).toBeGreaterThan(480);
      expect(dist).toBeLessThan(520);
    });

    it('should detect a point just outside a 50 m geo-fence', () => {
      const centre = { lat: 19.0760, lng: 72.8777 };
      // ~60 m away
      const outside = { lat: 19.07654, lng: 72.8777 };
      const dist = haversineDistance(centre, outside);
      expect(dist).toBeGreaterThan(50); // Should fail a 50 m fence
    });

    it('should detect a point just inside a 50 m geo-fence', () => {
      const centre = { lat: 19.0760, lng: 72.8777 };
      // ~20 m away
      const inside = { lat: 19.07618, lng: 72.8777 };
      const dist = haversineDistance(centre, inside);
      expect(dist).toBeLessThan(50); // Should pass a 50 m fence
    });
  });

  describe('antipodal points', () => {
    it('should return approximately 20,000 km for antipodal points', () => {
      const a = { lat: 0, lng: 0 };
      const b = { lat: 0, lng: 180 };
      const dist = haversineDistance(a, b);
      // Half the Earth's circumference ≈ 20,015 km
      expect(dist).toBeGreaterThan(20_000_000);
      expect(dist).toBeLessThan(20_030_000);
    });
  });

  describe('edge cases', () => {
    it('should handle negative latitudes (Southern Hemisphere)', () => {
      const sydney = { lat: -33.8688, lng: 151.2093 };
      const auckland = { lat: -36.8485, lng: 174.7633 };
      const dist = haversineDistance(sydney, auckland);
      // Sydney to Auckland ≈ 2,150 km
      expect(dist).toBeGreaterThan(2_100_000);
      expect(dist).toBeLessThan(2_200_000);
    });

    it('should return a non-negative value for all inputs', () => {
      const a = { lat: -90, lng: -180 };
      const b = { lat: 90, lng: 180 };
      expect(haversineDistance(a, b)).toBeGreaterThanOrEqual(0);
    });
  });
});
