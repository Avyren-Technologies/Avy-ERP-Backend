export interface PartListFilters {
  page: number;
  limit: number;
  search?: string | undefined;
  status?: string | undefined;
  categoryId?: string | undefined;
  locationId?: string | undefined;
  partType?: string | undefined;
}

export interface PartListResult {
  parts: any[];
  total: number;
  page: number;
  limit: number;
}
