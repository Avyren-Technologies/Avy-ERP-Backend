import { DateTime } from 'luxon';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { getCachedCompanySettings } from '../../../shared/utils/config-cache';

type IntentType =
  | 'LEAVE_BALANCE'
  | 'PAYSLIP'
  | 'ATTENDANCE'
  | 'HR_CONTACT'
  | 'POLICY'
  | 'HOLIDAY'
  | 'GREETING'
  | 'THANKS'
  | 'UNKNOWN';

interface IntentResult {
  intent: IntentType;
  message: string;
  data?: any;
}

class ChatbotService {
  // ── Intent Detection Patterns ──────────────────────────────────────

  private readonly INTENT_PATTERNS: { intent: IntentType; patterns: RegExp[] }[] = [
    {
      intent: 'LEAVE_BALANCE',
      patterns: [
        /leave\s*balance/i,
        /how\s*many\s*leaves/i,
        /remaining\s*leave/i,
        /leave\s*left/i,
        /cl\s*balance/i,
        /pl\s*balance/i,
      ],
    },
    {
      intent: 'PAYSLIP',
      patterns: [
        /payslip/i,
        /pay\s*slip/i,
        /salary\s*slip/i,
        /download\s*payslip/i,
        /my\s*salary/i,
      ],
    },
    {
      intent: 'ATTENDANCE',
      patterns: [
        /my\s*attendance/i,
        /attendance\s*status/i,
        /present\s*days/i,
        /absent\s*days/i,
      ],
    },
    {
      intent: 'HR_CONTACT',
      patterns: [
        /hr\s*contact/i,
        /contact\s*hr/i,
        /speak\s*to\s*hr/i,
        /talk\s*to\s*hr/i,
        /escalate/i,
      ],
    },
    {
      intent: 'POLICY',
      patterns: [
        /policy/i,
        /leave\s*policy/i,
        /attendance\s*policy/i,
        /wfh/i,
        /work\s*from\s*home/i,
      ],
    },
    {
      intent: 'HOLIDAY',
      patterns: [
        /holiday/i,
        /next\s*holiday/i,
        /upcoming\s*holiday/i,
        /holiday\s*list/i,
      ],
    },
    {
      intent: 'GREETING',
      patterns: [/^(hi|hello|hey|good\s*(morning|afternoon|evening))/i],
    },
    {
      intent: 'THANKS',
      patterns: [/thank/i, /thanks/i, /bye/i, /goodbye/i],
    },
  ];

  // ── Public Methods ─────────────────────────────────────────────────

  async startConversation(companyId: string, userId: string, channel: string = 'WEB') {
    // Resolve employee ID from user — userId might be a User ID or an Employee ID
    let employeeId = userId;
    const employee = await platformPrisma.employee.findFirst({
      where: { id: userId, companyId },
      select: { id: true },
    });
    if (!employee) {
      // Try finding employee linked to this user
      const user = await platformPrisma.user.findUnique({
        where: { id: userId },
        select: { employeeId: true },
      });
      if (user?.employeeId) {
        employeeId = user.employeeId;
      } else {
        throw ApiError.badRequest('No employee record found for this user. Chatbot requires an employee profile.');
      }
    }

    const conversation = await platformPrisma.chatConversation.create({
      data: {
        employeeId,
        channel: channel as any,
        status: 'ACTIVE',
        companyId,
      },
    });

    return conversation;
  }

