-- DropIndex (global unique on visitNumber/passNumber — now company-scoped)
DROP INDEX "visits_visitNumber_key";
DROP INDEX "recurring_visitor_passes_passNumber_key";
DROP INDEX "vehicle_gate_passes_passNumber_key";
DROP INDEX "material_gate_passes_passNumber_key";

-- CreateIndex (company-scoped unique constraints)
CREATE UNIQUE INDEX "visits_companyId_visitNumber_key" ON "visits"("companyId", "visitNumber");
CREATE UNIQUE INDEX "recurring_visitor_passes_companyId_passNumber_key" ON "recurring_visitor_passes"("companyId", "passNumber");
CREATE UNIQUE INDEX "vehicle_gate_passes_companyId_passNumber_key" ON "vehicle_gate_passes"("companyId", "passNumber");
CREATE UNIQUE INDEX "material_gate_passes_companyId_passNumber_key" ON "material_gate_passes"("companyId", "passNumber");
