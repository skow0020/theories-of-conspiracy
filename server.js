import { createServer } from 'http';
import next from 'next';
import { Server } from 'socket.io';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = Number(process.env.PORT || 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const rooms = new Map();

function generateRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  let code = 'CON-';
  for (let i = 0; i < 4; i += 1) {
    const chars = i % 2 === 0 ? letters : digits;
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function clearVoteTimer(room) {
  if (room.voteTimerInterval) {
    clearInterval(room.voteTimerInterval);
    room.voteTimerInterval = null;
  }
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
      currentRoom.voteTimer = 0;
      currentRoom.phase = 'results';
      currentRoom.winner = 'The room decided to keep the chaos alive';
      clearVoteTimer(currentRoom);
    }

    io.to(roomCode).emit('room-state', currentRoom);
  }, 1000);
}

function createRoomData(code) {
  return {
    code,
    players: [],
    judgeIndex: 0,
    round: 1,
    topic: '',
    theories: [],
    phase: 'lobby',
    winner: null,
    voteTimer: 20,
    voteTimerInterval: null,
  };
}

function getRoom(code) {
  const normalized = code.toUpperCase();
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
      const code = generateRoomCode();
      const room = getRoom(code);
      const player = {
        id: socket.id,
        name: nickname?.trim() || 'Guest',
        score: 0,
        badge: '🕵️',
      };

      room.players = [...room.players.filter((entry) => entry.id !== socket.id), player];
      socket.join(code);
      socket.data.roomCode = code;

      const payload = {
        code: room.code,
        players: room.players,
        judgeIndex: room.judgeIndex,
        round: room.round,
        topic: room.topic,
        theories: room.theories,
        phase: room.phase,
        winner: room.winner,
        voteTimer: room.voteTimer,
      };

      if (typeof callback === 'function') callback(payload);
      io.to(code).emit('room-state', payload);
    });

    socket.on('join-room', ({ roomCode, nickname }, callback) => {
      const code = (roomCode || '').toUpperCase();
      if (!code) return;

      const room = getRoom(code);
      const alreadyInRoom = room.players.some((player) => player.id === socket.id);

      if (!alreadyInRoom) {
        room.players.push({
          id: socket.id,
          name: nickname?.trim() || 'Guest',
          score: 0,
          badge: '🕵️',
        });
      }

      socket.join(code);
      socket.data.roomCode = code;

      const payload = {
        code: room.code,
        players: room.players,
        judgeIndex: room.judgeIndex,
        round: room.round,
        topic: room.topic,
        theories: room.theories,
        phase: room.phase,
        winner: room.winner,
        voteTimer: room.voteTimer,
      };

      if (typeof callback === 'function') callback(payload);
      io.to(code).emit('room-state', payload);
    });

    socket.on('start-round', ({ roomCode }) => {
      const room = getRoom(roomCode);
      const judgeId = room.players[room.judgeIndex]?.id;
      if (socket.id !== judgeId) return;

      room.phase = 'topic';
      room.theories = [];
      room.winner = null;
      room.topic = '';
      clearVoteTimer(room);
      io.to(roomCode).emit('room-state', {
        code: room.code,
        players: room.players,
        judgeIndex: room.judgeIndex,
        round: room.round,
        topic: room.topic,
        theories: room.theories,
        phase: room.phase,
        winner: room.winner,
        voteTimer: room.voteTimer,
      });
    });

    socket.on('set-topic', ({ roomCode, topic }) => {
      const room = getRoom(roomCode);
      const judgeId = room.players[room.judgeIndex]?.id;
      if (socket.id !== judgeId) return;

      room.topic = topic;
      room.phase = 'writing';
      io.to(roomCode).emit('room-state', {
        code: room.code,
        players: room.players,
        judgeIndex: room.judgeIndex,
        round: room.round,
        topic: room.topic,
        theories: room.theories,
        phase: room.phase,
        winner: room.winner,
        voteTimer: room.voteTimer,
      });
    });

    socket.on('submit-theory', ({ roomCode, theoryText, authorName }) => {
      const room = getRoom(roomCode);
      const judgeId = room.players[room.judgeIndex]?.id;
      const author = authorName?.trim() || 'Guest';

      if (room.phase !== 'writing') return;
      if (socket.id === judgeId) return;
      if (room.theories.some((theory) => theory.authorId === socket.id)) return;

      room.theories.push({
        id: `${Date.now()}-${Math.random()}`,
        authorId: socket.id,
        author,
        text: theoryText,
      });

      if (room.theories.length >= Math.max(room.players.length - 1, 1)) {
        room.phase = 'voting';
        room.voteTimer = 20;
        startVoteTimer(io, room.code);
      }

      io.to(roomCode).emit('room-state', {
        code: room.code,
        players: room.players,
        judgeIndex: room.judgeIndex,
        round: room.round,
        topic: room.topic,
        theories: room.theories,
        phase: room.phase,
        winner: room.winner,
        voteTimer: room.voteTimer,
      });
    });

    socket.on('cast-vote', ({ roomCode, theoryId }) => {
      const room = getRoom(roomCode);
      const judgeId = room.players[room.judgeIndex]?.id;
      if (socket.id !== judgeId) return;

      const selected = room.theories.find((theory) => theory.id === theoryId);
      if (!selected) return;

      room.winner = selected.author;
      const player = room.players.find((entry) => entry.name === selected.author);
      if (player) player.score += 1;
      room.phase = 'results';
      clearVoteTimer(room);

      io.to(roomCode).emit('room-state', {
        code: room.code,
        players: room.players,
        judgeIndex: room.judgeIndex,
        round: room.round,
        topic: room.topic,
        theories: room.theories,
        phase: room.phase,
        winner: room.winner,
        voteTimer: room.voteTimer,
      });
    });

    socket.on('next-round', ({ roomCode }) => {
      const room = getRoom(roomCode);
      const judgeId = room.players[room.judgeIndex]?.id;
      if (socket.id !== judgeId) return;

      room.judgeIndex = (room.judgeIndex + 1) % Math.max(room.players.length, 1);
      room.round += 1;
      room.phase = 'topic';
      room.topic = '';
      room.theories = [];
      room.winner = null;
      room.voteTimer = 20;
      clearVoteTimer(room);

      io.to(roomCode).emit('room-state', {
        code: room.code,
        players: room.players,
        judgeIndex: room.judgeIndex,
        round: room.round,
        topic: room.topic,
        theories: room.theories,
        phase: room.phase,
        winner: room.winner,
        voteTimer: room.voteTimer,
      });
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
        io.to(roomCode).emit('room-state', {
          code: room.code,
          players: room.players,
          judgeIndex: room.judgeIndex,
          round: room.round,
          topic: room.topic,
          theories: room.theories,
          phase: room.phase,
          winner: room.winner,
          voteTimer: room.voteTimer,
        });
      }
    });
  });

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
