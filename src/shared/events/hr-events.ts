export type HREvent =
  | { type: 'candidate.stage_changed'; candidateId: string; fromStage: string; toStage: string; changedBy: string; companyId: string }
  | { type: 'candidate.hired'; candidateId: string; offerId?: string; companyId: string }
  | { type: 'offer.sent'; offerId: string; candidateId: string; companyId: string }
  | { type: 'offer.accepted'; offerId: string; candidateId: string; companyId: string }
  | { type: 'offer.rejected'; offerId: string; candidateId: string; companyId: string }
  | { type: 'interview.scheduled'; interviewId: string; panelistIds: string[]; companyId: string }
  | { type: 'interview.completed'; interviewId: string; candidateId: string; companyId: string }
  | { type: 'training.nomination.created'; nominationId: string; employeeId: string; companyId: string }
  | { type: 'training.completed'; nominationId: string; employeeId: string; trainingName: string; companyId: string }
  | { type: 'training.session.upcoming'; sessionId: string; sessionName: string; companyId: string }
  | { type: 'certificate.expiring'; nominationId: string; employeeId: string; trainingName: string; expiryDate: string; companyId: string };

export const HR_EVENTS = {
  CANDIDATE_STAGE_CHANGED: 'candidate.stage_changed',
  CANDIDATE_HIRED: 'candidate.hired',
  OFFER_SENT: 'offer.sent',
  OFFER_ACCEPTED: 'offer.accepted',
  OFFER_REJECTED: 'offer.rejected',
  INTERVIEW_SCHEDULED: 'interview.scheduled',
  INTERVIEW_COMPLETED: 'interview.completed',
  TRAINING_NOMINATION_CREATED: 'training.nomination.created',
  TRAINING_COMPLETED: 'training.completed',
  TRAINING_SESSION_UPCOMING: 'training.session.upcoming',
  CERTIFICATE_EXPIRING: 'certificate.expiring',
} as const;
