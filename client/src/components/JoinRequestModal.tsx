import React from 'react';
import type { JoinRequestModalProps, JoinRequest } from '../types';

function JoinRequestModal({ requests, onApprove, onDeny }: JoinRequestModalProps): JSX.Element | null {
  if (requests.length === 0) return null;

  const handleApprove = (request: JoinRequest): void => {
    onApprove({ requestId: request.requestId });
  };

  const handleDeny = (request: JoinRequest): void => {
    onDeny(request.requestId);
  };

  return (
    <div className="join-request-modal glass-modal">
      <div className="modal-header">
        <p className="modal-eyebrow">Owner approval</p>
        <h3>Join requests ({requests.length})</h3>
        <p className="modal-message">Approve the people you want in this local room.</p>
      </div>
      <div className="request-list">
        {requests.map((request) => (
          <div key={request.requestId} className="request-item">
            <div className="request-info">
              <div className="request-avatar">
                {request.username.charAt(0).toUpperCase()}
              </div>
              <div className="request-details">
                <span className="request-username">{request.username}</span>
                <span className="request-key" title={request.publicKey}>
                  {request.publicKey.substring(0, 24)}...
                </span>
              </div>
            </div>
            <div className="request-actions">
              <button
                type="button"
                className="btn btn-approve"
                onClick={() => handleApprove(request)}
                title="Approve"
              >
                ✓
              </button>
              <button
                type="button"
                className="btn btn-deny"
                onClick={() => handleDeny(request)}
                title="Deny"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default JoinRequestModal;
