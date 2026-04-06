import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { n } from '../../../shared/utils/prisma-helpers';

export class CandidateProfileService {
  // ════════════════════════════════════════════════════════════════
  // Helpers
  // ════════════════════════════════════════════════════════════════

  private async assertCandidateExists(companyId: string, candidateId: string) {
    const candidate = await platformPrisma.candidate.findUnique({
      where: { id: candidateId },
      select: { id: true, companyId: true },
    });
    if (!candidate || candidate.companyId !== companyId) {
      throw ApiError.notFound('Candidate not found');
    }
    return candidate;
  }

  // ════════════════════════════════════════════════════════════════
  // EDUCATION
  // ════════════════════════════════════════════════════════════════

  async listEducation(companyId: string, candidateId: string) {
    await this.assertCandidateExists(companyId, candidateId);

    return platformPrisma.candidateEducation.findMany({
      where: { candidateId, companyId },
      orderBy: { yearOfPassing: 'desc' },
    });
  }

  async createEducation(companyId: string, candidateId: string, data: any) {
    await this.assertCandidateExists(companyId, candidateId);

    return platformPrisma.candidateEducation.create({
      data: {
        candidateId,
        companyId,
        qualification: data.qualification,
        degree: n(data.degree),
        institution: n(data.institution),
        university: n(data.university),
        yearOfPassing: n(data.yearOfPassing),
        percentage: n(data.percentage),
        certificateUrl: n(data.certificateUrl),
      },
    });
  }

  async updateEducation(companyId: string, id: string, data: any) {
    const existing = await platformPrisma.candidateEducation.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Education record not found');
    }

    return platformPrisma.candidateEducation.update({
      where: { id },
      data: {
        ...(data.qualification !== undefined && { qualification: data.qualification }),
        ...(data.degree !== undefined && { degree: n(data.degree) }),
        ...(data.institution !== undefined && { institution: n(data.institution) }),
        ...(data.university !== undefined && { university: n(data.university) }),
        ...(data.yearOfPassing !== undefined && { yearOfPassing: n(data.yearOfPassing) }),
        ...(data.percentage !== undefined && { percentage: n(data.percentage) }),
        ...(data.certificateUrl !== undefined && { certificateUrl: n(data.certificateUrl) }),
      },
    });
  }

  async deleteEducation(companyId: string, id: string) {
    const existing = await platformPrisma.candidateEducation.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Education record not found');
    }

    await platformPrisma.candidateEducation.delete({ where: { id } });
    return { deleted: true };
  }

  // ════════════════════════════════════════════════════════════════
  // EXPERIENCE
  // ════════════════════════════════════════════════════════════════

  async listExperience(companyId: string, candidateId: string) {
    await this.assertCandidateExists(companyId, candidateId);

    return platformPrisma.candidateExperience.findMany({
      where: { candidateId, companyId },
      orderBy: { fromDate: 'desc' },
    });
  }

  async createExperience(companyId: string, candidateId: string, data: any) {
    await this.assertCandidateExists(companyId, candidateId);

    return platformPrisma.candidateExperience.create({
      data: {
        candidateId,
        companyId,
        companyName: data.companyName,
        designation: data.designation,
        fromDate: data.fromDate ? new Date(data.fromDate) : null,
        toDate: data.toDate ? new Date(data.toDate) : null,
        currentlyWorking: data.currentlyWorking ?? false,
        ctc: n(data.ctc),
        description: n(data.description),
      },
    });
  }

  async updateExperience(companyId: string, id: string, data: any) {
    const existing = await platformPrisma.candidateExperience.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Experience record not found');
    }

    return platformPrisma.candidateExperience.update({
      where: { id },
      data: {
        ...(data.companyName !== undefined && { companyName: data.companyName }),
        ...(data.designation !== undefined && { designation: data.designation }),
        ...(data.fromDate !== undefined && { fromDate: data.fromDate ? new Date(data.fromDate) : null }),
        ...(data.toDate !== undefined && { toDate: data.toDate ? new Date(data.toDate) : null }),
        ...(data.currentlyWorking !== undefined && { currentlyWorking: data.currentlyWorking }),
        ...(data.ctc !== undefined && { ctc: n(data.ctc) }),
        ...(data.description !== undefined && { description: n(data.description) }),
      },
    });
  }

  async deleteExperience(companyId: string, id: string) {
    const existing = await platformPrisma.candidateExperience.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Experience record not found');
    }

    await platformPrisma.candidateExperience.delete({ where: { id } });
    return { deleted: true };
  }

  // ════════════════════════════════════════════════════════════════
  // DOCUMENTS
  // ════════════════════════════════════════════════════════════════

  async listDocuments(companyId: string, candidateId: string) {
    await this.assertCandidateExists(companyId, candidateId);

    return platformPrisma.candidateDocument.findMany({
      where: { candidateId, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDocument(companyId: string, candidateId: string, data: any) {
    await this.assertCandidateExists(companyId, candidateId);

    return platformPrisma.candidateDocument.create({
      data: {
        candidateId,
        companyId,
        documentType: data.documentType,
        fileName: data.fileName,
        fileUrl: data.fileUrl,
      },
    });
  }

  async deleteDocument(companyId: string, id: string) {
    const existing = await platformPrisma.candidateDocument.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      throw ApiError.notFound('Document not found');
    }

    await platformPrisma.candidateDocument.delete({ where: { id } });
    return { deleted: true };
  }
}

export const candidateProfileService = new CandidateProfileService();
