import React, { useState, useEffect } from 'react';
import { Flame, ArrowLeft, Trophy, Clock, Wallet, CheckCircle, Crosshair, User, LogIn, Activity } from 'lucide-react';

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

// --- Initial Mock Data ---
const MOCK_ARENAS: Arena[] = [
  {
    id: 'a1',
    opId: 'u1',
    opName: 'DuveshTheDev',
    opHandle: '@duvesh_dev',
    opAvatar: 'D',
    text: "I use ChatGPT for every API call. Documentation is for boomers.",
    stake: 0.05,
    endTime: Date.now() + 5 * 60 * 1000, // 5 minutes exactly
    status: 'active',
    roasts: [
      { id: 'r1', roasterId: 'u2', roasterName: 'Sankalp', text: "Skill issue bro.", entryStake: 0.01, backedStake: 0.07, myBackedAmount: 0 },
      { id: 'r2', roasterId: 'u3', roasterName: 'Aman', text: "Bro writes require() and feels powerful.", entryStake: 0.01, backedStake: 0.04, myBackedAmount: 0 },
    ],
  }
];

export default function App() {
  // --- Global State ---
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [arenas, setArenas] = useState<Arena[]>(MOCK_ARENAS);
  const [activeArenaId, setActiveArenaId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());
  const [activityFeed, setActivityFeed] = useState<ActivityLog[]>([]);

  // Forms
  const [authName, setAuthName] = useState("");
  const [authHandle, setAuthHandle] = useState("");
  const [newArenaText, setNewArenaText] = useState("");
  const [newRoastText, setNewRoastText] = useState("");

  // --- The Engine Tick (Room synchronization simulation) ---
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setCurrentTime(now);

      setArenas(prevArenas => prevArenas.map(arena => {
        if (arena.status === 'active' && arena.endTime <= now) {
          return resolveArena(arena);
        }
        return arena;
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, [currentUser]); // Dependency on currentUser to handle payouts to them

  // --- Logic: Resolve Arena ---
  const resolveArena = (arena: Arena): Arena => {
    if (arena.roasts.length === 0) {
      logActivity(`Arena by ${arena.opHandle} closed with no roasts.`);
      return { ...arena, status: 'resolved' };
    }

    const winner = arena.roasts.reduce((prev, current) =>
      (current.backedStake > prev.backedStake) ? current : prev
    );

    const losingBackingPool = arena.roasts
      .filter(r => r.id !== winner.id)
      .reduce((sum, r) => sum + r.backedStake, 0);

    const winnerBackingPool = winner.backedStake;

    logActivity(`🔥 ROAST WARS ENDED: ${winner.roasterName} won the pool! 🔥`);

    // Payout if current user backed winner or IS the winner/OP
    if (currentUser) {
      let payout = 0;

      // 1. Did the user back the winning roast?
      if (winner.myBackedAmount > 0 && winnerBackingPool > 0) {
        const userShareRatio = winner.myBackedAmount / winnerBackingPool;
        const profit = userShareRatio * (0.9 * losingBackingPool);
        payout += winner.myBackedAmount + profit;
      }

      // 2. Is the user the winning roaster?
      if (winner.roasterId === currentUser.id) {
        const roasterReward = (0.7 * arena.stake) + (0.7 * (arena.roasts.length - 1) * 0.01);
        payout += roasterReward;
      }

      // 3. Is the user the OP?
      if (arena.opId === currentUser.id) {
        const opReward = 0.05 * (losingBackingPool + winnerBackingPool);
        payout += opReward;
      }

      if (payout > 0) {
        setCurrentUser(prev => prev ? { ...prev, balance: prev.balance + payout } : null);
      }
    }

    return { ...arena, status: 'resolved', winnerRoastId: winner.id };
  };

  const logActivity = (msg: string) => {
    setActivityFeed(prev => [{ id: Math.random().toString(), message: msg, timestamp: Date.now() }, ...prev].slice(0, 10));
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
    logActivity(`${cleanHandle} joined the room.`);
  };

  const handleCreateArena = () => {
    if (!currentUser || !newArenaText.trim()) return;
    if (currentUser.balance < 0.05) return alert("Need 0.05 MONAD to post.");

    setCurrentUser({ ...currentUser, balance: currentUser.balance - 0.05 });

    const newArena: Arena = {
      id: Math.random().toString(36).substring(7),
      opId: currentUser.id,
      opName: currentUser.name,
      opHandle: currentUser.handle,
      opAvatar: currentUser.avatar,
      text: newArenaText,
      stake: 0.05,
      endTime: Date.now() + 5 * 60 * 1000, // 5 minutes live!
      status: 'active',
      roasts: []
    };

    setArenas([newArena, ...arenas]);
    setNewArenaText("");
    logActivity(`${currentUser.handle} dropped a new Ragebait!`);
  };

  const handleStakeOnRoast = (arenaId: string, roastId: string) => {
    const amount = 0.05;
    if (!currentUser || currentUser.balance < amount) return;

    setCurrentUser({ ...currentUser, balance: currentUser.balance - amount });

    setArenas(prev => prev.map(arena => {
      if (arena.id !== arenaId) return arena;
      return {
        ...arena,
        roasts: arena.roasts.map(roast => {
          if (roast.id !== roastId) return roast;
          return {
            ...roast,
            backedStake: roast.backedStake + amount,
            myBackedAmount: roast.myBackedAmount + amount
          };
        })
      };
    }));
    logActivity(`${currentUser.handle} staked ${amount} on a roast!`);
  };

  const handleSubmitRoast = (arenaId: string) => {
    if (!currentUser || !newRoastText.trim()) return;
    const entryFee = 0.01;
    if (currentUser.balance < entryFee) return alert("Need 0.01 MONAD to enter the arena!");

    setCurrentUser({ ...currentUser, balance: currentUser.balance - entryFee });

    const newRoast: RoastEntry = {
      id: Math.random().toString(36).substring(7),
      roasterId: currentUser.id,
      roasterName: currentUser.name,
      text: newRoastText,
      entryStake: entryFee,
      backedStake: 0,
      myBackedAmount: 0
    };

    setArenas(prev => prev.map(arena => {
      if (arena.id !== arenaId) return arena;
      return { ...arena, roasts: [...arena.roasts, newRoast] };
    }));

    setNewRoastText("");
    logActivity(`${currentUser.handle} entered the arena with a roast.`);
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
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>
        <div style={{ background: 'var(--panel-bg)', padding: '3rem', borderRadius: '12px', border: '1px solid var(--monad-purple)', width: '100%', maxWidth: '400px', textAlign: 'center' }}>
          <Flame size={48} color="var(--monad-purple)" style={{ margin: '0 auto 1rem' }} />
          <h1 className="glow-purple" style={{ marginBottom: '2rem' }}>MONAD RAGEBAIT</h1>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input type="text" placeholder="Display Name (e.g. Duvesh)" value={authName} onChange={e => setAuthName(e.target.value)}
              style={{ padding: '1rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px' }} required />
            <input type="text" placeholder="Handle (e.g. @dev_god)" value={authHandle} onChange={e => setAuthHandle(e.target.value)}
              style={{ padding: '1rem', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '4px' }} required />
            <button type="submit" className="btn-terminal btn-stake" style={{ marginTop: '1rem' }}>CONNECT & CLAIM 10 MND</button>
          </form>
        </div>
      </div>
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
          <button onClick={() => setActiveArenaId(null)} style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <ArrowLeft size={16} /> Back to Live Feed
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem' }}>
            {/* Left: The Battle */}
            <div>
              {/* OP */}
              <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--neon-magenta)', borderRadius: '8px', padding: '1.5rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(45deg, var(--monad-purple), var(--neon-magenta))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{activeArena.opAvatar}</div>
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{activeArena.opName} <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>{activeArena.opHandle}</span></div>
                      <div style={{ color: 'var(--neon-magenta)', fontSize: '0.8rem' }}>Target • Staked {activeArena.stake} MND</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className={`mono ${activeArena.status === 'active' ? 'glow-magenta' : ''}`} style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                      {formatTimeInfo(activeArena.endTime)}
                    </div>
                  </div>
                </div>
                <p style={{ fontSize: '1.3rem' }}>"{activeArena.text}"</p>
              </div>

              {/* Roasts */}
              <h3 className="glow-purple" style={{ marginBottom: '1rem' }}>The Arena ({activeArena.roasts.length})</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
                {activeArena.roasts.map(roast => {
                  const isWinner = activeArena.status === 'resolved' && activeArena.winnerRoastId === roast.id;
                  return (
                    <div key={roast.id} style={{ background: isWinner ? 'rgba(0, 255, 163, 0.1)' : 'rgba(255, 255, 255, 0.03)', border: `1px solid ${isWinner ? 'var(--neon-green)' : 'rgba(255, 255, 255, 0.1)'}`, borderRadius: '8px', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                          <span style={{ color: 'var(--monad-purple)', fontWeight: 'bold' }}>{roast.roasterName}</span>
                        </div>
                        <p>{roast.text}</p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Backed Pool</div>
                          <div className="mono glow-gold" style={{ fontSize: '1.2rem' }}>{roast.backedStake.toFixed(4)}</div>
                        </div>
                        {activeArena.status === 'active' && (
                          <button className="btn-terminal btn-stake" onClick={() => handleStakeOnRoast(activeArena.id, roast.id)} style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}>
                            STAKE 0.05
                          </button>
                        )}
                        {roast.myBackedAmount > 0 && <div className="mono" style={{ color: 'var(--neon-green)' }}>+ {roast.myBackedAmount.toFixed(2)}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {activeArena.status === 'active' && (
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <input type="text" value={newRoastText} onChange={e => setNewRoastText(e.target.value)} placeholder="Type a lethal roast..." style={{ flex: 1, background: 'rgba(0,0,0,0.5)', border: '1px solid var(--monad-purple)', borderRadius: '4px', padding: '1rem', color: 'white', outline: 'none' }} />
                  <button className="btn-terminal btn-roast" onClick={() => handleSubmitRoast(activeArena.id)}>ROAST (0.01 MND)</button>
                </div>
              )}
            </div>

            {/* Right: Room Stats & Activity */}
            <div style={{ background: 'var(--panel-bg)', borderRadius: '8px', border: '1px solid var(--border-color)', padding: '1.5rem', height: 'fit-content' }}>
              <div style={{ marginBottom: '2rem' }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Arena Pool (TLV)</div>
                <div className="mono glow-gold" style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                  {(activeArena.stake + activeArena.roasts.reduce((acc, r) => acc + r.entryStake + r.backedStake, 0)).toFixed(4)}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--neon-green)' }}>
                  <Activity size={16} /> <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>LIVE ACTIVITY</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {activityFeed.map(feed => (
                    <div key={feed.id} style={{ display: 'flex', gap: '0.5rem' }}>
                      <span className="mono" style={{ opacity: 0.5 }}>{new Date(feed.timestamp).toTimeString().split(' ')[0]}</span>
                      <span>{feed.message}</span>
                    </div>
                  ))}
                  {activityFeed.length === 0 && <div>Quiet in here...</div>}
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
            <div style={{ background: 'var(--panel-bg)', border: '1px dashed var(--monad-purple)', borderRadius: '8px', padding: '1.5rem', marginBottom: '2.5rem', display: 'flex', gap: '1rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(45deg, var(--monad-purple), var(--neon-magenta))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', flexShrink: 0 }}>{currentUser.avatar}</div>
              <div style={{ flex: 1 }}>
                <input type="text" value={newArenaText} onChange={e => setNewArenaText(e.target.value)} placeholder="Post a controversial opinion... (Cost: 0.05 MND)" style={{ width: '100%', background: 'transparent', border: 'none', color: 'white', fontSize: '1.1rem', outline: 'none', marginBottom: '1rem' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Timer locks to 5:00 on post.</div>
                  <button className="btn-terminal btn-roast" onClick={handleCreateArena} style={{ padding: '0.5rem 1rem' }}>DROP BAIT</button>
                </div>
              </div>
            </div>

            <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--neon-green)', display: 'inline-block', animation: 'pulse 1s infinite' }}></span>
              Live Arenas ({liveArenas.length})
            </h3>

            {liveArenas.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                No active arenas. Be the first to drop bait.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {liveArenas.map(arena => (
                <div key={arena.id} onClick={() => setActiveArenaId(arena.id)} style={{ background: 'var(--panel-bg)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '1.5rem', cursor: 'pointer', transition: 'transform 0.2s', position: 'relative' }}>
                  <div style={{ position: 'absolute', top: '-1px', left: '-1px', right: '-1px', height: '2px', background: 'linear-gradient(90deg, var(--monad-purple), var(--neon-magenta))' }}></div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: 'linear-gradient(45deg, var(--monad-purple), var(--neon-magenta))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>{arena.opAvatar}</div>
                      <div>
                        <span style={{ fontWeight: 'bold' }}>{arena.opName}</span> <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{arena.opHandle}</span>
                      </div>
                    </div>
                    <div className="mono glow-magenta" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Clock size={16} /> {formatTimeInfo(arena.endTime)}
                    </div>
                  </div>
                  <p style={{ fontSize: '1.2rem', marginBottom: '1rem', marginLeft: '2.5rem' }}>"{arena.text}"</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginLeft: '2.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{arena.roasts.length} Gladiators</div>
                    <div className="mono glow-gold">TLV: {(arena.stake + arena.roasts.reduce((a, r) => a + r.entryStake + r.backedStake, 0)).toFixed(4)} MND</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Side Panel */}
          <div>
            <div style={{ background: 'rgba(255,0,85,0.05)', border: '1px solid rgba(255,0,85,0.2)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
              <div style={{ color: 'var(--neon-magenta)', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.5rem' }}>GRAVEYARD (DEAD BAITS)</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Items are permanently removed from the live network after 5 minutes. {deadArenas.length} arenas perished today.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
