import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import type { CreateTrainingEvaluationInput, SubmitEssFeedbackInput } from './training-evaluation.validators';

/** Convert undefined to null for Prisma nullable fields. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

class TrainingEvaluationService {
  // ════════════════════════════════════════════════════════════════
  // SUBMIT EVALUATION (Admin)
  // ════════════════════════════════════════════════════════════════

  async submitEvaluation(companyId: string, data: CreateTrainingEvaluationInput, userId?: string) {
    // Validate nomination exists and belongs to this company
    const nomination = await platformPrisma.trainingNomination.findUnique({
      where: { id: data.nominationId },
      include: {
        session: { select: { trainerId: true } },
        training: { select: { id: true } },
      },
    });
    if (!nomination || nomination.companyId !== companyId) {
      throw ApiError.notFound('Training nomination not found');
    }

    // Resolve trainingId from the nomination
    const trainingId = nomination.trainingId;

    // Resolve sessionId — use provided or fall back to nomination's session
    const sessionId = data.sessionId ?? nomination.sessionId ?? undefined;

    const evaluation = await platformPrisma.trainingEvaluation.create({
      data: {
        nominationId: data.nominationId,
        trainingId,
        sessionId: n(sessionId),
        type: data.type,
        contentRelevance: n(data.contentRelevance),
        trainerEffectiveness: n(data.trainerEffectiveness),
        overallSatisfaction: n(data.overallSatisfaction),
        knowledgeGain: n(data.knowledgeGain),
        practicalApplicability: n(data.practicalApplicability),
        preAssessmentScore: n(data.preAssessmentScore),
        postAssessmentScore: n(data.postAssessmentScore),
        comments: n(data.comments),
        improvementSuggestions: n(data.improvementSuggestions),
        submittedBy: n(userId),
        submittedAt: new Date(),
        companyId,
      },
      include: {
        nomination: {
          select: { id: true, employeeId: true, employee: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });

    // If PARTICIPANT_FEEDBACK, recalculate trainer average rating
    if (data.type === 'PARTICIPANT_FEEDBACK') {
      await this.recalculateTrainerRating(companyId, sessionId);
    }

    return evaluation;
  }

  // ════════════════════════════════════════════════════════════════
  // GET EVALUATION (by nomination)
  // ════════════════════════════════════════════════════════════════

  async getEvaluation(companyId: string, nominationId: string) {
    const evaluations = await platformPrisma.trainingEvaluation.findMany({
      where: { nominationId, companyId },
      include: {
        nomination: {
          select: {
            id: true,
            employeeId: true,
            employee: { select: { id: true, firstName: true, lastName: true } },
            training: { select: { id: true, name: true } },
          },
        },
        session: { select: { id: true, batchName: true, startDateTime: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (evaluations.length === 0) {
      throw ApiError.notFound('No evaluations found for this nomination');
    }

    return evaluations;
  }

  // ════════════════════════════════════════════════════════════════
  // LIST SESSION EVALUATIONS
  // ════════════════════════════════════════════════════════════════

  async listSessionEvaluations(companyId: string, sessionId: string) {
    const evaluations = await platformPrisma.trainingEvaluation.findMany({
      where: { sessionId, companyId },
      include: {
        nomination: {
          select: {
            id: true,
            employeeId: true,
            employee: { select: { id: true, firstName: true, lastName: true, employeeId: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return evaluations;
  }

  // ════════════════════════════════════════════════════════════════
  // EVALUATION SUMMARY (aggregate for a training)
  // ════════════════════════════════════════════════════════════════

  async getEvaluationSummary(companyId: string, trainingId: string) {
    if (!trainingId) {
      throw ApiError.badRequest('trainingId query parameter is required');
    }

    const evaluations = await platformPrisma.trainingEvaluation.findMany({
      where: { trainingId, companyId },
      select: {
        contentRelevance: true,
        trainerEffectiveness: true,
        overallSatisfaction: true,
        knowledgeGain: true,
        practicalApplicability: true,
      },
    });

    const total = evaluations.length;
    if (total === 0) {
      return {
        totalEvaluations: 0,
        avgContentRelevance: null,
        avgTrainerEffectiveness: null,
        avgOverallSatisfaction: null,
        avgKnowledgeGain: null,
        avgPracticalApplicability: null,
      };
    }

    const avg = (field: keyof typeof evaluations[0]) => {
      const values = evaluations.map((e) => e[field]).filter((v): v is number => v !== null);
      return values.length > 0 ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null;
    };

    return {
      totalEvaluations: total,
      avgContentRelevance: avg('contentRelevance'),
      avgTrainerEffectiveness: avg('trainerEffectiveness'),
      avgOverallSatisfaction: avg('overallSatisfaction'),
      avgKnowledgeGain: avg('knowledgeGain'),
      avgPracticalApplicability: avg('practicalApplicability'),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // ESS FEEDBACK (Employee submits own feedback)
  // ════════════════════════════════════════════════════════════════

  async submitEssFeedback(companyId: string, nominationId: string, data: SubmitEssFeedbackInput, userId: string) {
    // Validate nomination exists
    const nomination = await platformPrisma.trainingNomination.findUnique({
      where: { id: nominationId },
      include: {
        session: { select: { trainerId: true } },
        training: { select: { id: true } },
      },
    });
    if (!nomination || nomination.companyId !== companyId) {
      throw ApiError.notFound('Training nomination not found');
    }

    // Resolve the employee from the user
    const user = await platformPrisma.user.findUnique({
      where: { id: userId },
      select: { employeeId: true },
    });

    if (!user?.employeeId) {
      throw ApiError.badRequest('No employee profile linked to your account');
    }

    // Validate that the nomination belongs to this employee
    if (nomination.employeeId !== user.employeeId) {
      throw ApiError.forbidden('You can only submit feedback for your own training nominations');
    }

    // Check if already submitted
    const existing = await platformPrisma.trainingEvaluation.findFirst({
      where: {
        nominationId,
        type: 'PARTICIPANT_FEEDBACK',
        submittedBy: userId,
        companyId,
      },
    });
    if (existing) {
      throw ApiError.badRequest('You have already submitted feedback for this nomination');
    }

    const trainingId = nomination.trainingId;
    const sessionId = data.sessionId ?? nomination.sessionId ?? undefined;

    const evaluation = await platformPrisma.trainingEvaluation.create({
      data: {
        nominationId,
        trainingId,
        sessionId: n(sessionId),
        type: 'PARTICIPANT_FEEDBACK',
        contentRelevance: n(data.contentRelevance),
        trainerEffectiveness: n(data.trainerEffectiveness),
        overallSatisfaction: n(data.overallSatisfaction),
        knowledgeGain: n(data.knowledgeGain),
        practicalApplicability: n(data.practicalApplicability),
        preAssessmentScore: n(data.preAssessmentScore),
        postAssessmentScore: n(data.postAssessmentScore),
        comments: n(data.comments),
        improvementSuggestions: n(data.improvementSuggestions),
        submittedBy: userId,
        submittedAt: new Date(),
        companyId,
      },
    });

    // Recalculate trainer average rating
    await this.recalculateTrainerRating(companyId, sessionId);

    return evaluation;
  }

  // ════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ════════════════════════════════════════════════════════════════

  /**
   * Recalculate the trainer's average rating from all PARTICIPANT_FEEDBACK evaluations
   * for sessions conducted by that trainer.
   */
  private async recalculateTrainerRating(companyId: string, sessionId?: string) {
    if (!sessionId) return;

    const session = await platformPrisma.trainingSession.findUnique({
      where: { id: sessionId },
      select: { trainerId: true },
    });
    if (!session?.trainerId) return;

    const trainerId = session.trainerId;

    // Get all sessions by this trainer
    const trainerSessions = await platformPrisma.trainingSession.findMany({
      where: { trainerId, companyId },
      select: { id: true },
    });
    const sessionIds = trainerSessions.map((s) => s.id);

    if (sessionIds.length === 0) return;

    // Get all PARTICIPANT_FEEDBACK evaluations with trainerEffectiveness for these sessions
    const evaluations = await platformPrisma.trainingEvaluation.findMany({
      where: {
        sessionId: { in: sessionIds },
        type: 'PARTICIPANT_FEEDBACK',
        trainerEffectiveness: { not: null },
        companyId,
      },
      select: { trainerEffectiveness: true },
    });

    if (evaluations.length === 0) return;

    const ratings = evaluations.map((e) => e.trainerEffectiveness!);
    const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;

    await platformPrisma.trainer.update({
      where: { id: trainerId },
      data: { averageRating: Math.round(avgRating * 100) / 100 },
    });
  }
}

export const trainingEvaluationService = new TrainingEvaluationService();
