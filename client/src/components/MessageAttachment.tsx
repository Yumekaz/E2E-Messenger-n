import React, { useState } from 'react';
import fileService from '../services/fileService';
import type { MessageAttachmentProps } from '../types';

function MessageAttachment({ attachment, resolveDownloadUrl }: MessageAttachmentProps): JSX.Element | null {
  if (!attachment) return null;

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isImage = fileService.isImage(attachment.mimetype);
  const fileSize = fileService.formatFileSize(attachment.size);

  // Download handler for all files (including images)
  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      setErrorMessage(null);
      let blobUrl: string;
      let revokeAfterUse = false;

      // If decryptedUrl is available (already decrypted by parent), use it
      if (attachment.decryptedUrl) {
        blobUrl = attachment.decryptedUrl;
      } else if (resolveDownloadUrl) {
        const resolved = await resolveDownloadUrl(attachment);
        blobUrl = resolved.url;
        revokeAfterUse = resolved.revokeAfterUse;
      } else {
        // Otherwise download and decrypt now
        const blob = await fileService.downloadEncryptedFile(attachment.url);
        blobUrl = URL.createObjectURL(blob);
        revokeAfterUse = true;
      }

      // Create download link
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = attachment.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Only revoke if we created it (not if it came from parent)
      if (revokeAfterUse) {
        URL.revokeObjectURL(blobUrl);
      }
    } catch (error: any) {
      console.error('Download failed:', error);
      setErrorMessage(error.message || 'Download failed');
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      await handleDownload(e as unknown as React.MouseEvent);
    }
  };

  // Show all files (including images) as file attachments - no thumbnails
  return (
    <div
      className="message-attachment file-attachment"
      onClick={handleDownload}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Download ${attachment.filename}`}
    >
      <div className="attachment-icon">
        {isImage ? '🖼️' : '📄'}
      </div>
      <div className="attachment-body">
        <div className="file-details">
          <div className="file-name">{attachment.filename}</div>
          <div className="file-size">{fileSize}</div>
        </div>
        <div className="attachment-caption">
          {attachment.encrypted ? 'Encrypted file' : 'File attachment'}
        </div>
        {errorMessage && (
          <div className="attachment-error" role="status">
            {errorMessage}
          </div>
        )}
      </div>
      <button
        type="button"
        className="btn-download"
        onClick={(e) => {
          e.stopPropagation();
          void handleDownload(e);
        }}
        title="Download file"
        aria-label={`Download ${attachment.filename}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M7 10L12 15L17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}

export default React.memo(MessageAttachment);
