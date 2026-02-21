import React, { useState, useEffect, useRef } from 'react';
import { Flame, ArrowLeft, Trophy, Clock, Wallet, CheckCircle, Crosshair, User, LogIn, Activity } from 'lucide-react';
import { io, Socket } from 'socket.io-client';

const socket = io('http://localhost:3001');

// --- Types ---
type UserAccount = {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  balance: number;
};

type RoastEntry = {
  id: string;
  roasterId: string;
  roasterName: string;
  text: string;
  entryStake: number;
  backedStake: number;
  myBackedAmount: number; // how much the specific logged-in user backed this
};

type Arena = {
  id: string;
  opId: string;
  opName: string;
  opHandle: string;
  opAvatar: string;
  text: string;
  stake: number;
  endTime: number;
  status: 'active' | 'resolved';
  winnerRoastId?: string;
  roasts: RoastEntry[];
};

type ActivityLog = {
  id: string;
  message: string;
  timestamp: number;
};

// Ensure initial state relies on the websocket
const INITIAL_ARENAS: Arena[] = [];

export default function App() {
  // --- Global State ---
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [arenas, setArenas] = useState<Arena[]>(INITIAL_ARENAS);
  // Store previous arenas to detect generic status changes for payouts
  const prevArenasRef = useRef<Arena[]>([]);

  const [activeArenaId, setActiveArenaId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [activityFeed, setActivityFeed] = useState<ActivityLog[]>([]);

  // Forms
  const [authName, setAuthName] = useState("");
  const [authHandle, setAuthHandle] = useState("");
  const [newArenaText, setNewArenaText] = useState("");
  const [newRoastText, setNewRoastText] = useState("");

  // --- Real-Time Sync & Engine Tick ---
  useEffect(() => {
    // Sync the master clock for UI visually
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    // Socket Handlers
    socket.on('state-update', (serverArenas: Arena[]) => {
      setArenas(serverArenas);

      // Check for payouts
      if (currentUser) {
        serverArenas.forEach(arena => {
          const oldArena = prevArenasRef.current.find(a => a.id === arena.id);
          // If it just resolved on the server
          if (oldArena && oldArena.status === 'active' && arena.status === 'resolved') {
            processPayout(arena);
          }
        });
      }
      prevArenasRef.current = serverArenas;
    });

    socket.on('activity-update', (log: ActivityLog) => {
      setActivityFeed(prev => {
        // Prevent dupes
        if (prev.find(p => p.id === log.id)) return prev;
        return [log, ...prev].slice(0, 10);
      });
    });

    return () => {
      clearInterval(timer);
      socket.off('state-update');
      socket.off('activity-update');
    };
  }, [currentUser]);

  const processPayout = (arena: Arena) => {
    if (!currentUser || arena.roasts.length === 0 || !arena.winnerRoastId) return;

    const winner = arena.roasts.find(r => r.id === arena.winnerRoastId);
    if (!winner) return;

    const losingBackingPool = arena.roasts
      .filter(r => r.id !== winner.id)
      .reduce((sum, r) => sum + r.backedStake, 0);

    const winnerBackingPool = winner.backedStake;
    let payout = 0;

    // 1. Did user back the winner?
    // Note: Since 'myBackedAmount' is local to tab, calculate logically, OR ideally track globally per user ID in server.
    // For this prototype we will assume the local DOM tracking works if they didn't refresh.
    if (winner.myBackedAmount > 0 && winnerBackingPool > 0) {
      const userShareRatio = winner.myBackedAmount / winnerBackingPool;
      const profit = userShareRatio * (0.9 * losingBackingPool);
      payout += winner.myBackedAmount + profit;
    }

    // 2. Is user winning roaster?
    if (winner.roasterId === currentUser.id) {
      payout += (0.7 * arena.stake) + (0.7 * (arena.roasts.length - 1) * 0.01);
    }

    // 3. Is user the OP?
    if (arena.opId === currentUser.id) {
      payout += 0.05 * (losingBackingPool + winnerBackingPool);
    }

    if (payout > 0) {
      setCurrentUser(prev => prev ? { ...prev, balance: prev.balance + payout } : null);
    }
  };

  // --- Actions ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!authName || !authHandle) return;
    const cleanHandle = authHandle.startsWith('@') ? authHandle : `@${authHandle}`;
    setCurrentUser({
      id: `dev_${Math.floor(Math.random() * 1000)}`,
      name: authName,
      handle: cleanHandle,
      avatar: authName.charAt(0).toUpperCase(),
      balance: 10.0 // Everyone starts with 10 MONAD airdrop
    });

    socket.emit('join', cleanHandle);
  };

  const handleCreateArena = () => {
    if (!currentUser || !newArenaText.trim()) return;
    if (currentUser.balance < 0.05) return alert("Need 0.05 MONAD to post.");

    setCurrentUser({ ...currentUser, balance: currentUser.balance - 0.05 });

    // Emit to Server
    socket.emit('create-arena', {
      opId: currentUser.id,
      opName: currentUser.name,
      opHandle: currentUser.handle,
      opAvatar: currentUser.avatar,
      text: newArenaText,
    });

    setNewArenaText("");
  };

  const handleStakeOnRoast = (arenaId: string, roastId: string) => {
    const amount = 0.05;
    if (!currentUser || currentUser.balance < amount) return;

    setCurrentUser({ ...currentUser, balance: currentUser.balance - amount });

    // Update local immediately for 'myBackedAmount' tracking
    setArenas(prev => prev.map(a => {
      if (a.id !== arenaId) return a;
      return {
        ...a,
        roasts: a.roasts.map(r => r.id === roastId ? { ...r, myBackedAmount: r.myBackedAmount + amount } : r)
      }
    }));

    socket.emit('stake-roast', {
      arenaId, roastId, amount, userHandle: currentUser.handle
    });
  };

  const handleSubmitRoast = (arenaId: string) => {
    if (!currentUser || !newRoastText.trim()) return;
    const entryFee = 0.01;
    if (currentUser.balance < entryFee) return alert("Need 0.01 MONAD to enter the arena!");

    setCurrentUser({ ...currentUser, balance: currentUser.balance - entryFee });

    socket.emit('submit-roast', {
      arenaId,
      roastData: {
        id: Math.random().toString(36).substring(7),
        roasterId: currentUser.id,
        roasterName: currentUser.name,
        text: newRoastText,
        entryStake: entryFee,
        backedStake: 0,
        myBackedAmount: 0
      }
    });

    setNewRoastText("");
  };

  // --- Views ---
  const formatTimeInfo = (endTime: number) => {
    const diff = endTime - currentTime;
    if (diff <= 0) return "00:00";
    const m = Math.floor((diff / 1000) / 60);
    const s = Math.floor((diff / 1000) % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!currentUser) {
    return (
      <>
        <div className="cyberpunk-bg"></div>
        <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', position: 'relative', zIndex: 10 }}>

          {/* Neon sparks via inline divs to avoid excessive CSS rules */}
          <div style={{ position: 'absolute', top: '20%', left: '15%', width: '4px', height: '4px', background: 'var(--neon-pink)', boxShadow: '0 0 10px 4px rgba(255,0,127,0.8)', animation: 'float 3s infinite alternate' }}></div>
          <div style={{ position: 'absolute', top: '70%', right: '20%', width: '6px', height: '6px', background: 'var(--toxic-green)', boxShadow: '0 0 10px 4px rgba(0,255,136,0.8)', animation: 'float 4s infinite alternate-reverse' }}></div>
          <div style={{ position: 'absolute', top: '40%', right: '10%', width: '3px', height: '3px', background: 'var(--electric-blue)', boxShadow: '0 0 10px 4px rgba(0,247,255,0.8)', animation: 'float 2s infinite alternate' }}></div>

          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '5rem',
            width: '100%',
            maxWidth: '1200px'
          }}>

            {/* Left: Branding */}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                <Flame size={64} style={{ color: 'var(--neon-pink)', filter: 'drop-shadow(0 0 20px rgba(255,0,127,0.8))' }} />
                <h1 style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '4.5rem',
                  lineHeight: '0.9',
                  margin: 0,
                  textTransform: 'uppercase',
                  background: 'linear-gradient(90deg, var(--neon-pink), var(--electric-blue), var(--neon-pink))',
                  backgroundSize: '200% auto',
                  color: 'transparent',
                  WebkitBackgroundClip: 'text',
                  animation: 'text-shimmer 4s linear infinite',
                  letterSpacing: '-0.05em'
                }}>
                  MONAD<br />RAGEBAIT
                </h1>
              </div>

              <h2 style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.5rem',
                color: 'var(--text-primary)',
                marginBottom: '2rem',
                borderLeft: '4px solid var(--toxic-green)',
                paddingLeft: '1rem',
                textShadow: '0 0 10px rgba(255,255,255,0.3)'
              }}>
                Stake the Roast.<br />Win the Chaos.
              </h2>

              {/* Typing effect simulation */}
              <div className="mono" style={{
                color: 'var(--electric-blue)',
                fontSize: '1rem',
                opacity: 0.8,
                background: 'rgba(0,247,255,0.1)',
                padding: '0.8rem',
                border: '1px solid rgba(0,247,255,0.3)',
                display: 'inline-block'
              }}>
                &gt; Likes are free. Consequences aren't_<span style={{ animation: 'flash 1s infinite' }}></span>
              </div>
            </div>

            {/* Right: The Glass Card */}
            <div className="login-glass-card" style={{ flex: '0 0 450px' }}>
              <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                <div>
                  <label className="mono" style={{ color: 'var(--neon-pink)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '2px', display: 'block', marginBottom: '0.5rem' }}>
                    [IDENTIFICATION]
                  </label>
                  <input
                    type="text"
                    className="neon-input"
                    placeholder="🔥 Your Arena Name"
                    value={authName}
                    onChange={e => setAuthName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="mono" style={{ color: 'var(--electric-blue)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '2px', display: 'block', marginBottom: '0.5rem' }}>
                    [NETWORK ALIAS]
                  </label>
                  <input
                    type="text"
                    className="neon-input"
                    placeholder="@ Your Roast Handle"
                    value={authHandle}
                    onChange={e => setAuthHandle(e.target.value)}
                    required
                  />
                </div>

                <div style={{ marginTop: '1rem', position: 'relative' }}>
                  <button
                    type="submit"
                    className="btn-terminal btn-terminal-large btn-action-green"
                    style={{ animation: 'pulse-glow 2s infinite' }}
                  >
                    ⚡ ENTER THE ARENA
                  </button>
                </div>

              </form>
            </div>

          </div>
        </div>
      </>
    );
  }

  // Filter Arenas: ONLY SHOW ACTIVE (Live for 5 mins)
  const liveArenas = arenas.filter(a => a.status === 'active');
  const deadArenas = arenas.filter(a => a.status === 'resolved'); // We can hide them entirely as requested "uske baad dead !!"

  const activeArena = activeArenaId ? arenas.find(a => a.id === activeArenaId) : null;

  return (
    <div className="app-container">
      {/* Header NavBar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Flame size={32} color="var(--monad-purple)" />
          <div>
            <h1 className="glow-purple" style={{ fontSize: '1.5rem', margin: 0 }}>RAGEBAIT</h1>
            <div style={{ fontSize: '0.8rem', color: 'var(--neon-green)' }}>● LIVE NETWORK</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(45deg, var(--monad-purple), var(--neon-magenta))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white' }}>
              {currentUser.avatar}
            </div>
            {currentUser.handle}
          </div>
          <div className="mono glow-green" style={{ fontSize: '1.2rem', fontWeight: 'bold', background: 'rgba(0,255,163,0.1)', padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid rgba(0,255,163,0.3)' }}>
            {currentUser.balance.toFixed(4)} MND
          </div>
        </div>
      </div>

      {activeArena ? (
        // --- ARENA / ROOM VIEW ---
        <div className="arena-view">
          <button onClick={() => setActiveArenaId(null)} style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}>
            <ArrowLeft size={16} /> [BACK_TO_FEED]
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 300px) 1fr minmax(250px, 300px)', gap: '2rem' }}>

            {/* Left Column: Live Activity Feed */}
            <div className="cyber-card" style={{ height: 'fit-content', padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--toxic-green)' }}>
                <Activity size={16} /> <span style={{ fontWeight: 'bold', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Live Activity</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {activityFeed.map(feed => (
                  <div key={feed.id} style={{ display: 'flex', gap: '0.5rem' }}>
                    <span className="mono" style={{ opacity: 0.5 }}>{new Date(feed.timestamp).toTimeString().split(' ')[0]}</span>
                    <span>{feed.message}</span>
                  </div>
                ))}
                {activityFeed.length === 0 && <div style={{ fontStyle: 'italic' }}>Quiet in here...</div>}
              </div>
            </div>

            {/* Center Column: The Battle */}
            <div>
              {/* OP */}
              <div className="cyber-card cyber-card-pink" style={{ marginBottom: '2rem', padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '4px', background: 'linear-gradient(45deg, var(--neon-pink), var(--electric-blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{activeArena.opAvatar}</div>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{activeArena.opName} <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', fontSize: '1rem' }}>{activeArena.opHandle}</span></div>
                      <div style={{ color: 'var(--neon-pink)', fontSize: '0.8rem', marginTop: '0.2rem', textTransform: 'uppercase', letterSpacing: '1px' }}>[TARGET] • Staked {activeArena.stake} MND</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className={`mono ${activeArena.status === 'active' ? 'glow-pink' : ''}`} style={{ fontSize: '2.5rem', fontWeight: 'bold', lineHeight: '1', animation: activeArena.status === 'active' ? 'pulse 1s infinite' : 'none', color: activeArena.status === 'active' ? 'var(--neon-pink)' : 'var(--text-secondary)' }}>
                      {formatTimeInfo(activeArena.endTime)}
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: '1.5rem', marginTop: '1rem', borderLeft: '4px solid var(--neon-pink)', paddingLeft: '1rem' }}>"{activeArena.text}"</p>
              </div>

              {/* Roasts */}
              <h3 className="glow-blue" style={{ marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '2px' }}>[ THE ARENA ] ({activeArena.roasts.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                {activeArena.roasts.map(roast => {
                  const isWinner = activeArena.status === 'resolved' && activeArena.winnerRoastId === roast.id;
                  return (
                    <div key={roast.id} id={`roast-${roast.id}`} className={isWinner ? 'cyber-card' : ''} style={{
                      background: isWinner ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${isWinner ? 'var(--toxic-green)' : 'rgba(var(--electric-blue-raw), 0.2)'}`,
                      borderRadius: '8px', padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      transition: 'all 0.3s ease'
                    }}>
                      <div style={{ flex: 1, paddingRight: '1rem' }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ color: 'var(--electric-blue)', fontWeight: 'bold' }}>{roast.roasterName}</span>
                        </div>
                        <p style={{ fontSize: '1.1rem' }}>{roast.text}</p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Backed Pool</div>
                          <div className="mono glow-gold" style={{ fontSize: '1.5rem' }}>{roast.backedStake.toFixed(4)}</div>
                        </div>
                        {activeArena.status === 'active' && (
                          <button className="btn-terminal btn-action-green" onClick={() => handleStakeOnRoast(activeArena.id, roast.id)} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
                            STAKE 0.05
                          </button>
                        )}
                        {roast.myBackedAmount > 0 && <div className="mono glow-green" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '0.8rem' }}><span style={{ color: 'var(--text-secondary)' }}>YOUR STAKE</span><span>{roast.myBackedAmount.toFixed(4)}</span></div>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {activeArena.status === 'active' && (
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <input type="text" value={newRoastText} onChange={e => setNewRoastText(e.target.value)} placeholder="Type a lethal roast..." className="roast-input" />
                  <button className="btn-terminal btn-action-blue" onClick={() => handleSubmitRoast(activeArena.id)} style={{ padding: '1rem 2rem' }}>[ROAST] 0.01 MND</button>
                </div>
              )}
            </div>

            {/* Right Column: Stats & Leaderboard */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              <div className="cyber-card" style={{ padding: '1.5rem' }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '1px' }}>Arena Pool (TLV)</div>
                <div className="mono glow-gold" style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>
                  {(activeArena.stake + activeArena.roasts.reduce((acc, r) => acc + r.entryStake + r.backedStake, 0)).toFixed(4)} MND
                </div>
              </div>

              <div className="cyber-card" style={{ padding: '1.5rem', height: 'fit-content' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--electric-blue)' }}>
                  <Trophy size={16} /> <span style={{ fontWeight: 'bold', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Top Gladiators</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {[...activeArena.roasts].sort((a, b) => b.backedStake - a.backedStake).slice(0, 5).map((r, idx) => (
                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.7rem' }}>
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                          <span className="mono" style={{ color: idx === 0 ? 'rgb(255, 215, 0)' : 'var(--text-secondary)' }}>#{idx + 1}</span>
                          {r.roasterName}
                        </div>
                        <div className="mono glow-gold" style={{ fontSize: '0.9rem' }}>{r.backedStake.toFixed(4)} MND</div>
                      </div>
                      <button
                        className="btn-terminal"
                        style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem', background: 'rgba(0,247,255,0.1)', border: '1px solid var(--electric-blue)', color: 'var(--electric-blue)' }}
                        onClick={() => {
                          const el = document.getElementById(`roast-${r.id}`);
                          if (el) {
                            const y = el.getBoundingClientRect().top + window.scrollY - 100;
                            window.scrollTo({ top: y, behavior: 'smooth' });

                            // Visual flash effect on the target roast card
                            el.style.boxShadow = 'inset 0 0 30px rgba(0, 247, 255, 0.6)';
                            el.style.borderColor = 'var(--electric-blue)';
                            setTimeout(() => {
                              el.style.boxShadow = '';
                              el.style.borderColor = 'rgba(0, 247, 255, 0.2)';
                            }, 1000);
                          }
                        }}
                      >
                        VIEW
                      </button>
                    </div>
                  ))}
                  {activeArena.roasts.length === 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No gladiators yet.</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // --- LIVE FEED VIEW ---
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
          <div>
            {/* Create Post */}
            <div className="cyber-card" style={{ padding: '2rem', marginBottom: '2.5rem', display: 'flex', gap: '1.5rem' }}>
              <div style={{ width: '50px', height: '50px', borderRadius: '4px', background: 'linear-gradient(45deg, var(--neon-pink), var(--electric-blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem', flexShrink: 0 }}>
                {currentUser.avatar}
              </div>
              <div style={{ flex: 1 }}>
                <input type="text" className="roast-input roast-input-green" value={newArenaText} onChange={e => setNewArenaText(e.target.value)} placeholder="Post a controversial opinion... (Cost: 0.05 MND)" style={{ marginBottom: '1.5rem' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="mono" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>&gt; Timer locks to 5:00 on post.</div>
                  <button className="btn-terminal btn-action-pink" onClick={handleCreateArena}>[ DROP BAIT ]</button>
                </div>
              </div>
            </div>

            <h3 className="glow-blue" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'uppercase', letterSpacing: '2px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--electric-blue)', display: 'inline-block', animation: 'pulse-glow 1s infinite' }}></span>
              Live Arenas ({liveArenas.length})
            </h3>

            {liveArenas.length === 0 && (
              <div className="mono" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '4px' }}>
                [ NO ACTIVE ARENAS. BE THE FIRST TO DROP BAIT. ]
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {liveArenas.map(arena => (
                <div key={arena.id} className="cyber-card" onClick={() => setActiveArenaId(arena.id)} style={{ cursor: 'pointer' }}>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '4px', background: 'linear-gradient(45deg, var(--neon-pink), var(--electric-blue))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>{arena.opAvatar}</div>
                      <div>
                        <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{arena.opName}</span> <span className="mono" style={{ color: 'var(--electric-blue)', fontSize: '0.9rem', marginLeft: '0.5rem' }}>{arena.opHandle}</span>
                      </div>
                    </div>
                    <div className="mono glow-pink" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem', animation: 'pulse 1s infinite' }}>
                      {formatTimeInfo(arena.endTime)}
                    </div>
                  </div>
                  <p style={{ fontSize: '1.3rem', marginBottom: '1.5rem', marginLeft: '3rem', borderLeft: '3px solid rgba(255,255,255,0.1)', paddingLeft: '1rem' }}>"{arena.text}"</p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginLeft: '3rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                    <div className="mono" style={{ color: 'var(--toxic-green)', fontSize: '0.9rem' }}>{arena.roasts.length} Gladiators</div>
                    <div className="mono glow-gold" style={{ fontSize: '1.1rem' }}>TLV: {(arena.stake + arena.roasts.reduce((a, r) => a + r.entryStake + r.backedStake, 0)).toFixed(4)} MND</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Side Panel */}
          <div>
            <div className="cyber-card cyber-card-pink" style={{ padding: '1.5rem' }}>
              <div style={{ color: 'var(--neon-pink)', fontWeight: 'bold', fontSize: '1rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '1px' }}>[ GRAVEYARD ]</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                Items are permanently purged from the live network after 5 minutes. <br /><br />
                <span className="mono glow-pink" style={{ fontSize: '1.2rem' }}>{deadArenas.length}</span> arenas perished today.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
