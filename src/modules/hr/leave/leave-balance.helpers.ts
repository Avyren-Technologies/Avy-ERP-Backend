import { Prisma } from '@prisma/client';
import { ApiError } from '../../../shared/errors';

// ── Types ────────────────────────────────────────────────────────────

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
  tx: Prisma.TransactionClient,
  companyId: string,
  year: number,
  month?: number,
) {
  const where: Record<string, unknown> = { companyId, year, status: { not: 'DRAFT' } };
  if (month !== undefined) where.month = month;

  const locked = await (tx as any).payrollRun.findFirst({ where });
  if (locked) {
    const period = month ? `${month}/${year}` : `${year}`;
    throw ApiError.badRequest(
      `Cannot modify: payroll for ${period} is locked (status: ${locked.status})`,
    );
  }
}

// ── Optimistic Lock + Ledger Entry ───────────────────────────────────

export async function mutateBalance(
  tx: Prisma.TransactionClient,
  balanceId: string,
  currentVersion: number,
  changes: BalanceFields,
  transaction: TransactionInput,
  companyId: string,
) {
  const current = await (tx as any).leaveBalance.findUnique({ where: { id: balanceId } });
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

  const updateResult = await (tx as any).leaveBalance.updateMany({
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

  await (tx as any).leaveBalanceTransaction.create({
    data: {
      leaveBalanceId: balanceId,
      type: transaction.type,
      delta: transaction.delta,
      resultingBalance: newBalance,
      beforeState: beforeSnap ?? Prisma.JsonNull,
      afterState: afterSnap ?? Prisma.JsonNull,
      changedBy: transaction.changedBy,
      reason: transaction.reason,
      source: transaction.source,
      referenceId: transaction.referenceId,
      referenceType: transaction.referenceType,
      idempotencyKey: transaction.idempotencyKey,
      metadata: transaction.metadata ?? Prisma.JsonNull,
      companyId,
    },
  });

  return (tx as any).leaveBalance.findUnique({
    where: { id: balanceId },
    include: {
      employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
      leaveType: { select: { id: true, name: true, code: true, category: true } },
    },
  });
}
