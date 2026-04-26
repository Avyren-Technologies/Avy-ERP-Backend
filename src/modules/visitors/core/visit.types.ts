export interface CreateVisitInput {
  visitorName: string;
  visitorMobile: string;
  visitorEmail?: string | undefined;
  visitorCompany?: string | undefined;
  visitorDesignation?: string | undefined;
  visitorTypeId: string;
  purpose: string; // VisitPurpose enum value
  purposeNotes?: string | undefined;
  expectedDate: string; // ISO date string
  expectedTime?: string | undefined; // HH:mm
  expectedDurationMinutes?: number | undefined;
  hostEmployeeId: string;
  plantId: string;
  gateId?: string | undefined;
  vehicleRegNumber?: string | undefined;
  vehicleType?: string | undefined;
  materialCarriedIn?: string | undefined;
  specialInstructions?: string | undefined;
  emergencyContact?: string | undefined;
  meetingRef?: string | undefined;
  purchaseOrderRef?: string | undefined;
}

export interface CheckInInput {
  checkInGateId?: string | undefined;
  checkInGuardId?: string | undefined;
  visitorPhoto?: string | undefined;
  governmentIdType?: string | undefined;
  governmentIdNumber?: string | undefined;
  idDocumentPhoto?: string | undefined;
  badgeFormat?: string | undefined;
}

export interface CheckOutInput {
  checkOutGateId?: string | undefined;
  checkOutMethod: string;
  badgeReturned?: boolean | undefined;
  materialOut?: string | undefined;
}

export interface ExtendVisitInput {
  additionalMinutes: number;
  reason: string;
}

export interface VisitListFilters {
  status?: string | undefined;
  visitorTypeId?: string | undefined;
  hostEmployeeId?: string | undefined;
  plantId?: string | undefined;
  gateId?: string | undefined;
  registrationMethod?: string | undefined;
  fromDate?: string | undefined;
  toDate?: string | undefined;
  search?: string | undefined;
  page: number;
  limit: number;
}
