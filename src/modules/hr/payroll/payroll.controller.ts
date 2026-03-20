import { Request, Response } from 'express';
import { payrollConfigService } from './payroll.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createSalaryComponentSchema,
  updateSalaryComponentSchema,
  createSalaryStructureSchema,
  updateSalaryStructureSchema,
  createEmployeeSalarySchema,
  updateEmployeeSalarySchema,
  pfConfigSchema,
  esiConfigSchema,
  createPTConfigSchema,
  updatePTConfigSchema,
  gratuityConfigSchema,
  bonusConfigSchema,
  createLWFConfigSchema,
  updateLWFConfigSchema,
  bankConfigSchema,
  createLoanPolicySchema,
  updateLoanPolicySchema,
  createLoanRecordSchema,
  updateLoanRecordSchema,
  updateLoanStatusSchema,
  taxConfigSchema,
} from './payroll.validators';

export class PayrollController {
  // ── Salary Components ────────────────────────────────────────────────

  listSalaryComponents = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.search) opts.search = req.query.search as string;
    const result = await payrollConfigService.listSalaryComponents(companyId, opts);
    res.json(createPaginatedResponse(result.components, result.page, result.limit, result.total, 'Salary components retrieved'));
  });

  getSalaryComponent = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const component = await payrollConfigService.getSalaryComponent(companyId, req.params.id!);
    res.json(createSuccessResponse(component, 'Salary component retrieved'));
  });

  createSalaryComponent = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createSalaryComponentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const component = await payrollConfigService.createSalaryComponent(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(component, 'Salary component created'));
  });

  updateSalaryComponent = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateSalaryComponentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const component = await payrollConfigService.updateSalaryComponent(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(component, 'Salary component updated'));
  });

  deleteSalaryComponent = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await payrollConfigService.deleteSalaryComponent(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Salary component deleted'));
  });

  // ── Salary Structures ────────────────────────────────────────────────

  listSalaryStructures = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.search) opts.search = req.query.search as string;
    const result = await payrollConfigService.listSalaryStructures(companyId, opts);
    res.json(createPaginatedResponse(result.structures, result.page, result.limit, result.total, 'Salary structures retrieved'));
  });

  getSalaryStructure = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const structure = await payrollConfigService.getSalaryStructure(companyId, req.params.id!);
    res.json(createSuccessResponse(structure, 'Salary structure retrieved'));
  });

  createSalaryStructure = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createSalaryStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const structure = await payrollConfigService.createSalaryStructure(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(structure, 'Salary structure created'));
  });

  updateSalaryStructure = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateSalaryStructureSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const structure = await payrollConfigService.updateSalaryStructure(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(structure, 'Salary structure updated'));
  });

  deleteSalaryStructure = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await payrollConfigService.deleteSalaryStructure(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Salary structure deleted'));
  });

  // ── Employee Salary ──────────────────────────────────────────────────

  listEmployeeSalaries = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.isCurrent !== undefined) opts.isCurrent = req.query.isCurrent === 'true';

    const result = await payrollConfigService.listEmployeeSalaries(companyId, opts);
    res.json(createPaginatedResponse(result.salaries, result.page, result.limit, result.total, 'Employee salaries retrieved'));
  });

  getEmployeeSalary = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const salary = await payrollConfigService.getEmployeeSalary(companyId, req.params.id!);
    res.json(createSuccessResponse(salary, 'Employee salary retrieved'));
  });

  assignSalary = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createEmployeeSalarySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const salary = await payrollConfigService.assignSalary(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(salary, 'Salary assigned'));
  });

  updateEmployeeSalary = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateEmployeeSalarySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const salary = await payrollConfigService.updateEmployeeSalary(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(salary, 'Employee salary updated'));
  });

  // ── PF Config ────────────────────────────────────────────────────────

  getPFConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const config = await payrollConfigService.getPFConfig(companyId);
    res.json(createSuccessResponse(config, 'PF config retrieved'));
  });

  updatePFConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = pfConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const config = await payrollConfigService.updatePFConfig(companyId, parsed.data);
    res.json(createSuccessResponse(config, 'PF config updated'));
  });

  // ── ESI Config ───────────────────────────────────────────────────────

  getESIConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const config = await payrollConfigService.getESIConfig(companyId);
    res.json(createSuccessResponse(config, 'ESI config retrieved'));
  });

  updateESIConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = esiConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const config = await payrollConfigService.updateESIConfig(companyId, parsed.data);
    res.json(createSuccessResponse(config, 'ESI config updated'));
  });

  // ── PT Config ────────────────────────────────────────────────────────

  listPTConfigs = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const configs = await payrollConfigService.listPTConfigs(companyId);
    res.json(createSuccessResponse(configs, 'PT configs retrieved'));
  });

  createPTConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createPTConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const config = await payrollConfigService.createPTConfig(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(config, 'PT config created'));
  });

  updatePTConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updatePTConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const config = await payrollConfigService.updatePTConfig(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(config, 'PT config updated'));
  });

  deletePTConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await payrollConfigService.deletePTConfig(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'PT config deleted'));
  });

  // ── Gratuity Config ──────────────────────────────────────────────────

  getGratuityConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const config = await payrollConfigService.getGratuityConfig(companyId);
    res.json(createSuccessResponse(config, 'Gratuity config retrieved'));
  });

  updateGratuityConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = gratuityConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const config = await payrollConfigService.updateGratuityConfig(companyId, parsed.data);
    res.json(createSuccessResponse(config, 'Gratuity config updated'));
  });

  // ── Bonus Config ─────────────────────────────────────────────────────

  getBonusConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const config = await payrollConfigService.getBonusConfig(companyId);
    res.json(createSuccessResponse(config, 'Bonus config retrieved'));
  });

  updateBonusConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = bonusConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const config = await payrollConfigService.updateBonusConfig(companyId, parsed.data);
    res.json(createSuccessResponse(config, 'Bonus config updated'));
  });

  // ── LWF Config ───────────────────────────────────────────────────────

  listLWFConfigs = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const configs = await payrollConfigService.listLWFConfigs(companyId);
    res.json(createSuccessResponse(configs, 'LWF configs retrieved'));
  });

  createLWFConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createLWFConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const config = await payrollConfigService.createLWFConfig(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(config, 'LWF config created'));
  });

  updateLWFConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateLWFConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const config = await payrollConfigService.updateLWFConfig(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(config, 'LWF config updated'));
  });

  deleteLWFConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await payrollConfigService.deleteLWFConfig(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'LWF config deleted'));
  });

  // ── Bank Config ──────────────────────────────────────────────────────

  getBankConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const config = await payrollConfigService.getBankConfig(companyId);
    res.json(createSuccessResponse(config, 'Bank config retrieved'));
  });

  updateBankConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = bankConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const config = await payrollConfigService.updateBankConfig(companyId, parsed.data);
    res.json(createSuccessResponse(config, 'Bank config updated'));
  });

  // ── Tax Config ───────────────────────────────────────────────────────

  getTaxConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const config = await payrollConfigService.getTaxConfig(companyId);
    res.json(createSuccessResponse(config, 'Tax config retrieved'));
  });

  updateTaxConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = taxConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const config = await payrollConfigService.updateTaxConfig(companyId, parsed.data);
    res.json(createSuccessResponse(config, 'Tax config updated'));
  });

  // ── Loan Policies ────────────────────────────────────────────────────

  listLoanPolicies = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.search) opts.search = req.query.search as string;
    const result = await payrollConfigService.listLoanPolicies(companyId, opts);
    res.json(createPaginatedResponse(result.policies, result.page, result.limit, result.total, 'Loan policies retrieved'));
  });

  getLoanPolicy = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const policy = await payrollConfigService.getLoanPolicy(companyId, req.params.id!);
    res.json(createSuccessResponse(policy, 'Loan policy retrieved'));
  });

  createLoanPolicy = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createLoanPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const policy = await payrollConfigService.createLoanPolicy(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(policy, 'Loan policy created'));
  });

  updateLoanPolicy = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateLoanPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const policy = await payrollConfigService.updateLoanPolicy(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(policy, 'Loan policy updated'));
  });

  deleteLoanPolicy = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await payrollConfigService.deleteLoanPolicy(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Loan policy deleted'));
  });

  // ── Loan Records ─────────────────────────────────────────────────────

  listLoans = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.status) opts.status = req.query.status as string;

    const result = await payrollConfigService.listLoans(companyId, opts);
    res.json(createPaginatedResponse(result.loans, result.page, result.limit, result.total, 'Loans retrieved'));
  });

  getLoan = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const loan = await payrollConfigService.getLoan(companyId, req.params.id!);
    res.json(createSuccessResponse(loan, 'Loan retrieved'));
  });

  createLoan = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createLoanRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const loan = await payrollConfigService.createLoan(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(loan, 'Loan created'));
  });

  updateLoan = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateLoanRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const loan = await payrollConfigService.updateLoan(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(loan, 'Loan updated'));
  });

  updateLoanStatus = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateLoanStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const loan = await payrollConfigService.updateLoanStatus(
      companyId,
      req.params.id!,
      parsed.data.status,
      parsed.data.approvedBy
    );
    res.json(createSuccessResponse(loan, `Loan status updated to ${parsed.data.status}`));
  });
}

export const payrollController = new PayrollController();
