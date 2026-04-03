import { platformPrisma } from '../../config/database';
import { ApiError } from '../../shared/errors';
import { logger } from '../../config/logger';
import { sendRegistrationNotification, sendRegistrationRejected } from '../../infrastructure/email/registration-emails';
import type { RegisterCompanyInput, UpdateRegistrationInput } from './registration.validators';
import type { RegistrationRequestStatus } from '@prisma/client';

export class RegistrationService {
  /**
   * Submit a new company registration request.
   * Checks for duplicate emails in both CompanyRegistrationRequest and User tables.
   */
  async submitRegistration(data: RegisterCompanyInput) {
    const normalizedEmail = data.email.toLowerCase().trim();

    // Check for duplicate in existing registration requests (pending only)
    const existingRequest = await platformPrisma.companyRegistrationRequest.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingRequest) {
      if (existingRequest.status === 'PENDING') {
        throw ApiError.conflict('A registration request with this email is already pending');
      }
      if (existingRequest.status === 'APPROVED') {
        throw ApiError.conflict('This email has already been registered and approved');
      }
      // If rejected, allow re-submission by deleting the old request
      await platformPrisma.companyRegistrationRequest.delete({
        where: { id: existingRequest.id },
      });
    }

    // Check for duplicate in existing users
    const existingUser = await platformPrisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw ApiError.conflict('An account with this email already exists');
    }

    // Create the registration request
    const request = await platformPrisma.companyRegistrationRequest.create({
      data: {
        companyName: data.companyName.trim(),
        adminName: data.adminName.trim(),
        email: normalizedEmail,
        phone: data.phone.trim(),
      },
    });

    // Send notification email to super admin (non-blocking)
    sendRegistrationNotification({
      companyName: request.companyName,
      adminName: request.adminName,
      email: request.email,
      phone: request.phone,
      requestId: request.id,
    }).catch((err) => {
      logger.error('Failed to send registration notification email', { error: err, requestId: request.id });
    });

    return {
      id: request.id,
      companyName: request.companyName,
      adminName: request.adminName,
      email: request.email,
      status: request.status,
      createdAt: request.createdAt,
    };
  }

  /**
   * List all registration requests (super admin).
   */
  async listRegistrations(params: {
    status?: RegistrationRequestStatus;
    page: number;
    limit: number;
    offset: number;
  }) {
    const where: any = {};
    if (params.status) {
      where.status = params.status;
    }

    const [requests, total] = await Promise.all([
      platformPrisma.companyRegistrationRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: params.offset,
        take: params.limit,
      }),
      platformPrisma.companyRegistrationRequest.count({ where }),
    ]);

    return { requests, total };
  }

  /**
   * Get a single registration request by ID (super admin).
   */
  async getRegistration(id: string) {
    const request = await platformPrisma.companyRegistrationRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw ApiError.notFound('Registration request not found');
    }
    return request;
  }

  /**
   * Approve or reject a registration request (super admin).
   * On rejection, sends rejection email. Approval is handled by a separate
   * provisioning flow (Task 8) — this just updates the status.
   */
  async updateRegistration(id: string, data: UpdateRegistrationInput) {
    const request = await platformPrisma.companyRegistrationRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw ApiError.notFound('Registration request not found');
    }
    if (request.status !== 'PENDING') {
      throw ApiError.badRequest(`Cannot update a request that is already ${request.status.toLowerCase()}`);
    }

    const updated = await platformPrisma.companyRegistrationRequest.update({
      where: { id },
      data: {
        status: data.status,
        ...(data.status === 'REJECTED' ? { rejectionReason: data.rejectionReason } : {}),
      },
    });

    // On rejection, send rejection email (non-blocking)
    if (data.status === 'REJECTED') {
      sendRegistrationRejected({
        email: request.email,
        adminName: request.adminName,
        companyName: request.companyName,
        rejectionReason: data.rejectionReason,
      }).catch((err) => {
        logger.error('Failed to send registration rejection email', { error: err, requestId: id });
      });
    }

    return updated;
  }
}

export const registrationService = new RegistrationService();
