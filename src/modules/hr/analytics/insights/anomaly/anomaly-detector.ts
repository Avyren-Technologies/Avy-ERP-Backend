import type { AnomalyResult } from '../../analytics.types';
import { ANOMALY_THRESHOLDS, MIN_DATA_POINTS } from './thresholds';

/**
 * Compute the mean of an array of numbers.
 */
function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Compute the standard deviation of an array of numbers.
 */
function stdDev(values: number[], avg: number): number {
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length);
}

/**
 * Z-score based anomaly detection.
 *
 * Compares the current value against a historical distribution
 * and flags anomalies based on configured thresholds.
 */
export function detectAnomaly(
  current: number,
  historicalValues: number[],
): AnomalyResult {
  // Not enough data to determine anomaly
  if (historicalValues.length < MIN_DATA_POINTS) {
    return { isAnomaly: false };
  }

  const avg = mean(historicalValues);
  const sd = stdDev(historicalValues, avg);

  // Zero standard deviation means all historical values are the same.
  // Only flag if the current value differs from the constant historical value.
  if (sd === 0) {
    if (current !== avg) {
      return {
        isAnomaly: true,
        severity: 'HIGH',
        direction: current > avg ? 'ABOVE' : 'BELOW',
        zScore: Infinity * Math.sign(current - avg),
      };
    }
    return { isAnomaly: false };
  }

  const zScore = (current - avg) / sd;
  const absZ = Math.abs(zScore);

  if (absZ >= ANOMALY_THRESHOLDS.HIGH) {
    return {
      isAnomaly: true,
      severity: 'HIGH',
      direction: zScore > 0 ? 'ABOVE' : 'BELOW',
      zScore: Math.round(zScore * 100) / 100,
    };
  }

  if (absZ >= ANOMALY_THRESHOLDS.MEDIUM) {
    return {
      isAnomaly: true,
      severity: 'MEDIUM',
      direction: zScore > 0 ? 'ABOVE' : 'BELOW',
      zScore: Math.round(zScore * 100) / 100,
    };
  }

  return { isAnomaly: false, zScore: Math.round(zScore * 100) / 100 };
}
