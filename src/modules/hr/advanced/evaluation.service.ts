import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';

interface EvaluationInput {
  dimension: string;
  rating: number;
  comments?: string | undefined;
  recommendation: 'STRONG_HIRE' | 'HIRE' | 'MAYBE' | 'NO_HIRE' | 'STRONG_NO_HIRE';
}

export class EvaluationService {
  async submitEvaluations(
    companyId: string,
    interviewId: string,
    evaluatorId: string,
    data: { evaluations: EvaluationInput[] },
  ) {
    const interview = await platformPrisma.interview.findUnique({
      where: { id: interviewId },
    });

    if (!interview || interview.companyId !== companyId) {
      throw ApiError.notFound('Interview not found');
    }

    const created = await platformPrisma.$transaction(
      data.evaluations.map((ev) =>
        platformPrisma.interviewEvaluation.create({
          data: {
            interviewId,
            evaluatorId,
            dimension: ev.dimension,
            rating: ev.rating,
            comments: ev.comments ?? null,
            recommendation: ev.recommendation,
            companyId,
          },
        }),
      ),
    );

    return created;
  }

  async listEvaluationsForInterview(companyId: string, interviewId: string) {
    const interview = await platformPrisma.interview.findUnique({
      where: { id: interviewId },
    });

    if (!interview || interview.companyId !== companyId) {
      throw ApiError.notFound('Interview not found');
    }

    const evaluations = await platformPrisma.interviewEvaluation.findMany({
      where: { interviewId, companyId },
      orderBy: { createdAt: 'asc' },
    });

    // Group by evaluatorId
    const grouped = evaluations.reduce<Record<string, typeof evaluations>>((acc, ev) => {
      if (!acc[ev.evaluatorId]) {
        acc[ev.evaluatorId] = [];
      }
      acc[ev.evaluatorId]!.push(ev);
      return acc;
    }, {});

    return grouped;
  }
}

export const evaluationService = new EvaluationService();
