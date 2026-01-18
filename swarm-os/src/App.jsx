import { useState, useEffect } from 'react'
import A2Renderer from './components/A2Renderer'
import SwarmGraph from './components/SwarmGraph'
import FileExplorer from './components/FileExplorer';
import MemoryFeed from './components/MemoryFeed';
import ChatPanel from './components/ChatPanel';
import RoomPanel from './components/RoomPanel';
import { Activity, Network, Shield, Terminal, HardDrive, BrainCircuit, Users } from 'lucide-react';

const MOCK_AGENT_UI = null;

function App() {
    const [logs, setLogs] = useState([])
    const [peers, setPeers] = useState([]);
    const [myId, setMyId] = useState('');
    const [stats, setStats] = useState({ active: 1, totalUnique: 1, direct: 0, uptime: 0, version: '?.?.?', myId: '' });
    const [activeTab, setActiveTab] = useState('network'); // network | drive | memory
    const [selectedAgent, setSelectedAgent] = useState(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 })

    useEffect(() => {
        // 1. Fetch Identity
        fetch('/info').then(r => r.json()).then(d => setMyId(d.peerId)).catch(console.error)

        // 2. Poll Peers & Stats
        const poll = setInterval(() => {
            // Peers for graph
            fetch('/peers').then(r => r.json()).then(d => {
                const newPeers = d.details || [];
                setPeers(prev => {
                    if (newPeers.length > prev.length) {
                        const diff = newPeers.length - prev.length;
                        setLogs(l => [`[${new Date().toLocaleTimeString()}] **ALERT**: DETECTED ${diff} NEW PEER(S)`, ...l])
                    }
                    return newPeers;
                })
            }).catch(console.error)

            // Stats for deployment counter
            fetch('/stats').then(r => r.json()).then(setStats).catch(() => { })
        }, 2000)

        // Resize Handler
        const handleResize = () => setDimensions({ width: window.innerWidth * 0.6, height: window.innerHeight * 0.6 })
        window.addEventListener('resize', handleResize)
        handleResize()

        return () => {
            clearInterval(poll)
            window.removeEventListener('resize', handleResize)
        }
    }, [])

    const handleAction = (action, payload) => {
        const entry = `[${new Date().toLocaleTimeString()}] ACTION: ${action}`;
        setLogs(prev => [entry, ...prev])
    }

    const handleNodeClick = (node) => {
        // When a graph node is clicked, simulate fetching its A2UI
        // In real impl, we would GET /ui/:nodeId
        const newUI = {
            type: "panel",
            title: node.agent_id ? `${node.agent_id} // ${node.role}` : "Unknown Node",
            children: [
                { type: "text", content: `ID: ${node.id}`, variant: "body" },
                { type: "text", content: `SKILLS: ${node.skills ? node.skills.join(', ') : 'None'}`, variant: "body" },
                {
                    type: "button",
                    label: "Ping Node",
                    action: "ping",
                    icon: "activity"
                }
            ]
        };
        setSelectedAgent(newUI);
        handleAction('SELECT_NODE', node.id);
    }

    return (
        <div className="flex h-screen w-full bg-swarm-bg text-white font-mono overflow-hidden">

            {/* HEADER OVERLAY */}
            <div className="absolute top-0 left-0 w-full p-8 flex justify-between items-start pointer-events-none z-50">
                <div>
                    <h1 className="text-3xl font-bold text-neon-cyan tracking-tighter drop-shadow-glow">SWARM_OS <span className="text-xs opacity-50 font-normal">v{stats.version}</span></h1>
                    <div className="flex items-center gap-2 mt-1">
                        <div className={`w-2 h-2 rounded-full ${stats.direct > 0 ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                        <span className="text-xs tracking-widest text-emerald-400 font-bold">
                            AGENTS_ONLINE :: <span className="text-lg">{stats.active}</span>
                            <span className="text-slate-500 ml-2">({stats.totalUnique} total)</span>
                        </span>
                    </div>
                    <div className="text-[10px] text-slate-600 mt-1">
                        Uptime: {Math.floor(stats.uptime / 60)}m {stats.uptime % 60}s | Direct: {stats.direct}
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Local Identity</div>
                    <div className="font-mono text-xs text-neon-pink">{stats.myId || myId?.slice(-8) || 'INITIALIZING...'}</div>
                </div>
            </div>

            {/* LEFT COL: TABS & VIEWPORT */}
            <div className="flex-1 flex flex-col p-6 relative pt-28">
                {/* Tabs */}
                <div className="flex gap-3 mb-4 z-10">
                    <button
                        onClick={() => setActiveTab('network')}
                        className={`px-5 py-3 rounded-t-lg font-mono text-sm flex items-center gap-2 border-t border-x transition-colors ${activeTab === 'network' ? 'bg-black/80 border-cyan-500/50 text-cyan-400' : 'bg-black/20 border-transparent text-slate-600 hover:text-cyan-300'}`}
                    >
                        <Network className="w-3 h-3" /> NET_TOPOLOGY
                    </button>
                    <button
                        onClick={() => setActiveTab('drive')}
                        className={`px-5 py-3 rounded-t-lg font-mono text-sm flex items-center gap-2 border-t border-x transition-colors ${activeTab === 'drive' ? 'bg-black/80 border-cyan-500/50 text-cyan-400' : 'bg-black/20 border-transparent text-slate-600 hover:text-cyan-300'}`}
                    >
                        <HardDrive className="w-3 h-3" /> LOCAL_DRIVE
                    </button>
                    <button
                        onClick={() => setActiveTab('memory')}
                        className={`px-5 py-3 rounded-t-lg font-mono text-sm flex items-center gap-2 border-t border-x transition-colors ${activeTab === 'memory' ? 'bg-black/80 border-cyan-500/50 text-cyan-400' : 'bg-black/20 border-transparent text-slate-600 hover:text-cyan-300'}`}
                    >
                        <BrainCircuit className="w-3 h-3" /> CORTEX_MEMORY
                    </button>
                </div>

                {/* Viewport */}
                <div className="flex-1 border border-slate-800/50 rounded-b-lg rounded-tr-lg bg-black/40 backdrop-blur-sm overflow-hidden relative shadow-2xl">
                    {activeTab === 'network' && (
                        <div className="w-full h-full relative">
                            {/* Graph is full size now, header is absolute overlay above */}
                            <SwarmGraph peers={peers} myId={myId} width={dimensions.width} height={dimensions.height} onNodeClick={handleNodeClick} />
                        </div>
                    )}
                    {activeTab === 'drive' && <FileExplorer />}
                    {activeTab === 'memory' && <MemoryFeed />}
                </div>
            </div>

            <div className="w-[450px] border-l border-slate-800/50 bg-swarm-panel/30 p-8 flex flex-col gap-8 backdrop-blur-md pt-28">


                {/* ROOM MANAGEMENT */}
                <div className="min-h-[280px]">
                    <RoomPanel peers={peers} myId={myId} />
                </div>

                {/* CHAT / COMMAND CENTER */}
                <div className="flex-1 flex flex-col min-h-0">
                    <ChatPanel onAction={handleAction} myId={myId} />
                </div>

                {/* LOGS (Collapsed/Smaller) */}
                <div className="h-36 border-t border-slate-800 pt-4 flex flex-col">
                    <h3 className="text-slate-500 text-[11px] uppercase mb-2">System Events</h3>
                    <div className="flex-1 overflow-y-auto space-y-2 text-[11px] font-mono opacity-60">
                        {logs.map((l, i) => <div key={i} className="text-slate-400 py-1">{l}</div>)}
                    </div>
                </div>

            </div>

        </div>
    )
}

export default App
