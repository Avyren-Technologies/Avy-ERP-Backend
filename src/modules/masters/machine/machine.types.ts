export interface MachineListFilters {
  page: number;
  limit: number;
  search?: string | undefined;
  status?: string | undefined;
  categoryId?: string | undefined;
  typeId?: string | undefined;
  zoneId?: string | undefined;
  locationId?: string | undefined;
  priority?: string | undefined;
}

export interface MachineListResult {
  machines: any[];
  total: number;
  page: number;
  limit: number;
}
