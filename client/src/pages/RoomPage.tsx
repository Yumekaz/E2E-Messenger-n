import React, { useState, useEffect, useRef, FormEvent } from 'react';
import socket from '../socket';
import { QRCodeCanvas } from 'qrcode.react';
import ConfirmModal from '../components/ConfirmModal';
import FileUpload from '../components/FileUpload';
import MessageAttachment from '../components/MessageAttachment';
import fileService from '../services/fileService';
import type { 
  RoomPageProps, 
  DecryptedMessage, 
  SystemMessage, 
  Message, 
  Attachment,
  EncryptedMessage 
} from '../types';

// Extended attachment type with encryption
interface EncryptedAttachmentData extends Attachment {
  encrypted?: boolean;
  iv?: string | null;
  metadata?: string | null;
  decryptedUrl?: string;
}

// Message with possible attachment
interface MessageWithAttachment extends DecryptedMessage {
  attachment?: EncryptedAttachmentData;
}

function RoomPage({
  roomId,
  roomCode,
  username,
  isOwner,
  encryption,
  onUpdateRoomKey,
  onLeave,
  roomType = 'legacy'
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef<number>(0);
  const userHasScrolledRef = useRef<boolean>(false);
  const attachmentUrlsRef = useRef<Set<string>>(new Set());

  const releaseAttachmentUrls = (): void => {
    for (const url of attachmentUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    attachmentUrlsRef.current.clear();
  };

  // Decrypt an attachment and return a blob URL
  const decryptAttachment = async (attachment: EncryptedAttachmentData): Promise<string | null> => {
    if (!attachment.encrypted || !attachment.iv || !attachment.metadata) {
      // Not encrypted, return original URL
      return attachment.url;
    }

    try {
      // Download encrypted file
      const encryptedBlob = await fileService.downloadEncryptedFile(attachment.url);
      
      // Decrypt using room key
      const decrypted = await encryption.decryptFile(
        encryptedBlob,
        attachment.iv,
        attachment.metadata
      );

      // Create blob URL for display
      const decryptedUrl = URL.createObjectURL(decrypted.blob);
      attachmentUrlsRef.current.add(decryptedUrl);
      return decryptedUrl;
    } catch (error) {
      console.error('Failed to decrypt attachment:', error);
      return null;
    }
  };

  useEffect(() => {
    // Get key fingerprint
    encryption.getFingerprint().then(setFingerprint);

    // Fetch server network info for QR code
    fetch('/api/network-info')
      .then(res => res.json())
      .then(data => setServerUrl(data.url))
      .catch(() => setServerUrl(window.location.origin));

    // Join room
    socket.emit('join-room', { roomId });

    // Handle room data
    socket.on('room-data', async ({ members: roomMembers, memberKeys, encryptedMessages }) => {
      setMembers(roomMembers);

      // Update room key with all member keys
      await onUpdateRoomKey(memberKeys);

      // Decrypt existing messages
      const decrypted = await Promise.all(
        encryptedMessages.map(async (msg: EncryptedMessage) => {
          const text = await encryption.decrypt(msg.encryptedData, msg.iv);
          
          // Handle attachment decryption if present
          let decryptedAttachment: EncryptedAttachmentData | undefined;
          if ((msg as any).attachment) {
            const att = (msg as any).attachment as EncryptedAttachmentData;
            if (att.encrypted) {
              const decryptedUrl = await decryptAttachment(att);
              decryptedAttachment = { ...att, decryptedUrl: decryptedUrl || undefined };
            } else {
              decryptedAttachment = att;
            }
          }

          return {
            ...msg,
            text: text || '🔒 Could not decrypt',
            decrypted: !!text,
            attachment: decryptedAttachment,
          } as MessageWithAttachment;
        })
      );

      releaseAttachmentUrls();
      setMessages(decrypted);
    });

    // Handle new encrypted message
    socket.on('new-encrypted-message', async (msg: EncryptedMessage) => {
      const text = await encryption.decrypt(msg.encryptedData, msg.iv);
      
      // Handle attachment decryption if present
      let decryptedAttachment: EncryptedAttachmentData | undefined;
      if ((msg as any).attachment) {
        const att = (msg as any).attachment as EncryptedAttachmentData;
        if (att.encrypted) {
          const decryptedUrl = await decryptAttachment(att);
          decryptedAttachment = { ...att, decryptedUrl: decryptedUrl || undefined };
        } else {
          decryptedAttachment = att;
        }
      }

      setMessages(prev => [...prev, {
        ...msg,
        text: text || '🔒 Could not decrypt',
        decrypted: !!text,
        attachment: decryptedAttachment,
      } as MessageWithAttachment]);
    });

    socket.on('user-typing', ({ username: typingUser }: { username: string }) => {
      setTypingUsers(prev => new Set(prev).add(typingUser));
      setTimeout(() => {
        setTypingUsers(prev => {
          const newSet = new Set(prev);
          newSet.delete(typingUser);
          return newSet;
        });
      }, 3000);
    });

    socket.on('member-joined', async ({ username: joinedUser }: { username: string; publicKey: string }) => {
      setMessages(prev => [...prev, {
        type: 'system',
        text: `🔐 ${joinedUser} joined with verified encryption`,
        timestamp: Date.now()
      } as SystemMessage]);
    });

    socket.on('member-left', ({ username: leftUser }: { username: string }) => {
      setMessages(prev => [...prev, {
        type: 'system',
        text: `${leftUser} left the room`,
        timestamp: Date.now()
      } as SystemMessage]);
    });

    socket.on('members-update', async ({ members: updatedMembers, memberKeys }: { members: string[]; memberKeys: Record<string, string> }) => {
      setMembers(updatedMembers);
      await onUpdateRoomKey(memberKeys);
    });

    return () => {
      releaseAttachmentUrls();
      socket.off('room-data');
      socket.off('new-encrypted-message');
      socket.off('user-typing');
      socket.off('member-joined');
      socket.off('member-left');
      socket.off('members-update');
    };
  }, [roomId, encryption, onUpdateRoomKey]);

  // Mark that user has manually scrolled
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // If user scrolled up more than 150px, mark as manually scrolled
    if (distanceFromBottom > 150) {
      userHasScrolledRef.current = true;
    } else {
      // If they scroll back near bottom, re-enable auto-scroll
      userHasScrolledRef.current = false;
    }
  };

  // Handle touch events for mobile
  const handleTouchStart = () => {
    handleScroll();
  };

  const handleTouchMove = () => {
    handleScroll();
  };

  const handleTouchEnd = () => {
    handleScroll();
  };

  // Auto-scroll to bottom on new messages (unless user scrolled up)
  useEffect(() => {
    const hasNewMessages = messages.length > prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    // Only auto-scroll if: 1) new messages added, 2) user hasn't scrolled up
    if (hasNewMessages && !userHasScrolledRef.current) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages]);

  const handleSendMessage = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!inputText.trim()) return;

    try {
      // Encrypt message before sending
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
  };

  const handleTyping = (): void => {
    socket.emit('typing', { roomId });
  };

  // Handle encrypted file upload
  const handleEncryptFile = async (file: File): Promise<{ blob: Blob; iv: string; metadata: string }> => {
    return await encryption.encryptFile(file);
  };

  const handleFileUploaded = async (attachment: Attachment): Promise<void> => {
    try {
      // Encrypt a message about the file
      const messageText = `📎 Shared encrypted file: ${attachment.filename}`;
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
  };

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      // Today: show time only
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else {
      // Other days: show date and time
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const copyRoomCode = (): void => {
    navigator.clipboard.writeText(roomCode);
  };

  const handleLeaveClick = (): void => {
    setShowLeaveConfirm(true);
  };

  const handleConfirmLeave = (): void => {
    setShowLeaveConfirm(false);
    onLeave();
  };

  const handleCancelLeave = (): void => {
    setShowLeaveConfirm(false);
  };

  // Helper to check if message is system message
  const isSystemMessage = (msg: Message): msg is SystemMessage => {
    return (msg as SystemMessage).type === 'system';
  };

  return (
    <div className="page room-page">
      <div className="room-container">
        {/* Header */}
        <div className="room-header">
          <div className="room-info-left">
            <button className="btn-back" onClick={handleLeaveClick}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="room-title-section">
              <h3>
                <span className="lock-icon">🔒</span>
                Room {roomCode}
                {roomType === 'authenticated' && (
                  <span style={{
                    marginLeft: '8px',
                    fontSize: '11px',
                    padding: '2px 8px',
                    background: '#4CAF50',
                    color: 'white',
                    borderRadius: '12px',
                    fontWeight: 'normal',
                    verticalAlign: 'middle'
                  }}>
                    ✓ Authenticated
                  </span>
                )}
                {roomType === 'legacy' && (
                  <span style={{
                    marginLeft: '8px',
                    fontSize: '11px',
                    padding: '2px 8px',
                    background: '#FF9800',
                    color: 'white',
                    borderRadius: '12px',
                    fontWeight: 'normal',
                    verticalAlign: 'middle'
                  }}>
                    Legacy
                  </span>
                )}
              </h3>
              <span className="member-count">{members.length} member{members.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div className="header-actions">
            <button
              className="btn btn-icon"
              onClick={() => setShowRoomInfo(!showRoomInfo)}
              title="Room Info"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <button
              className="btn btn-icon"
              onClick={() => setShowMembers(!showMembers)}
              title="Members"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="17" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 21V18C3 16.3431 4.34315 15 6 15H12C13.6569 15 15 16.3431 15 18V21" stroke="currentColor" strokeWidth="1.5" />
                <path d="M17 15C18.6569 15 20 16.3431 20 18V21" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
            <button
              className="btn btn-icon btn-leave"
              onClick={handleLeaveClick}
              title={isOwner ? "Close Room (deletes all data)" : "Leave Room"}
              style={{
                background: 'rgba(255, 75, 75, 0.2)',
                borderColor: 'rgba(255, 75, 75, 0.5)'
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9" stroke="#ff4b4b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M16 17L21 12L16 7" stroke="#ff4b4b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21 12H9" stroke="#ff4b4b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* Room Info Panel */}
        {showRoomInfo && (
          <div className="room-info-panel">
            <div className="info-panel-header">
              <h4>🔐 Encryption Info</h4>
              <button className="close-btn" onClick={() => setShowRoomInfo(false)}>×</button>
            </div>
            <div className="info-panel-content">
              <div className="info-row">
                <span className="info-label">Room Code</span>
                <div className="code-display">
                  <span className="code-value">{roomCode}</span>
                  <button className="copy-btn" onClick={copyRoomCode}>Copy</button>
                </div>
              </div>
              <div className="info-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
                <span className="info-label">Mobile Join</span>
                <div style={{ background: 'white', padding: '10px', borderRadius: '8px', alignSelf: 'center' }}>
                  <QRCodeCanvas
                    value={`${serverUrl || window.location.origin}/?room=${roomCode}`}
                    size={150}
                    level={'H'}
                    marginSize={2}
                  />
                </div>
                <small style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', textAlign: 'center', width: '100%' }}>
                  Ensure you are accessing via IP
                </small>
              </div>
              <div className="info-row">
                <span className="info-label">Your Key Fingerprint</span>
                <code className="fingerprint">{fingerprint}</code>
              </div>
              <div className="info-row">
                <span className="info-label">Encryption</span>
                <span className="encryption-type">AES-256-GCM</span>
              </div>
              <div className="info-row">
                <span className="info-label">Key Exchange</span>
                <span className="encryption-type">ECDH P-256</span>
              </div>
              <div className="security-note">
                <span className="note-icon">ℹ️</span>
                Messages and files are encrypted end-to-end. The server cannot read them.
              </div>
            </div>
          </div>
        )}

        <div className="room-content">
          {/* Messages Area */}
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

          {/* Members Sidebar */}
          {showMembers && (
            <div className="members-sidebar" onClick={() => setShowMembers(false)}>
              <div className="members-panel" onClick={(e) => e.stopPropagation()}>
                <div className="panel-header">
                  <h4>Members ({members.length})</h4>
                  <button className="close-btn" onClick={() => setShowMembers(false)}>×</button>
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

        {/* Input Area */}
        <form className="message-input-form" onSubmit={handleSendMessage}>
          <FileUpload
            roomId={roomId}
            onFileUploaded={handleFileUploaded}
            encryptFile={handleEncryptFile}
          />
          <div className="input-container">
            <input
              type="text"
              className="input message-input"
              placeholder="Type an encrypted message..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleTyping}
            />
          </div>
          <button type="submit" className="btn btn-send" disabled={!inputText.trim()}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>

      {/* Leave Confirmation Modal */}
      <ConfirmModal
        isOpen={showLeaveConfirm}
        title={isOwner ? "⚠️ Close Room?" : "Leave Room?"}
        message={isOwner
          ? "You are the room owner. Leaving will permanently delete:"
          : "Are you sure you want to leave this room?"
        }
        details={isOwner ? [
          "All chat messages",
          "All room members",
          "The entire room"
        ] : null}
        onConfirm={handleConfirmLeave}
        onCancel={handleCancelLeave}
        confirmText={isOwner ? "Close Room" : "Leave"}
        cancelText="Cancel"
        isDanger={isOwner}
      />
    </div>
  );
}

export default RoomPage;
