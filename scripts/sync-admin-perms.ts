import { rbacService } from '../src/core/rbac/rbac.service';
import { platformPrisma } from '../src/config/database';

async function run() {
  try {
    const result = await rbacService.syncCompanyAdminPermissions();
    console.log("Sync Result:", result);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await platformPrisma.$disconnect();
    process.exit(0);
  }
}

run();
