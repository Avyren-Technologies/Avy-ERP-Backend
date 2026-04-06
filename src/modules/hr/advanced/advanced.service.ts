import { Prisma } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { generateNextNumber } from '../../../shared/utils/number-series';
import { essService } from '../ess/ess.service';

/** Convert undefined to null for Prisma nullable fields. */
function n<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

interface ListOptions {
  page?: number;
  limit?: number;
}

// ═══════════════════════════════════════════════════════════════════
// Requisition list options
// ═══════════════════════════════════════════════════════════════════

interface RequisitionListOptions extends ListOptions {
  status?: string;
  departmentId?: string;
}

interface CandidateListOptions extends ListOptions {
  requisitionId?: string;
  stage?: string;
}

interface InterviewListOptions extends ListOptions {
  candidateId?: string;
  status?: string;
}

interface TrainingCatalogueListOptions extends ListOptions {
  type?: string;
  mandatory?: boolean;
}

interface TrainingNominationListOptions extends ListOptions {
  employeeId?: string;
  trainingId?: string;
  status?: string;
}

interface AssetListOptions extends ListOptions {
  categoryId?: string;
  status?: string;
}

interface AssetAssignmentListOptions extends ListOptions {
  employeeId?: string;
  assetId?: string;
  active?: boolean;
}

interface ExpenseClaimListOptions extends ListOptions {
  employeeId?: string;
  status?: string;
  category?: string;
}

interface LetterListOptions extends ListOptions {
  employeeId?: string;
  templateId?: string;
}

interface GrievanceCaseListOptions extends ListOptions {
  categoryId?: string;
  status?: string;
  employeeId?: string;
}

interface DisciplinaryListOptions extends ListOptions {
  employeeId?: string;
  type?: string;
  status?: string;
}

// ═══════════════════════════════════════════════════════════════════
// VALID STATUS TRANSITIONS
// ═══════════════════════════════════════════════════════════════════

const REQUISITION_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['INTERVIEWING', 'CANCELLED'],
  INTERVIEWING: ['OFFERED', 'CANCELLED'],
  OFFERED: ['FILLED', 'INTERVIEWING', 'CANCELLED'],
  FILLED: [],
  CANCELLED: [],
};

const CANDIDATE_STAGE_ORDER = [
  'APPLIED', 'SHORTLISTED', 'HR_ROUND', 'TECHNICAL', 'FINAL',
  'ASSESSMENT', 'OFFER_SENT', 'HIRED',
];

const GRIEVANCE_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['INVESTIGATING', 'RESOLVED', 'ESCALATED', 'CLOSED'],
  INVESTIGATING: ['RESOLVED', 'ESCALATED', 'CLOSED'],
  ESCALATED: ['INVESTIGATING', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
};

export class AdvancedHRService {
  // ════════════════════════════════════════════════════════════════
  // RECRUITMENT — Requisitions
  // ════════════════════════════════════════════════════════════════

