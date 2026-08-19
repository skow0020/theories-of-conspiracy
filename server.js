const { createServer } = require('http');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = Number(process.env.PORT || 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const rooms = new Map();

function normalizeRoomCode(code) {
  const normalized = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
  if (!normalized) return '';
  const compact = normalized.replace(/^CON/, '').slice(0, 6);
  return `CON-${compact}`;
}

function generateRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const chars = [];
  for (let i = 0; i < 6; i += 1) {
    const source = i % 2 === 0 ? letters : digits;
    chars.push(source[Math.floor(Math.random() * source.length)]);
  }
  return `CON-${chars.join('')}`;
}

function clearVoteTimer(room) {
  if (!room) return;
  if (room.voteTimerInterval) {
    clearInterval(room.voteTimerInterval);
    room.voteTimerInterval = null;
  }
}

function getRoomWinner(room) {
  if (!room.theories.length) return null;

  const topVotes = Math.max(...room.theories.map((theory) => theory.votes || 0));
  const topTheories = room.theories.filter((theory) => (theory.votes || 0) === topVotes);

  if (topTheories.length > 1) {
    return { isTie: true, theory: null };
  }

  return { isTie: false, theory: topTheories[0] || null };
}

function broadcastRoomState(io, roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  io.to(roomCode).emit('room-state', {
    code: room.code,
    players: room.players,
    chooserIndex: room.chooserIndex,
    round: room.round,
    topic: room.topic,
    theories: room.theories,
    phase: room.phase,
    winner: room.winner,
    isTie: Boolean(room.isTie),
    voteTimer: room.voteTimer,
  });
}

function finalizeRound(io, roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  clearVoteTimer(room);
  room.voteTimer = 0;

  const winnerState = getRoomWinner(room);
  room.phase = 'results';
  room.isTie = Boolean(winnerState && winnerState.isTie);
  room.winner = winnerState && !winnerState.isTie ? winnerState.theory.author : (winnerState && winnerState.isTie ? 'Tie!' : null);

  if (winnerState && !winnerState.isTie && winnerState.theory) {
    const winnerPlayer = room.players.find((player) => player.name === winnerState.theory.author);
    if (winnerPlayer) winnerPlayer.score += 1;
  }

  broadcastRoomState(io, roomCode);
}

function startVoteTimer(io, roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  clearVoteTimer(room);

  room.voteTimerInterval = setInterval(() => {
    const currentRoom = rooms.get(roomCode);
    if (!currentRoom || currentRoom.phase !== 'voting') {
      clearVoteTimer(currentRoom);
      return;
    }

    currentRoom.voteTimer -= 1;
    if (currentRoom.voteTimer <= 0) {
      finalizeRound(io, roomCode);
      return;
    }

    broadcastRoomState(io, roomCode);
  }, 1000);
}

function createRoomData(code) {
  return {
    code,
    players: [],
    chooserIndex: 0,
    round: 1,
    topic: '',
    theories: [],
    phase: 'lobby',
    winner: null,
    isTie: false,
    voteTimer: 20,
    voteTimerInterval: null,
    votesByPlayer: new Map(),
    submittedBy: [],
  };
}

