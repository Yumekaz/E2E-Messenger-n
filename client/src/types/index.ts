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

export type RoomType = 'legacy' | 'authenticated';
export type AppPage = 'auth' | 'username' | 'home' | 'room';
export type EncryptionStatus = 'initializing' | 'ready' | 'error';

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
  roomType?: RoomType;
  memberKeys?: Record<string, string>;
}

export interface RoomState extends Room {
  memberKeys: Record<string, string>;
  roomType: RoomType;
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
  attachment?: Attachment;
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

export interface SocketRegistrationPayload {
  username: string;
  publicKey: string;
}

export interface RoomCodePayload {
  roomCode: string;
}

export interface RoomIdPayload {
  roomId: string;
}

export interface RequestIdPayload {
  requestId: string;
}

export interface WrappedRoomKeyPayload {
  wrappedRoomKey: string;
  wrappedRoomKeyIv: string;
  keySenderUsername: string;
}

export interface SendEncryptedMessagePayload {
  roomId: string;
  encryptedData: string;
  iv: string;
  senderUsername: string;
  attachmentId?: number;
}

export interface UploadTokenPayload {
  token: string;
}

export interface RoomCreatedPayload {
  roomId: string;
  roomCode: string;
  roomType?: RoomType;
}

export interface JoinApprovedPayload {
  roomId: string;
  roomCode: string;
  roomType?: RoomType;
  memberKeys: Record<string, string>;
  wrappedRoomKey?: string | null;
  wrappedRoomKeyIv?: string | null;
  keySenderUsername?: string | null;
}

export interface RoomDataPayload {
  members: string[];
  memberKeys: Record<string, string>;
  encryptedMessages: EncryptedMessage[];
  wrappedRoomKey?: string | null;
  wrappedRoomKeyIv?: string | null;
  keySenderUsername?: string | null;
}

export interface MembersUpdatePayload {
  members: string[];
  memberKeys: Record<string, string>;
}

export interface MemberJoinedPayload {
  username: string;
  publicKey: string;
}

export interface MemberLeftPayload {
  username: string;
}

export interface SocketErrorPayload {
  message: string;
}

export interface ClientToServerEvents {
  register: (data: SocketRegistrationPayload) => void;
  'create-room': () => void;
  'request-join': (data: RoomCodePayload) => void;
  'approve-join': (data: RequestIdPayload & WrappedRoomKeyPayload) => void;
  'deny-join': (data: RequestIdPayload) => void;
  'join-room': (data: RoomIdPayload) => void;
  'leave-room': (data: RoomIdPayload) => void;
  'send-encrypted-message': (data: SendEncryptedMessagePayload) => void;
  typing: (data: RoomIdPayload) => void;
  'request-upload-token': () => void;
  'sync-room-key': (data: RoomIdPayload & WrappedRoomKeyPayload) => void;
}

export interface ServerToClientEvents {
  'auth-expired': () => void;
  registered: (data: { username: string }) => void;
  'upload-token': (data: UploadTokenPayload) => void;
  'username-taken': () => void;
  'room-created': (data: RoomCreatedPayload) => void;
  'join-request': (data: JoinRequest) => void;
  'join-approved': (data: JoinApprovedPayload) => void;
  'join-denied': () => void;
  'room-data': (data: RoomDataPayload) => void;
  'new-encrypted-message': (message: EncryptedMessage) => void;
  'member-joined': (data: MemberJoinedPayload) => void;
  'member-left': (data: MemberLeftPayload) => void;
  'members-update': (data: MembersUpdatePayload) => void;
  'room-closed': () => void;
  'user-typing': (data: { username: string }) => void;
  error: (data: SocketErrorPayload) => void;
}

export type SocketEvents = ClientToServerEvents & ServerToClientEvents;

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
  hasRoomKey(): boolean;
  createRoomKey(): Promise<void>;
  setLegacyRoomKey(roomCode: string, memberKeys: string[]): Promise<void>;
  wrapRoomKeyForMember(memberPublicKey: string): Promise<{ wrappedRoomKey: string; wrappedRoomKeyIv: string }>;
  restoreRoomKey(senderPublicKey: string, wrappedRoomKey: string, wrappedRoomKeyIv: string): Promise<void>;
  encrypt(plaintext: string): Promise<EncryptionResult>;
  decrypt(encryptedData: string, iv: string): Promise<string | null>;
  encryptFile(file: File): Promise<{ blob: Blob; iv: string; metadata: string }>;
  decryptFile(encryptedBlob: Blob, iv: string, encryptedMetadata: string): Promise<DecryptedFileResult>;
  decryptFileMetadata(encryptedMetadata: string): Promise<{ name: string; type: string; size: number }>;
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
  socketConnected: boolean;
}

export interface RoomPageProps {
  roomId: string;
  roomCode: string;
  username: string;
  isOwner: boolean;
  encryption: RoomEncryptionInterface;
  onUpdateRoomKey: (memberKeys: Record<string, string>) => Promise<void>;
  onLeave: () => void;
  roomType?: RoomType;
  socketConnected: boolean;
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
  onApprove: (data: { requestId: string }) => Promise<void> | void;
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
  candidates?: Array<{
    name: string;
    ip: string;
    url: string;
    httpUrl: string;
    httpsUrl: string;
    recommended: boolean;
  }>;
}
