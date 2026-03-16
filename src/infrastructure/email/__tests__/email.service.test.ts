/**
 * Unit tests for email service
 *
 * Source file: src/infrastructure/email/email.service.ts
 *
 * Strategy:
 *   - Mock nodemailer at module level so no real SMTP calls occur.
 *   - Reset the module registry between "SMTP configured" and "Ethereal fallback"
 *     test groups so the module-level `transporter` singleton is reinitialised.
 */

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Shared mock setup — sendMail spy we reuse across tests
// ---------------------------------------------------------------------------
const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'mock-msg-id-123' });
const mockCreateTransport = jest.fn().mockReturnValue({ sendMail: mockSendMail });
const mockCreateTestAccount = jest.fn().mockResolvedValue({
  user: 'ethereal-user@ethereal.email',
  pass: 'ethereal-pass',
});
const mockGetTestMessageUrl = jest.fn().mockReturnValue('https://ethereal.email/message/preview');

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: mockCreateTransport,
    createTestAccount: mockCreateTestAccount,
    getTestMessageUrl: mockGetTestMessageUrl,
  },
  createTransport: mockCreateTransport,
  createTestAccount: mockCreateTestAccount,
  getTestMessageUrl: mockGetTestMessageUrl,
}));

// ---------------------------------------------------------------------------
// Helper: reset module registry so the `transporter` singleton is fresh
// ---------------------------------------------------------------------------
function freshEmailModule() {
  jest.resetModules();
  // Re-apply the mock after resetModules (mocks survive resetModules in Jest)
  return require('../email.service');
}

// ---------------------------------------------------------------------------
// Tests: SMTP configured path
// ---------------------------------------------------------------------------

describe('Email service — SMTP configured', () => {
  let sendEmail: (to: string, subject: string, html: string, text?: string) => Promise<void>;
  let sendPasswordResetCode: (to: string, code: string, firstName: string) => Promise<void>;

  beforeAll(() => {
    // Configure SMTP env vars
    process.env['SMTP_HOST'] = 'smtp.example.com';
    process.env['SMTP_USER'] = 'user@example.com';
    process.env['SMTP_PASS'] = 'secret';
    process.env['SMTP_PORT'] = '587';
    process.env['FROM_EMAIL'] = 'noreply@avyerp.com';
    process.env['FROM_NAME'] = 'Avy ERP';
    process.env['APP_NAME'] = 'Avy ERP';

    mockCreateTransport.mockClear();
    mockSendMail.mockClear();

    const mod = freshEmailModule();
    sendEmail = mod.sendEmail;
    sendPasswordResetCode = mod.sendPasswordResetCode;
  });

  afterAll(() => {
    // Restore env to the original empty values from setup.ts
    process.env['SMTP_HOST'] = '';
    process.env['SMTP_USER'] = '';
    process.env['SMTP_PASS'] = '';
  });

  it('should call createTransport with SMTP credentials (not Ethereal)', async () => {
    await sendEmail('recipient@example.com', 'Test Subject', '<p>Hello</p>');

    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        auth: expect.objectContaining({ user: 'user@example.com' }),
      })
    );
    expect(mockCreateTestAccount).not.toHaveBeenCalled();
  });

  it('should call sendMail with the correct to/subject/html parameters', async () => {
    await sendEmail('recipient@example.com', 'Hello World', '<b>Hi</b>');

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'recipient@example.com',
        subject: 'Hello World',
        html: '<b>Hi</b>',
        from: expect.stringContaining('noreply@avyerp.com'),
      })
    );
  });

  it('should derive text from html by stripping tags when text param is omitted', async () => {
    await sendEmail('r@x.com', 'Subject', '<p>Hello World</p>');

    const call = mockSendMail.mock.calls[mockSendMail.mock.calls.length - 1];
    expect(call[0].text).toBe('Hello World');
  });

  it('should use provided text param when given', async () => {
    await sendEmail('r@x.com', 'Subj', '<p>Hi</p>', 'Plain text version');

    const call = mockSendMail.mock.calls[mockSendMail.mock.calls.length - 1];
    expect(call[0].text).toBe('Plain text version');
  });

  it('should re-throw errors from sendMail', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP connection refused'));

    await expect(sendEmail('r@x.com', 'S', '<p>body</p>'))
      .rejects.toThrow('SMTP connection refused');
  });

  describe('sendPasswordResetCode', () => {
    it('should call sendMail with the 6-digit code visible in the HTML body', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-1' });

      await sendPasswordResetCode('alice@acme.com', '123456', 'Alice');

      const call = mockSendMail.mock.calls[mockSendMail.mock.calls.length - 1];
      expect(call[0].to).toBe('alice@acme.com');
      expect(call[0].html).toContain('123456');
      expect(call[0].html).toContain('Alice');
      // Should mention 15-minute expiry
      expect(call[0].html).toContain('15 minutes');
    });

    it('should use APP_NAME in the email subject', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'msg-2' });

      await sendPasswordResetCode('alice@acme.com', '654321', 'Alice');

      const call = mockSendMail.mock.calls[mockSendMail.mock.calls.length - 1];
      expect(call[0].subject).toContain('Avy ERP');
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: Ethereal fallback path (no SMTP env vars)
// ---------------------------------------------------------------------------

describe('Email service — Ethereal fallback when SMTP not configured', () => {
  let sendEmail: (to: string, subject: string, html: string) => Promise<void>;

  beforeAll(() => {
    // Ensure SMTP vars are absent (as in test environment)
    process.env['SMTP_HOST'] = '';
    process.env['SMTP_USER'] = '';
    process.env['SMTP_PASS'] = '';

    mockCreateTransport.mockClear();
    mockCreateTestAccount.mockClear();
    mockSendMail.mockClear();
    // Ensure mockSendMail is still set on the mocked transporter
    mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });

    const mod = freshEmailModule();
    sendEmail = mod.sendEmail;
  });

  it('should call createTestAccount to get Ethereal credentials', async () => {
    await sendEmail('r@x.com', 'Subj', '<p>body</p>');

    expect(mockCreateTestAccount).toHaveBeenCalledTimes(1);
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.ethereal.email' })
    );
  });

  it('should reuse the existing transporter on subsequent sends (singleton)', async () => {
    // Second call — transporter already initialised
    await sendEmail('r2@x.com', 'Subj2', '<p>body2</p>');

    // createTestAccount should NOT be called again — transporter is reused (singleton)
    expect(mockCreateTestAccount).not.toHaveBeenCalled();
  });

  it('should still deliver the email via sendMail even on Ethereal path', async () => {
    await sendEmail('r3@x.com', 'Subj3', '<p>Hello</p>');

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'r3@x.com' })
    );
  });
});
