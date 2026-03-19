const path = require('path');

const IMAGE_MIME_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

function inferMimeTypeFromName(filename = '') {
  const extension = path.extname(filename).slice(1).toLowerCase();
  return IMAGE_MIME_TYPES[extension];
}

function serializeAttachmentRecord(record, attachmentId = record?.id) {
  if (!record || !attachmentId) {
    return null;
  }

  const filename = record.filename;
  const mimetype =
    inferMimeTypeFromName(record.filename) ||
    record.mimetype;
  const size = record.size;

  return {
    id: attachmentId,
    filename,
    url: `/api/files/${attachmentId}`,
    mimetype,
    size,
    encrypted: Boolean(record.encrypted),
    iv: record.attachment_iv ?? record.iv ?? null,
    metadata: record.metadata ?? null,
  };
}

function serializeSocketMessage(record) {
  const message = {
    id: record.message_id,
    senderUsername: record.sender_username,
    encryptedData: record.encrypted_data,
    iv: record.iv,
    timestamp: new Date(record.created_at).getTime(),
  };

  const attachment = record.attachment_id
    ? serializeAttachmentRecord({ ...record, id: record.attachment_id }, record.attachment_id)
    : null;

  if (attachment) {
    message.attachment = attachment;
  }

  return message;
}

function serializeApiMessage(record) {
  return {
    messageId: record.message_id,
    senderUsername: record.sender_username,
    encryptedData: record.encrypted_data,
    iv: record.iv,
    state: record.state,
    createdAt: record.created_at,
    attachment: record.attachment_id
      ? serializeAttachmentRecord({ ...record, id: record.attachment_id }, record.attachment_id)
      : null,
  };
}

module.exports = {
  inferMimeTypeFromName,
  serializeAttachmentRecord,
  serializeSocketMessage,
  serializeApiMessage,
};