function getRoom(code) {
  const normalized = normalizeRoomCode(code);
  if (!rooms.has(normalized)) {
    rooms.set(normalized, createRoomData(normalized));
  }
  return rooms.get(normalized);
}

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    socket.on('create-room', ({ nickname }, callback) => {
      const safeName = String(nickname || '').trim();
      if (!safeName || safeName.toLowerCase() === 'you') {
        if (typeof callback === 'function') callback({ error: 'Alias is required and cannot be "You".' });
        return;
      }

      const code = normalizeRoomCode(generateRoomCode());
      const room = getRoom(code);
      const player = {
        id: socket.id,
        name: safeName,
        score: 0,
        badge: '🕵️',
      };

      room.players = [...room.players.filter((entry) => entry.id !== socket.id), player];
      socket.join(code);
      socket.data.roomCode = code;

      const payload = {
        code: room.code,
        players: room.players,
        chooserIndex: room.chooserIndex,
        round: room.round,
        topic: room.topic,
        theories: room.theories,
        phase: room.phase,
        winner: room.winner,
        isTie: Boolean(room.isTie),
        voteTimer: room.voteTimer,
      };

      if (typeof callback === 'function') callback(payload);
      io.to(code).emit('room-state', payload);
    });

    socket.on('join-room', ({ roomCode, nickname }, callback) => {
      const safeName = String(nickname || '').trim();
      if (!safeName || safeName.toLowerCase() === 'you') {
        if (typeof callback === 'function') callback({ error: 'Alias is required and cannot be "You".' });
        return;
      }

      const code = normalizeRoomCode(roomCode);
      if (!code) return;

      const room = rooms.get(code);
      if (!room) {
        if (typeof callback === 'function') {
          callback({ error: 'Room does not exist.' });
        }
        return;
      }

      const alreadyInRoom = room.players.some((player) => player.id === socket.id);

      if (!alreadyInRoom) {
        room.players.push({
          id: socket.id,
          name: safeName,
          score: 0,
          badge: '🕵️',
        });
      }

      socket.join(code);
      socket.data.roomCode = code;

      const payload = {
        code: room.code,
        players: room.players,
        chooserIndex: room.chooserIndex,
        round: room.round,
        topic: room.topic,
        theories: room.theories,
        phase: room.phase,
        winner: room.winner,
        isTie: Boolean(room.isTie),
        voteTimer: room.voteTimer,
      };

      if (typeof callback === 'function') callback(payload);
      io.to(code).emit('room-state', payload);
    });

    socket.on('start-round', ({ roomCode }) => {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      const room = getRoom(normalizedRoomCode);
      const chooserId = room.players[room.chooserIndex]?.id;
      if (socket.id !== chooserId) return;
      if (room.players.length < 2) return;

      room.phase = 'topic';
      room.theories = [];
      room.winner = null;
      room.isTie = false;
      room.topic = '';
      room.votesByPlayer = new Map();
      room.submittedBy = [];
      room.voteTimer = 20;
      clearVoteTimer(room);
      broadcastRoomState(io, roomCode);
    });

    socket.on('set-topic', ({ roomCode, topic }) => {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      const room = getRoom(normalizedRoomCode);
      const chooserId = room.players[room.chooserIndex]?.id;
      if (socket.id !== chooserId) return;

      room.topic = topic;
      room.phase = 'writing';
      room.isTie = false;
      room.votesByPlayer = new Map();
      room.submittedBy = [];
      room.voteTimer = 20;
      broadcastRoomState(io, roomCode);
    });

    socket.on('submit-theory', ({ roomCode, theoryText, authorName }) => {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      const room = getRoom(normalizedRoomCode);
      const author = authorName?.trim() || 'Guest';

      if (room.phase !== 'writing') return;
      if (room.submittedBy.includes(socket.id)) return;

      room.submittedBy.push(socket.id);
      room.theories.push({
        id: `${Date.now()}-${Math.random()}`,
        authorId: socket.id,
        author,
        text: theoryText,
        votes: 0,
        voters: [],
      });

      if (room.theories.length >= room.players.length) {
        room.phase = 'voting';
        room.voteTimer = 20;
        room.votesByPlayer = new Map();
        startVoteTimer(io, room.code);
      }

      broadcastRoomState(io, roomCode);
    });

    socket.on('cast-vote', ({ roomCode, theoryId }) => {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      const room = getRoom(normalizedRoomCode);
      if (room.phase !== 'voting') return;
      if (room.votesByPlayer.has(socket.id)) return;

      const selected = room.theories.find((theory) => theory.id === theoryId);
      if (!selected) return;

      const voterName = room.players.find((player) => player.id === socket.id)?.name || 'Guest';
      selected.votes = (selected.votes || 0) + 1;
      selected.voters = Array.from(new Set([...(selected.voters || []), voterName]));
      room.votesByPlayer.set(socket.id, theoryId);

      if (room.votesByPlayer.size >= room.players.length) {
        finalizeRound(io, roomCode);
        return;
      }

      broadcastRoomState(io, roomCode);
    });

    socket.on('next-round', ({ roomCode }) => {
      const normalizedRoomCode = normalizeRoomCode(roomCode);
      const room = getRoom(normalizedRoomCode);
      const chooserId = room.players[room.chooserIndex]?.id;
      if (socket.id !== chooserId) return;

      if (room.round >= 3) {
        room.phase = 'game-over';
        room.topic = '';
        room.theories = [];
        room.winner = null;
        room.isTie = false;
        room.voteTimer = 0;
        room.votesByPlayer = new Map();
        room.submittedBy = [];
        clearVoteTimer(room);
        broadcastRoomState(io, roomCode);
        return;
      }

      room.chooserIndex = (room.chooserIndex + 1) % Math.max(room.players.length, 1);
      room.round += 1;
      room.phase = 'topic';
      room.topic = '';
      room.theories = [];
      room.winner = null;
      room.isTie = false;
      room.voteTimer = 20;
      room.votesByPlayer = new Map();
      room.submittedBy = [];
      clearVoteTimer(room);
      broadcastRoomState(io, roomCode);
    });

    socket.on('disconnect', () => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;
      const room = rooms.get(roomCode);
      if (!room) return;

      room.players = room.players.filter((player) => player.id !== socket.id);
      if (room.players.length === 0) {
        rooms.delete(roomCode);
      } else {
        if (room.chooserIndex >= room.players.length) {
          room.chooserIndex = 0;
        }
        broadcastRoomState(io, roomCode);
      }
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
