import type { PendingAttachment } from '@/src/types/attachments';

export type SupportStatus = 'New' | 'Assigned' | 'Closed';
export type SupportSenderKind = 'Patient' | 'Staff' | 'System';

export interface SupportAttachment {
  id: number;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

export interface SupportMessage {
  id: number;
  ticketId: number;
  senderKind: SupportSenderKind;
  senderId: string;
  senderDisplayName: string;
  body?: string | null;
  createdAtUtc: string;
  attachments: SupportAttachment[];
}

export interface SupportTicket {
  id: number;
  status: SupportStatus;
  createdAtUtc: string;
  assignedAtUtc?: string | null;
  closedAtUtc?: string | null;
  lastMessageAtUtc?: string | null;
  lastMessagePreview?: string | null;
  unreadCount: number;
  assignee?: { id: string; displayName: string } | null;
}

export interface SupportTicketList {
  items: SupportTicket[];
  total: number;
  unreadTotal: number;
}

export interface SupportMessageList {
  items: SupportMessage[];
}

export interface SupportTicketCreated {
  ticket: SupportTicket;
  message: SupportMessage;
}

export type PendingSupportAttachment = PendingAttachment;
