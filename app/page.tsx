"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

type Phase = "home" | "lobby" | "topic" | "writing" | "voting" | "results" | "game-over";

type Player = {
  id: string;
  name: string;
  score: number;
  badge: string;
};

type TheoryCard = {
  id: string;
  author: string;
  authorId?: string;
  text: string;
  votes?: number;
  voters?: string[];
};

type RoomState = {
  code: string;
  players: Player[];
  chooserIndex: number;
  round: number;
  topic: string;
  theories: TheoryCard[];
  phase: Phase;
  winner: string | null;
  isTie?: boolean;
  voteTimer: number;
};

const topicBank = [
  "The moon landing was filmed in a giant warehouse above a laundromat",
  "Your neighborhood wifi router is powered by a secret municipal weather machine",
  "The pigeons on the bridge are secretly running a covert delivery network",
  "The toaster in the office is listening for corporate secrets",
  "Every viral trend is a government test to see how quickly people panic",
  "The supermarket self-checkout is actually a social experiment for shopper obedience",
  "A hidden faction of librarians controls the internet using overdue fines",
  "The local bus route only exists to track who is most likely to buy expensive sneakers",
  "The giant billboard on the highway is a subliminal scoreboard used by the moon cult",
  "The city fountain only starts working when the mayor tells a lie at dinner",
];

const normalizeRoomCode = (value: string) => {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
  if (!normalized) return "";
  const compact = normalized.replace(/^CON/, "").slice(0, 6);
  return `CON-${compact}`;
};

const generateRoomCode = () => {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const chars = Array.from({ length: 6 }, (_, index) =>
    index % 2 === 0
      ? letters[Math.floor(Math.random() * letters.length)]
      : digits[Math.floor(Math.random() * digits.length)],
  );
  return `CON-${chars.join("")}`;
};

const shuffleTopics = () => {
  const arr = [...topicBank];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 3);
};

