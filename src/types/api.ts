export type ApiStatus = 1 | 2 | 3 | 4 | 5;

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  status: ApiStatus;
  data: T | null;
  errors: string[];
}

export interface PatientAuthResponse {
  token: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegistrationRequest extends LoginRequest {
  patientCode: string;
}

export interface PushTokenRegistrationRequest {
  token: string;
  platform: 'ios' | 'android';
}

export interface PatientProfile {
  userId: string;
  email: string | null;
  phoneNumber: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  fullName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  ssn: string | null;
  patientID: string | null;
  mrn: string | null;
  typeofPatientID: string | null;
  isActive: boolean;
  isVip: boolean | null;
  isAnonymized: boolean;
  createdAt: string | null;
  modifiedAt: string | null;
}

export interface PatientWorklistItem {
  tenantId: number | null;
  patientID: string;
  studyID: number;
  studyInstanceUID: string | null;
  studyDate: string | null;
  studyTime: string | null;
  studyDescription: string | null;
  statusId: number | null;
  studyStatus: string | null;
  reportStatusId: number | null;
  reportStatus: string | null;
  reportDoubleVerfication: boolean | null;
  reportReview: boolean | null;
  reportVerificationType: number | null;
  seriesCount: number;
  bodyPartExamined: string | null;
  modality: string | null;
}

export interface SharedStudyLinkResponse {
  sharedStudyCode: string;
  expiresAtUtc: string;
}

export interface CreateMobileVisitRequest {
  entityBranchId: number;
  patientId?: string | null;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  reasonForReservation: string | null;
}

export interface PatientVisit {
  visitId: number;
  visitNumber: string;
  orderId: number | null;
  procedureId: number | null;
  procedure: string | null;
  bookingSource: string;
  status: string;
  createdAtUtc: string;
  scheduledAtUtc: string;
  reasonForReservation: string | null;
}

export interface GuestReservationReceipt {
  submittedAtUtc: string;
}
