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
  email: string | null;
  dateOfBirth: string;
  gender: string | null;
  reasonForReservation: string | null;
  procedureId: number | null;
}

export interface MobileProcedureOption {
  procedureId: number;
  modalityId: number;
  modalityDisplayName: string;
  procedureDisplayName: string;
  procedureCode: string | null;
}

export interface RisPrerequisite {
  id: number;
  ruleId: number | null;
  type: number | string;
  subTypeId: number | null;
  subTypeCode: string | null;
  subTypeName: string | null;
  name: string;
  isRequired: boolean;
  requiredGender: string | null;
  description: string | null;
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
  roomName: string | null;
  reasonForReservation: string | null;
  totalPrice: number | null;
  depositedAmount: number | null;
  currencyCode: string | null;
  currencySymbol: string | null;
  isPaid: boolean | null;
  paymentStatus: 'Paid' | 'PartiallyPaid' | 'Unpaid' | null;
}

export interface GuestReservationReceipt {
  visitId: number;
  orderId: number | null;
  submittedAtUtc: string;
  procedureId: number | null;
  procedureDisplayName: string | null;
}

export type BookingAttachmentSource = 'camera' | 'file';
export type BookingAttachmentStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

export interface PendingBookingAttachment {
  id: string;
  uri: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
  source: BookingAttachmentSource;
  status: BookingAttachmentStatus;
  error: string | null;
  webFile?: Blob;
}
