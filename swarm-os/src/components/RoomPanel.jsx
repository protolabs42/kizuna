import React, { useState, useEffect } from 'react';
import { Users, Lock, Globe, LogIn, LogOut, Copy, Check } from 'lucide-react';

const RoomPanel = ({ peers = [], myId = '' }) => {
    const [topics, setTopics] = useState([]);
    const [joinTopic, setJoinTopic] = useState('');
    const [joinSecret, setJoinSecret] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(false);

    // Poll topics
    useEffect(() => {
        const fetchTopics = () => {
            fetch('/topics').then(r => r.json())
                .then(data => setTopics(data.topics || []))
                .catch(() => { });
        };
        fetchTopics();
        const timer = setInterval(fetchTopics, 3000);
        return () => clearInterval(timer);
    }, []);

    const handleJoin = async () => {
        if (!joinTopic.trim()) return;
        setLoading(true);
        try {
            const payload = { topic: joinTopic.trim() };
            if (joinSecret.trim()) payload.secret = joinSecret.trim();
            const resp = await fetch('/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await resp.json();
            if (data.status === 'joined') {
                setJoinTopic('');
                setJoinSecret('');
            }
        } catch (e) {
            console.error('Join failed:', e);
        }
        setLoading(false);
    };

    const handleLeave = async (topicName) => {
        try {
            await fetch('/leave', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic: topicName })
            });
        } catch (e) {
            console.error('Leave failed:', e);
        }
    };

    const handleCreateInvite = () => {
        if (!joinTopic.trim()) return;
        const data = joinSecret.trim() ? `${joinTopic.trim()}:${joinSecret.trim()}` : joinTopic.trim();
        const code = btoa(data);
        setInviteCode(code);
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(inviteCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleJoinInvite = () => {
        if (!inviteCode.trim()) return;
        try {
            const decoded = atob(inviteCode.trim());
            const [topic, secret] = decoded.includes(':') ? decoded.split(':', 2) : [decoded, ''];
            setJoinTopic(topic);
            setJoinSecret(secret || '');
        } catch (e) {
            console.error('Invalid invite code');
        }
    };

    return (
        <div style={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            borderRadius: '12px',
            padding: '24px',
            color: '#e0e0e0',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflow: 'auto'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                paddingBottom: '16px'
            }}>
                <Users size={20} color="#00d4ff" />
                <span style={{ fontWeight: 'bold', fontSize: '15px' }}>ROOMS</span>
                <span style={{
                    marginLeft: 'auto',
                    fontSize: '12px',
                    color: '#888',
                    fontFamily: 'monospace'
                }}>
                    {myId.slice(-8) || '?'}
                </span>
            </div>

            {/* Join Room Form */}
            <div style={{
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
            }}>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Join or Create Room</div>
                <input
                    type="text"
                    placeholder="Room name..."
                    value={joinTopic}
                    onChange={(e) => setJoinTopic(e.target.value)}
                    style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        color: '#fff',
                        fontSize: '14px',
                        outline: 'none'
                    }}
                />
                <input
                    type="password"
                    placeholder="Secret (optional)..."
                    value={joinSecret}
                    onChange={(e) => setJoinSecret(e.target.value)}
                    style={{
                        background: 'rgba(255,255,255,0.1)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        color: '#fff',
                        fontSize: '14px',
                        outline: 'none'
                    }}
                />
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={handleJoin}
                        disabled={loading || !joinTopic.trim()}
                        style={{
                            flex: 1,
                            background: 'linear-gradient(90deg, #00d4ff, #00ff88)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            color: '#000',
                            fontWeight: 'bold',
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            opacity: loading || !joinTopic.trim() ? 0.5 : 1
                        }}
                    >
                        <LogIn size={14} /> Join
                    </button>
                    <button
                        onClick={handleCreateInvite}
                        disabled={!joinTopic.trim()}
                        style={{
                            flex: 1,
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            color: '#fff',
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                            opacity: !joinTopic.trim() ? 0.5 : 1
                        }}
                    >
                        <Copy size={14} /> Invite
                    </button>
                </div>

                {/* Invite Code Display */}
                {inviteCode && (
                    <div style={{
                        background: 'rgba(0,212,255,0.1)',
                        border: '1px solid rgba(0,212,255,0.3)',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}>
                        <code style={{
                            flex: 1,
                            fontSize: '12px',
                            wordBreak: 'break-all',
                            color: '#00d4ff'
                        }}>
                            {inviteCode}
                        </code>
                        <button onClick={handleCopy} style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px'
                        }}>
                            {copied ? <Check size={14} color="#00ff88" /> : <Copy size={14} color="#00d4ff" />}
                        </button>
                    </div>
                )}
            </div>

            {/* Active Topics */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
                    Active Topics ({topics.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {topics.map((t, i) => (
                        <div key={i} style={{
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '8px',
                            padding: '12px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontSize: '13px'
                        }}>
                            {t.private ?
                                <Lock size={12} color="#ff6b6b" /> :
                                <Globe size={12} color="#00ff88" />
                            }
                            <span style={{ flex: 1 }}>{t.name}</span>
                            <span style={{
                                fontSize: '11px',
                                color: '#666',
                                fontFamily: 'monospace'
                            }}>
                                {t.hash}
                            </span>
                            {t.name !== 'agent-zero-swarm-poc' && (
                                <button
                                    onClick={() => handleLeave(t.name)}
                                    style={{
                                        background: 'rgba(255,107,107,0.2)',
                                        border: 'none',
                                        borderRadius: '6px',
                                        padding: '6px 10px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center'
                                    }}
                                >
                                    <LogOut size={12} color="#ff6b6b" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Members Online */}
            <div>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>
                    Members Online ({peers.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '140px', overflow: 'auto' }}>
                    {peers.map((p, i) => (
                        <div key={i} style={{
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontSize: '12px'
                        }}>
                            <span style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: '#00ff88'
                            }} />
                            <span style={{ fontFamily: 'monospace' }}>
                                {p.publicKey?.slice(-8) || '?'}
                            </span>
                            <span style={{ color: '#888' }}>
                                {p.manifest?.agent_id || p.manifest?.role || 'Unknown'}
                            </span>
                        </div>
                    ))}
                    {peers.length === 0 && (
                        <div style={{ color: '#666', fontSize: '12px', padding: '10px' }}>
                            No peers connected
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default RoomPanel;
