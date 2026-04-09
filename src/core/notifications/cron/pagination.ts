/**
 * Cursor-based paginated iterator for Prisma findMany calls.
 *
 * Yields batches of rows until the query returns fewer than `batchSize`.
 * Prevents memory spikes when processing large tenants (10k+ employees).
 *
 * Usage:
 * ```ts
 *   for await (const batch of paginateWithCursor(
 *     (cursor) => tenantDb.employee.findMany({
 *       where: { status: 'ACTIVE' },
 *       take: 200,
 *       ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
 *       orderBy: { id: 'asc' },
 *     }),
 *     (row) => row.id,
 *     200,
 *   )) {
 *     // process batch
 *   }
 * ```
 */
export async function* paginateWithCursor<T>(
  fetchPage: (cursor?: string) => Promise<T[]>,
  getId: (row: T) => string,
  batchSize = 200,
): AsyncGenerator<T[]> {
  let cursor: string | undefined = undefined;
  while (true) {
    const batch = await fetchPage(cursor);
    if (batch.length === 0) break;
    yield batch;
    if (batch.length < batchSize) break;
    const lastRow = batch[batch.length - 1];
    if (!lastRow) break;
    cursor = getId(lastRow);
  }
}
