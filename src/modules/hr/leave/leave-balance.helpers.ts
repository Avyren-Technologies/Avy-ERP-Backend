import { Prisma, PrismaClient, LeaveTransactionType } from '@prisma/client';
import { ApiError } from '../../../shared/errors';

// ── Types ────────────────────────────────────────────────────────────

/**
 * Transaction client type that preserves model accessors without requiring `as any` casts.
 * Prisma.TransactionClient has the same model methods as PrismaClient, minus connection/transaction management.
 */
type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export interface BalanceFields {
  openingBalance?: number;
  accrued?: number;
  taken?: number;
  adjusted?: number;
  booked?: number;
}

export interface TransactionInput {
  type: string; // LeaveTransactionType enum value
  delta: number;
  changedBy: string;
  reason?: string;
  source: 'MANUAL' | 'SYSTEM' | 'IMPORT' | 'CRON';
  referenceId?: string;
  referenceType?: string;
  idempotencyKey?: string;
  includeSnapshot?: boolean;
  metadata?: Record<string, unknown>;
}

// ── Snapshot ──────────────────────────────────────────────────────────

export function snapshotBalance(balance: {
  openingBalance: unknown; accrued: unknown; taken: unknown; adjusted: unknown; booked: unknown; balance: unknown;
}) {
  return {
    openingBalance: Number(balance.openingBalance),
    accrued: Number(balance.accrued),
    taken: Number(balance.taken),
    adjusted: Number(balance.adjusted),
    booked: Number(balance.booked ?? 0),
    balance: Number(balance.balance),
  };
}

// ── Recalculate ──────────────────────────────────────────────────────

export function recalculateBalance(fields: {
  openingBalance: number; accrued: number; taken: number; adjusted: number;
}): number {
  return fields.openingBalance + fields.accrued - fields.taken + fields.adjusted;
}

// ── Payroll Lock Check ───────────────────────────────────────────────

export async function checkPayrollLock(
  tx: TxClient,
  companyId: string,
  year: number,
  month?: number,
) {
  const where: Record<string, unknown> = { companyId, year, status: { not: 'DRAFT' } };
  if (month !== undefined) where.month = month;

  const locked = await tx.payrollRun.findFirst({
    where: where as Prisma.PayrollRunWhereInput,
  });
  if (locked) {
    const period = month ? `${month}/${year}` : `${year}`;
    throw ApiError.badRequest(
      `Cannot modify: payroll for ${period} is locked (status: ${locked.status})`,
    );
  }
}

// ── Optimistic Lock + Ledger Entry ───────────────────────────────────

export async function mutateBalance(
  tx: TxClient,
  balanceId: string,
  currentVersion: number,
  changes: BalanceFields,
  transaction: TransactionInput,
  companyId: string,
) {
  const current = await tx.leaveBalance.findUnique({ where: { id: balanceId } });
  if (!current) throw ApiError.notFound('Leave balance not found');

  const newOpening = changes.openingBalance ?? Number(current.openingBalance);
  const newAccrued = changes.accrued ?? Number(current.accrued);
  const newTaken = changes.taken ?? Number(current.taken);
  const newAdjusted = changes.adjusted ?? Number(current.adjusted);
  const newBooked = changes.booked ?? Number(current.booked ?? 0);
  const newBalance = recalculateBalance({
    openingBalance: newOpening,
    accrued: newAccrued,
    taken: newTaken,
    adjusted: newAdjusted,
  });

  const updateResult = await tx.leaveBalance.updateMany({
    where: { id: balanceId, version: currentVersion },
    data: {
      openingBalance: newOpening,
      accrued: newAccrued,
      taken: newTaken,
      adjusted: newAdjusted,
      booked: newBooked,
      balance: newBalance,
      version: { increment: 1 },
    },
  });

  if (updateResult.count === 0) {
    throw ApiError.conflict('Balance was modified concurrently. Please retry.');
  }

  const beforeSnap = transaction.includeSnapshot ? snapshotBalance(current) : undefined;
  const afterSnap = transaction.includeSnapshot
    ? { openingBalance: newOpening, accrued: newAccrued, taken: newTaken, adjusted: newAdjusted, booked: newBooked, balance: newBalance }
    : undefined;

  // Cast data to satisfy exactOptionalPropertyTypes: optional fields in TransactionInput
  // are `string | undefined` but Prisma expects `string | null` for nullable columns.
  await tx.leaveBalanceTransaction.create({
    data: {
      leaveBalanceId: balanceId,
      type: transaction.type as LeaveTransactionType,
      delta: transaction.delta,
      resultingBalance: newBalance,
      beforeState: beforeSnap ?? Prisma.JsonNull,
      afterState: afterSnap ?? Prisma.JsonNull,
      changedBy: transaction.changedBy,
      reason: transaction.reason ?? null,
      source: transaction.source,
      referenceId: transaction.referenceId ?? null,
      referenceType: transaction.referenceType ?? null,
      idempotencyKey: transaction.idempotencyKey ?? null,
      metadata: (transaction.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      companyId,
    },
  });

  return tx.leaveBalance.findUnique({
    where: { id: balanceId },
    include: {
      employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
      leaveType: { select: { id: true, name: true, code: true, category: true } },
    },
  });
}
