import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle } from 'lucide-react';

const ChatPanel = ({ onAction, myId: propMyId }) => {
    const [input, setInput] = useState('');
    const [history, setHistory] = useState([
        { sender: 'SYSTEM', senderId: '', content: 'Connected to swarm. Say hi! 👋', ts: Date.now() }
    ]);
    const messagesEndRef = useRef(null);

    // Derived short ID for filtering
    const myShortId = React.useMemo(() => propMyId ? propMyId.slice(-8) : '', [propMyId]);
    const myShortIdRef = useRef(myShortId);

    // Update ref when ID changes so interval sees current value
    useEffect(() => {
        myShortIdRef.current = myShortId;
    }, [myShortId]);

    // Track seen message timestamps to prevent duplicates
    const seenTimestampsRef = React.useRef(new Set());

    // Poll inbox for peer messages
    useEffect(() => {
        const timer = setInterval(() => {
            fetch('/inbox').then(r => r.json()).then(data => {
                // console.log('[ChatPanel] inbox poll:', data);
                if (data.messages && data.messages.length > 0) {
                    // console.log('[ChatPanel] msgs received:', data.messages.length);
                    const newMsgs = data.messages
                        .filter(m => m.content?.type === 'CHAT')
                        .filter(m => !seenTimestampsRef.current.has(m.timestamp)) // Dedupe
                        // We NO LONGER filter own messages. We rely on loopback for everything.
                        .map(m => {
                            seenTimestampsRef.current.add(m.timestamp); // Mark as seen

                            // Check if this is my formatted message
                            const msgSenderShort = m.senderShortId || m.sender?.slice(-8) || '';
                            const isMe = myShortIdRef.current && msgSenderShort === myShortIdRef.current;

                            // console.log('[ChatPanel] processing msg:', { msgSenderShort, myShortId, isMe, propMyId });

                            return {
                                sender: isMe ? 'ME' : 'PEER',
                                senderId: msgSenderShort || '?',
                                content: m.content?.text || JSON.stringify(m.content),
                                ts: m.timestamp || Date.now()
                            };
                        });

                    if (newMsgs.length > 0) {
                        setHistory(prev => [...prev, ...newMsgs]);
                    }
                }
            }).catch(() => { });
        }, 1500);
        return () => clearInterval(timer);
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const currentId = propMyId || '';
        // No optimistic update - wait for loopback
        const copy = input;
        setInput('');

        try {
            onAction?.('CHAT_SEND', copy);
            // Broadcast as CHAT type
            await fetch('/broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: {
                        type: 'CHAT',
                        text: copy,
                        sender: currentId
                    }
                })
            });
        } catch (e) {
            console.error(e);
            setHistory(prev => [...prev, { sender: 'SYSTEM', senderId: '', content: '⚠️ Failed to send', ts: Date.now() }]);
        }
    };

    const getSenderColor = (sender) => {
        if (sender === 'ME') return 'text-cyan-400';
        if (sender === 'PEER') return 'text-pink-400';
        if (sender === 'AGENT') return 'text-green-400';
        return 'text-slate-500';
    };

    return (
        <div className="flex flex-col h-full bg-black/40 border border-slate-800 rounded-lg overflow-hidden backdrop-blur font-mono text-sm">
            {/* Header */}
            <div className="bg-slate-900/80 p-4 border-b border-slate-700 flex items-center gap-3 text-neon-cyan">
                <MessageCircle className="w-4 h-4" />
                <span>SWARM_CHAT</span>
                <span className="text-slate-500 text-[11px] ml-auto">@agent-zero to invoke</span>
            </div>

            {/* History */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 scroller">
                {history.map((h, i) => (
                    <div key={i} className={`flex flex-col ${h.sender === 'ME' ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[11px] font-bold ${getSenderColor(h.sender)}`}>
                                {h.sender === 'ME' ? 'you' : h.sender === 'SYSTEM' ? 'sys' : h.senderId}
                            </span>
                            <span className="text-[10px] text-slate-600">{new Date(h.ts).toLocaleTimeString()}</span>
                        </div>
                        <div className={`max-w-[85%] p-3 rounded-lg ${h.sender === 'ME'
                            ? 'bg-cyan-900/30 text-cyan-100 border border-cyan-500/30'
                            : h.sender === 'PEER'
                                ? 'bg-pink-900/20 text-pink-100 border border-pink-500/20'
                                : 'bg-slate-800/50 text-slate-300 border border-slate-700'
                            }`}>
                            {h.content}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-slate-700 bg-black/60 flex gap-3">
                <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                    placeholder="Message the swarm..."
                    className="flex-1 bg-transparent border-none outline-none text-white font-mono placeholder-slate-600"
                />
                <button onClick={handleSend} className="text-neon-cyan hover:text-white transition">
                    <Send className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default ChatPanel;
