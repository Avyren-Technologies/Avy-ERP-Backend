/**
 * Unit tests for RegistrationService — duplicate checks, listing, and status transitions.
 *
 * HTTP validation (Zod) is covered indirectly via controller; these tests lock DB/email behavior.
 */

jest.mock('../../../config/database', () => ({
  platformPrisma: {
    companyRegistrationRequest: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../../infrastructure/email/registration-emails', () => ({
  sendRegistrationNotification: jest.fn().mockResolvedValue(undefined),
  sendRegistrationRejected: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { platformPrisma } from '../../../config/database';
import { sendRegistrationNotification, sendRegistrationRejected } from '../../../infrastructure/email/registration-emails';
import { registrationService } from '../registration.service';

const mockReg = platformPrisma.companyRegistrationRequest as any;
const mockUser = platformPrisma.user as any;

const validInput = {
  companyName: '  Acme  ',
  adminName: '  Jane  ',
  email: 'Apply@Example.COM',
  phone: ' 9876543210 ',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('RegistrationService.submitRegistration', () => {
  it('creates a request when no conflicts', async () => {
    mockReg.findUnique.mockResolvedValue(null);
    mockUser.findUnique.mockResolvedValue(null);
    mockReg.create.mockResolvedValue({
      id: 'new-1',
      companyName: 'Acme',
      adminName: 'Jane',
      email: 'apply@example.com',
      phone: '9876543210',
      status: 'PENDING',
      createdAt: new Date('2026-01-01'),
    });

    const result = await registrationService.submitRegistration(validInput);

    expect(result.id).toBe('new-1');
    expect(mockReg.create).toHaveBeenCalledWith({
      data: {
        companyName: 'Acme',
        adminName: 'Jane',
        email: 'apply@example.com',
        phone: '9876543210',
      },
    });
    expect(sendRegistrationNotification).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'new-1', email: 'apply@example.com' })
    );
  });

  it('throws conflict when a PENDING request exists for the email', async () => {
    mockReg.findUnique.mockResolvedValue({ id: 'x', status: 'PENDING' });

    await expect(registrationService.submitRegistration(validInput)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockReg.create).not.toHaveBeenCalled();
  });

  it('throws conflict when request was already APPROVED', async () => {
    mockReg.findUnique.mockResolvedValue({ id: 'x', status: 'APPROVED' });

    await expect(registrationService.submitRegistration(validInput)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockReg.create).not.toHaveBeenCalled();
  });

  it('throws conflict when a User already exists', async () => {
    mockReg.findUnique.mockResolvedValue(null);
    mockUser.findUnique.mockResolvedValue({ id: 'user-1' });

    await expect(registrationService.submitRegistration(validInput)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockReg.create).not.toHaveBeenCalled();
  });

  it('deletes a REJECTED request and creates a new one', async () => {
    mockReg.findUnique.mockResolvedValue({
      id: 'old',
      status: 'REJECTED',
      email: 'apply@example.com',
    });
    mockReg.delete.mockResolvedValue({});
    mockUser.findUnique.mockResolvedValue(null);
    mockReg.create.mockResolvedValue({
      id: 'new-2',
      companyName: 'Acme',
      adminName: 'Jane',
      email: 'apply@example.com',
      phone: '9876543210',
      status: 'PENDING',
      createdAt: new Date(),
    });

    await registrationService.submitRegistration(validInput);

    expect(mockReg.delete).toHaveBeenCalledWith({ where: { id: 'old' } });
    expect(mockReg.create).toHaveBeenCalled();
  });
});

describe('RegistrationService.listRegistrations', () => {
  it('applies status filter when provided', async () => {
    mockReg.findMany.mockResolvedValue([]);
    mockReg.count.mockResolvedValue(0);

    await registrationService.listRegistrations({
      status: 'PENDING',
      page: 1,
      limit: 10,
      offset: 0,
    });

    expect(mockReg.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PENDING' },
        skip: 0,
        take: 10,
      })
    );
  });
});

describe('RegistrationService.getRegistration', () => {
  it('throws not found when missing', async () => {
    mockReg.findUnique.mockResolvedValue(null);

    await expect(registrationService.getRegistration('missing')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('returns the row when present', async () => {
    const row = { id: 'r1', status: 'PENDING' };
    mockReg.findUnique.mockResolvedValue(row);

    const result = await registrationService.getRegistration('r1');
    expect(result).toBe(row);
  });
});

describe('RegistrationService.updateRegistration', () => {
  const pendingRow = {
    id: 'r1',
    status: 'PENDING',
    email: 'a@b.com',
    adminName: 'A',
    companyName: 'Co',
    phone: '1',
  };

  it('throws not found when request missing', async () => {
    mockReg.findUnique.mockResolvedValue(null);

    await expect(
      registrationService.updateRegistration('r1', { status: 'APPROVED' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws bad request when not PENDING', async () => {
    mockReg.findUnique.mockResolvedValue({ ...pendingRow, status: 'APPROVED' });

    await expect(
      registrationService.updateRegistration('r1', { status: 'REJECTED', rejectionReason: 'x' })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockReg.update).not.toHaveBeenCalled();
  });

  it('updates to REJECTED and triggers rejection email', async () => {
    mockReg.findUnique.mockResolvedValue(pendingRow);
    mockReg.update.mockResolvedValue({ ...pendingRow, status: 'REJECTED', rejectionReason: 'No' });

    await registrationService.updateRegistration('r1', {
      status: 'REJECTED',
      rejectionReason: 'No',
    });

    expect(mockReg.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: 'REJECTED', rejectionReason: 'No' },
    });
    expect(sendRegistrationRejected).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.com', rejectionReason: 'No' })
    );
  });

  it('updates to APPROVED without rejection email', async () => {
    mockReg.findUnique.mockResolvedValue(pendingRow);
    mockReg.update.mockResolvedValue({ ...pendingRow, status: 'APPROVED' });

    await registrationService.updateRegistration('r1', { status: 'APPROVED' });

    expect(mockReg.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { status: 'APPROVED' },
    });
    expect(sendRegistrationRejected).not.toHaveBeenCalled();
  });
});