export default function Home() {
  const socketRef = useRef<Socket | null>(null);
  const phaseRef = useRef<Phase>("home");
  const roomCodeRef = useRef("");
  const [phase, setPhase] = useState<Phase>("home");
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("You");
  const [customTopic, setCustomTopic] = useState("");
  const [players, setPlayers] = useState<Player[]>([]);
  const [chooserIndex, setChooserIndex] = useState(0);
  const [round, setRound] = useState(1);
  const [topic, setTopic] = useState("");
  const [theories, setTheories] = useState<TheoryCard[]>([]);
  const [submittedText, setSubmittedText] = useState("");
  const [winner, setWinner] = useState<string | null>(null);
  const [isTie, setIsTie] = useState(false);
  const [copied, setCopied] = useState(false);
  const [voteTimer, setVoteTimer] = useState(20);
  const [isConnected, setIsConnected] = useState(false);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [hasSubmittedTheory, setHasSubmittedTheory] = useState(false);
  const [hasVotedThisRound, setHasVotedThisRound] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [shuffledSuggestions] = useState<string[]>(() => shuffleTopics());

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  useEffect(() => {
    const socketUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

    const socket = io(socketUrl, {
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
      timeout: 10000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      setCurrentPlayerId(socket.id ?? null);
    });
    socket.on("connect_error", () => {
      setIsConnected(false);
    });
    socket.on("disconnect", () => {
      setIsConnected(false);
      setCurrentPlayerId(null);
    });

    socket.on("room-state", (state: RoomState) => {
      setRoomCode((previousCode) => state.code || previousCode || "");
      setPlayers(state.players || []);
      setChooserIndex(state.chooserIndex || 0);
      setRound(state.round || 1);
      setPhase(state.phase || "lobby");
      setTopic(state.topic || "");
      setTheories(state.theories || []);
      setWinner(state.winner || null);
      setIsTie(Boolean(state.isTie));
      setVoteTimer(state.voteTimer ?? 20);

      const currentName = state.players.find((player) => player.id === socket.id)?.name || nickname;
      setHasSubmittedTheory((state.theories || []).some((theory) => theory.authorId === socket.id));
      setHasVotedThisRound((state.theories || []).some((theory) => Array.isArray(theory.voters) && theory.voters.includes(currentName)));
    });

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (phaseRef.current !== "home" && roomCodeRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      socket.disconnect();
    };
  }, []);

  const activeChooser = players[chooserIndex % Math.max(players.length, 1)] ?? null;
  const isTopicChooser = Boolean(activeChooser && currentPlayerId && activeChooser.id === currentPlayerId);
  const lobbyStatusText = isConnected ? "Online" : "Connecting...";

  const createRoom = () => {
    const socket = socketRef.current;
    if (!socket || !isConnected) return;

    socket.emit("create-room", { nickname: nickname.trim() || "Guest" }, (response: RoomState) => {
      setRoomCode(response.code || generateRoomCode());
      setPlayers(response.players || []);
      setChooserIndex(response.chooserIndex || 0);
      setRound(response.round || 1);
      setPhase(response.phase || "lobby");
      setTopic(response.topic || "");
      setTheories(response.theories || []);
      setWinner(response.winner || null);
      setIsTie(Boolean(response.isTie));
      setVoteTimer(response.voteTimer ?? 20);
      setSubmittedText("");
      setHasSubmittedTheory(false);
      setHasVotedThisRound(false);
    });
  };

  const joinRoom = () => {
    const socket = socketRef.current;
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    if (!socket || !isConnected || !normalizedRoomCode) return;

    socket.emit("join-room", { roomCode: normalizedRoomCode, nickname: nickname.trim() || "Guest" }, (response: RoomState & { error?: string }) => {
      if (response?.error) {
        setJoinError(response.error);
        setPhase("home");
        setRoomCode("");
        return;
      }

      setJoinError("");
      setRoomCode(response.code || normalizedRoomCode);
      setPlayers(response.players || []);
      setChooserIndex(response.chooserIndex || 0);
      setRound(response.round || 1);
      setPhase(response.phase || "lobby");
      setTopic(response.topic || "");
      setTheories(response.theories || []);
      setWinner(response.winner || null);
      setVoteTimer(response.voteTimer ?? 20);
      setSubmittedText("");
      setHasSubmittedTheory(false);
      setHasVotedThisRound(false);
    });
  };

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  const pickTopic = (value: string) => {
    const socket = socketRef.current;
    if (!socket || !isTopicChooser) return;
    socket.emit("set-topic", { roomCode, topic: value });
    setCustomTopic("");
  };

  const submitTheory = () => {
    const socket = socketRef.current;
    if (!socket || !roomCode || hasSubmittedTheory) return;

    const finalText = submittedText.trim() || `The ${topic.toLowerCase()} scandal is being covered up by a moonlit committee of pigeons.`;
    setHasSubmittedTheory(true);
    socket.emit("submit-theory", {
      roomCode,
      theoryText: finalText,
      authorName: nickname.trim() || "Guest",
    });
    setSubmittedText("");
  };

  const castVote = (selectedId: string) => {
    const socket = socketRef.current;
    if (!socket || !roomCode || hasVotedThisRound) return;
    setHasVotedThisRound(true);
    socket.emit("cast-vote", { roomCode, theoryId: selectedId });
  };

  const nextRound = () => {
    const socket = socketRef.current;
    if (!socket || !roomCode || !isTopicChooser) return;
    socket.emit("next-round", { roomCode });
  };

  return (
    <main className="min-h-screen bg-[#0f1021] px-4 py-6 text-white">
      <div className="mx-auto max-w-md">
        {phase !== "home" && phase !== "lobby" && (
          <div className="mb-4 rounded-[28px] border border-cyan-400/20 bg-slate-900/70 p-4 shadow-xl shadow-cyan-500/10">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs uppercase tracking-[0.2em] text-cyan-300">Room code</span>
              <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-sm font-bold text-cyan-100">{roomCode}</span>
            </div>
          </div>
        )}

        {phase === "home" && (
          <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl">
            <div className="mb-6 inline-flex rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
              social chaos
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white">Theories of Conspiracy</h1>
            <p className="mt-3 text-sm text-slate-300">
              Gather a crew, pick a chaotic topic, and see who can invent the wildest conspiracy the group believes in most.
            </p>

            <div className="mt-6 space-y-3">
              <label className="block text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                Your alias
              </label>
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-base text-white outline-none ring-0 placeholder:text-slate-500 focus:border-cyan-400"
                placeholder="You"
              />
            </div>

            <div className="mt-8 grid gap-3">
              <button
                disabled={!isConnected}
                onClick={createRoom}
                className="rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isConnected ? "New room" : "Connecting..."}
              </button>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  value={roomCode}
                  onChange={(event) => {
                    setRoomCode(normalizeRoomCode(event.target.value));
                    if (joinError) setJoinError("");
                  }}
                  className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-center text-sm font-semibold tracking-[0.18em] text-cyan-100 uppercase outline-none focus:border-cyan-400"
                  placeholder="Code"
                />
                <button
                  disabled={!isConnected}
                  onClick={joinRoom}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Join room
                </button>
              </div>
              {joinError && (
                <div className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
                  {joinError}
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-100">
              <span>Realtime lobby</span>
              <span>{lobbyStatusText}</span>
            </div>
          </section>
        )}

        {phase === "lobby" && (
          <section className="space-y-4">
            <div className="rounded-[28px] border border-cyan-400/20 bg-slate-900/70 p-4 shadow-xl shadow-cyan-500/10">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.2em] text-cyan-300">Room code</span>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-sm font-bold text-cyan-100">{roomCode}</span>
                  <button
                    onClick={copyRoomCode}
                    className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white transition hover:bg-white/10"
                  >
                    {copied ? "Copied" : "Share"}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold">Players</h2>
                <span className="text-xs text-slate-400">{players.length}</span>
              </div>
              <div className="space-y-2">
                {players.map((player) => (
                  <div key={player.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{player.badge}</span>
                      <div>
                        <div className="font-medium text-white">{player.name}</div>
                        <div className="text-xs text-slate-400">{player.id === currentPlayerId ? "you" : "guest"}</div>
                      </div>
                    </div>
                    <span className="rounded-full bg-white/5 px-2 py-1 text-xs font-semibold text-cyan-200">{player.score} pts</span>
                  </div>
                ))}
              </div>

              <button
                disabled={!isTopicChooser || players.length < 2}
                onClick={() => {
                  const socket = socketRef.current;
                  if (socket && roomCode && isTopicChooser && players.length >= 2) socket.emit("start-round", { roomCode });
                }}
                className="mt-5 w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 to-purple-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {players.length < 2 ? "Need at least 2 players" : isTopicChooser ? `Start round ${round}` : "Waiting for topic chooser"}
              </button>
            </div>
          </section>
        )}

        {phase === "topic" && (
          isTopicChooser ? (
            <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Round {round}</p>
                  <h2 className="mt-1 text-2xl font-black">Topic chooser: {activeChooser?.name || "—"}</h2>
                </div>
                <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-xs font-semibold text-cyan-100">{roomCode}</span>
              </div>

              <div className="rounded-2xl border border-dashed border-cyan-400/35 bg-cyan-500/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Topic</p>
                <p className="mt-2 text-lg font-bold text-white">{topic || "Choose a topic for this round"}</p>
              </div>

              <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 p-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200">Round briefing</p>
                <p className="mt-1 text-sm text-cyan-50">Pick a chaotic topic and let everyone invent a wild conspiracy theory.</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">AI topic suggestions</p>
                {shuffledSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => pickTopic(suggestion)}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-3 text-left text-sm text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-500/5"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Custom topic</label>
                <input
                  value={customTopic}
                  onChange={(event) => setCustomTopic(event.target.value)}
                  placeholder="Add your own absurd topic"
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400"
                />
                <button
                  onClick={() => pickTopic(customTopic.trim() || topic || shuffledSuggestions[0])}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Use custom topic
                </button>
              </div>
            </section>
          ) : (
            <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Round {round}</p>
                  <h2 className="mt-1 text-2xl font-black">Topic chooser: {activeChooser?.name || "—"}</h2>
                </div>
                <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-1 text-xs font-semibold text-cyan-100">{roomCode}</span>
              </div>
              <div className="rounded-2xl border border-dashed border-cyan-400/35 bg-cyan-500/5 p-4 text-sm text-cyan-50">
                The topic chooser is picking a fresh conspiracy prompt. Get ready to write your wildest theory.
              </div>
            </section>
          )
        )}

        {phase === "writing" && (
          <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="rounded-2xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-fuchsia-200">Current topic</p>
              <p className="mt-2 text-lg font-bold text-white">{topic}</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Your conspiracy</label>
              <textarea
                value={submittedText}
                onChange={(event) => setSubmittedText(event.target.value)}
                rows={5}
                disabled={hasSubmittedTheory}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder={hasSubmittedTheory ? "Waiting for all submissions..." : "Write the most ridiculous conspiracy you can imagine..."}
              />
            </div>

            <div className="grid gap-2">
              <button
                disabled={hasSubmittedTheory}
                onClick={submitTheory}
                className="rounded-2xl bg-gradient-to-r from-fuchsia-500 to-pink-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-fuchsia-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {hasSubmittedTheory ? "Theory submitted" : "Submit theory"}
              </button>
              {!hasSubmittedTheory && (
                <button
                  onClick={() => setSubmittedText("The entire town is being run by a council of suspiciously organized squirrels who own the bakery.")}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Use a random absurd suggestion
                </button>
              )}
              {hasSubmittedTheory && (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                  Waiting for all submissions before voting begins.
                </div>
              )}
            </div>
          </section>
        )}

        {phase === "voting" && (
          <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-cyan-300">Round voting</p>
                <h2 className="mt-1 text-xl font-black">Choose the wildest theory</h2>
              </div>
              <div className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-xs font-bold text-cyan-100">
                {voteTimer}s
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-cyan-400/35 bg-cyan-500/5 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">Topic</p>
              <p className="mt-2 text-base font-bold text-white">{topic}</p>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-fuchsia-500 transition-all duration-1000"
                style={{ width: `${Math.max((voteTimer / 20) * 100, 0)}%` }}
              />
            </div>

            <div className="space-y-3">
              {theories.map((theory, index) => (
                <button
                  key={theory.id}
                  onClick={() => castVote(theory.id)}
                  disabled={hasVotedThisRound}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/30 p-4 text-left transition hover:border-cyan-400/40 hover:bg-cyan-500/5 disabled:cursor-not-allowed disabled:opacity-80"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-bold text-white">Theory {index + 1}</span>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{theory.votes ?? 0} votes</span>
                  </div>
                  <p className="text-sm leading-6 text-slate-200">{theory.text}</p>
                  <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-cyan-200">
                    {hasVotedThisRound ? "Vote locked in" : "Tap to vote"}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}

        {phase === "results" && (
          <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
            <div className="rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-pink-500 p-[1px]">
              <div className="rounded-2xl bg-slate-950/90 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-amber-200">Round winner</p>
                <h2 className="mt-2 text-3xl font-black text-white">{winner || "No winner"}</h2>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Vote breakdown</p>
              <div className="mt-3 space-y-3">
                {theories
                  .slice()
                  .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
                  .map((theory) => (
                    <div key={theory.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="font-semibold text-white">{theory.author}</span>
                        <span className="text-xs uppercase tracking-[0.18em] text-cyan-200">{theory.votes ?? 0} votes</span>
                      </div>
                      <p className="text-sm text-slate-200">{theory.text}</p>
                      {Array.isArray(theory.voters) && theory.voters.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {theory.voters.map((voter) => (
                            <span key={`${theory.id}-${voter}`} className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100">
                              {voter}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-slate-400">No votes</p>
                      )}
                    </div>
                  ))}
              </div>

              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-400">Round summary</p>
              <div className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-3 text-sm text-emerald-100">
                {isTie
                  ? "It’s a tie! No one gets a point."
                  : winner
                    ? `The theory from ${winner} takes the round and earns a point.`
                    : "No theory received votes this round."}
              </div>

              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-slate-400">Leaderboard</p>
              <div className="mt-3 space-y-2">
                {players
                  .slice()
                  .sort((a, b) => b.score - a.score)
                  .map((player) => (
                    <div key={player.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span>{player.badge}</span>
                        <span className="font-medium text-white">{player.name}</span>
                      </div>
                      <span className="text-sm font-bold text-cyan-200">{player.score}</span>
                    </div>
                  ))}
              </div>
            </div>

            <button
              disabled={!isTopicChooser}
              onClick={nextRound}
              className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isTopicChooser ? (round >= 10 ? "Finish game" : "Next round") : "Waiting for topic chooser"}
            </button>
          </section>
        )}

        {phase === "game-over" && (
          <section className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
            <div className="rounded-[28px] border border-amber-400/30 bg-amber-500/10 p-4 text-center">
              <p className="text-xs uppercase tracking-[0.22em] text-amber-200">Final round</p>
              <h2 className="mt-3 text-4xl font-black text-white">Quit milk mixin</h2>
              <p className="mt-2 text-sm text-amber-100">go outside you filthy animals</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Room code</p>
              <div className="mt-2 flex items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/10 px-3 py-2 text-sm font-bold text-cyan-100">{roomCode}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Leaderboard</p>
              <div className="mt-3 space-y-2">
                {players
                  .slice()
                  .sort((a, b) => b.score - a.score)
                  .map((player) => (
                    <div key={player.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span>{player.badge}</span>
                        <span className="font-medium text-white">{player.name}</span>
                      </div>
                      <span className="text-sm font-bold text-cyan-200">{player.score}</span>
                    </div>
                  ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
