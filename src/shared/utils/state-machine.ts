import { ApiError } from '../errors';

export function validateTransition<T extends string>(
  currentState: T,
  newState: T,
  allowedTransitions: Record<string, string[]>,
  entityName: string,
): void {
  const allowed = allowedTransitions[currentState];
  if (!allowed || !allowed.includes(newState)) {
    throw ApiError.badRequest(
      `Invalid ${entityName} transition: cannot move from "${currentState}" to "${newState}"`,
    );
  }
}

// ---------------------------------------------------------------------------
// Recruitment
// ---------------------------------------------------------------------------

export const REQUISITION_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['INTERVIEWING', 'CANCELLED'],
  INTERVIEWING: ['OFFERED', 'CANCELLED'],
  OFFERED: ['FILLED', 'INTERVIEWING', 'CANCELLED'],
  FILLED: [],
  CANCELLED: [],
};

export const CANDIDATE_STAGE_TRANSITIONS: Record<string, string[]> = {
  APPLIED: ['SHORTLISTED', 'REJECTED', 'ON_HOLD'],
  SHORTLISTED: ['HR_ROUND', 'REJECTED', 'ON_HOLD'],
  HR_ROUND: ['TECHNICAL', 'REJECTED', 'ON_HOLD'],
  TECHNICAL: ['FINAL', 'REJECTED', 'ON_HOLD'],
  FINAL: ['ASSESSMENT', 'OFFER_SENT', 'REJECTED', 'ON_HOLD'],
  ASSESSMENT: ['OFFER_SENT', 'REJECTED', 'ON_HOLD'],
  OFFER_SENT: ['HIRED', 'REJECTED', 'ON_HOLD'],
  ON_HOLD: [
    'APPLIED',
    'SHORTLISTED',
    'HR_ROUND',
    'TECHNICAL',
    'FINAL',
    'ASSESSMENT',
    'OFFER_SENT',
    'REJECTED',
  ],
  HIRED: [],
  REJECTED: [],
};

export const INTERVIEW_TRANSITIONS: Record<string, string[]> = {
  SCHEDULED: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export const OFFER_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SENT', 'WITHDRAWN'],
  SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'],
  ACCEPTED: [],
  REJECTED: [],
  WITHDRAWN: [],
  EXPIRED: [],
};

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export const NOMINATION_TRANSITIONS: Record<string, string[]> = {
  NOMINATED: ['APPROVED', 'CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const SESSION_TRANSITIONS: Record<string, string[]> = {
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const PROGRAM_ENROLLMENT_TRANSITIONS: Record<string, string[]> = {
  ENROLLED: ['IN_PROGRESS', 'ABANDONED'],
  IN_PROGRESS: ['COMPLETED', 'FAILED', 'ABANDONED'],
  COMPLETED: [],
  FAILED: [],
  ABANDONED: [],
};
