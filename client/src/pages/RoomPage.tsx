import React, { useEffect, useRef, useState, FormEvent } from 'react';
import socket from '../socket';
import { QRCodeCanvas } from 'qrcode.react';
import ConfirmModal from '../components/ConfirmModal';
import FileUpload from '../components/FileUpload';
import MessageAttachment from '../components/MessageAttachment';
import fileService from '../services/fileService';
import '../styles/room.css';
import type {
  RoomPageProps,
  DecryptedMessage,
  SystemMessage,
  Message,
  Attachment,
  EncryptedMessage
} from '../types';

interface EncryptedAttachmentData extends Attachment {
  encrypted?: boolean;
  iv?: string | null;
  metadata?: string | null;
  decryptedUrl?: string;
}

interface MessageWithAttachment extends DecryptedMessage {
  attachment?: EncryptedAttachmentData;
}

function getRoomTypeLabel(roomType?: string): string {
  return roomType === 'authenticated' ? 'Authenticated' : 'Legacy';
}

function getRoomTypeDescription(roomType?: string): string {
  return roomType === 'authenticated'
    ? 'Requires signed-in access'
    : 'Available to anyone on the local network';
}

function RoomPage({
  roomId,
  roomCode,
  username,
  isOwner,
  encryption,
  onUpdateRoomKey,
  onLeave,
  roomType = 'legacy',
  socketConnected,
}: RoomPageProps): JSX.Element {
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [showMembers, setShowMembers] = useState<boolean>(false);
  const [showRoomInfo, setShowRoomInfo] = useState<boolean>(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState<boolean>(false);
  const [fingerprint, setFingerprint] = useState<string>('');
  const [serverUrl, setServerUrl] = useState<string>('');
  const [copiedRoomCode, setCopiedRoomCode] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef<number>(0);
  const userHasScrolledRef = useRef<boolean>(false);
  const typingTimeoutsRef = useRef<Map<string, number>>(new Map());
  const copyResetTimerRef = useRef<number | null>(null);

  function clearTypingTimeouts(): void {
    typingTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
    typingTimeoutsRef.current.clear();
  }

  function resetRoomViewState(): void {
    setMessages([]);
    setMembers([]);
    setInputText('');
    setTypingUsers(new Set());
    setShowMembers(false);
    setShowRoomInfo(false);
    setShowLeaveConfirm(false);
    setCopiedRoomCode(false);
    prevMessagesLengthRef.current = 0;
    userHasScrolledRef.current = false;
    clearTypingTimeouts();
  }

  async function resolveAttachmentDownload(
    attachment: EncryptedAttachmentData
  ): Promise<{ url: string; revokeAfterUse: boolean }> {
    if (!attachment.encrypted || !attachment.iv || !attachment.metadata) {
      return {
        url: attachment.url,
        revokeAfterUse: false,
      };
    }

    const encryptedBlob = await fileService.downloadEncryptedFile(attachment.url);
    const decrypted = await encryption.decryptFile(
      encryptedBlob,
      attachment.iv,
      attachment.metadata
    );

    return {
      url: URL.createObjectURL(decrypted.blob),
      revokeAfterUse: true,
    };
  }

  function isSystemMessage(msg: Message): msg is SystemMessage {
    return (msg as SystemMessage).type === 'system';
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function copyRoomCode(): void {
    if (!navigator.clipboard?.writeText) {
      return;
    }

    void navigator.clipboard.writeText(roomCode).then(() => {
      setCopiedRoomCode(true);

      if (copyResetTimerRef.current !== null) {
        clearTimeout(copyResetTimerRef.current);
      }

      copyResetTimerRef.current = window.setTimeout(() => {
        setCopiedRoomCode(false);
        copyResetTimerRef.current = null;
      }, 1400);
    }).catch((error) => {
      console.error('Failed to copy room code:', error);
    });
  }

  function handleLeaveClick(): void {
    setShowLeaveConfirm(true);
  }

  function handleConfirmLeave(): void {
    setShowLeaveConfirm(false);
    onLeave();
  }

  function handleCancelLeave(): void {
    setShowLeaveConfirm(false);
  }

  function handleScroll(): void {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    userHasScrolledRef.current = distanceFromBottom > 150;
  }

  function handleTouchStart(): void {
    handleScroll();
  }

  function handleTouchMove(): void {
    handleScroll();
  }

  function handleTouchEnd(): void {
    handleScroll();
  }

  async function handleSendMessage(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();

    if (!inputText.trim()) {
      return;
    }

    try {
      const { encryptedData, iv } = await encryption.encrypt(inputText.trim());

      socket.emit('send-encrypted-message', {
        roomId,
        encryptedData,
        iv,
        senderUsername: username
      });

      setInputText('');
    } catch (error) {
      console.error('Encryption failed:', error);
    }
  }

  async function handleEncryptFile(file: File): Promise<{ blob: Blob; iv: string; metadata: string }> {
    return encryption.encryptFile(file);
  }

  async function handleFileUploaded(attachment: Attachment): Promise<void> {
    try {
      const messageText = `Shared encrypted file: ${attachment.filename}`;
      const { encryptedData, iv } = await encryption.encrypt(messageText);

      socket.emit('send-encrypted-message', {
        roomId,
        encryptedData,
        iv,
        senderUsername: username,
        attachmentId: attachment.id
      });
    } catch (error) {
      console.error('Failed to send file message:', error);
    }
  }

  function handleTyping(): void {
    socket.emit('typing', { roomId });
  }

  useEffect(() => {
    resetRoomViewState();
    socket.emit('join-room', { roomId });
  }, [roomId]);

  useEffect(() => {
    const initRoomMetadata = async (): Promise<void> => {
      try {
        if (!window.crypto || !window.crypto.subtle) {
          throw new Error('Web Crypto API not available');
        }

        const fingerprintValue = await encryption.getFingerprint();
        setFingerprint(fingerprintValue);
      } catch (error) {
        console.error('Room setup failed:', error);
      }

      fetch('/api/network-info')
        .then(res => res.json())
        .then(data => setServerUrl(data.url))
        .catch(() => setServerUrl(window.location.origin));
    };

    initRoomMetadata();
  }, [encryption]);

  useEffect(() => {
    let active = true;

    const handleRoomData = async ({
      members: roomMembers,
      memberKeys,
      encryptedMessages
    }: {
      members: string[];
      memberKeys: Record<string, string>;
      encryptedMessages: EncryptedMessage[];
    }) => {
      if (!active) {
        return;
      }

      setMembers(roomMembers);

      try {
        await onUpdateRoomKey(memberKeys);
      } catch (error) {
        console.error('Failed to refresh room key:', error);
      }

      const decrypted = await Promise.all(
        encryptedMessages.map(async (msg: EncryptedMessage) => {
          try {
            const text = await encryption.decrypt(msg.encryptedData, msg.iv);
            const attachment = msg.attachment as EncryptedAttachmentData | undefined;

            return {
              ...msg,
              text: text || 'Message could not be decrypted',
              decrypted: !!text,
              attachment,
            } as MessageWithAttachment;
          } catch (error) {
            console.error('Failed to decrypt message:', error);
            const attachment = msg.attachment as EncryptedAttachmentData | undefined;

            return {
              ...msg,
              text: 'Message could not be decrypted',
              decrypted: false,
              attachment,
            } as MessageWithAttachment;
          }
        })
      );

      if (!active) {
        return;
      }

      setMessages(decrypted);
      prevMessagesLengthRef.current = decrypted.length;
      userHasScrolledRef.current = false;
    };

    const handleNewEncryptedMessage = async (msg: EncryptedMessage) => {
      if (!active) {
        return;
      }

      try {
        const text = await encryption.decrypt(msg.encryptedData, msg.iv);
        if (!active) {
          return;
        }

        const attachment = msg.attachment as EncryptedAttachmentData | undefined;

        setMessages(prev => [...prev, {
          ...msg,
          text: text || 'Message could not be decrypted',
          decrypted: !!text,
          attachment,
        } as MessageWithAttachment]);
      } catch (error) {
        console.error('Failed to decrypt incoming message:', error);
      }
    };

    const handleUserTyping = ({ username: typingUser }: { username: string }) => {
      setTypingUsers(prev => new Set(prev).add(typingUser));

      const existingTimer = typingTimeoutsRef.current.get(typingUser);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timerId = window.setTimeout(() => {
        setTypingUsers(prev => {
          const next = new Set(prev);
          next.delete(typingUser);
          return next;
        });
        typingTimeoutsRef.current.delete(typingUser);
      }, 2500);

      typingTimeoutsRef.current.set(typingUser, timerId);
    };

    const handleMemberJoined = ({ username: joinedUser }: { username: string; publicKey: string }) => {
      setMessages(prev => [...prev, {
        type: 'system',
        text: `${joinedUser} joined the room`,
        timestamp: Date.now()
      } as SystemMessage]);
    };

    const handleMemberLeft = ({ username: leftUser }: { username: string }) => {
      setMessages(prev => [...prev, {
        type: 'system',
        text: `${leftUser} left the room`,
        timestamp: Date.now()
      } as SystemMessage]);
    };

    const handleMembersUpdate = async ({
      members: updatedMembers,
      memberKeys
    }: {
      members: string[];
      memberKeys: Record<string, string>;
    }) => {
      if (!active) {
        return;
      }

      setMembers(updatedMembers);

      try {
        await onUpdateRoomKey(memberKeys);
      } catch (error) {
        console.error('Failed to refresh members key state:', error);
      }
    };

    socket.on('room-data', handleRoomData);
    socket.on('new-encrypted-message', handleNewEncryptedMessage);
    socket.on('user-typing', handleUserTyping);
    socket.on('member-joined', handleMemberJoined);
    socket.on('member-left', handleMemberLeft);
    socket.on('members-update', handleMembersUpdate);

    return () => {
      active = false;
      socket.off('room-data', handleRoomData);
      socket.off('new-encrypted-message', handleNewEncryptedMessage);
      socket.off('user-typing', handleUserTyping);
      socket.off('member-joined', handleMemberJoined);
      socket.off('member-left', handleMemberLeft);
      socket.off('members-update', handleMembersUpdate);
      clearTypingTimeouts();
    };
  }, [encryption, onUpdateRoomKey]);

  useEffect(() => {
    const hasNewMessages = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    if (hasNewMessages && !userHasScrolledRef.current) {
      const scrollTimer = window.setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 80);

      return () => clearTimeout(scrollTimer);
    }

    return undefined;
  }, [messages]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        clearTimeout(copyResetTimerRef.current);
      }
      clearTypingTimeouts();
    };
  }, []);

  return (
    <div className="page room-page">
      <div className="room-shell">
        <header className="room-header">
          <div className="room-info-left">
            <button className="btn-back" onClick={handleLeaveClick} aria-label="Leave room">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="room-title-section">
              <div className="room-title-row">
                <h3>
                  <span className="lock-icon">🔒</span>
                  Room {roomCode}
                </h3>
                <span className={`room-badge room-badge--${roomType}`}>
                  {getRoomTypeLabel(roomType)}
                </span>
              </div>
              <div className="room-meta-row">
                <span className="member-count">{members.length} member{members.length !== 1 ? 's' : ''}</span>
                <span className="room-meta-dot">•</span>
                <span className="room-meta-note">{getRoomTypeDescription(roomType)}</span>
              </div>
            </div>
          </div>
          <div className="header-actions">
            <button
              className="btn btn-icon"
              onClick={() => setShowRoomInfo(!showRoomInfo)}
              title="Room Info"
              aria-label="Room Info"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="sr-only">Room Info</span>
            </button>
            <button
              className="btn btn-icon"
              onClick={() => setShowMembers(!showMembers)}
              title="Members"
              aria-label="Members"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="17" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 21V18C3 16.3431 4.34315 15 6 15H12C13.6569 15 15 16.3431 15 18V21" stroke="currentColor" strokeWidth="1.5" />
                <path d="M17 15C18.6569 15 20 16.3431 20 18V21" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span className="sr-only">Members</span>
            </button>
            <button
              className="btn btn-icon btn-leave"
              onClick={handleLeaveClick}
              title={isOwner ? 'Close Room (deletes all data)' : 'Leave Room'}
              aria-label={isOwner ? 'Close room' : 'Leave room'}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M16 17L21 12L16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </header>

        <div className="room-status-strip">
          <span className="status-chip">
            {socketConnected ? 'Same Wi-Fi or hotspot required' : 'Reconnecting to the local host'}
          </span>
          <span className="status-chip">Owner approval enabled</span>
          <span className="status-chip">Messages stay end-to-end encrypted</span>
        </div>

        {showRoomInfo && (
          <div className="room-info-panel">
            <div className="info-panel-header">
              <div>
                <p className="info-panel-eyebrow">Session details</p>
                <h4>How this room works</h4>
              </div>
              <button className="close-btn" onClick={() => setShowRoomInfo(false)} aria-label="Close room details">×</button>
            </div>
            <div className="info-panel-content">
              <div className="info-row">
                <span className="info-label">Room code</span>
                <div className="code-display">
                  <span className="code-value">{roomCode}</span>
                  <button className="copy-btn" onClick={copyRoomCode} type="button">
                    {copiedRoomCode ? 'Copied' : 'Copy code'}
                  </button>
                </div>
              </div>
              <div className="info-row room-qr-row">
                <span className="info-label">Mobile join</span>
                <div className="room-qr-card">
                  <QRCodeCanvas
                    value={`${serverUrl || window.location.origin}/?room=${roomCode}`}
                    size={156}
                    level={'H'}
                    marginSize={2}
                  />
                </div>
                <small className="room-footnote">
                  Scan from a phone on the same Wi-Fi or hotspot. The room link stays local.
                </small>
              </div>
              <div className="room-summary-grid">
                <div className="room-summary-card">
                  <span className="room-summary-label">Transport</span>
                  <span className="room-summary-value">Local network only</span>
                </div>
                <div className="room-summary-card">
                  <span className="room-summary-label">Access</span>
                  <span className="room-summary-value">Owner approval</span>
                </div>
              </div>
              <div className="info-row">
                <span className="info-label">Your key fingerprint</span>
                <code className="fingerprint">{fingerprint}</code>
              </div>
              <div className="info-row">
                <span className="info-label">Encryption</span>
                <span className="encryption-type">AES-256-GCM</span>
              </div>
              <div className="info-row">
                <span className="info-label">Key exchange</span>
                <span className="encryption-type">ECDH P-256</span>
              </div>
              <div className="security-note">
                <span className="note-icon">ℹ</span>
                The server relays encrypted payloads and room state. It cannot read message contents.
              </div>
            </div>
          </div>
        )}

        <div className="room-content">
          <div
            className="messages-container"
            ref={messagesContainerRef}
            onScroll={handleScroll}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="encryption-banner">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="banner-icon">
                <path d="M12 2L4 6V12C4 17 8 21 12 22C16 21 20 17 20 12V6L12 2Z" stroke="currentColor" strokeWidth="1.5" />
                <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Messages and files are end-to-end encrypted</span>
            </div>

            {messages.map((msg, index) => (
              <div
                key={(msg as DecryptedMessage).id || index}
                className={`message ${isSystemMessage(msg)
                  ? 'system-message'
                  : (msg as DecryptedMessage).senderUsername === username
                    ? 'own-message'
                    : 'other-message'
                }`}
              >
                {!isSystemMessage(msg) && (
                  <div className="message-header">
                    <span className="message-username">{(msg as DecryptedMessage).senderUsername}</span>
                    <span className="message-time">{formatTime(msg.timestamp)}</span>
                  </div>
                )}
                <div className="message-content">
                  <div className="message-text">{isSystemMessage(msg) ? msg.text : (msg as DecryptedMessage).text}</div>
                  {!isSystemMessage(msg) && (msg as MessageWithAttachment).attachment && (
                    <MessageAttachment
                      key={(msg as MessageWithAttachment).attachment!.id || (msg as MessageWithAttachment).attachment!.filename}
                      attachment={(msg as MessageWithAttachment).attachment!}
                      resolveDownloadUrl={resolveAttachmentDownload}
                    />
                  )}
                  {!isSystemMessage(msg) && (msg as DecryptedMessage).decrypted && (
                    <span className="encrypted-badge" title="Decrypted successfully">🔓</span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />

            {typingUsers.size > 0 && (
              <div className="typing-indicator">
                <div className="typing-dots">
                  <span></span><span></span><span></span>
                </div>
                {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
              </div>
            )}
          </div>

          {showMembers && (
            <div className="members-sidebar" onClick={() => setShowMembers(false)}>
              <div className="members-panel" onClick={(e) => e.stopPropagation()}>
                <div className="panel-header">
                  <div>
                    <p className="info-panel-eyebrow">People here now</p>
                    <h4>Members ({members.length})</h4>
                  </div>
                  <button className="close-btn" onClick={() => setShowMembers(false)} aria-label="Close members panel">×</button>
                </div>
                <ul className="members-list">
                  {members.map((member) => (
                    <li key={member} className="member-item">
                      <div className="member-avatar">{member.charAt(0).toUpperCase()}</div>
                      <div className="member-info">
                        <span className="member-name">{member}</span>
                        {member === username && <span className="you-badge">You</span>}
                      </div>
                      <span className="member-status-icon" title="Encryption verified">🔐</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <form className="message-input-form" onSubmit={handleSendMessage}>
          <div className="composer-surface">
            <FileUpload
              roomId={roomId}
              onFileUploaded={handleFileUploaded}
              encryptFile={handleEncryptFile}
            />
            <div className="input-container">
              <input
                type="text"
                className="input message-input"
                placeholder="Write a secure message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleTyping}
                maxLength={4000}
              />
            </div>
            <button type="submit" className="btn btn-send" disabled={!inputText.trim()} aria-label="Send message">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div className="composer-meta">
            <span>Messages are encrypted locally before upload.</span>
            <span>{inputText.length}/4000</span>
          </div>
        </form>
      </div>

      <ConfirmModal
        isOpen={showLeaveConfirm}
        title={isOwner ? 'Close room?' : 'Leave room?'}
        message={isOwner
          ? 'Leaving will permanently delete the room, messages, and membership state.'
          : 'Are you sure you want to leave this room?'
        }
        details={isOwner ? [
          'All chat messages',
          'All room members',
          'The entire room'
        ] : null}
        onConfirm={handleConfirmLeave}
        onCancel={handleCancelLeave}
        confirmText={isOwner ? 'Close room' : 'Leave'}
        cancelText="Cancel"
        isDanger={isOwner}
      />
    </div>
  );
}

export default RoomPage;
