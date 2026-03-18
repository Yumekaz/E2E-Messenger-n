/**
 * TypeScript Type Definitions
 * Centralizes all shared types for the E2E Messenger client
 */

// ==================== USER TYPES ====================

export interface User {
  id: number;
  username: string;
  email: string;
  public_key?: string;
  created_at: string;
  last_seen?: string;
}

export interface AuthUser {
  id: number;
  username: string;
  email: string;
}

// ==================== AUTH TYPES ====================

export interface AuthResponse {
  message: string;
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  username: string;
  password: string;
}

export interface TokenPayload {
  userId: number;
  username: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

// ==================== ROOM TYPES ====================

export interface Room {
  roomId: string;
  roomCode: string;
  isOwner: boolean;
  memberKeys?: Record<string, string>;
}

export interface RoomMember {
  username: string;
  publicKey: string;
  isOwner?: boolean;
}

export interface JoinRequest {
  requestId: string;
  username: string;
  publicKey: string;
  roomId: string;
}

// ==================== MESSAGE TYPES ====================

export type MessageState = 'pending' | 'delivered' | 'read';

export interface EncryptedMessage {
  id: string;
  encryptedData: string;
  iv: string;
  senderUsername: string;
  timestamp: number;
  attachmentId?: number;
}

export interface DecryptedMessage extends EncryptedMessage {
  text: string;
  decrypted: boolean;
  type?: 'system' | 'message';
  attachment?: Attachment;
}

export interface SystemMessage {
  type: 'system';
  text: string;
  timestamp: number;
}

export type Message = DecryptedMessage | SystemMessage;

// ==================== ATTACHMENT TYPES ====================

export interface Attachment {
  id: number;
  filename: string;
  url: string;
  mimetype: string;
  size: number;
  uploadedBy?: string;
  createdAt?: string;
  encrypted?: boolean;
  iv?: string | null;
  metadata?: string | null;
  decryptedUrl?: string;
}

export interface EncryptedAttachment extends Attachment {
  encrypted: true;
  iv: string;
  metadata: string;
}

export interface UploadResponse {
  message: string;
  attachment: Attachment;
}

export interface EncryptedUploadData {
  blob: Blob;
  iv: string;
  metadata: string;
}

// ==================== SOCKET EVENT TYPES ====================

export interface SocketEvents {
  // Client -> Server
  register: (data: { username: string; publicKey: string }) => void;
  'create-room': () => void;
  'request-join': (data: { roomCode: string }) => void;
  'approve-join': (data: { requestId: string }) => void;
  'deny-join': (data: { requestId: string }) => void;
  'join-room': (data: { roomId: string }) => void;
  'leave-room': (data: { roomId: string }) => void;
  'send-encrypted-message': (data: {
    roomId: string;
    encryptedData: string;
    iv: string;
    senderUsername: string;
    attachmentId?: number;
  }) => void;
  typing: (data: { roomId: string }) => void;
  'request-upload-token': () => void;

  // Server -> Client
  registered: (data: { username: string }) => void;
  'upload-token': (data: { token: string }) => void;
  'username-taken': () => void;
  'room-created': (data: { roomId: string; roomCode: string }) => void;
  'join-request': (data: JoinRequest) => void;
  'join-approved': (data: {
    roomId: string;
    roomCode: string;
    memberKeys: Record<string, string>;
  }) => void;
  'join-denied': () => void;
  'room-data': (data: {
    members: string[];
    memberKeys: Record<string, string>;
    encryptedMessages: EncryptedMessage[];
  }) => void;
  'new-encrypted-message': (message: EncryptedMessage) => void;
  'member-joined': (data: { username: string; publicKey: string }) => void;
  'member-left': (data: { username: string }) => void;
  'members-update': (data: {
    members: string[];
    memberKeys: Record<string, string>;
  }) => void;
  'room-closed': () => void;
  'user-typing': (data: { username: string }) => void;
  error: (data: { message: string }) => void;
}

// ==================== ENCRYPTION TYPES ====================

export interface EncryptionResult {
  encryptedData: string;
  iv: string;
}

export interface DecryptedFileResult {
  blob: Blob;
  filename: string;
  mimeType: string;
}

export interface RoomEncryptionInterface {
  initialize(): Promise<string>;
  publicKeyExported: string | null;
  setRoomKey(roomCode: string, memberKeys: string[]): Promise<void>;
  encrypt(plaintext: string): Promise<EncryptionResult>;
  decrypt(encryptedData: string, iv: string): Promise<string | null>;
  encryptFile(file: File): Promise<{ blob: Blob; iv: string; metadata: string }>;
  decryptFile(encryptedBlob: Blob, iv: string, encryptedMetadata: string): Promise<DecryptedFileResult>;
  getFingerprint(): Promise<string>;
}

// ==================== COMPONENT PROP TYPES ====================

export interface AuthPageProps {
  onAuth: (user: AuthUser) => void;
  encryptionReady: boolean;
}

export interface HomePageProps {
  username: string;
  onCreateRoom: () => void;
  onJoinRoom: (roomCode: string) => void;
}

export interface RoomPageProps {
  roomId: string;
  roomCode: string;
  username: string;
  isOwner: boolean;
  encryption: RoomEncryptionInterface;
  onUpdateRoomKey: (memberKeys: Record<string, string>) => Promise<void>;
  onLeave: () => void;
  roomType?: 'legacy' | 'authenticated';
}

export interface FileUploadProps {
  roomId: string;
  onFileUploaded: (attachment: Attachment) => void;
  disabled?: boolean;
}

export interface MessageAttachmentProps {
  attachment: Attachment;
  resolveDownloadUrl?: (attachment: Attachment) => Promise<{ url: string; revokeAfterUse: boolean }>;
}

export interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  details?: string[] | null;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

export interface JoinRequestModalProps {
  requests: JoinRequest[];
  onApprove: (data: { requestId: string }) => void;
  onDeny: (requestId: string) => void;
}

// ==================== API RESPONSE TYPES ====================

export interface ApiError {
  error: string;
  message: string;
  details?: string[];
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  stats: {
    users: number;
    rooms: number;
    messages: number;
    attachments: number;
  };
}

export interface NetworkInfoResponse {
  url: string;
  ip: string;
  port: number;
}
