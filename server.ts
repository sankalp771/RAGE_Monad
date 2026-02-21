import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});

// The God State
let arenas: any[] = [];
let activityLog: any[] = [];

// Tick: 1 sec interval
setInterval(() => {
    const now = Date.now();

    // Resolve arenas that hit 5 minutes
    let didUpdate = false;
    arenas = arenas.map((arena) => {
        if (arena.status === 'active' && arena.endTime <= now) {
            didUpdate = true;

            // Calculate Winners
            if (arena.roasts.length === 0) {
                logActivity(`Arena by ${arena.opHandle} closed with no roasts.`);
                return { ...arena, status: 'resolved' };
            }

            const winner = arena.roasts.reduce((prev: any, current: any) =>
                (current.backedStake > prev.backedStake) ? current : prev
            );

            logActivity(`🔥 ROAST WARS ENDED: ${winner.roasterName} won the pool! 🔥`);

            // In a real app we handle payout DB balances here.
            // Since balance is local-client tracked for this mock, clients calculate their own payouts.
            return { ...arena, status: 'resolved', winnerRoastId: winner.id };
        }
        return arena;
    });

    if (didUpdate) {
        io.emit('state-update', arenas);
    }
}, 1000);

const logActivity = (msg: string) => {
    const log = { id: Math.random().toString(), message: msg, timestamp: Date.now() };
    activityLog = [log, ...activityLog].slice(0, 15);
    io.emit('activity-update', log);
};

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Send initial state
    socket.emit('state-update', arenas);
    // Send last 10 activities if they just joined
    activityLog.slice(0, 10).forEach(log => socket.emit('activity-update', log));

    socket.on('join', (userHandle: string) => {
        logActivity(`${userHandle} joined the room.`);
    });

    socket.on('create-arena', (arenaData) => {
        const newArena = {
            ...arenaData,
            id: Math.random().toString(36).substring(7),
            stake: 0.05,
            endTime: Date.now() + 5 * 60 * 1000,
            status: 'active',
            roasts: []
        };
        arenas = [newArena, ...arenas];
        logActivity(`${newArena.opHandle} dropped a new Ragebait!`);
        io.emit('state-update', arenas);
    });

    socket.on('submit-roast', ({ arenaId, roastData }) => {
        arenas = arenas.map(arena => {
            if (arena.id !== arenaId) return arena;
            return {
                ...arena,
                roasts: [...arena.roasts, roastData]
            };
        });
        logActivity(`${roastData.roasterName} entered the arena with a roast.`);
        io.emit('state-update', arenas);
    });

    socket.on('stake-roast', ({ arenaId, roastId, amount, userHandle }) => {
        arenas = arenas.map(arena => {
            if (arena.id !== arenaId) return arena;
            return {
                ...arena,
                roasts: arena.roasts.map((roast: any) => {
                    if (roast.id !== roastId) return roast;
                    return {
                        ...roast,
                        backedStake: roast.backedStake + amount
                    };
                })
            };
        });
        logActivity(`${userHandle} staked ${amount} MND on a roast!`);
        io.emit('state-update', arenas);
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
    console.log(`⚡ Ragebait WebSocket Server running on port ${PORT}`);
});
