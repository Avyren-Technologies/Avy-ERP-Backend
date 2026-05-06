import { eventBus } from './event-bus';

// ── Event Types ──────────────────────────────────────────────────────

export const LEAVE_EVENTS = {
  LEAVE_APPROVED: 'leave:approved',
  LEAVE_REJECTED: 'leave:rejected',
  ACCRUAL_COMPLETED: 'leave:accrual_completed',
  BALANCE_EXPIRY_WARNING: 'leave:balance_expiry_warning',
  ENCASHMENT_PROCESSED: 'leave:encashment_processed',
  BALANCE_EDITED: 'leave:balance_edited',
  CARRY_FORWARD_COMPLETED: 'leave:carry_forward_completed',
} as const;

// ── Payload Interfaces ───────────────────────────────────────────────

export interface LeaveApprovedPayload {
  requestId: string;
  employeeId: string;
  days: number;
  leaveTypeName: string;
  companyId: string;
}

export interface LeaveRejectedPayload {
  requestId: string;
  employeeId: string;
  reason: string;
  companyId: string;
}

export interface AccrualCompletedPayload {
  companyId: string;
  month: number;
  year: number;
  employeesProcessed: number;
}

export interface BalanceExpiryWarningPayload {
  employeeId: string;
  leaveTypeId: string;
  leaveTypeName: string;
  expiresAt: Date;
  daysRemaining: number;
  companyId: string;
}

export interface EncashmentProcessedPayload {
  employeeId: string;
  leaveTypeId: string;
  days: number;
  totalAmount: number;
  companyId: string;
}

export interface BalanceEditedPayload {
  employeeId: string;
  leaveTypeId: string;
  changedBy: string;
  changes: Record<string, unknown>;
  companyId: string;
}

export interface CarryForwardCompletedPayload {
  companyId: string;
  fromYear: number;
  toYear: number;
  employeesProcessed: number;
}

// ── Emitters ─────────────────────────────────────────────────────────

export function emitLeaveApproved(payload: LeaveApprovedPayload) {
  eventBus.emitEvent(LEAVE_EVENTS.LEAVE_APPROVED, payload);
}

export function emitLeaveRejected(payload: LeaveRejectedPayload) {
  eventBus.emitEvent(LEAVE_EVENTS.LEAVE_REJECTED, payload);
}

export function emitAccrualCompleted(payload: AccrualCompletedPayload) {
  eventBus.emitEvent(LEAVE_EVENTS.ACCRUAL_COMPLETED, payload);
}

export function emitBalanceExpiryWarning(payload: BalanceExpiryWarningPayload) {
  eventBus.emitEvent(LEAVE_EVENTS.BALANCE_EXPIRY_WARNING, payload);
}

export function emitEncashmentProcessed(payload: EncashmentProcessedPayload) {
  eventBus.emitEvent(LEAVE_EVENTS.ENCASHMENT_PROCESSED, payload);
}

export function emitBalanceEdited(payload: BalanceEditedPayload) {
  eventBus.emitEvent(LEAVE_EVENTS.BALANCE_EDITED, payload);
}

export function emitCarryForwardCompleted(payload: CarryForwardCompletedPayload) {
  eventBus.emitEvent(LEAVE_EVENTS.CARRY_FORWARD_COMPLETED, payload);
}
