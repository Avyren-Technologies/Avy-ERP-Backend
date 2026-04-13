/**
 * Unit tests for visit code generation logic.
 *
 * The visit code generator produces 6-character alphanumeric codes
 * excluding ambiguous characters (I, O, 0, 1) for readability.
 *
 * Source: src/modules/visitors/core/visit.service.ts — generateVisitCode()
 */

jest.mock('../../../config/database', () => ({
  platformPrisma: {
    visit: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../shared/utils/number-series', () => ({
  generateNextNumber: jest.fn(),
}));

import { platformPrisma } from '../../../config/database';

const mockVisit = platformPrisma.visit as any;

// The service is a singleton — we need to access the private method via
// a test-friendly wrapper.  Re-export the class by importing the module.
import { visitService } from '../core/visit.service';

// Access the private method for testing
const generateVisitCode = (visitService as any).generateVisitCode.bind(visitService);

// Valid characters in the code alphabet (excludes I, O, 0, 1)
const VALID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

describe('Visit Code Generation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────
  // Format & length
  // ─────────────────────────────────────────────────────────────────────

  describe('code format', () => {
    it('should generate a 6-character code', async () => {
      mockVisit.findUnique.mockResolvedValue(null); // no collision

      const code = await generateVisitCode();

      expect(code).toHaveLength(6);
    });

    it('should only contain valid characters (A-Z excluding I/O, 2-9)', async () => {
      mockVisit.findUnique.mockResolvedValue(null);

      const code = await generateVisitCode();

      for (const ch of code) {
        expect(VALID_CHARS).toContain(ch);
      }
    });

    it('should never contain ambiguous characters (I, O, 0, 1)', async () => {
      mockVisit.findUnique.mockResolvedValue(null);

      // Generate multiple codes and check all of them
      for (let i = 0; i < 50; i++) {
        const code = await generateVisitCode();
        expect(code).not.toMatch(/[IO01]/);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Uniqueness
  // ─────────────────────────────────────────────────────────────────────

  describe('uniqueness', () => {
    it('should generate unique codes across 1000 invocations', async () => {
      mockVisit.findUnique.mockResolvedValue(null);

      const codes = new Set<string>();
      for (let i = 0; i < 1000; i++) {
        const code = await generateVisitCode();
        codes.add(code);
      }

      // With 30^6 = 729,000,000 possibilities and 1000 samples,
      // the probability of any collision is vanishingly small.
      expect(codes.size).toBe(1000);
    });

    it('should retry on collision and succeed on the next attempt', async () => {
      // First attempt: collision found
      mockVisit.findUnique
        .mockResolvedValueOnce({ id: 'existing-visit' })
        // Second attempt: no collision
        .mockResolvedValueOnce(null);

      const code = await generateVisitCode();

      expect(code).toHaveLength(6);
      expect(mockVisit.findUnique).toHaveBeenCalledTimes(2);
    });

    it('should throw ApiError.conflict after 3 consecutive collisions', async () => {
      // All 3 attempts collide
      mockVisit.findUnique
        .mockResolvedValueOnce({ id: 'v1' })
        .mockResolvedValueOnce({ id: 'v2' })
        .mockResolvedValueOnce({ id: 'v3' });

      await expect(generateVisitCode()).rejects.toThrow(
        'Unable to generate unique visit code',
      );
      expect(mockVisit.findUnique).toHaveBeenCalledTimes(3);
    });

    it('should succeed if the third attempt has no collision', async () => {
      mockVisit.findUnique
        .mockResolvedValueOnce({ id: 'v1' })
        .mockResolvedValueOnce({ id: 'v2' })
        .mockResolvedValueOnce(null);

      const code = await generateVisitCode();

      expect(code).toHaveLength(6);
      expect(mockVisit.findUnique).toHaveBeenCalledTimes(3);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Database lookup
  // ─────────────────────────────────────────────────────────────────────

  describe('collision check', () => {
    it('should query the visit table by visitCode', async () => {
      mockVisit.findUnique.mockResolvedValue(null);

      const code = await generateVisitCode();

      expect(mockVisit.findUnique).toHaveBeenCalledWith({
        where: { visitCode: code },
      });
    });
  });
});
