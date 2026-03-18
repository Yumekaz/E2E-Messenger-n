const db = require('../database/db');

function buildMemberSnapshot(roomId) {
  const dbMembers = db.getRoomMembers(roomId);
  const memberKeys = {};
  const members = [];

  for (const member of dbMembers) {
    members.push(member.username);
    if (member.public_key) {
      memberKeys[member.username] = member.public_key;
    }
  }

  return { members, memberKeys };
}

function emitMembersUpdate(io, roomId) {
  const snapshot = buildMemberSnapshot(roomId);

  io.to(roomId).emit('members-update', snapshot);

  return snapshot;
}

module.exports = {
  buildMemberSnapshot,
  emitMembersUpdate,
};
