import React, { useState, useRef, ChangeEvent, DragEvent } from 'react';
import fileService from '../services/fileService';
import type { FileUploadProps, Attachment } from '../types';

interface EncryptedUploadProps extends FileUploadProps {
  encryptFile?: (file: File) => Promise<{ blob: Blob; iv: string; metadata: string }>;
}

function FileUpload({ roomId, onFileUploaded, disabled = false, encryptFile }: EncryptedUploadProps): JSX.Element {
  const [uploading, setUploading] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File): Promise<void> => {
    if (!file || uploading) return;

    try {
      setErrorMessage(null);

      // Validate file
      fileService.validateFile(file);

      setUploading(true);
      setProgress(10);

      let uploadData: { blob: Blob; iv: string; metadata: string } | null = null;

      // Encrypt file if encryption is available
      if (encryptFile) {
        setProgress(30);
        uploadData = await encryptFile(file);
        setProgress(50);
      }

      // Upload file (encrypted or plain)
      const result = await fileService.uploadFile(roomId, file, uploadData);
      setProgress(100);

      // Notify parent
      onFileUploaded(result.attachment);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(0);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleClick = (): void => {
    if (!uploading && !disabled) {
      setErrorMessage(null);
      fileInputRef.current?.click();
    }
  };

  return (
    <div
      className={`file-upload ${dragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="file-upload-input"
        onChange={handleInputChange}
        disabled={uploading || disabled}
        accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,.doc,.docx"
      />
      
      <button
        type="button"
        className="btn btn-icon file-upload-btn"
        onClick={handleClick}
        disabled={uploading || disabled}
        title={encryptFile ? 'Attach encrypted file' : 'Attach file'}
        aria-label={encryptFile ? 'Attach encrypted file' : 'Attach file'}
      >
        {uploading ? (
          <div className="upload-progress">
            <span className="loading-spinner small"></span>
            <span className="progress-text">{progress}%</span>
          </div>
        ) : (
          <span className="file-upload-trigger">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M21.44 11.05L12.25 20.24C11.1242 21.3658 9.59718 21.9983 8.00498 21.9983C6.41278 21.9983 4.88584 21.3658 3.76 20.24C2.63416 19.1142 2.00166 17.5872 2.00166 15.995C2.00166 14.4028 2.63416 12.8758 3.76 11.75L12.33 3.18C13.0806 2.42927 14.0948 2.00615 15.1525 2.00615C16.2102 2.00615 17.2244 2.42927 17.975 3.18C18.7257 3.93064 19.1488 4.94482 19.1488 6.0025C19.1488 7.06019 18.7257 8.07436 17.975 8.825L9.41 17.39C9.03472 17.7653 8.52756 17.9768 7.995 17.9768C7.46244 17.9768 6.95528 17.7653 6.58 17.39C6.20472 17.0147 5.99328 16.5076 5.99328 15.975C5.99328 15.4424 6.20472 14.9353 6.58 14.56L15.07 6.07"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="file-upload-label">Attach</span>
          </span>
        )}
      </button>
      <div className="file-upload-copy">
        <span className="file-upload-hint">
          {errorMessage || (dragOver ? 'Drop to attach' : 'Drag, drop, or browse')}
        </span>
        {encryptFile && !uploading && (
          <span className="encryption-badge" title="Files are end-to-end encrypted">🔒</span>
        )}
        {errorMessage && (
          <span className="file-upload-error" role="status">
            {errorMessage}
          </span>
        )}
      </div>
    </div>
  );
}

export default FileUpload;
