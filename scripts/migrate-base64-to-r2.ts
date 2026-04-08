/**
 * One-time migration: base64 data URLs in DB → Cloudflare R2 object keys.
 *
 * Run from avy-erp-backend root:
 *   npx tsx scripts/migrate-base64-to-r2.ts --dry-run
 *   npx tsx scripts/migrate-base64-to-r2.ts
 *   npx tsx scripts/migrate-base64-to-r2.ts --category=company-logo
 *
 * Requires: R2_* env vars, DATABASE_URL (platform). Tenant schemas use same URL + ?schema=...
 * Dependency: @aws-sdk/client-s3
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { writeFileSync, appendFileSync, existsSync, readFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

dotenv.config();

// ─── Configuration ────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const CATEGORY_FILTER = process.argv.find((a) => a.startsWith('--category='))?.split('=')[1];
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 200;

const LOG_FILE = 'migration-base64-to-r2.log';
const ROLLBACK_FILE = 'migration-rollback.json';

// ─── R2 Client ────────────────────────────────────────────────────────────────

const accountId = process.env.R2_ACCOUNT_ID!;
const endpoint = process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
const bucket = process.env.R2_BUCKET_NAME || 'avy-erp-files';

const s3 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// ─── Prisma Clients ───────────────────────────────────────────────────────────

const platformPrisma = new PrismaClient();

function getTenantPrisma(schemaName: string): PrismaClient {
  const baseUrl = process.env.DATABASE_URL!;
  const tenantUrl = baseUrl.includes('schema=')
    ? baseUrl.replace(/schema=[^&]+/, `schema=${schemaName}`)
    : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}schema=${schemaName}`;
  return new PrismaClient({ datasources: { db: { url: tenantUrl } } });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + '\n');
}

function isBase64DataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:');
}

function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error('Invalid data URL format');
  return {
    mimeType: match[1]!,
    buffer: Buffer.from(match[2]!, 'base64'),
  };
}

function getExtFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  };
  return map[mime] || 'bin';
}

async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const msg = String(e?.message ?? err);
  return (
    e?.code === 'P2021' ||
    msg.includes('does not exist') ||
    msg.includes('Unknown model') ||
    msg.includes('Unknown arg')
  );
}

// ─── Rollback Log ─────────────────────────────────────────────────────────────

interface RollbackEntry {
  table: string;
  id: string;
  field: string;
  oldValuePreview: string;
  newKey: string;
}

let rollbackEntries: RollbackEntry[] = [];

function loadExistingRollback(): void {
  if (existsSync(ROLLBACK_FILE)) {
    rollbackEntries = JSON.parse(readFileSync(ROLLBACK_FILE, 'utf-8'));
  }
}

function saveRollback(): void {
  writeFileSync(ROLLBACK_FILE, JSON.stringify(rollbackEntries, null, 2));
}

// ─── Field Migration Definitions ──────────────────────────────────────────────

interface FieldMigration {
  table: string;
  model: string;
  fields: string[];
  keyTemplate: (companyId: string, recordId: string, field: string, ext: string) => string;
  scope: 'platform' | 'tenant';
  category: string;
}

const MIGRATIONS: FieldMigration[] = [
  {
    table: 'Company',
    model: 'company',
    fields: ['logoUrl'],
    keyTemplate: (cId, _rId, _f, ext) => `${cId}/company/logo.${ext}`,
    scope: 'platform',
    category: 'company-logo',
  },
  {
    table: 'Invoice',
    model: 'invoice',
    fields: ['pdfUrl'],
    keyTemplate: (cId, rId, _f, _ext) => `${cId}/billing/${rId}.pdf`,
    scope: 'platform',
    category: 'billing-invoice',
  },
  {
    table: 'Employee',
    model: 'employee',
    fields: ['profilePhotoUrl'],
    keyTemplate: (cId, rId, _f, ext) => `${cId}/employees/${rId}/photo.${ext}`,
    scope: 'tenant',
    category: 'employee-photo',
  },
  {
    table: 'EmployeeEducation',
    model: 'employeeEducation',
    fields: ['certificateUrl'],
    keyTemplate: (cId, rId, _f, ext) => `${cId}/employees/${rId}/education/${uuidv4()}.${ext}`,
    scope: 'tenant',
    category: 'education-certificate',
  },
  {
    table: 'EmployeePrevEmployment',
    model: 'employeePrevEmployment',
    fields: ['experienceLetterUrl', 'relievingLetterUrl'],
    keyTemplate: (cId, rId, f, ext) => `${cId}/employees/${rId}/prev-employment/${f}-${uuidv4()}.${ext}`,
    scope: 'tenant',
    category: 'prev-employment-doc',
  },
  {
    table: 'EmployeeDocument',
    model: 'employeeDocument',
    fields: ['fileUrl'],
    keyTemplate: (cId, rId, _f, ext) => `${cId}/employees/${rId}/documents/${uuidv4()}.${ext}`,
    scope: 'tenant',
    category: 'employee-document',
  },
  {
    table: 'Candidate',
    model: 'candidate',
    fields: ['resumeUrl'],
    keyTemplate: (cId, rId, _f, ext) => `${cId}/recruitment/${rId}/resume.${ext}`,
    scope: 'tenant',
    category: 'recruitment-doc',
  },
  {
    table: 'CandidateOffer',
    model: 'candidateOffer',
    fields: ['offerLetterUrl'],
    keyTemplate: (cId, rId, _f, ext) => `${cId}/recruitment/${rId}/offer.${ext}`,
    scope: 'tenant',
    category: 'recruitment-doc',
  },
  {
    table: 'CandidateEducation',
    model: 'candidateEducation',
    fields: ['certificateUrl'],
    keyTemplate: (cId, rId, _f, ext) => `${cId}/recruitment/${rId}/education/${uuidv4()}.${ext}`,
    scope: 'tenant',
    category: 'education-certificate',
  },
  {
    table: 'CandidateDocument',
    model: 'candidateDocument',
    fields: ['fileUrl'],
    keyTemplate: (cId, rId, _f, ext) => `${cId}/recruitment/${rId}/documents/${uuidv4()}.${ext}`,
    scope: 'tenant',
    category: 'candidate-document',
  },
  {
    table: 'TrainingNomination',
    model: 'trainingNomination',
    fields: ['certificateUrl'],
    keyTemplate: (cId, rId, _f, ext) => `${cId}/training/certificates/${rId}.${ext}`,
    scope: 'tenant',
    category: 'training-certificate',
  },
  {
    table: 'TrainingMaterial',
    model: 'trainingMaterial',
    fields: ['url'],
    keyTemplate: (cId, rId, _f, ext) => `${cId}/training/${rId}.${ext}`,
    scope: 'tenant',
    category: 'training-material',
  },
  {
    table: 'HRLetter',
    model: 'hRLetter',
    fields: ['pdfUrl'],
    keyTemplate: (cId, rId, _f, _ext) => `${cId}/hr-letters/${rId}.pdf`,
    scope: 'tenant',
    category: 'hr-letter',
  },
  {
    table: 'AttendanceRecord',
    model: 'attendanceRecord',
    fields: ['checkInPhotoUrl', 'checkOutPhotoUrl'],
    keyTemplate: (cId, rId, f, ext) => {
      const type = f === 'checkInPhotoUrl' ? 'checkin' : 'checkout';
      return `${cId}/attendance/${rId}/${type}.${ext}`;
    },
    scope: 'tenant',
    category: 'attendance-photo',
  },
  {
    table: 'Payslip',
    model: 'payslip',
    fields: ['pdfUrl'],
    keyTemplate: (cId, rId, _f, _ext) => `${cId}/payroll/${rId}.pdf`,
    scope: 'tenant',
    category: 'payslip',
  },
  {
    table: 'SalaryRevision',
    model: 'salaryRevision',
    fields: ['revisionLetterUrl'],
    keyTemplate: (cId, rId, _f, _ext) => `${cId}/payroll/revisions/${rId}.pdf`,
    scope: 'tenant',
    category: 'salary-revision',
  },
  {
    table: 'FnFSettlement',
    model: 'fnFSettlement',
    fields: ['settlementLetterUrl'],
    keyTemplate: (cId, rId, _f, _ext) => `${cId}/offboarding/${rId}/settlement.pdf`,
    scope: 'tenant',
    category: 'offboarding-doc',
  },
  {
    table: 'EmployeeTransfer',
    model: 'employeeTransfer',
    fields: ['transferLetterUrl'],
    keyTemplate: (cId, rId, _f, _ext) => `${cId}/transfers/${rId}.pdf`,
    scope: 'tenant',
    category: 'transfer-letter',
  },
  {
    table: 'EmployeePromotion',
    model: 'employeePromotion',
    fields: ['promotionLetterUrl'],
    keyTemplate: (cId, rId, _f, _ext) => `${cId}/transfers/promotions/${rId}.pdf`,
    scope: 'tenant',
    category: 'transfer-letter',
  },
  {
    table: 'PolicyDocument',
    model: 'policyDocument',
    fields: ['fileUrl'],
    keyTemplate: (cId, rId, _f, ext) => `${cId}/policies/${rId}.${ext}`,
    scope: 'tenant',
    category: 'policy-document',
  },
];

// ─── JSON Field Migrations (ExpenseClaim receipts) ────────────────────────────

interface JsonFieldMigration {
  table: string;
  model: string;
  jsonField: string;
  scope: 'tenant';
  category: string;
}

const JSON_MIGRATIONS: JsonFieldMigration[] = [
  {
    table: 'ExpenseClaim',
    model: 'expenseClaim',
    jsonField: 'receipts',
    scope: 'tenant',
    category: 'expense-receipt',
  },
  {
    table: 'ExpenseClaimItem',
    model: 'expenseClaimItem',
    jsonField: 'receipts',
    scope: 'tenant',
    category: 'expense-receipt',
  },
];

// ─── Core Migration Logic ─────────────────────────────────────────────────────

interface MigrationStats {
  scanned: number;
  migrated: number;
  skipped: number;
  failed: number;
  failedIds: string[];
}

async function migrateStringFieldForRecord(
  prisma: PrismaClient,
  migration: FieldMigration,
  companyId: string,
  recordId: string,
): Promise<MigrationStats> {
  const stats: MigrationStats = { scanned: 0, migrated: 0, skipped: 0, failed: 0, failedIds: [] };
  const model = (prisma as any)[migration.model];
  if (!model) {
    log(`  WARNING: Model "${migration.model}" not found in Prisma client, skipping`);
    return stats;
  }

  const select: Record<string, boolean> = { id: true };
  for (const f of migration.fields) select[f] = true;

  let record: Record<string, unknown> | null;
  try {
    record = await model.findUnique({
      where: { id: recordId },
      select,
    });
  } catch (err: unknown) {
    if (isMissingTableError(err)) {
      log(`  WARNING: Skipping ${migration.table} (table/model missing)`);
      return stats;
    }
    throw err;
  }

  if (!record) return stats;

  for (const field of migration.fields) {
    stats.scanned++;
    const value = record[field];
    if (!isBase64DataUrl(value)) {
      stats.skipped++;
      continue;
    }

    try {
      const { mimeType, buffer } = parseDataUrl(value);
      const ext = getExtFromMime(mimeType);
      const key = migration.keyTemplate(companyId, String(record.id), field, ext);

      if (DRY_RUN) {
        log(
          `  [DRY-RUN] Would migrate ${migration.table}.${field} id=${String(record.id)} → ${key} (${buffer.length} bytes)`,
        );
        stats.migrated++;
        continue;
      }

      await uploadToR2(key, buffer, mimeType);
      await model.update({ where: { id: record.id }, data: { [field]: key } });

      rollbackEntries.push({
        table: migration.table,
        id: String(record.id),
        field,
        oldValuePreview: value.substring(0, 100),
        newKey: key,
      });

      stats.migrated++;
      log(`  Migrated ${migration.table}.${field} id=${String(record.id)} → ${key}`);
    } catch (err: unknown) {
      stats.failed++;
      stats.failedIds.push(String(record.id));
      log(`  ERROR ${migration.table}.${field} id=${String(record.id)}: ${String((err as Error).message)}`);
    }
  }

  return stats;
}

async function migrateStringField(
  prisma: PrismaClient,
  migration: FieldMigration,
  companyId: string,
): Promise<MigrationStats> {
  const stats: MigrationStats = { scanned: 0, migrated: 0, skipped: 0, failed: 0, failedIds: [] };
  const model = (prisma as any)[migration.model];
  if (!model) {
    log(`  WARNING: Model "${migration.model}" not found in Prisma client, skipping`);
    return stats;
  }

  for (const field of migration.fields) {
    let skip = 0;
    while (true) {
      let records: { id: string; [k: string]: unknown }[];
      try {
        records = await model.findMany({
          select: { id: true, [field]: true },
          take: BATCH_SIZE,
          skip,
        });
      } catch (err: unknown) {
        if (isMissingTableError(err)) {
          log(`  WARNING: Skipping ${migration.table}.${field} (table/model missing in this tenant schema)`);
          break;
        }
        throw err;
      }

      if (records.length === 0) break;

      for (const record of records) {
        stats.scanned++;
        const value = record[field];

        if (!isBase64DataUrl(value)) {
          stats.skipped++;
          continue;
        }

        try {
          const { mimeType, buffer } = parseDataUrl(value);
          const ext = getExtFromMime(mimeType);
          const key = migration.keyTemplate(companyId, record.id, field, ext);

          if (DRY_RUN) {
            log(`  [DRY-RUN] Would migrate ${migration.table}.${field} id=${record.id} → ${key} (${buffer.length} bytes)`);
            stats.migrated++;
            continue;
          }

          await uploadToR2(key, buffer, mimeType);
          await model.update({ where: { id: record.id }, data: { [field]: key } });

          rollbackEntries.push({
            table: migration.table,
            id: record.id,
            field,
            oldValuePreview: value.substring(0, 100),
            newKey: key,
          });

          stats.migrated++;
          log(`  Migrated ${migration.table}.${field} id=${record.id} → ${key}`);
        } catch (err: unknown) {
          stats.failed++;
          stats.failedIds.push(record.id);
          log(`  ERROR ${migration.table}.${field} id=${record.id}: ${String((err as Error).message)}`);
        }
      }

      skip += BATCH_SIZE;
      await sleep(BATCH_DELAY_MS);
    }
  }

  return stats;
}

async function migrateJsonField(
  prisma: PrismaClient,
  migration: JsonFieldMigration,
  companyId: string,
): Promise<MigrationStats> {
  const stats: MigrationStats = { scanned: 0, migrated: 0, skipped: 0, failed: 0, failedIds: [] };
  const model = (prisma as any)[migration.model];
  if (!model) {
    log(`  WARNING: Model "${migration.model}" not found, skipping`);
    return stats;
  }

  let skip = 0;
  while (true) {
    let records: { id: string; [k: string]: unknown }[];
    try {
      records = await model.findMany({
        select: { id: true, [migration.jsonField]: true },
        take: BATCH_SIZE,
        skip,
      });
    } catch (err: unknown) {
      if (isMissingTableError(err)) {
        log(`  WARNING: Skipping ${migration.table}.${migration.jsonField} (table/model missing in this tenant schema)`);
        break;
      }
      throw err;
    }

    if (records.length === 0) break;

    for (const record of records) {
      stats.scanned++;
      const receipts = record[migration.jsonField];
      if (!Array.isArray(receipts)) {
        stats.skipped++;
        continue;
      }

      let hasBase64 = false;
      const updated: unknown[] = [];

      for (const receipt of receipts as { fileUrl?: string }[]) {
        if (receipt?.fileUrl && isBase64DataUrl(receipt.fileUrl)) {
          hasBase64 = true;
          try {
            const { mimeType, buffer } = parseDataUrl(receipt.fileUrl);
            const ext = getExtFromMime(mimeType);
            const key = `${companyId}/expenses/${record.id}/${uuidv4()}.${ext}`;

            if (!DRY_RUN) {
              await uploadToR2(key, buffer, mimeType);
            }

            updated.push({ ...receipt, fileUrl: key });
            log(
              `  ${DRY_RUN ? '[DRY-RUN] Would migrate' : 'Migrated'} ${migration.table}.${migration.jsonField} receipt in id=${record.id} → ${key}`,
            );
          } catch (err: unknown) {
            updated.push(receipt);
            stats.failed++;
            log(`  ERROR ${migration.table}.${migration.jsonField} receipt in id=${record.id}: ${String((err as Error).message)}`);
          }
        } else {
          updated.push(receipt);
        }
      }

      if (hasBase64) {
        if (!DRY_RUN) {
          await model.update({ where: { id: record.id }, data: { [migration.jsonField]: updated } });
          rollbackEntries.push({
            table: migration.table,
            id: record.id,
            field: migration.jsonField,
            oldValuePreview: JSON.stringify(receipts).substring(0, 100),
            newKey: 'json-migrated',
          });
        }
        stats.migrated++;
      } else {
        stats.skipped++;
      }
    }

    skip += BATCH_SIZE;
    await sleep(BATCH_DELAY_MS);
  }

  return stats;
}

function addStats(total: MigrationStats, part: MigrationStats) {
  total.scanned += part.scanned;
  total.migrated += part.migrated;
  total.skipped += part.skipped;
  total.failed += part.failed;
  total.failedIds.push(...part.failedIds);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('='.repeat(60));
  log(`Migration started ${DRY_RUN ? '(DRY RUN)' : ''}`);
  if (CATEGORY_FILTER) log(`Category filter: ${CATEGORY_FILTER}`);
  log('='.repeat(60));

  loadExistingRollback();

  const totalStats: MigrationStats = { scanned: 0, migrated: 0, skipped: 0, failed: 0, failedIds: [] };

  const platformMigrations = MIGRATIONS.filter((m) => m.scope === 'platform');
  for (const migration of platformMigrations) {
    if (CATEGORY_FILTER && migration.category !== CATEGORY_FILTER) continue;
    log(`\n[Platform] Migrating ${migration.table}.${migration.fields.join(', ')}`);

    const model = (platformPrisma as any)[migration.model];
    if (!model) {
      log(`  WARNING: Model not found, skipping`);
      continue;
    }

    if (migration.model === 'company') {
      let records: { id: string }[];
      try {
        records = await model.findMany({ select: { id: true } });
      } catch (err: unknown) {
        if (isMissingTableError(err)) {
          log(`  WARNING: Skipping Company migration (table missing)`);
          continue;
        }
        throw err;
      }
      for (const record of records) {
        const stats = await migrateStringFieldForRecord(platformPrisma, migration, record.id, record.id);
        addStats(totalStats, stats);
      }
    } else if (migration.model === 'invoice') {
      let records: {
        id: string;
        subscription: { tenant: { companyId: string } | null } | null;
      }[];
      try {
        records = await model.findMany({
          select: {
            id: true,
            subscription: {
              select: {
                tenant: { select: { companyId: true } },
              },
            },
          },
        });
      } catch (err: unknown) {
        if (isMissingTableError(err)) {
          log(`  WARNING: Skipping Invoice migration (table/model missing)`);
          continue;
        }
        throw err;
      }
      for (const record of records) {
        const companyId = record.subscription?.tenant?.companyId;
        if (!companyId) {
          log(`  WARNING: Invoice ${record.id} has no companyId via subscription.tenant, skipping`);
          continue;
        }
        const stats = await migrateStringFieldForRecord(platformPrisma, migration, companyId, record.id);
        addStats(totalStats, stats);
      }
    } else {
      let records: { id: string }[];
      try {
        records = await model.findMany({ select: { id: true } });
      } catch (err: unknown) {
        if (isMissingTableError(err)) {
          log(`  WARNING: Skipping ${migration.table} (table missing)`);
          continue;
        }
        throw err;
      }
      for (const record of records) {
        const stats = await migrateStringFieldForRecord(platformPrisma, migration, record.id, record.id);
        addStats(totalStats, stats);
      }
    }
  }

  const tenants = await platformPrisma.tenant.findMany({
    where: { status: { in: ['ACTIVE', 'TRIAL'] } },
    select: { id: true, slug: true, schemaName: true, companyId: true },
  });

  log(`\nFound ${tenants.length} active tenants`);

  for (const tenant of tenants) {
    const companyId = tenant.companyId;
    log(`\n--- Tenant: ${tenant.slug} (company: ${companyId}) ---`);

    let tenantPrisma: PrismaClient | null = null;
    try {
      tenantPrisma = getTenantPrisma(tenant.schemaName);

      const tenantMigrations = MIGRATIONS.filter((m) => m.scope === 'tenant');
      for (const migration of tenantMigrations) {
        if (CATEGORY_FILTER && migration.category !== CATEGORY_FILTER) continue;
        log(`  [${tenant.slug}] Migrating ${migration.table}.${migration.fields.join(', ')}`);
        const stats = await migrateStringField(tenantPrisma, migration, companyId);
        addStats(totalStats, stats);
      }

      for (const migration of JSON_MIGRATIONS) {
        if (CATEGORY_FILTER && migration.category !== CATEGORY_FILTER) continue;
        log(`  [${tenant.slug}] Migrating ${migration.table}.${migration.jsonField} (JSON)`);
        const stats = await migrateJsonField(tenantPrisma, migration, companyId);
        addStats(totalStats, stats);
      }
    } catch (err: unknown) {
      log(`  ERROR connecting to tenant ${tenant.slug}: ${String((err as Error).message)}`);
    } finally {
      if (tenantPrisma) await tenantPrisma.$disconnect();
    }
  }

  if (!DRY_RUN) {
    saveRollback();
  }

  log('\n' + '='.repeat(60));
  log('MIGRATION SUMMARY');
  log('='.repeat(60));
  log(`Total scanned:  ${totalStats.scanned}`);
  log(`Total migrated: ${totalStats.migrated}`);
  log(`Total skipped:  ${totalStats.skipped}`);
  log(`Total failed:   ${totalStats.failed}`);
  if (totalStats.failedIds.length > 0) {
    log(`Failed IDs: ${totalStats.failedIds.join(', ')}`);
  }
  log(`Rollback file: ${ROLLBACK_FILE}`);
  log(`Log file: ${LOG_FILE}`);

  await platformPrisma.$disconnect();
}

main().catch((err) => {
  console.error('Migration crashed:', err);
  saveRollback();
  process.exit(1);
});
