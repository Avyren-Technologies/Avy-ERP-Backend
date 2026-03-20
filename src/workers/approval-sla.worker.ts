import { platformPrisma } from '../config/database';
import { logger } from '../config/logger';

export async function processApprovalSLAs() {
  logger.info('Running approval SLA enforcement...');

  // Find all PENDING/IN_PROGRESS requests
  const requests = await platformPrisma.approvalRequest.findMany({
    where: { status: { in: ['PENDING', 'IN_PROGRESS'] } },
    include: { workflow: true },
  });

  const now = new Date();
  let escalated = 0;
  let autoApproved = 0;
  let autoRejected = 0;

  for (const request of requests) {
    const steps = request.workflow.steps as any[];
    const currentStepConfig = steps.find((s: any) => s.stepOrder === request.currentStep);
    if (!currentStepConfig || !currentStepConfig.slaHours) continue;

    // Calculate SLA deadline
    const lastAction = (request.stepHistory as any[])?.slice(-1)[0];
    const stepStartTime = lastAction ? new Date(lastAction.at) : request.createdAt;
    const slaDeadline = new Date(stepStartTime.getTime() + currentStepConfig.slaHours * 3600000);

    if (now <= slaDeadline) continue; // SLA not breached yet

    // SLA breached — take action based on config
    const historyEntry = {
      step: request.currentStep,
      action: 'system',
      by: 'SYSTEM_SLA',
      at: now.toISOString(),
      note: `SLA of ${currentStepConfig.slaHours}h breached`,
    };
    const updatedHistory = [...((request.stepHistory as any[]) ?? []), historyEntry];

    if (currentStepConfig.autoApprove) {
      // Auto-approve this step
      const isLastStep = request.currentStep >= steps.length;
      await platformPrisma.approvalRequest.update({
        where: { id: request.id },
        data: {
          status: isLastStep ? 'AUTO_APPROVED' : 'IN_PROGRESS',
          currentStep: isLastStep ? request.currentStep : request.currentStep + 1,
          stepHistory: updatedHistory,
        },
      });
      autoApproved++;
    } else if (currentStepConfig.autoReject) {
      await platformPrisma.approvalRequest.update({
        where: { id: request.id },
        data: { status: 'AUTO_REJECTED', stepHistory: updatedHistory },
      });
      autoRejected++;
    } else if (currentStepConfig.autoEscalate) {
      await platformPrisma.approvalRequest.update({
        where: { id: request.id },
        data: { status: 'ESCALATED', stepHistory: updatedHistory },
      });
      escalated++;
    }
  }

  logger.info(`SLA enforcement complete: ${escalated} escalated, ${autoApproved} auto-approved, ${autoRejected} auto-rejected`);
}
