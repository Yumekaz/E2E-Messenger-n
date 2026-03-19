import React from 'react';
import type { ConfirmModalProps } from '../types';

function ConfirmModal({
  isOpen,
  title,
  message,
  details,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = false,
}: ConfirmModalProps): JSX.Element | null {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className={`modal-content glass-modal confirm-modal ${isDanger ? 'confirm-modal--danger' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-header">
          <p className="modal-eyebrow">{isDanger ? 'Danger zone' : 'Confirmation'}</p>
          <h3 className="modal-title">{title}</h3>
        </div>
        <p className="modal-message">{message}</p>

        {details && details.length > 0 && (
          <ul className="modal-details">
            {details.map((detail, index) => (
              <li key={index}>{detail}</li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn ${isDanger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