  async listRequisitions(companyId: string, options: RequisitionListOptions = {}) {
    const { page = 1, limit = 25, status, departmentId } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (status) where.status = status.toUpperCase();
    if (departmentId) where.departmentId = departmentId;

    const [requisitions, total] = await Promise.all([
      platformPrisma.jobRequisition.findMany({
        where,
        include: {
          designation: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
          _count: { select: { candidates: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.jobRequisition.count({ where }),
    ]);

    return { requisitions, total, page, limit };
  }

  async getRequisition(companyId: string, id: string) {
    const requisition = await platformPrisma.jobRequisition.findUnique({
      where: { id },
      include: {
        designation: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        _count: { select: { candidates: true } },
      },
    });

    if (!requisition || requisition.companyId !== companyId) {
      throw ApiError.notFound('Job requisition not found');
    }

    return requisition;
  }

  async createRequisition(companyId: string, data: any, userId?: string) {
    const requisitionNumber = await generateNextNumber(
      platformPrisma, companyId, ['Recruitment', 'Job Requisition'], 'Job Requisition',
    );

    const requisition = await platformPrisma.jobRequisition.create({
      data: {
        companyId,
        requisitionNumber,
        title: data.title,
        designationId: n(data.designationId),
        departmentId: n(data.departmentId),
        openings: data.openings ?? 1,
        description: n(data.description),
        budgetMin: n(data.budgetMin),
        budgetMax: n(data.budgetMax),
        targetDate: data.targetDate ? new Date(data.targetDate) : null,
        sourceChannels: data.sourceChannels ?? Prisma.JsonNull,
        approvedBy: n(data.approvedBy),
        status: 'DRAFT',
      },
      include: {
        designation: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    });

    // Wire approval workflow
    if (userId) {
      await essService.createRequest(companyId, {
        requesterId: userId,
        entityType: 'JobRequisition',
        entityId: requisition.id,
        triggerEvent: 'JOB_REQUISITION',
        data: { title: data.title, department: data.departmentId, openings: data.openings ?? 1 },
      });
    }

    return requisition;
  }

  async updateRequisition(companyId: string, id: string, data: any) {
    const req = await platformPrisma.jobRequisition.findUnique({ where: { id } });
    if (!req || req.companyId !== companyId) {
      throw ApiError.notFound('Job requisition not found');
    }

    return platformPrisma.jobRequisition.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.designationId !== undefined && { designationId: n(data.designationId) }),
        ...(data.departmentId !== undefined && { departmentId: n(data.departmentId) }),
        ...(data.openings !== undefined && { openings: data.openings }),
        ...(data.description !== undefined && { description: n(data.description) }),
        ...(data.budgetMin !== undefined && { budgetMin: n(data.budgetMin) }),
        ...(data.budgetMax !== undefined && { budgetMax: n(data.budgetMax) }),
        ...(data.targetDate !== undefined && { targetDate: data.targetDate ? new Date(data.targetDate) : null }),
        ...(data.sourceChannels !== undefined && { sourceChannels: data.sourceChannels ?? Prisma.JsonNull }),
        ...(data.approvedBy !== undefined && { approvedBy: n(data.approvedBy) }),
      },
      include: {
        designation: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        _count: { select: { candidates: true } },
      },
    });
  }

  async updateRequisitionStatus(companyId: string, id: string, status: string) {
    const req = await platformPrisma.jobRequisition.findUnique({ where: { id } });
    if (!req || req.companyId !== companyId) {
      throw ApiError.notFound('Job requisition not found');
    }

    const allowed = REQUISITION_TRANSITIONS[req.status] ?? [];
    if (!allowed.includes(status)) {
      throw ApiError.badRequest(`Cannot transition from ${req.status} to ${status}`);
    }

    return platformPrisma.jobRequisition.update({
      where: { id },
      data: { status: status as any },
    });
  }

  async deleteRequisition(companyId: string, id: string) {
    const req = await platformPrisma.jobRequisition.findUnique({ where: { id } });
    if (!req || req.companyId !== companyId) {
      throw ApiError.notFound('Job requisition not found');
    }

    if (req.status !== 'DRAFT') {
      throw ApiError.badRequest('Only DRAFT requisitions can be deleted');
    }

    await platformPrisma.jobRequisition.delete({ where: { id } });
    return { message: 'Job requisition deleted' };
  }

  // ════════════════════════════════════════════════════════════════
  // RECRUITMENT — Candidates
  // ════════════════════════════════════════════════════════════════

  async listCandidates(companyId: string, options: CandidateListOptions = {}) {
    const { page = 1, limit = 25, requisitionId, stage } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (requisitionId) where.requisitionId = requisitionId;
    if (stage) where.stage = stage;

    const [candidates, total] = await Promise.all([
      platformPrisma.candidate.findMany({
        where,
        include: {
          requisition: { select: { id: true, title: true, status: true } },
          _count: { select: { interviews: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.candidate.count({ where }),
    ]);

    return { candidates, total, page, limit };
  }

  async getCandidate(companyId: string, id: string) {
    const candidate = await platformPrisma.candidate.findUnique({
      where: { id },
      include: {
        requisition: { select: { id: true, title: true, status: true } },
        interviews: {
          orderBy: { scheduledAt: 'asc' },
        },
      },
    });

    if (!candidate || candidate.companyId !== companyId) {
      throw ApiError.notFound('Candidate not found');
    }

    return candidate;
  }

  async createCandidate(companyId: string, data: any) {
    // Validate requisition belongs to company
    const requisition = await platformPrisma.jobRequisition.findUnique({ where: { id: data.requisitionId } });
    if (!requisition || requisition.companyId !== companyId) {
      throw ApiError.badRequest('Job requisition not found in this company');
    }

    return platformPrisma.candidate.create({
      data: {
        companyId,
        requisitionId: data.requisitionId,
        name: data.name,
        email: data.email,
        phone: n(data.phone),
        source: n(data.source),
        currentCtc: n(data.currentCtc),
        expectedCtc: n(data.expectedCtc),
        resumeUrl: n(data.resumeUrl),
        rating: n(data.rating),
        notes: n(data.notes),
        stage: 'APPLIED',
      },
      include: {
        requisition: { select: { id: true, title: true } },
      },
    });
  }

  async updateCandidate(companyId: string, id: string, data: any) {
    const candidate = await platformPrisma.candidate.findUnique({ where: { id } });
    if (!candidate || candidate.companyId !== companyId) {
      throw ApiError.notFound('Candidate not found');
    }

    return platformPrisma.candidate.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.phone !== undefined && { phone: n(data.phone) }),
        ...(data.source !== undefined && { source: n(data.source) }),
        ...(data.currentCtc !== undefined && { currentCtc: n(data.currentCtc) }),
        ...(data.expectedCtc !== undefined && { expectedCtc: n(data.expectedCtc) }),
        ...(data.resumeUrl !== undefined && { resumeUrl: n(data.resumeUrl) }),
        ...(data.rating !== undefined && { rating: n(data.rating) }),
        ...(data.notes !== undefined && { notes: n(data.notes) }),
      },
      include: {
        requisition: { select: { id: true, title: true } },
      },
    });
  }

  async advanceCandidateStage(companyId: string, id: string, stage: string) {
    const candidate = await platformPrisma.candidate.findUnique({ where: { id } });
    if (!candidate || candidate.companyId !== companyId) {
      throw ApiError.notFound('Candidate not found');
    }

    // Allow explicit REJECTED / ON_HOLD from any stage
    if (stage !== 'REJECTED' && stage !== 'ON_HOLD') {
      const currentIdx = CANDIDATE_STAGE_ORDER.indexOf(candidate.stage);
      const targetIdx = CANDIDATE_STAGE_ORDER.indexOf(stage);
      if (targetIdx < 0) {
        throw ApiError.badRequest(`Invalid stage: ${stage}`);
      }
      if (targetIdx <= currentIdx) {
        throw ApiError.badRequest(`Cannot move from ${candidate.stage} to ${stage}; stages only advance forward`);
      }
    }

    return platformPrisma.candidate.update({
      where: { id },
      data: { stage: stage as any },
    });
  }

  async deleteCandidate(companyId: string, id: string) {
    const candidate = await platformPrisma.candidate.findUnique({ where: { id } });
    if (!candidate || candidate.companyId !== companyId) {
      throw ApiError.notFound('Candidate not found');
    }

    await platformPrisma.candidate.delete({ where: { id } });
    return { message: 'Candidate deleted' };
  }

  // ════════════════════════════════════════════════════════════════
  // RECRUITMENT — Interviews
  // ════════════════════════════════════════════════════════════════

  async listInterviews(companyId: string, options: InterviewListOptions = {}) {
    const { page = 1, limit = 25, candidateId, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (candidateId) where.candidateId = candidateId;
    if (status) where.status = status.toUpperCase();

    const [interviews, total] = await Promise.all([
      platformPrisma.interview.findMany({
        where,
        include: {
          candidate: { select: { id: true, name: true, email: true, stage: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { scheduledAt: 'desc' },
      }),
      platformPrisma.interview.count({ where }),
    ]);

    return { interviews, total, page, limit };
  }

  async getInterview(companyId: string, id: string) {
    const interview = await platformPrisma.interview.findUnique({
      where: { id },
      include: {
        candidate: {
          select: { id: true, name: true, email: true, stage: true, requisitionId: true },
        },
      },
    });

    if (!interview || interview.companyId !== companyId) {
      throw ApiError.notFound('Interview not found');
    }

    return interview;
  }

  async createInterview(companyId: string, data: any) {
    // Validate candidate belongs to company
    const candidate = await platformPrisma.candidate.findUnique({ where: { id: data.candidateId } });
    if (!candidate || candidate.companyId !== companyId) {
      throw ApiError.badRequest('Candidate not found in this company');
    }

    return platformPrisma.interview.create({
      data: {
        companyId,
        candidateId: data.candidateId,
        round: data.round,
        panelists: data.panelists ?? Prisma.JsonNull,
        scheduledAt: new Date(data.scheduledAt),
        duration: n(data.duration),
        meetingLink: n(data.meetingLink),
        status: 'SCHEDULED',
      },
      include: {
        candidate: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async updateInterview(companyId: string, id: string, data: any) {
    const interview = await platformPrisma.interview.findUnique({ where: { id } });
    if (!interview || interview.companyId !== companyId) {
      throw ApiError.notFound('Interview not found');
    }
    if (interview.status !== 'SCHEDULED') {
      throw ApiError.badRequest('Only SCHEDULED interviews can be updated');
    }

    return platformPrisma.interview.update({
      where: { id },
      data: {
        ...(data.round !== undefined && { round: data.round }),
        ...(data.panelists !== undefined && { panelists: data.panelists ?? Prisma.JsonNull }),
        ...(data.scheduledAt !== undefined && { scheduledAt: new Date(data.scheduledAt) }),
        ...(data.duration !== undefined && { duration: n(data.duration) }),
        ...(data.meetingLink !== undefined && { meetingLink: n(data.meetingLink) }),
      },
    });
  }

  async completeInterview(companyId: string, id: string, data: any) {
    const interview = await platformPrisma.interview.findUnique({ where: { id } });
    if (!interview || interview.companyId !== companyId) {
      throw ApiError.notFound('Interview not found');
    }
    if (interview.status !== 'SCHEDULED') {
      throw ApiError.badRequest('Only SCHEDULED interviews can be completed');
    }

    return platformPrisma.interview.update({
      where: { id },
      data: {
        feedbackRating: data.feedbackRating,
        feedbackNotes: n(data.feedbackNotes),
        status: 'COMPLETED',
      },
    });
  }

  async cancelInterview(companyId: string, id: string) {
    const interview = await platformPrisma.interview.findUnique({ where: { id } });
    if (!interview || interview.companyId !== companyId) {
      throw ApiError.notFound('Interview not found');
    }
    if (interview.status !== 'SCHEDULED') {
      throw ApiError.badRequest('Only SCHEDULED interviews can be cancelled');
    }

    return platformPrisma.interview.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async deleteInterview(companyId: string, id: string) {
    const interview = await platformPrisma.interview.findUnique({ where: { id } });
    if (!interview || interview.companyId !== companyId) {
      throw ApiError.notFound('Interview not found');
    }

    await platformPrisma.interview.delete({ where: { id } });
    return { message: 'Interview deleted' };
  }

  // ── Recruitment Dashboard ────────────────────────────────────────

  async getRecruitmentDashboard(companyId: string) {
    // Pipeline stats: candidates per stage
    const stages = ['APPLIED', 'SHORTLISTED', 'HR_ROUND', 'TECHNICAL', 'FINAL', 'ASSESSMENT', 'OFFER_SENT', 'HIRED', 'REJECTED', 'ON_HOLD'];
    const stageCounts: Record<string, number> = {};
    for (const stage of stages) {
      stageCounts[stage] = await platformPrisma.candidate.count({
        where: { companyId, stage: stage as any },
      });
    }

    // Open requisitions
    const openRequisitions = await platformPrisma.jobRequisition.count({
      where: { companyId, status: { in: ['OPEN', 'INTERVIEWING', 'OFFERED'] } },
    });

    const totalRequisitions = await platformPrisma.jobRequisition.count({ where: { companyId } });
    const filledRequisitions = await platformPrisma.jobRequisition.count({
      where: { companyId, status: 'FILLED' },
    });

    // Time-to-hire: average days between candidate creation and HIRED stage
    const hiredCandidates = await platformPrisma.candidate.findMany({
      where: { companyId, stage: 'HIRED' },
      select: { createdAt: true, updatedAt: true },
    });

    let avgTimeToHire: number | null = null;
    if (hiredCandidates.length > 0) {
      const totalDays = hiredCandidates.reduce((sum, c) => {
        const days = (c.updatedAt.getTime() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        return sum + days;
      }, 0);
      avgTimeToHire = Math.round(totalDays / hiredCandidates.length);
    }

    // Upcoming interviews
    const upcomingInterviews = await platformPrisma.interview.count({
      where: { companyId, status: 'SCHEDULED', scheduledAt: { gte: new Date() } },
    });

    return {
      pipeline: stageCounts,
      requisitions: { total: totalRequisitions, open: openRequisitions, filled: filledRequisitions },
      avgTimeToHireDays: avgTimeToHire,
      upcomingInterviews,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // TRAINING — Catalogue
  // ════════════════════════════════════════════════════════════════

  async listTrainingCatalogues(companyId: string, options: TrainingCatalogueListOptions = {}) {
    const { page = 1, limit = 25, type, mandatory } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (type) where.type = type;
    if (mandatory !== undefined) where.mandatory = mandatory;

    const [catalogues, total] = await Promise.all([
      platformPrisma.trainingCatalogue.findMany({
        where,
        include: {
          _count: { select: { nominations: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.trainingCatalogue.count({ where }),
    ]);

    return { catalogues, total, page, limit };
  }

  async getTrainingCatalogue(companyId: string, id: string) {
    const catalogue = await platformPrisma.trainingCatalogue.findUnique({
      where: { id },
      include: {
        _count: { select: { nominations: true } },
      },
    });

    if (!catalogue || catalogue.companyId !== companyId) {
      throw ApiError.notFound('Training catalogue not found');
    }

    return catalogue;
  }

  async createTrainingCatalogue(companyId: string, data: any) {
    const catalogueNumber = await generateNextNumber(
      platformPrisma, companyId, ['Training', 'Training Catalogue'], 'Training Programme',
    );

    return platformPrisma.trainingCatalogue.create({
      data: {
        companyId,
        catalogueNumber,
        name: data.name,
        type: data.type ?? 'TECHNICAL',
        mode: data.mode ?? 'CLASSROOM',
        duration: n(data.duration),
        linkedSkillIds: data.linkedSkillIds ?? Prisma.JsonNull,
        proficiencyGain: data.proficiencyGain ?? 1,
        mandatory: data.mandatory ?? false,
        certificationName: n(data.certificationName),
        certificationBody: n(data.certificationBody),
        certificationValidity: n(data.certificationValidity),
        vendorProvider: n(data.vendorProvider),
        costPerHead: n(data.costPerHead),
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateTrainingCatalogue(companyId: string, id: string, data: any) {
    const catalogue = await platformPrisma.trainingCatalogue.findUnique({ where: { id } });
    if (!catalogue || catalogue.companyId !== companyId) {
      throw ApiError.notFound('Training catalogue not found');
    }

    return platformPrisma.trainingCatalogue.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.mode !== undefined && { mode: data.mode }),
        ...(data.duration !== undefined && { duration: n(data.duration) }),
        ...(data.linkedSkillIds !== undefined && { linkedSkillIds: data.linkedSkillIds ?? Prisma.JsonNull }),
        ...(data.proficiencyGain !== undefined && { proficiencyGain: data.proficiencyGain }),
        ...(data.mandatory !== undefined && { mandatory: data.mandatory }),
        ...(data.certificationName !== undefined && { certificationName: n(data.certificationName) }),
        ...(data.certificationBody !== undefined && { certificationBody: n(data.certificationBody) }),
        ...(data.certificationValidity !== undefined && { certificationValidity: n(data.certificationValidity) }),
        ...(data.vendorProvider !== undefined && { vendorProvider: n(data.vendorProvider) }),
        ...(data.costPerHead !== undefined && { costPerHead: n(data.costPerHead) }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async deleteTrainingCatalogue(companyId: string, id: string) {
    const catalogue = await platformPrisma.trainingCatalogue.findUnique({
      where: { id },
      include: { _count: { select: { nominations: true } } },
    });
    if (!catalogue || catalogue.companyId !== companyId) {
      throw ApiError.notFound('Training catalogue not found');
    }
    if (catalogue._count.nominations > 0) {
      throw ApiError.badRequest(`Cannot delete: ${catalogue._count.nominations} nomination(s) exist for this training`);
    }

    await platformPrisma.trainingCatalogue.delete({ where: { id } });
    return { message: 'Training catalogue deleted' };
  }

  // ════════════════════════════════════════════════════════════════
  // TRAINING — Nominations
  // ════════════════════════════════════════════════════════════════

  async listTrainingNominations(companyId: string, options: TrainingNominationListOptions = {}) {
    const { page = 1, limit = 25, employeeId, trainingId, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (employeeId) where.employeeId = employeeId;
    if (trainingId) where.trainingId = trainingId;
    if (status) where.status = status.toUpperCase();

    const [nominations, total] = await Promise.all([
      platformPrisma.trainingNomination.findMany({
        where,
        include: {
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
          training: { select: { id: true, name: true, type: true, mode: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.trainingNomination.count({ where }),
    ]);

    return { nominations, total, page, limit };
  }

  async getTrainingNomination(companyId: string, id: string) {
    const nomination = await platformPrisma.trainingNomination.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        training: true,
      },
    });

    if (!nomination || nomination.companyId !== companyId) {
      throw ApiError.notFound('Training nomination not found');
    }

    return nomination;
  }

  async createTrainingNomination(companyId: string, data: any) {
    // Validate employee
    const employee = await platformPrisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found in this company');
    }

    // Validate training
    const training = await platformPrisma.trainingCatalogue.findUnique({ where: { id: data.trainingId } });
    if (!training || training.companyId !== companyId) {
      throw ApiError.badRequest('Training not found in this company');
    }

    return platformPrisma.trainingNomination.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        trainingId: data.trainingId,
        status: 'NOMINATED',
      },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        training: { select: { id: true, name: true, type: true } },
      },
    });
  }

  async updateTrainingNomination(companyId: string, id: string, data: any) {
    const nomination = await platformPrisma.trainingNomination.findUnique({ where: { id } });
    if (!nomination || nomination.companyId !== companyId) {
      throw ApiError.notFound('Training nomination not found');
    }

    return platformPrisma.trainingNomination.update({
      where: { id },
      data: {
        ...(data.status !== undefined && { status: data.status }),
        ...(data.completionDate !== undefined && { completionDate: data.completionDate ? new Date(data.completionDate) : null }),
        ...(data.score !== undefined && { score: n(data.score) }),
        ...(data.certificateUrl !== undefined && { certificateUrl: n(data.certificateUrl) }),
      },
    });
  }

  async completeTrainingNomination(companyId: string, id: string, data: any) {
    const nomination = await platformPrisma.trainingNomination.findUnique({
      where: { id },
      include: { training: true },
    });
    if (!nomination || nomination.companyId !== companyId) {
      throw ApiError.notFound('Training nomination not found');
    }
    if (nomination.status === 'COMPLETED') {
      throw ApiError.badRequest('Nomination is already completed');
    }
    if (nomination.status === 'CANCELLED') {
      throw ApiError.badRequest('Cannot complete a cancelled nomination');
    }

    // Update nomination to COMPLETED
    const updated = await platformPrisma.trainingNomination.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completionDate: data.completionDate ? new Date(data.completionDate) : new Date(),
        score: n(data.score),
        certificateUrl: n(data.certificateUrl),
      },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        training: true,
      },
    });

    // Auto-update skill mappings based on linked skills
    const linkedSkillIds = nomination.training.linkedSkillIds as string[] | null;
    if (linkedSkillIds && Array.isArray(linkedSkillIds) && linkedSkillIds.length > 0) {
      const proficiencyGain = nomination.training.proficiencyGain;

      for (const skillId of linkedSkillIds) {
        const mapping = await platformPrisma.skillMapping.findFirst({
          where: { companyId, employeeId: nomination.employeeId, skillId },
        });

        if (mapping) {
          // Increase proficiency, capped at 5
          const newLevel = Math.min(5, mapping.currentLevel + proficiencyGain);
          await platformPrisma.skillMapping.update({
            where: { id: mapping.id },
            data: { currentLevel: newLevel, assessedAt: new Date() },
          });
        } else {
          // Create a new mapping with the proficiency gain as starting level
          await platformPrisma.skillMapping.create({
            data: {
              companyId,
              employeeId: nomination.employeeId,
              skillId,
              currentLevel: Math.min(5, proficiencyGain),
              requiredLevel: 3,
              assessedAt: new Date(),
            },
          });
        }
      }
    }

    return updated;
  }

  async deleteTrainingNomination(companyId: string, id: string) {
    const nomination = await platformPrisma.trainingNomination.findUnique({ where: { id } });
    if (!nomination || nomination.companyId !== companyId) {
      throw ApiError.notFound('Training nomination not found');
    }

    await platformPrisma.trainingNomination.delete({ where: { id } });
    return { message: 'Training nomination deleted' };
  }

  // ── Training Dashboard ──────────────────────────────────────────

  async getTrainingDashboard(companyId: string) {
    const [totalNominations, completed, cancelled, inProgress] = await Promise.all([
      platformPrisma.trainingNomination.count({ where: { companyId } }),
      platformPrisma.trainingNomination.count({ where: { companyId, status: 'COMPLETED' } }),
      platformPrisma.trainingNomination.count({ where: { companyId, status: 'CANCELLED' } }),
      platformPrisma.trainingNomination.count({ where: { companyId, status: 'IN_PROGRESS' } }),
    ]);

    const completionPercent = totalNominations > 0
      ? Math.round((completed / totalNominations) * 100)
      : 0;

    // Mandatory training coverage
    const mandatoryTrainings = await platformPrisma.trainingCatalogue.findMany({
      where: { companyId, mandatory: true, isActive: true },
      select: { id: true, name: true },
    });

    const totalEmployees = await platformPrisma.employee.count({ where: { companyId, status: 'ACTIVE' } });

    const mandatoryCoverage: { trainingId: string; name: string; total: number; completed: number; percent: number }[] = [];
    for (const training of mandatoryTrainings) {
      const completedCount = await platformPrisma.trainingNomination.count({
        where: { companyId, trainingId: training.id, status: 'COMPLETED' },
      });
      mandatoryCoverage.push({
        trainingId: training.id,
        name: training.name,
        total: totalEmployees,
        completed: completedCount,
        percent: totalEmployees > 0 ? Math.round((completedCount / totalEmployees) * 100) : 0,
      });
    }

    return {
      totalNominations,
      completed,
      inProgress,
      cancelled,
      completionPercent,
      mandatoryCoverage,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // ASSETS — Categories
  // ════════════════════════════════════════════════════════════════

  async listAssetCategories(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    const where = { companyId };

    const [categories, total] = await Promise.all([
      platformPrisma.assetCategory.findMany({
        where,
        include: { _count: { select: { assets: true } } },
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      platformPrisma.assetCategory.count({ where }),
    ]);

    return { categories, total, page, limit };
  }

  async getAssetCategory(companyId: string, id: string) {
    const category = await platformPrisma.assetCategory.findUnique({
      where: { id },
      include: { _count: { select: { assets: true } } },
    });

    if (!category || category.companyId !== companyId) {
      throw ApiError.notFound('Asset category not found');
    }

    return category;
  }

  async createAssetCategory(companyId: string, data: any) {
    // Check uniqueness
    const existing = await platformPrisma.assetCategory.findUnique({
      where: { companyId_name: { companyId, name: data.name } },
    });
    if (existing) {
      throw ApiError.conflict(`Asset category "${data.name}" already exists`);
    }

    return platformPrisma.assetCategory.create({
      data: {
        companyId,
        name: data.name,
        depreciationRate: n(data.depreciationRate),
        returnChecklist: data.returnChecklist ?? Prisma.JsonNull,
      },
    });
  }

  async updateAssetCategory(companyId: string, id: string, data: any) {
    const category = await platformPrisma.assetCategory.findUnique({ where: { id } });
    if (!category || category.companyId !== companyId) {
      throw ApiError.notFound('Asset category not found');
    }

    if (data.name && data.name !== category.name) {
      const existing = await platformPrisma.assetCategory.findUnique({
        where: { companyId_name: { companyId, name: data.name } },
      });
      if (existing) {
        throw ApiError.conflict(`Asset category "${data.name}" already exists`);
      }
    }

    return platformPrisma.assetCategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.depreciationRate !== undefined && { depreciationRate: n(data.depreciationRate) }),
        ...(data.returnChecklist !== undefined && { returnChecklist: data.returnChecklist ?? Prisma.JsonNull }),
      },
    });
  }

  async deleteAssetCategory(companyId: string, id: string) {
    const category = await platformPrisma.assetCategory.findUnique({
      where: { id },
      include: { _count: { select: { assets: true } } },
    });
    if (!category || category.companyId !== companyId) {
      throw ApiError.notFound('Asset category not found');
    }
    if (category._count.assets > 0) {
      throw ApiError.badRequest(`Cannot delete: ${category._count.assets} asset(s) in this category`);
    }

    await platformPrisma.assetCategory.delete({ where: { id } });
    return { message: 'Asset category deleted' };
  }

  // ════════════════════════════════════════════════════════════════
  // ASSETS — Assets
  // ════════════════════════════════════════════════════════════════

  async listAssets(companyId: string, options: AssetListOptions = {}) {
    const { page = 1, limit = 25, categoryId, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status.toUpperCase();

    const [assets, total] = await Promise.all([
      platformPrisma.asset.findMany({
        where,
        include: {
          category: { select: { id: true, name: true } },
          _count: { select: { assignments: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.asset.count({ where }),
    ]);

    return { assets, total, page, limit };
  }

  async getAsset(companyId: string, id: string) {
    const asset = await platformPrisma.asset.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        assignments: {
          include: {
            employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
          },
          orderBy: { issueDate: 'desc' },
        },
      },
    });

    if (!asset || asset.companyId !== companyId) {
      throw ApiError.notFound('Asset not found');
    }

    return asset;
  }

  async createAsset(companyId: string, data: any) {
    // Validate category
    const category = await platformPrisma.assetCategory.findUnique({ where: { id: data.categoryId } });
    if (!category || category.companyId !== companyId) {
      throw ApiError.badRequest('Asset category not found in this company');
    }

    const assetNumber = await generateNextNumber(
      platformPrisma, companyId, ['Asset', 'Asset Management'], 'Asset',
    );

    return platformPrisma.asset.create({
      data: {
        companyId,
        assetNumber,
        name: data.name,
        categoryId: data.categoryId,
        serialNumber: n(data.serialNumber),
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
        purchaseValue: n(data.purchaseValue),
        condition: data.condition ?? 'NEW',
        status: 'IN_STOCK',
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });
  }

  async updateAsset(companyId: string, id: string, data: any) {
    const asset = await platformPrisma.asset.findUnique({ where: { id } });
    if (!asset || asset.companyId !== companyId) {
      throw ApiError.notFound('Asset not found');
    }

    return platformPrisma.asset.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
        ...(data.serialNumber !== undefined && { serialNumber: n(data.serialNumber) }),
        ...(data.purchaseDate !== undefined && { purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null }),
        ...(data.purchaseValue !== undefined && { purchaseValue: n(data.purchaseValue) }),
        ...(data.condition !== undefined && { condition: data.condition }),
        ...(data.status !== undefined && { status: data.status }),
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });
  }

  async deleteAsset(companyId: string, id: string) {
    const asset = await platformPrisma.asset.findUnique({ where: { id } });
    if (!asset || asset.companyId !== companyId) {
      throw ApiError.notFound('Asset not found');
    }
    if (asset.status === 'ASSIGNED') {
      throw ApiError.badRequest('Cannot delete an assigned asset; return it first');
    }

    await platformPrisma.asset.delete({ where: { id } });
    return { message: 'Asset deleted' };
  }

  // ════════════════════════════════════════════════════════════════
  // ASSETS — Assignments
  // ════════════════════════════════════════════════════════════════

  async listAssetAssignments(companyId: string, options: AssetAssignmentListOptions = {}) {
    const { page = 1, limit = 25, employeeId, assetId, active } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (employeeId) where.employeeId = employeeId;
    if (assetId) where.assetId = assetId;
    if (active === true) where.returnDate = null;
    if (active === false) where.returnDate = { not: null };

    const [assignments, total] = await Promise.all([
      platformPrisma.assetAssignment.findMany({
        where,
        include: {
          asset: { select: { id: true, name: true, serialNumber: true, status: true } },
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { issueDate: 'desc' },
      }),
      platformPrisma.assetAssignment.count({ where }),
    ]);

    return { assignments, total, page, limit };
  }

  async createAssetAssignment(companyId: string, data: any, userId?: string) {
    // Validate asset
    const asset = await platformPrisma.asset.findUnique({ where: { id: data.assetId } });
    if (!asset || asset.companyId !== companyId) {
      throw ApiError.badRequest('Asset not found in this company');
    }
    if (asset.status === 'ASSIGNED') {
      throw ApiError.badRequest('Asset is already assigned');
    }
    if (asset.status === 'RETIRED') {
      throw ApiError.badRequest('Cannot assign a retired asset');
    }

    // Validate employee
    const employee = await platformPrisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found in this company');
    }

    // Create assignment and update asset status in a transaction
    const [assignment] = await platformPrisma.$transaction([
      platformPrisma.assetAssignment.create({
        data: {
          companyId,
          assetId: data.assetId,
          employeeId: data.employeeId,
          issueDate: new Date(data.issueDate),
          notes: n(data.notes),
        },
        include: {
          asset: { select: { id: true, name: true, serialNumber: true } },
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        },
      }),
      platformPrisma.asset.update({
        where: { id: data.assetId },
        data: { status: 'ASSIGNED' },
      }),
    ]);

    // Wire approval workflow
    if (userId) {
      await essService.createRequest(companyId, {
        requesterId: userId,
        entityType: 'AssetAssignment',
        entityId: assignment.id,
        triggerEvent: 'ASSET_ISSUANCE',
        data: { assetName: asset.name, employeeName: employee.firstName },
      });
    }

    return assignment;
  }

  async returnAssetAssignment(companyId: string, id: string, data: any) {
    const assignment = await platformPrisma.assetAssignment.findUnique({ where: { id } });
    if (!assignment || assignment.companyId !== companyId) {
      throw ApiError.notFound('Asset assignment not found');
    }
    if (assignment.returnDate) {
      throw ApiError.badRequest('Asset has already been returned');
    }

    // Determine new asset status based on return condition
    const newAssetStatus = data.returnCondition === 'DAMAGED' || data.returnCondition === 'LOST'
      ? 'UNDER_REPAIR'
      : 'IN_STOCK';

    const [updatedAssignment] = await platformPrisma.$transaction([
      platformPrisma.assetAssignment.update({
        where: { id },
        data: {
          returnDate: new Date(data.returnDate),
          returnCondition: data.returnCondition,
          ...(data.notes !== undefined && { notes: data.notes }),
        },
        include: {
          asset: { select: { id: true, name: true, serialNumber: true } },
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        },
      }),
      platformPrisma.asset.update({
        where: { id: assignment.assetId },
        data: {
          status: newAssetStatus as any,
          condition: data.returnCondition,
        },
      }),
    ]);

    return updatedAssignment;
  }

  // ════════════════════════════════════════════════════════════════
  // EXPENSE CLAIMS
  // ════════════════════════════════════════════════════════════════

  // ════════════════════════════════════════════════════════════════
  // EXPENSE CATEGORIES (Admin Configuration)
  // ════════════════════════════════════════════════════════════════

  async listExpenseCategories(companyId: string, options: { includeInactive?: boolean } = {}) {
    const where: any = { companyId };
    if (!options.includeInactive) where.isActive = true;

    return platformPrisma.expenseCategory.findMany({
      where,
      include: {
        limits: {
          include: {
            grade: { select: { id: true, name: true, code: true } },
            designation: { select: { id: true, name: true, code: true } },
          },
        },
        _count: { select: { items: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getExpenseCategory(companyId: string, id: string) {
    const category = await platformPrisma.expenseCategory.findUnique({
      where: { id },
      include: {
        limits: {
          include: {
            grade: { select: { id: true, name: true, code: true } },
            designation: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });
    if (!category || category.companyId !== companyId) {
      throw ApiError.notFound('Expense category not found');
    }
    return category;
  }

  async createExpenseCategory(companyId: string, data: any) {
    // Check for duplicate code
    const existing = await platformPrisma.expenseCategory.findUnique({
      where: { companyId_code: { companyId, code: data.code } },
    });
    if (existing) {
      throw ApiError.badRequest(`Expense category with code "${data.code}" already exists`);
    }

    return platformPrisma.expenseCategory.create({
      data: {
        companyId,
        name: data.name,
        code: data.code,
        description: n(data.description),
        isActive: data.isActive ?? true,
        requiresReceipt: data.requiresReceipt ?? true,
        receiptThreshold: data.receiptThreshold ?? null,
        maxAmountPerClaim: data.maxAmountPerClaim ?? null,
        maxAmountPerMonth: data.maxAmountPerMonth ?? null,
        maxAmountPerYear: data.maxAmountPerYear ?? null,
      },
    });
  }

  async updateExpenseCategory(companyId: string, id: string, data: any) {
    const category = await platformPrisma.expenseCategory.findUnique({ where: { id } });
    if (!category || category.companyId !== companyId) {
      throw ApiError.notFound('Expense category not found');
    }

    return platformPrisma.expenseCategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.code !== undefined && { code: data.code }),
        ...(data.description !== undefined && { description: n(data.description) }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.requiresReceipt !== undefined && { requiresReceipt: data.requiresReceipt }),
        ...(data.receiptThreshold !== undefined && { receiptThreshold: data.receiptThreshold }),
        ...(data.maxAmountPerClaim !== undefined && { maxAmountPerClaim: data.maxAmountPerClaim }),
        ...(data.maxAmountPerMonth !== undefined && { maxAmountPerMonth: data.maxAmountPerMonth }),
        ...(data.maxAmountPerYear !== undefined && { maxAmountPerYear: data.maxAmountPerYear }),
      },
    });
  }

  async deleteExpenseCategory(companyId: string, id: string) {
    const category = await platformPrisma.expenseCategory.findUnique({
      where: { id },
      include: { _count: { select: { items: true } } },
    });
    if (!category || category.companyId !== companyId) {
      throw ApiError.notFound('Expense category not found');
    }
    if (category._count.items > 0) {
      throw ApiError.badRequest('Cannot delete category that has been used in expense claim items. Deactivate it instead.');
    }

    await platformPrisma.expenseCategory.delete({ where: { id } });
    return { message: 'Expense category deleted' };
  }

  // ── Expense Category Limits (per grade/designation) ──────────────

  async createExpenseCategoryLimit(companyId: string, data: any) {
    const category = await platformPrisma.expenseCategory.findUnique({ where: { id: data.categoryId } });
    if (!category || category.companyId !== companyId) {
      throw ApiError.notFound('Expense category not found');
    }

    return platformPrisma.expenseCategoryLimit.create({
      data: {
        companyId,
        categoryId: data.categoryId,
        gradeId: data.gradeId ?? null,
        designationId: data.designationId ?? null,
        maxAmountPerClaim: data.maxAmountPerClaim ?? null,
        maxAmountPerMonth: data.maxAmountPerMonth ?? null,
        maxAmountPerYear: data.maxAmountPerYear ?? null,
      },
      include: {
        category: { select: { id: true, name: true, code: true } },
        grade: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async updateExpenseCategoryLimit(companyId: string, id: string, data: any) {
    const limit = await platformPrisma.expenseCategoryLimit.findUnique({ where: { id } });
    if (!limit || limit.companyId !== companyId) {
      throw ApiError.notFound('Expense category limit not found');
    }

    return platformPrisma.expenseCategoryLimit.update({
      where: { id },
      data: {
        ...(data.maxAmountPerClaim !== undefined && { maxAmountPerClaim: data.maxAmountPerClaim }),
        ...(data.maxAmountPerMonth !== undefined && { maxAmountPerMonth: data.maxAmountPerMonth }),
        ...(data.maxAmountPerYear !== undefined && { maxAmountPerYear: data.maxAmountPerYear }),
      },
      include: {
        category: { select: { id: true, name: true, code: true } },
        grade: { select: { id: true, name: true, code: true } },
        designation: { select: { id: true, name: true, code: true } },
      },
    });
  }

  async deleteExpenseCategoryLimit(companyId: string, id: string) {
    const limit = await platformPrisma.expenseCategoryLimit.findUnique({ where: { id } });
    if (!limit || limit.companyId !== companyId) {
      throw ApiError.notFound('Expense category limit not found');
    }

    await platformPrisma.expenseCategoryLimit.delete({ where: { id } });
    return { message: 'Expense category limit deleted' };
  }

  // ════════════════════════════════════════════════════════════════
  // EXPENSE CLAIMS (Admin)
  // ════════════════════════════════════════════════════════════════

  async listExpenseClaims(companyId: string, options: ExpenseClaimListOptions = {}) {
    const { page = 1, limit = 25, employeeId, status, category } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status.toUpperCase();
    if (category) where.category = category;

    const [claims, total] = await Promise.all([
      platformPrisma.expenseClaim.findMany({
        where,
        include: {
          employee: {
            select: {
              id: true, employeeId: true, firstName: true, lastName: true,
              department: { select: { id: true, name: true } },
              designation: { select: { id: true, name: true } },
              grade: { select: { id: true, name: true } },
            },
          },
          items: {
            include: { category: { select: { id: true, name: true, code: true } } },
            orderBy: { expenseDate: 'asc' },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.expenseClaim.count({ where }),
    ]);

    return { claims, total, page, limit };
  }

  async getExpenseClaim(companyId: string, id: string) {
    const claim = await platformPrisma.expenseClaim.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true, employeeId: true, firstName: true, lastName: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
            grade: { select: { id: true, name: true } },
          },
        },
        items: {
          include: { category: { select: { id: true, name: true, code: true } } },
          orderBy: { expenseDate: 'asc' },
        },
      },
    });

    if (!claim || claim.companyId !== companyId) {
      throw ApiError.notFound('Expense claim not found');
    }

    return claim;
  }

  async createExpenseClaim(companyId: string, data: any) {
    // Validate employee
    const employee = await platformPrisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found in this company');
    }

    // Calculate total from items if provided
    let totalAmount = data.amount;
    if (data.items && data.items.length > 0) {
      totalAmount = data.items.reduce((sum: number, item: any) => sum + item.amount, 0);
    }

    // Generate claim number from Number Series
    const claimNumber = await generateNextNumber(
      platformPrisma, companyId, ['Expense', 'Expense Claims'], 'Expense Claim',
    );

    const createData: any = {
      companyId,
      employeeId: data.employeeId,
      claimNumber,
      title: data.title,
      amount: totalAmount,
      category: data.category,
      receipts: data.receipts ?? Prisma.JsonNull,
      description: n(data.description),
      tripDate: data.tripDate ? new Date(data.tripDate) : null,
      fromDate: data.fromDate ? new Date(data.fromDate) : null,
      toDate: data.toDate ? new Date(data.toDate) : null,
      paymentMethod: data.paymentMethod ?? 'CASH',
      merchantName: n(data.merchantName),
      projectCode: n(data.projectCode),
      currency: data.currency ?? 'INR',
      status: 'DRAFT',
    };

    if (data.items && data.items.length > 0) {
      createData.items = {
        create: data.items.map((item: any) => ({
          categoryCode: item.categoryCode,
          categoryId: item.categoryId ?? null,
          description: item.description,
          amount: item.amount,
          expenseDate: new Date(item.expenseDate),
          merchantName: item.merchantName ?? null,
          receipts: item.receipts ?? Prisma.JsonNull,
          distanceKm: item.distanceKm ?? null,
          ratePerKm: item.ratePerKm ?? null,
        })),
      };
    }

    return platformPrisma.expenseClaim.create({
      data: createData,
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        items: { orderBy: { expenseDate: 'asc' } },
      },
    });
  }

  async updateExpenseClaim(companyId: string, id: string, data: any) {
    const claim = await platformPrisma.expenseClaim.findUnique({ where: { id } });
    if (!claim || claim.companyId !== companyId) {
      throw ApiError.notFound('Expense claim not found');
    }
    if (claim.status !== 'DRAFT') {
      throw ApiError.badRequest('Only DRAFT claims can be updated');
    }

    // If items are being replaced, recalculate total
    let newAmount = data.amount;
    if (data.items && data.items.length > 0) {
      newAmount = data.items.reduce((sum: number, item: any) => sum + item.amount, 0);
      await platformPrisma.expenseClaimItem.deleteMany({ where: { claimId: id } });
    }

    const updateData: any = {
      ...(data.title !== undefined && { title: data.title }),
      ...(newAmount !== undefined && { amount: newAmount }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.receipts !== undefined && { receipts: data.receipts ?? Prisma.JsonNull }),
      ...(data.description !== undefined && { description: n(data.description) }),
      ...(data.tripDate !== undefined && { tripDate: data.tripDate ? new Date(data.tripDate) : null }),
      ...(data.fromDate !== undefined && { fromDate: data.fromDate ? new Date(data.fromDate) : null }),
      ...(data.toDate !== undefined && { toDate: data.toDate ? new Date(data.toDate) : null }),
      ...(data.paymentMethod !== undefined && { paymentMethod: data.paymentMethod }),
      ...(data.merchantName !== undefined && { merchantName: n(data.merchantName) }),
      ...(data.projectCode !== undefined && { projectCode: n(data.projectCode) }),
    };

    if (data.items && data.items.length > 0) {
      updateData.items = {
        create: data.items.map((item: any) => ({
          categoryCode: item.categoryCode,
          categoryId: item.categoryId ?? null,
          description: item.description,
          amount: item.amount,
          expenseDate: new Date(item.expenseDate),
          merchantName: item.merchantName ?? null,
          receipts: item.receipts ?? Prisma.JsonNull,
          distanceKm: item.distanceKm ?? null,
          ratePerKm: item.ratePerKm ?? null,
        })),
      };
    }

    return platformPrisma.expenseClaim.update({
      where: { id },
      data: updateData,
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        items: { orderBy: { expenseDate: 'asc' } },
      },
    });
  }

  async submitExpenseClaim(companyId: string, id: string) {
    const claim = await platformPrisma.expenseClaim.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!claim || claim.companyId !== companyId) {
      throw ApiError.notFound('Expense claim not found');
    }
    if (claim.status !== 'DRAFT') {
      throw ApiError.badRequest('Only DRAFT claims can be submitted');
    }

    const updatedClaim = await platformPrisma.expenseClaim.update({
      where: { id },
      data: { status: 'SUBMITTED' },
      include: { items: true },
    });

    // Wire approval workflow
    const approvalRequest = await essService.createRequest(companyId, {
      requesterId: claim.employeeId,
      entityType: 'ExpenseClaim',
      entityId: claim.id,
      triggerEvent: 'REIMBURSEMENT',
      data: {
        amount: Number(claim.amount),
        category: claim.category,
        title: claim.title,
        itemCount: claim.items.length,
        claimNumber: claim.claimNumber,
      },
    });

    // If no workflow, auto-approve
    if (!approvalRequest) {
      return platformPrisma.expenseClaim.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedBy: 'auto',
          approvedAt: new Date(),
          approvedAmount: claim.amount,
        },
        include: { items: true },
      });
    }

    // Update to PENDING_APPROVAL since a workflow exists
    return platformPrisma.expenseClaim.update({
      where: { id },
      data: { status: 'PENDING_APPROVAL' },
      include: { items: true },
    });
  }

  async approveRejectExpenseClaim(companyId: string, id: string, data: {
    action: 'approve' | 'reject';
    approvedBy?: string;
    rejectionReason?: string;
    approvedAmount?: number;
    itemApprovals?: Array<{ itemId: string; approved: boolean; approvedAmount?: number; reason?: string }>;
  }) {
    const claim = await platformPrisma.expenseClaim.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!claim || claim.companyId !== companyId) {
      throw ApiError.notFound('Expense claim not found');
    }
    if (!['SUBMITTED', 'PENDING_APPROVAL'].includes(claim.status)) {
      throw ApiError.badRequest('Only SUBMITTED or PENDING_APPROVAL claims can be approved or rejected');
    }

    if (data.action === 'reject') {
      // Full rejection
      const updated = await platformPrisma.expenseClaim.update({
        where: { id },
        data: {
          status: 'REJECTED',
          approvedBy: n(data.approvedBy),
          approvedAt: new Date(),
          rejectionReason: data.rejectionReason ?? null,
        },
        include: { items: true },
      });
      // Mark all items as rejected
      if (claim.items.length > 0) {
        await platformPrisma.expenseClaimItem.updateMany({
          where: { claimId: id },
          data: { isApproved: false, rejectionReason: data.rejectionReason ?? 'Claim rejected' },
        });
      }
      return updated;
    }

    // Approval (full or partial)
    if (data.itemApprovals && data.itemApprovals.length > 0) {
      // Partial approval — process per-item decisions
      let totalApproved = 0;
      let hasRejections = false;

      for (const itemApproval of data.itemApprovals) {
        const item = claim.items.find((i) => i.id === itemApproval.itemId);
        if (!item) continue;

        await platformPrisma.expenseClaimItem.update({
          where: { id: itemApproval.itemId },
          data: {
            isApproved: itemApproval.approved,
            approvedAmount: itemApproval.approved
              ? (itemApproval.approvedAmount ?? Number(item.amount))
              : 0,
            rejectionReason: !itemApproval.approved ? (itemApproval.reason ?? null) : null,
          },
        });

        if (itemApproval.approved) {
          totalApproved += itemApproval.approvedAmount ?? Number(item.amount);
        } else {
          hasRejections = true;
        }
      }

      const newStatus = hasRejections ? 'PARTIALLY_APPROVED' : 'APPROVED';
      return platformPrisma.expenseClaim.update({
        where: { id },
        data: {
          status: newStatus,
          approvedAmount: totalApproved,
          approvedBy: n(data.approvedBy),
          approvedAt: new Date(),
        },
        include: { items: true },
      });
    }

    // Full approval
    return platformPrisma.expenseClaim.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedAmount: data.approvedAmount ?? claim.amount,
        approvedBy: n(data.approvedBy),
        approvedAt: new Date(),
      },
      include: { items: true },
    });
  }

  async deleteExpenseClaim(companyId: string, id: string) {
    const claim = await platformPrisma.expenseClaim.findUnique({ where: { id } });
    if (!claim || claim.companyId !== companyId) {
      throw ApiError.notFound('Expense claim not found');
    }
    if (!['DRAFT', 'CANCELLED'].includes(claim.status)) {
      throw ApiError.badRequest('Only DRAFT or CANCELLED claims can be deleted');
    }

    // Items are cascade-deleted
    await platformPrisma.expenseClaim.delete({ where: { id } });
    return { message: 'Expense claim deleted' };
  }

  async getExpenseClaimReport(companyId: string, options: {
    fromDate?: string;
    toDate?: string;
    employeeId?: string;
    departmentId?: string;
    status?: string;
  } = {}) {
    const where: any = { companyId };
    if (options.status) where.status = options.status.toUpperCase();
    if (options.employeeId) where.employeeId = options.employeeId;

    if (options.fromDate || options.toDate) {
      where.createdAt = {};
      if (options.fromDate) where.createdAt.gte = new Date(options.fromDate);
      if (options.toDate) where.createdAt.lte = new Date(options.toDate);
    }

    if (options.departmentId) {
      where.employee = { departmentId: options.departmentId };
    }

    const claims = await platformPrisma.expenseClaim.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true, employeeId: true, firstName: true, lastName: true,
            department: { select: { id: true, name: true } },
          },
        },
        items: { select: { categoryCode: true, amount: true, approvedAmount: true, isApproved: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Build summary
    const summary = {
      totalClaims: claims.length,
      totalClaimed: 0,
      totalApproved: 0,
      totalPaid: 0,
      totalRejected: 0,
      totalPending: 0,
      byCategory: {} as Record<string, { count: number; claimed: number; approved: number }>,
      byDepartment: {} as Record<string, { count: number; claimed: number; approved: number }>,
      byStatus: {} as Record<string, number>,
    };

    for (const claim of claims) {
      const amt = Number(claim.amount);
      const approved = Number(claim.approvedAmount ?? 0);
      summary.totalClaimed += amt;
      summary.byStatus[claim.status] = (summary.byStatus[claim.status] ?? 0) + 1;

      const deptName = claim.employee.department?.name ?? 'Unassigned';
      if (!summary.byDepartment[deptName]) {
        summary.byDepartment[deptName] = { count: 0, claimed: 0, approved: 0 };
      }
      summary.byDepartment[deptName]!.count++;
      summary.byDepartment[deptName]!.claimed += amt;

      if (!summary.byCategory[claim.category]) {
        summary.byCategory[claim.category] = { count: 0, claimed: 0, approved: 0 };
      }
      summary.byCategory[claim.category]!.count++;
      summary.byCategory[claim.category]!.claimed += amt;

      if (['APPROVED', 'PARTIALLY_APPROVED', 'PAID'].includes(claim.status)) {
        summary.totalApproved += approved;
        summary.byDepartment[deptName]!.approved += approved;
        summary.byCategory[claim.category]!.approved += approved;
      }
      if (claim.status === 'PAID') {
        summary.totalPaid += approved;
      }
      if (claim.status === 'REJECTED') {
        summary.totalRejected += amt;
      }
      if (['SUBMITTED', 'PENDING_APPROVAL'].includes(claim.status)) {
        summary.totalPending += amt;
      }
    }

    return { claims, summary };
  }

  // ════════════════════════════════════════════════════════════════
  // HR LETTER TEMPLATES
  // ════════════════════════════════════════════════════════════════

  async listLetterTemplates(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    const where = { companyId };

    const [templates, total] = await Promise.all([
      platformPrisma.hRLetterTemplate.findMany({
        where,
        include: { _count: { select: { letters: true } } },
        skip: offset,
        take: limit,
        orderBy: { type: 'asc' },
      }),
      platformPrisma.hRLetterTemplate.count({ where }),
    ]);

    return { templates, total, page, limit };
  }

  async getLetterTemplate(companyId: string, id: string) {
    const template = await platformPrisma.hRLetterTemplate.findUnique({
      where: { id },
      include: { _count: { select: { letters: true } } },
    });

    if (!template || template.companyId !== companyId) {
      throw ApiError.notFound('Letter template not found');
    }

    return template;
  }

  async createLetterTemplate(companyId: string, data: any) {
    return platformPrisma.hRLetterTemplate.create({
      data: {
        companyId,
        type: data.type,
        name: data.name,
        bodyTemplate: data.bodyTemplate,
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateLetterTemplate(companyId: string, id: string, data: any) {
    const template = await platformPrisma.hRLetterTemplate.findUnique({ where: { id } });
    if (!template || template.companyId !== companyId) {
      throw ApiError.notFound('Letter template not found');
    }

    return platformPrisma.hRLetterTemplate.update({
      where: { id },
      data: {
        ...(data.type !== undefined && { type: data.type }),
        ...(data.name !== undefined && { name: data.name }),
        ...(data.bodyTemplate !== undefined && { bodyTemplate: data.bodyTemplate }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async deleteLetterTemplate(companyId: string, id: string) {
    const template = await platformPrisma.hRLetterTemplate.findUnique({
      where: { id },
      include: { _count: { select: { letters: true } } },
    });
    if (!template || template.companyId !== companyId) {
      throw ApiError.notFound('Letter template not found');
    }
    if (template._count.letters > 0) {
      throw ApiError.badRequest(`Cannot delete: ${template._count.letters} letter(s) generated from this template`);
    }

    await platformPrisma.hRLetterTemplate.delete({ where: { id } });
    return { message: 'Letter template deleted' };
  }

  // ════════════════════════════════════════════════════════════════
  // HR LETTERS
  // ════════════════════════════════════════════════════════════════

  async listLetters(companyId: string, options: LetterListOptions = {}) {
    const { page = 1, limit = 25, employeeId, templateId } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (employeeId) where.employeeId = employeeId;
    if (templateId) where.templateId = templateId;

    const [letters, total] = await Promise.all([
      platformPrisma.hRLetter.findMany({
        where,
        include: {
          template: { select: { id: true, type: true, name: true } },
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.hRLetter.count({ where }),
    ]);

    return { letters, total, page, limit };
  }

  async getLetter(companyId: string, id: string) {
    const letter = await platformPrisma.hRLetter.findUnique({
      where: { id },
      include: {
        template: true,
        employee: {
          select: {
            id: true, employeeId: true, firstName: true, lastName: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!letter || letter.companyId !== companyId) {
      throw ApiError.notFound('HR letter not found');
    }

    // Resolve tokens in the body
    const resolvedBody = this.resolveLetterTokens(letter.template.bodyTemplate, letter.employee);

    return { ...letter, resolvedBody };
  }

  async createLetter(companyId: string, data: any) {
    // Validate template
    const template = await platformPrisma.hRLetterTemplate.findUnique({ where: { id: data.templateId } });
    if (!template || template.companyId !== companyId) {
      throw ApiError.badRequest('Letter template not found in this company');
    }
    if (!template.isActive) {
      throw ApiError.badRequest('Letter template is inactive');
    }

    // Validate employee
    const employee = await platformPrisma.employee.findUnique({
      where: { id: data.employeeId },
      include: {
        department: { select: { name: true } },
        designation: { select: { name: true } },
      },
    });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found in this company');
    }

    const letterNumber = await generateNextNumber(
      platformPrisma, companyId, ['Letter', 'HR Letters'], 'HR Letter',
    );

    const letter = await platformPrisma.hRLetter.create({
      data: {
        companyId,
        letterNumber,
        templateId: data.templateId,
        employeeId: data.employeeId,
        effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : null,
        pdfUrl: null, // PDF generation is a placeholder for now
        eSignStatus: 'PENDING',
      },
      include: {
        template: { select: { id: true, type: true, name: true } },
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
      },
    });

    return letter;
  }

  async deleteLetter(companyId: string, id: string) {
    const letter = await platformPrisma.hRLetter.findUnique({ where: { id } });
    if (!letter || letter.companyId !== companyId) {
      throw ApiError.notFound('HR letter not found');
    }

    await platformPrisma.hRLetter.delete({ where: { id } });
    return { message: 'HR letter deleted' };
  }

  private resolveLetterTokens(template: string, employee: any): string {
    const tokens: Record<string, string> = {
      '{employee_name}': `${employee.firstName ?? ''} ${employee.lastName ?? ''}`.trim(),
      '{employee_id}': employee.employeeId ?? '',
      '{first_name}': employee.firstName ?? '',
      '{last_name}': employee.lastName ?? '',
      '{designation}': employee.designation?.name ?? '',
      '{department}': employee.department?.name ?? '',
      '{date}': new Date().toISOString().split('T')[0]!,
    };

    let resolved = template;
    for (const [token, value] of Object.entries(tokens)) {
      resolved = resolved.split(token).join(value);
    }

    return resolved;
  }

  // ════════════════════════════════════════════════════════════════
  // GRIEVANCE — Categories
  // ════════════════════════════════════════════════════════════════

  async listGrievanceCategories(companyId: string, options: ListOptions = {}) {
    const { page = 1, limit = 50 } = options;
    const offset = (page - 1) * limit;

    const where = { companyId };

    const [categories, total] = await Promise.all([
      platformPrisma.grievanceCategory.findMany({
        where,
        include: { _count: { select: { cases: true } } },
        skip: offset,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      platformPrisma.grievanceCategory.count({ where }),
    ]);

    return { categories, total, page, limit };
  }

  async getGrievanceCategory(companyId: string, id: string) {
    const category = await platformPrisma.grievanceCategory.findUnique({
      where: { id },
      include: { _count: { select: { cases: true } } },
    });

    if (!category || category.companyId !== companyId) {
      throw ApiError.notFound('Grievance category not found');
    }

    return category;
  }

  async createGrievanceCategory(companyId: string, data: any) {
    const existing = await platformPrisma.grievanceCategory.findUnique({
      where: { companyId_name: { companyId, name: data.name } },
    });
    if (existing) {
      throw ApiError.conflict(`Grievance category "${data.name}" already exists`);
    }

    return platformPrisma.grievanceCategory.create({
      data: {
        companyId,
        name: data.name,
        slaHours: data.slaHours ?? 72,
        autoEscalateTo: n(data.autoEscalateTo),
      },
    });
  }

  async updateGrievanceCategory(companyId: string, id: string, data: any) {
    const category = await platformPrisma.grievanceCategory.findUnique({ where: { id } });
    if (!category || category.companyId !== companyId) {
      throw ApiError.notFound('Grievance category not found');
    }

    if (data.name && data.name !== category.name) {
      const existing = await platformPrisma.grievanceCategory.findUnique({
        where: { companyId_name: { companyId, name: data.name } },
      });
      if (existing) {
        throw ApiError.conflict(`Grievance category "${data.name}" already exists`);
      }
    }

    return platformPrisma.grievanceCategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.slaHours !== undefined && { slaHours: data.slaHours }),
        ...(data.autoEscalateTo !== undefined && { autoEscalateTo: n(data.autoEscalateTo) }),
      },
    });
  }

  async deleteGrievanceCategory(companyId: string, id: string) {
    const category = await platformPrisma.grievanceCategory.findUnique({
      where: { id },
      include: { _count: { select: { cases: true } } },
    });
    if (!category || category.companyId !== companyId) {
      throw ApiError.notFound('Grievance category not found');
    }
    if (category._count.cases > 0) {
      throw ApiError.badRequest(`Cannot delete: ${category._count.cases} case(s) in this category`);
    }

    await platformPrisma.grievanceCategory.delete({ where: { id } });
    return { message: 'Grievance category deleted' };
  }

  // ════════════════════════════════════════════════════════════════
  // GRIEVANCE — Cases
  // ════════════════════════════════════════════════════════════════

  async listGrievanceCases(companyId: string, options: GrievanceCaseListOptions = {}) {
    const { page = 1, limit = 25, categoryId, status, employeeId } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status.toUpperCase();
    if (employeeId) where.employeeId = employeeId;

    const [cases, total] = await Promise.all([
      platformPrisma.grievanceCase.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slaHours: true } },
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.grievanceCase.count({ where }),
    ]);

    return { cases, total, page, limit };
  }

  async getGrievanceCase(companyId: string, id: string) {
    const gCase = await platformPrisma.grievanceCase.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, slaHours: true, autoEscalateTo: true } },
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
      },
    });

    if (!gCase || gCase.companyId !== companyId) {
      throw ApiError.notFound('Grievance case not found');
    }

    // Compute SLA breach
    const slaHours = (gCase.category as any).slaHours ?? 72;
    const createdTime = gCase.createdAt.getTime();
    const now = Date.now();
    const hoursPassed = (now - createdTime) / (1000 * 60 * 60);
    const slaBreach = gCase.status !== 'RESOLVED' && gCase.status !== 'CLOSED' && hoursPassed > slaHours;

    return { ...gCase, slaBreach, hoursPassed: Math.round(hoursPassed) };
  }

  async createGrievanceCase(companyId: string, data: any) {
    // Validate category
    const category = await platformPrisma.grievanceCategory.findUnique({ where: { id: data.categoryId } });
    if (!category || category.companyId !== companyId) {
      throw ApiError.badRequest('Grievance category not found in this company');
    }

    // Validate employee if not anonymous
    if (!data.isAnonymous && data.employeeId) {
      const employee = await platformPrisma.employee.findUnique({ where: { id: data.employeeId } });
      if (!employee || employee.companyId !== companyId) {
        throw ApiError.badRequest('Employee not found in this company');
      }
    }

    return platformPrisma.grievanceCase.create({
      data: {
        companyId,
        employeeId: data.isAnonymous ? null : n(data.employeeId),
        categoryId: data.categoryId,
        description: data.description,
        isAnonymous: data.isAnonymous ?? false,
        status: 'OPEN',
      },
      include: {
        category: { select: { id: true, name: true } },
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
      },
    });
  }

  async updateGrievanceCase(companyId: string, id: string, data: any) {
    const gCase = await platformPrisma.grievanceCase.findUnique({ where: { id } });
    if (!gCase || gCase.companyId !== companyId) {
      throw ApiError.notFound('Grievance case not found');
    }

    // Validate status transition
    if (data.status) {
      const allowed = GRIEVANCE_TRANSITIONS[gCase.status] ?? [];
      if (!allowed.includes(data.status)) {
        throw ApiError.badRequest(`Cannot transition from ${gCase.status} to ${data.status}`);
      }
    }

    return platformPrisma.grievanceCase.update({
      where: { id },
      data: {
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.resolution !== undefined && { resolution: n(data.resolution) }),
        ...(data.resolvedBy !== undefined && { resolvedBy: n(data.resolvedBy) }),
      },
    });
  }

  async resolveGrievanceCase(companyId: string, id: string, data: any) {
    const gCase = await platformPrisma.grievanceCase.findUnique({ where: { id } });
    if (!gCase || gCase.companyId !== companyId) {
      throw ApiError.notFound('Grievance case not found');
    }
    if (gCase.status === 'RESOLVED' || gCase.status === 'CLOSED') {
      throw ApiError.badRequest('Case is already resolved or closed');
    }

    return platformPrisma.grievanceCase.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolution: data.resolution,
        resolvedBy: data.resolvedBy,
        resolvedAt: new Date(),
      },
    });
  }

  async deleteGrievanceCase(companyId: string, id: string) {
    const gCase = await platformPrisma.grievanceCase.findUnique({ where: { id } });
    if (!gCase || gCase.companyId !== companyId) {
      throw ApiError.notFound('Grievance case not found');
    }

    await platformPrisma.grievanceCase.delete({ where: { id } });
    return { message: 'Grievance case deleted' };
  }

  // ════════════════════════════════════════════════════════════════
  // DISCIPLINARY ACTIONS
  // ════════════════════════════════════════════════════════════════

  async listDisciplinaryActions(companyId: string, options: DisciplinaryListOptions = {}) {
    const { page = 1, limit = 25, employeeId, type, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (employeeId) where.employeeId = employeeId;
    if (type) where.type = type;
    if (status) where.status = status.toUpperCase();

    const [actions, total] = await Promise.all([
      platformPrisma.disciplinaryAction.findMany({
        where,
        include: {
          employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.disciplinaryAction.count({ where }),
    ]);

    return { actions, total, page, limit };
  }

  async getDisciplinaryAction(companyId: string, id: string) {
    const action = await platformPrisma.disciplinaryAction.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true, employeeId: true, firstName: true, lastName: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!action || action.companyId !== companyId) {
      throw ApiError.notFound('Disciplinary action not found');
    }

    return action;
  }

  async createDisciplinaryAction(companyId: string, data: any) {
    // Validate employee
    const employee = await platformPrisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found in this company');
    }

    // Type-specific validation
    if (data.type === 'PIP' && !data.pipDuration) {
      throw ApiError.badRequest('PIP duration is required for PIP actions');
    }
    if (data.type === 'SHOW_CAUSE' && !data.replyDueBy) {
      throw ApiError.badRequest('Reply due date is required for show-cause notices');
    }

    // Set initial status based on type
    let initialStatus = 'ISSUED';
    if (data.type === 'PIP') {
      initialStatus = 'PIP_ACTIVE';
    }

    return platformPrisma.disciplinaryAction.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        type: data.type,
        charges: data.charges,
        replyDueBy: data.replyDueBy ? new Date(data.replyDueBy) : null,
        pipDuration: n(data.pipDuration),
        status: initialStatus,
        issuedBy: n(data.issuedBy),
      },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
      },
    });
  }

  async updateDisciplinaryAction(companyId: string, id: string, data: any) {
    const action = await platformPrisma.disciplinaryAction.findUnique({ where: { id } });
    if (!action || action.companyId !== companyId) {
      throw ApiError.notFound('Disciplinary action not found');
    }

    // Auto-transition status based on updates
    let status = data.status;
    if (!status) {
      if (data.replyReceived && action.status === 'ISSUED') {
        status = 'REPLY_RECEIVED';
      }
      if (data.pipOutcome && action.type === 'PIP') {
        status = 'RESOLVED';
      }
    }

    return platformPrisma.disciplinaryAction.update({
      where: { id },
      data: {
        ...(data.charges !== undefined && { charges: data.charges }),
        ...(data.replyDueBy !== undefined && { replyDueBy: data.replyDueBy ? new Date(data.replyDueBy) : null }),
        ...(data.replyReceived !== undefined && { replyReceived: n(data.replyReceived) }),
        ...(data.pipDuration !== undefined && { pipDuration: n(data.pipDuration) }),
        ...(data.pipOutcome !== undefined && { pipOutcome: n(data.pipOutcome) }),
        ...(status !== undefined && { status }),
        ...(data.issuedBy !== undefined && { issuedBy: n(data.issuedBy) }),
      },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
      },
    });
  }

  async deleteDisciplinaryAction(companyId: string, id: string) {
    const action = await platformPrisma.disciplinaryAction.findUnique({ where: { id } });
    if (!action || action.companyId !== companyId) {
      throw ApiError.notFound('Disciplinary action not found');
    }

    await platformPrisma.disciplinaryAction.delete({ where: { id } });
    return { message: 'Disciplinary action deleted' };
  }

  // ════════════════════════════════════════════════════════════════
  // BONUS BATCHES
  // ════════════════════════════════════════════════════════════════

  async listBonusBatches(companyId: string, options: { page?: number; limit?: number; status?: string } = {}) {
    const { page = 1, limit = 25, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (status) where.status = status.toUpperCase();

    const [batches, total] = await Promise.all([
      platformPrisma.bonusBatch.findMany({
        where,
        include: {
          _count: { select: { items: true } },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.bonusBatch.count({ where }),
    ]);

    return { batches, total, page, limit };
  }

  async getBonusBatch(companyId: string, id: string) {
    const batch = await platformPrisma.bonusBatch.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            employee: {
              select: {
                id: true,
                employeeId: true,
                firstName: true,
                lastName: true,
                department: { select: { id: true, name: true } },
                designation: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!batch || batch.companyId !== companyId) {
      throw ApiError.notFound('Bonus batch not found');
    }

    return batch;
  }

  async createBonusBatch(
    companyId: string,
    data: {
      name: string;
      bonusType: string;
      items: Array<{ employeeId: string; amount: number; remarks?: string }>;
    },
  ) {
    // Validate all employee IDs belong to company
    const employeeIds = data.items.map((i) => i.employeeId);
    const employees = await platformPrisma.employee.findMany({
      where: { id: { in: employeeIds }, companyId },
      select: { id: true },
    });
    const foundIds = new Set(employees.map((e) => e.id));
    const missing = employeeIds.filter((eid) => !foundIds.has(eid));
    if (missing.length > 0) {
      throw ApiError.badRequest(`Employees not found in this company: ${missing.join(', ')}`);
    }

    // Calculate TDS per item (simplified: 10% flat rate for new regime)
    const itemsWithTds = data.items.map((item) => {
      const tdsAmount = round2(item.amount * 0.10);
      const netAmount = round2(item.amount - tdsAmount);
      return { ...item, tdsAmount, netAmount };
    });

    const totalAmount = round2(itemsWithTds.reduce((sum, i) => sum + i.amount, 0));

    // Create batch + items in transaction
    return platformPrisma.$transaction(async (tx) => {
      const batch = await tx.bonusBatch.create({
        data: {
          companyId,
          name: data.name,
          bonusType: data.bonusType,
          totalAmount: new Prisma.Decimal(totalAmount),
          status: 'DRAFT',
        },
      });

      await tx.bonusBatchItem.createMany({
        data: itemsWithTds.map((item) => ({
          batchId: batch.id,
          employeeId: item.employeeId,
          amount: new Prisma.Decimal(item.amount),
          tdsAmount: new Prisma.Decimal(item.tdsAmount),
          netAmount: new Prisma.Decimal(item.netAmount),
          remarks: n(item.remarks),
          companyId,
        })),
      });

      return this.getBonusBatch(companyId, batch.id);
    });
  }

  async approveBonusBatch(companyId: string, id: string, userId: string) {
    const batch = await platformPrisma.bonusBatch.findUnique({ where: { id } });
    if (!batch || batch.companyId !== companyId) {
      throw ApiError.notFound('Bonus batch not found');
    }

    if (batch.status !== 'DRAFT' && batch.status !== 'SUBMITTED') {
      throw ApiError.badRequest(`Cannot approve batch in ${batch.status} status. Must be DRAFT or SUBMITTED.`);
    }

    return platformPrisma.bonusBatch.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });
  }

  async mergeBonusBatchToPayroll(companyId: string, batchId: string, payrollRunId: string) {
    const batch = await platformPrisma.bonusBatch.findUnique({
      where: { id: batchId },
      include: { items: true },
    });
    if (!batch || batch.companyId !== companyId) {
      throw ApiError.notFound('Bonus batch not found');
    }

    if (batch.status !== 'APPROVED') {
      throw ApiError.badRequest(`Cannot merge batch in ${batch.status} status. Must be APPROVED.`);
    }

    // Validate payroll run exists and is in mergeable status
    const payrollRun = await platformPrisma.payrollRun.findUnique({ where: { id: payrollRunId } });
    if (!payrollRun || payrollRun.companyId !== companyId) {
      throw ApiError.notFound('Payroll run not found');
    }

    if (payrollRun.status !== 'COMPUTED' && payrollRun.status !== 'STATUTORY_DONE') {
      throw ApiError.badRequest(`Cannot merge into payroll run in ${payrollRun.status} status. Must be COMPUTED or STATUTORY_DONE.`);
    }

    return platformPrisma.$transaction(async (tx) => {
      // For each item, find the PayrollEntry for that employee and add bonus
      for (const item of batch.items) {
        const entry = await tx.payrollEntry.findFirst({
          where: { payrollRunId, employeeId: item.employeeId },
        });

        if (entry) {
          const currentEarnings = (entry.earnings as Record<string, number>) ?? {};
          const updatedEarnings = {
            ...currentEarnings,
            bonus: round2((currentEarnings['bonus'] ?? 0) + Number(item.amount)),
          };

          const newGross = round2(Number(entry.grossEarnings) + Number(item.amount));
          const newNet = round2(Number(entry.netPay) + Number(item.netAmount));

          await tx.payrollEntry.update({
            where: { id: entry.id },
            data: {
              earnings: updatedEarnings,
              grossEarnings: new Prisma.Decimal(newGross),
              netPay: new Prisma.Decimal(newNet),
            },
          });
        }
      }

      // Update batch status to MERGED
      return tx.bonusBatch.update({
        where: { id: batchId },
        data: {
          status: 'MERGED',
          mergedToRunId: payrollRunId,
        },
      });
    });
  }
  // ════════════════════════════════════════════════════════════════
  // E-SIGN INTEGRATION (ORA-7)
  // ════════════════════════════════════════════════════════════════

  async dispatchESign(companyId: string, letterId: string) {
    const letter = await platformPrisma.hRLetter.findUnique({
      where: { id: letterId },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true, officialEmail: true } },
        template: { select: { id: true, type: true, name: true } },
      },
    });

    if (!letter || letter.companyId !== companyId) {
      throw ApiError.notFound('HR letter not found');
    }

    if (letter.eSignStatus === 'SIGNED') {
      throw ApiError.badRequest('Letter is already signed');
    }

    const eSignToken = `esign_${letterId}_${Date.now()}`;
    const signingUrl = `https://esign.placeholder.com/sign?token=${eSignToken}`;

    const updated = await platformPrisma.hRLetter.update({
      where: { id: letterId },
      data: {
        eSignStatus: 'PENDING',
        eSignToken,
        eSignDispatchedAt: new Date(),
      },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        template: { select: { id: true, type: true, name: true } },
      },
    });

    return {
      letter: updated,
      signingUrl,
      dispatchedAt: updated.eSignDispatchedAt,
    };
  }

  async processESignCallback(signingToken: string, status: 'SIGNED' | 'DECLINED') {
    const letter = await platformPrisma.hRLetter.findFirst({
      where: { eSignToken: signingToken },
    });

    if (!letter) {
      throw ApiError.notFound('Letter not found for the provided signing token');
    }

    const updateData: any = {
      eSignStatus: status,
    };

    if (status === 'SIGNED') {
      updateData.eSignedAt = new Date();
    }

    return platformPrisma.hRLetter.update({
      where: { id: letter.id },
      data: updateData,
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        template: { select: { id: true, type: true, name: true } },
      },
    });
  }

  async getESignStatus(
    companyId: string,
    letterId: string,
    options?: { employeeId?: string },
  ) {
    const letter = await platformPrisma.hRLetter.findFirst({
      where: {
        id: letterId,
        companyId,
        ...(options?.employeeId ? { employeeId: options.employeeId } : {}),
      },
      select: {
        id: true,
        eSignStatus: true,
        eSignedAt: true,
        eSignDispatchedAt: true,
      },
    });

    if (!letter) {
      throw ApiError.notFound('HR letter not found');
    }

    return letter;
  }

  async listPendingESignLetters(companyId: string, options?: { employeeId?: string }) {
    const letters = await platformPrisma.hRLetter.findMany({
      where: {
        companyId,
        eSignStatus: 'PENDING',
        ...(options?.employeeId ? { employeeId: options.employeeId } : {}),
      },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        template: { select: { id: true, type: true, name: true } },
      },
      orderBy: { eSignDispatchedAt: 'desc' },
    });

    return letters;
  }

  // ════════════════════════════════════════════════════════════════
  // PRODUCTION INCENTIVE (ORA-9)
  // ════════════════════════════════════════════════════════════════

  async listIncentiveConfigs(companyId: string) {
    const configs = await platformPrisma.productionIncentiveConfig.findMany({
      where: { companyId },
      include: {
        department: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return configs;
  }

  async getIncentiveConfig(companyId: string, id: string) {
    const config = await platformPrisma.productionIncentiveConfig.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true } },
      },
    });

    if (!config || config.companyId !== companyId) {
      throw ApiError.notFound('Production incentive config not found');
    }

    return config;
  }

  async createIncentiveConfig(companyId: string, data: any) {
    // Validate department if provided
    if (data.departmentId) {
      const department = await platformPrisma.department.findUnique({ where: { id: data.departmentId } });
      if (!department || department.companyId !== companyId) {
        throw ApiError.badRequest('Department not found in this company');
      }
    }

    return platformPrisma.productionIncentiveConfig.create({
      data: {
        companyId,
        name: data.name,
        incentiveBasis: data.incentiveBasis,
        calculationCycle: n(data.calculationCycle),
        slabs: data.slabs,
        machineId: n(data.machineId),
        departmentId: n(data.departmentId),
      },
      include: {
        department: { select: { id: true, name: true } },
      },
    });
  }

  async updateIncentiveConfig(companyId: string, id: string, data: any) {
    const config = await platformPrisma.productionIncentiveConfig.findUnique({ where: { id } });
    if (!config || config.companyId !== companyId) {
      throw ApiError.notFound('Production incentive config not found');
    }

    // Validate department if being updated
    if (data.departmentId) {
      const department = await platformPrisma.department.findUnique({ where: { id: data.departmentId } });
      if (!department || department.companyId !== companyId) {
        throw ApiError.badRequest('Department not found in this company');
      }
    }

    return platformPrisma.productionIncentiveConfig.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.incentiveBasis !== undefined && { incentiveBasis: data.incentiveBasis }),
        ...(data.calculationCycle !== undefined && { calculationCycle: n(data.calculationCycle) }),
        ...(data.slabs !== undefined && { slabs: data.slabs }),
        ...(data.machineId !== undefined && { machineId: n(data.machineId) }),
        ...(data.departmentId !== undefined && { departmentId: n(data.departmentId) }),
      },
      include: {
        department: { select: { id: true, name: true } },
      },
    });
  }

  async deleteIncentiveConfig(companyId: string, id: string) {
    const config = await platformPrisma.productionIncentiveConfig.findUnique({ where: { id } });
    if (!config || config.companyId !== companyId) {
      throw ApiError.notFound('Production incentive config not found');
    }

    // Check no active records reference it
    const activeRecords = await platformPrisma.productionIncentiveRecord.count({
      where: { configId: id, status: { in: ['COMPUTED', 'MERGED'] } },
    });
    if (activeRecords > 0) {
      throw ApiError.badRequest(`Cannot delete: ${activeRecords} active incentive record(s) reference this config`);
    }

    await platformPrisma.productionIncentiveConfig.delete({ where: { id } });
    return { message: 'Production incentive config deleted' };
  }

  async computeIncentives(
    companyId: string,
    configId: string,
    data: { period: string; records: Array<{ employeeId: string; outputUnits: number }> },
  ) {
    const config = await platformPrisma.productionIncentiveConfig.findUnique({ where: { id: configId } });
    if (!config || config.companyId !== companyId) {
      throw ApiError.notFound('Production incentive config not found');
    }

    const slabs = config.slabs as Array<{ minOutput: number; maxOutput: number; amount: number }>;

    // Calculate incentive for each record
    const computedRecords = data.records.map((rec) => {
      const matchingSlab = slabs.find((s) => rec.outputUnits >= s.minOutput && rec.outputUnits <= s.maxOutput);
      const incentiveAmount = matchingSlab ? matchingSlab.amount : 0;
      return {
        configId,
        companyId,
        employeeId: rec.employeeId,
        periodDate: new Date(data.period),
        outputUnits: rec.outputUnits,
        incentiveAmount,
        status: 'COMPUTED',
      };
    });

    // Delete existing records for this config+period, create new ones
    await platformPrisma.$transaction(async (tx) => {
      await tx.productionIncentiveRecord.deleteMany({
        where: { configId, periodDate: new Date(data.period), companyId },
      });

      await tx.productionIncentiveRecord.createMany({
        data: computedRecords.map((r) => ({
          configId: r.configId,
          companyId: r.companyId,
          employeeId: r.employeeId,
          periodDate: r.periodDate,
          outputUnits: r.outputUnits,
          incentiveAmount: new Prisma.Decimal(r.incentiveAmount),
          status: r.status,
        })),
      });
    });

    const totalIncentive = round2(computedRecords.reduce((sum, r) => sum + r.incentiveAmount, 0));

    return {
      configId,
      period: data.period,
      recordsProcessed: computedRecords.length,
      totalIncentive,
    };
  }

  async mergeIncentivesToPayroll(
    companyId: string,
    configId: string,
    month: number,
    year: number,
    payrollRunId: string,
  ) {
    const config = await platformPrisma.productionIncentiveConfig.findUnique({ where: { id: configId } });
    if (!config || config.companyId !== companyId) {
      throw ApiError.notFound('Production incentive config not found');
    }

    // Find COMPUTED records for the config in the given period
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const records = await platformPrisma.productionIncentiveRecord.findMany({
      where: {
        configId,
        companyId,
        status: 'COMPUTED',
        periodDate: { gte: periodStart, lte: periodEnd },
      },
    });

    if (records.length === 0) {
      throw ApiError.badRequest('No computed incentive records found for this config and period');
    }

    // Validate payroll run
    const payrollRun = await platformPrisma.payrollRun.findUnique({ where: { id: payrollRunId } });
    if (!payrollRun || payrollRun.companyId !== companyId) {
      throw ApiError.notFound('Payroll run not found');
    }

    if (payrollRun.status !== 'COMPUTED' && payrollRun.status !== 'STATUTORY_DONE') {
      throw ApiError.badRequest(`Cannot merge into payroll run in ${payrollRun.status} status. Must be COMPUTED or STATUTORY_DONE.`);
    }

    return platformPrisma.$transaction(async (tx) => {
      for (const record of records) {
        const entry = await tx.payrollEntry.findFirst({
          where: { payrollRunId, employeeId: record.employeeId },
        });

        if (entry) {
          const currentEarnings = (entry.earnings as Record<string, number>) ?? {};
          const incentiveAmt = Number(record.incentiveAmount);
          const updatedEarnings = {
            ...currentEarnings,
            PROD_INCENTIVE: round2((currentEarnings['PROD_INCENTIVE'] ?? 0) + incentiveAmt),
          };

          const newGross = round2(Number(entry.grossEarnings) + incentiveAmt);
          const newNet = round2(Number(entry.netPay) + incentiveAmt);

          await tx.payrollEntry.update({
            where: { id: entry.id },
            data: {
              earnings: updatedEarnings,
              grossEarnings: new Prisma.Decimal(newGross),
              netPay: new Prisma.Decimal(newNet),
            },
          });
        }

        // Update record to MERGED status
        await tx.productionIncentiveRecord.update({
          where: { id: record.id },
          data: {
            status: 'MERGED',
            payrollRunId,
          },
        });
      }

      return {
        configId,
        month,
        year,
        payrollRunId,
        recordsMerged: records.length,
        totalMerged: round2(records.reduce((sum, r) => sum + Number(r.incentiveAmount), 0)),
      };
    });
  }

  async listIncentiveRecords(
    companyId: string,
    options: { configId?: string; employeeId?: string; status?: string; month?: number; year?: number } = {},
  ) {
    const { configId, employeeId, status, month, year } = options;

    const where: any = { companyId };
    if (configId) where.configId = configId;
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status.toUpperCase();
    if (month && year) {
      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0, 23, 59, 59, 999);
      where.periodDate = { gte: periodStart, lte: periodEnd };
    }

    const records = await platformPrisma.productionIncentiveRecord.findMany({
      where,
      include: {
        config: { select: { id: true, name: true, incentiveBasis: true } },
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
      },
      orderBy: { periodDate: 'desc' },
    });

    return records;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const advancedHRService = new AdvancedHRService();
