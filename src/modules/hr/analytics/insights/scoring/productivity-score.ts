interface ProductivityInput {
  /** Actual output / Expected output ratio */
  outputRatio: number;
  /** Hours worked / Standard hours ratio */
  hoursRatio: number;
  /** Tasks completed / Tasks assigned ratio */
  taskCompletionRatio: number;
}

type ProductivityStatus = 'under-utilized' | 'normal' | 'over-worked';

interface ProductivityResult {
  index: number;
  status: ProductivityStatus;
}

/**
 * Compute a productivity index (0-2 scale) and status.
 *
 * The index is the average of output, hours, and task-completion ratios.
 *  - Under-utilized: < 0.7
 *  - Normal: 0.7 - 1.2
 *  - Over-worked: > 1.2
 */
export function computeProductivityIndex(input: ProductivityInput): ProductivityResult {
  const rawIndex =
    (Math.max(input.outputRatio, 0) +
      Math.max(input.hoursRatio, 0) +
      Math.max(input.taskCompletionRatio, 0)) /
    3;

  // Cap at 2.0
  const index = Math.round(Math.min(rawIndex, 2) * 100) / 100;

  let status: ProductivityStatus;
  if (index < 0.7) {
    status = 'under-utilized';
  } else if (index > 1.2) {
    status = 'over-worked';
  } else {
    status = 'normal';
  }

  return { index, status };
}
