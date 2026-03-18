import { socket } from '../socket';
import authService from './authService';
import type { Attachment, UploadResponse } from '../types';

const API_BASE = '/api/files';

const ALLOWED_MIME_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream', // For encrypted files
] as const;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface EncryptedUploadData {
  blob: Blob;
  iv: string;
  metadata: string;
}

class FileService {
  /**
   * Request a legacy upload/download token via socket
   */
  private async requestLegacyToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout waiting for auth token'));
      }, 5000);

      const handleToken = ({ token }: { token: string }) => {
        cleanup();
        resolve(token);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('upload-token', handleToken);
      };

      socket.on('upload-token', handleToken);
      socket.emit('request-upload-token');
    });
  }

  /**
   * Get valid auth token (standard or legacy)
   */
  private async getAuthToken(): Promise<string | null> {
    const token = authService.getAccessToken();
    if (token) return token;

    try {
      if (socket.connected) {
        return await this.requestLegacyToken();
      }
    } catch (e) {
      console.warn('Failed to get legacy token:', e);
    }
    return null;
  }

  /**
   * Upload a file to a room (with optional encryption)
   */
  async uploadFile(
    roomId: string,
    file: File,
    encryptedData?: EncryptedUploadData | null
  ): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('roomId', roomId);

    if (encryptedData) {
      // Upload encrypted file
      formData.append('file', encryptedData.blob, `encrypted_${Date.now()}.enc`);
      formData.append('iv', encryptedData.iv);
      formData.append('metadata', encryptedData.metadata);
      formData.append('encrypted', 'true');
      formData.append('originalName', file.name);
      formData.append('originalType', file.type);
      formData.append('originalSize', file.size.toString());
    } else {
      // Upload plain file
      formData.append('file', file);
    }

    const token = await this.getAuthToken();

    let response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    // Retry with legacy token if unauthorized (e.g. stale JWT)
    if (response.status === 401 && socket.connected) {
      try {
        const legacyToken = await this.requestLegacyToken();
        response = await fetch(`${API_BASE}/upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${legacyToken}`,
          },
          body: formData,
        });
      } catch (e) {
        console.warn('Legacy retry failed:', e);
      }
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Upload failed');
    }

    return response.json();
  }

  /**
   * Download encrypted file and return as blob
   */
  async downloadEncryptedFile(url: string): Promise<Blob> {
    const token = await this.getAuthToken();

    let response = await fetch(url, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    // Retry with legacy token if unauthorized
    if (response.status === 401 && socket.connected) {
      try {
        const legacyToken = await this.requestLegacyToken();
        response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${legacyToken}`,
          },
        });
      } catch (e) {
        console.warn('Legacy download retry failed:', e);
      }
    }

    if (!response.ok) {
      let errorMessage = `Failed to download file (${response.status} ${response.statusText})`;

      // Provide user-friendly error messages
      if (response.status === 401) {
        errorMessage = "Authentication expired. Please log in again.";
      } else if (response.status === 403) {
        errorMessage = "You don't have permission to access this file.";
      } else if (response.status === 404) {
        errorMessage = "File not found. It may have been deleted.";
      } else {
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
        } catch (e) {
          // use default message with status code
        }
      }

      throw new Error(errorMessage);
    }

    return response.blob();
  }

  /**
   * Get all files in a room
   */
  async getRoomFiles(roomId: string): Promise<{ attachments: Attachment[] }> {
    const response = await authService.authenticatedFetch(`${API_BASE}/room/${roomId}`);
    return response.json();
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Check if file is an image
   */
  isImage(mimetype: string | undefined): boolean {
    return !!mimetype && mimetype.startsWith('image/');
  }

  /**
   * Check if file is encrypted
   */
  isEncrypted(attachment: Attachment): boolean {
    return !!(attachment as any).encrypted ||
      attachment.filename?.endsWith('.enc') ||
      !!(attachment as any).iv;
  }

  /**
   * Validate file before upload
   */
  validateFile(file: File, maxSize: number = MAX_FILE_SIZE): boolean {
    if (file.size > maxSize) {
      throw new Error(`File too large. Max size: ${this.formatFileSize(maxSize)}`);
    }

    // Allow all types if they'll be encrypted
    if (!ALLOWED_MIME_TYPES.includes(file.type) && file.type !== '') {
      throw new Error('File type not allowed');
    }

    return true;
  }

  /**
   * Get file extension from filename
   */
  getFileExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
  }

  /**
   * Get icon for file type
   */
  getFileIcon(mimetype: string): string {
    if (this.isImage(mimetype)) return '🖼️';
    if (mimetype === 'application/pdf') return '📄';
    if (mimetype.includes('word')) return '📝';
    if (mimetype === 'text/plain') return '📃';
    if (mimetype === 'application/octet-stream') return '🔒';
    return '📎';
  }
}

// Export singleton instance
const fileService = new FileService();
export default fileService;