  async sendMessage(companyId: string, conversationId: string, employeeId: string, content: string) {
    // Validate conversation exists, belongs to employee, and is ACTIVE
    const conversation = await platformPrisma.chatConversation.findFirst({
      where: {
        id: conversationId,
        companyId,
        employeeId,
      },
    });

    if (!conversation) {
      throw ApiError.notFound('Conversation not found');
    }

    if (conversation.status !== 'ACTIVE') {
      throw ApiError.badRequest(`Conversation is ${conversation.status.toLowerCase()} and cannot accept new messages`);
    }

    // Save user message
    await platformPrisma.chatMessage.create({
      data: {
        conversationId,
        role: 'USER',
        content,
      },
    });

    // Detect intent and execute
    const intent = this.detectIntent(content);
    const result = await this.executeIntent(intent, companyId, employeeId);

    // Save assistant message
    const assistantMessage = await platformPrisma.chatMessage.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        content: result.message,
        intent: result.intent,
        metadata: result.data ? (result.data as any) : undefined,
      },
    });

    return {
      intent: result.intent,
      message: result.message,
      data: result.data,
      messageId: assistantMessage.id,
    };
  }

  async getConversationHistory(companyId: string, conversationId: string, employeeId: string) {
    const conversation = await platformPrisma.chatConversation.findFirst({
      where: {
        id: conversationId,
        companyId,
        employeeId,
      },
    });

    if (!conversation) {
      throw ApiError.notFound('Conversation not found');
    }

    const messages = await platformPrisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    return { conversation, messages };
  }

  async listConversations(companyId: string, employeeId: string) {
    const conversations = await platformPrisma.chatConversation.findMany({
      where: {
        companyId,
        employeeId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return conversations;
  }

  async escalateToHR(companyId: string, conversationId: string) {
    const conversation = await platformPrisma.chatConversation.findFirst({
      where: {
        id: conversationId,
        companyId,
      },
    });

    if (!conversation) {
      throw ApiError.notFound('Conversation not found');
    }

    if (conversation.status !== 'ACTIVE') {
      throw ApiError.badRequest('Only active conversations can be escalated');
    }

    const updated = await platformPrisma.chatConversation.update({
      where: { id: conversationId },
      data: { status: 'ESCALATED' },
    });

    // Add system message about escalation
    await platformPrisma.chatMessage.create({
      data: {
        conversationId,
        role: 'SYSTEM',
        content: 'This conversation has been escalated to HR. A representative will get back to you shortly.',
        intent: 'HR_CONTACT',
      },
    });

    return updated;
  }

  async closeConversation(companyId: string, conversationId: string) {
    const conversation = await platformPrisma.chatConversation.findFirst({
      where: {
        id: conversationId,
        companyId,
      },
    });

    if (!conversation) {
      throw ApiError.notFound('Conversation not found');
    }

    if (conversation.status === 'CLOSED') {
      throw ApiError.badRequest('Conversation is already closed');
    }

    const updated = await platformPrisma.chatConversation.update({
      where: { id: conversationId },
      data: { status: 'CLOSED' },
    });

    return updated;
  }

  // ── Private Methods ────────────────────────────────────────────────

  private detectIntent(content: string): IntentType {
    for (const { intent, patterns } of this.INTENT_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          return intent;
        }
      }
    }
    return 'UNKNOWN';
  }

  private async executeIntent(intent: IntentType, companyId: string, employeeId: string): Promise<IntentResult> {
    switch (intent) {
      case 'LEAVE_BALANCE':
        return this.handleLeaveBalance(companyId, employeeId);
      case 'PAYSLIP':
        return this.handlePayslip(companyId, employeeId);
      case 'ATTENDANCE':
        return this.handleAttendance(companyId, employeeId);
      case 'HOLIDAY':
        return this.handleHoliday(companyId);
      case 'HR_CONTACT':
        return this.handleHRContact();
      case 'POLICY':
        return this.handlePolicy();
      case 'GREETING':
        return this.handleGreeting();
      case 'THANKS':
        return this.handleThanks();
      default:
        return this.handleUnknown();
    }
  }

  private async handleLeaveBalance(companyId: string, employeeId: string): Promise<IntentResult> {
    try {
      const companySettings = await getCachedCompanySettings(companyId);
      const companyTimezone = companySettings?.timezone ?? 'Asia/Kolkata';
      const currentYear = DateTime.now().setZone(companyTimezone).year;
      const balances = await platformPrisma.leaveBalance.findMany({
        where: {
          employeeId,
          companyId,
          year: currentYear,
        },
        include: {
          leaveType: {
            select: { name: true, code: true },
          },
        },
      });

      if (!balances.length) {
        return {
          intent: 'LEAVE_BALANCE',
          message: `No leave balances found for the current year (${currentYear}). Please contact HR if you believe this is an error.`,
        };
      }

      const lines = balances.map(
        (b: any) =>
          `- ${b.leaveType.name} (${b.leaveType.code}): ${b.balance} remaining out of ${b.entitled} entitled (${b.taken} taken, ${b.adjustments} adjustments)`
      );

      return {
        intent: 'LEAVE_BALANCE',
        message: `Here are your leave balances for ${currentYear}:\n\n${lines.join('\n')}`,
        data: balances.map((b: any) => ({
          leaveType: b.leaveType.name,
          code: b.leaveType.code,
          entitled: b.entitled,
          taken: b.taken,
          balance: b.balance,
          adjustments: b.adjustments,
        })),
      };
    } catch {
      return {
        intent: 'LEAVE_BALANCE',
        message: 'I was unable to fetch your leave balance at the moment. Please try again later or check the ESS portal.',
      };
    }
  }

  private async handlePayslip(companyId: string, employeeId: string): Promise<IntentResult> {
    try {
      const latestPayslip = await platformPrisma.payslip.findFirst({
        where: {
          employeeId,
          companyId,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!latestPayslip) {
        return {
          intent: 'PAYSLIP',
          message: 'No payslips found. Your payslips will be available here once payroll has been processed.',
        };
      }

      return {
        intent: 'PAYSLIP',
        message: `Your latest payslip:\n\n- Period: ${latestPayslip.month}/${latestPayslip.year}\n- Gross: ${latestPayslip.grossEarnings}\n- Net: ${latestPayslip.netPay}\n\nYou can download the full payslip from the ESS portal under "My Payslips".`,
        data: {
          month: latestPayslip.month,
          year: latestPayslip.year,
          grossEarnings: latestPayslip.grossEarnings,
          netPay: latestPayslip.netPay,
        },
      };
    } catch {
      return {
        intent: 'PAYSLIP',
        message: 'I was unable to fetch your payslip details at the moment. Please try again later or check the ESS portal.',
      };
    }
  }

  private async handleAttendance(companyId: string, employeeId: string): Promise<IntentResult> {
    try {
      const companySettings = await getCachedCompanySettings(companyId);
      const companyTimezone = companySettings?.timezone ?? 'Asia/Kolkata';
      const now = DateTime.now().setZone(companyTimezone);
      const startOfMonth = now.startOf('month').toJSDate();
      const endOfMonth = now.endOf('month').toJSDate();

      const records = await platformPrisma.attendanceRecord.findMany({
        where: {
          employeeId,
          companyId,
          date: {
            gte: startOfMonth,
            lte: endOfMonth,
          },
        },
      });

      const statusCounts: Record<string, number> = {};
      for (const record of records) {
        const status = record.status || 'UNKNOWN';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }

      const monthName = now.toFormat('MMMM yyyy');
      const lines = Object.entries(statusCounts).map(
        ([status, count]) => `- ${status}: ${count} day(s)`
      );

      return {
        intent: 'ATTENDANCE',
        message: lines.length
          ? `Your attendance summary for ${monthName}:\n\n${lines.join('\n')}\n\nTotal records: ${records.length}`
          : `No attendance records found for ${monthName} yet.`,
        data: { month: monthName, totalRecords: records.length, summary: statusCounts },
      };
    } catch {
      return {
        intent: 'ATTENDANCE',
        message: 'I was unable to fetch your attendance at the moment. Please try again later or check the ESS portal.',
      };
    }
  }

  private async handleHoliday(companyId: string): Promise<IntentResult> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const holidays = await platformPrisma.holidayCalendar.findMany({
        where: {
          companyId,
          date: { gte: today },
        },
        orderBy: { date: 'asc' },
        take: 5,
      });

      if (!holidays.length) {
        return {
          intent: 'HOLIDAY',
          message: 'No upcoming holidays found. Please check with HR for the latest holiday calendar.',
        };
      }

      const lines = holidays.map(
        (h: any) =>
          `- ${new Date(h.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}: ${h.name}${h.optional ? ' (Optional)' : ''}`
      );

      return {
        intent: 'HOLIDAY',
        message: `Upcoming holidays:\n\n${lines.join('\n')}`,
        data: holidays.map((h: any) => ({
          date: h.date,
          name: h.name,
          optional: h.optional || false,
        })),
      };
    } catch {
      return {
        intent: 'HOLIDAY',
        message: 'I was unable to fetch the holiday list at the moment. Please try again later.',
      };
    }
  }

  private handleHRContact(): IntentResult {
    return {
      intent: 'HR_CONTACT',
      message:
        'I can escalate this conversation to HR so a representative can assist you directly. Would you like me to escalate? You can also reply "escalate" to confirm.',
    };
  }

  private handlePolicy(): IntentResult {
    return {
      intent: 'POLICY',
      message:
        'You can find all company policies (leave, attendance, WFH, etc.) in the ESS portal under "Policy Documents". If you have a specific question about a policy, feel free to ask and I\'ll do my best to help!',
    };
  }

  private handleGreeting(): IntentResult {
    return {
      intent: 'GREETING',
      message:
        'Hello! I\'m your HR assistant. Here\'s what I can help you with:\n\n' +
        '- Leave balance\n' +
        '- Payslip details\n' +
        '- Attendance summary\n' +
        '- Upcoming holidays\n' +
        '- Company policies\n' +
        '- Connect with HR\n\n' +
        'How can I help you today?',
    };
  }

  private handleThanks(): IntentResult {
    return {
      intent: 'THANKS',
      message: 'You\'re welcome! If you need anything else, feel free to start a new conversation. Have a great day!',
    };
  }

  private handleUnknown(): IntentResult {
    return {
      intent: 'UNKNOWN',
      message:
        'I\'m not sure I understand that. Here\'s what I can help with:\n\n' +
        '- Leave balance\n' +
        '- Payslip details\n' +
        '- Attendance summary\n' +
        '- Upcoming holidays\n' +
        '- Company policies\n' +
        '- Connect with HR\n\n' +
        'Would you like me to escalate this to HR instead?',
    };
  }
}

export const chatbotService = new ChatbotService();
