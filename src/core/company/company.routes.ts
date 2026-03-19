import { Router } from 'express';
import { companyController } from './company.controller';

const router = Router();

// All company routes are mounted under /platform/companies
// which already has platform:admin permission from the main router

// List companies (paginated, searchable, filterable)
router.get('/', companyController.listCompanies);

// Get full company detail
router.get('/:companyId', companyController.getCompany);

// Section-based partial update
router.patch('/:companyId/sections/:sectionKey', companyController.updateCompanySection);

// Update company wizard status
router.put('/:companyId/status', companyController.updateCompanyStatus);

// Delete company
router.delete('/:companyId', companyController.deleteCompany);

export { router as companyRoutes };
