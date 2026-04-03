import {
  listRegistrationsQuerySchema,
  registerCompanySchema,
  updateRegistrationSchema,
} from '../registration.validators';

describe('registerCompanySchema', () => {
  it('accepts valid payload', () => {
    const r = registerCompanySchema.safeParse({
      companyName: 'Acme',
      adminName: 'Jane',
      email: 'j@acme.com',
      phone: '9876543210',
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const r = registerCompanySchema.safeParse({
      companyName: 'Acme',
      adminName: 'Jane',
      email: 'bad',
      phone: '9876543210',
    });
    expect(r.success).toBe(false);
  });
});

describe('listRegistrationsQuerySchema', () => {
  it('accepts optional valid status', () => {
    expect(listRegistrationsQuerySchema.safeParse({ status: 'PENDING' }).success).toBe(true);
    expect(listRegistrationsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('rejects invalid status', () => {
    const r = listRegistrationsQuerySchema.safeParse({ status: 'INVALID' });
    expect(r.success).toBe(false);
  });
});

describe('updateRegistrationSchema', () => {
  it('requires rejection reason when rejecting', () => {
    const r = updateRegistrationSchema.safeParse({ status: 'REJECTED' });
    expect(r.success).toBe(false);
  });

  it('rejects whitespace-only rejection reason', () => {
    const r = updateRegistrationSchema.safeParse({
      status: 'REJECTED',
      rejectionReason: '   \t  ',
    });
    expect(r.success).toBe(false);
  });

  it('accepts reject with reason', () => {
    const r = updateRegistrationSchema.safeParse({
      status: 'REJECTED',
      rejectionReason: 'Does not qualify',
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.status === 'REJECTED') {
      expect(r.data.rejectionReason).toBe('Does not qualify');
    }
  });

  it('trims rejection reason in output', () => {
    const r = updateRegistrationSchema.safeParse({
      status: 'REJECTED',
      rejectionReason: '  spaced  ',
    });
    expect(r.success).toBe(true);
    if (r.success && r.data.status === 'REJECTED') {
      expect(r.data.rejectionReason).toBe('spaced');
    }
  });

  it('accepts approve without rejectionReason', () => {
    const r = updateRegistrationSchema.safeParse({ status: 'APPROVED' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.status).toBe('APPROVED');
    }
  });
});
