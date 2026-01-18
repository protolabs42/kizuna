import React, { useEffect, useState } from 'react';
import { Brain, Cpu, MessageSquare } from 'lucide-react';

const MemoryFeed = () => {
    const [thoughts, setThoughts] = useState([]);

    useEffect(() => {
        const fetchMemory = async () => {
            try {
                const res = await fetch('/api/memory');
                const data = await res.json();
                setThoughts(data.memory || []);
            } catch (e) {
                console.error(e);
            }
        };

        fetchMemory();
        const interval = setInterval(fetchMemory, 3000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="bg-black/80 border border-purple-500/30 rounded-lg p-6 font-mono w-full h-full flex flex-col backdrop-blur-md">
            <div className="flex justify-between items-center mb-6 border-b border-purple-500/30 pb-3">
                <h2 className="text-purple-400 font-bold flex items-center gap-2">
                    <Brain className="w-5 h-5" />
                    HYPERCORE_MEMORY
                </h2>
                <Cpu className="w-4 h-4 text-purple-500 animate-pulse" />
            </div>

            <div className="flex-1 overflow-auto space-y-4 scroller pr-2">
                {thoughts.length === 0 && (
                    <div className="text-purple-500/50 text-center py-10 italic">
                        -- TABULA RASA --
                    </div>
                )}

                {[...thoughts].reverse().map((t, i) => (
                    <div key={i} className="flex flex-col gap-2 p-3 border-l-2 border-purple-500/30 bg-purple-500/5 rounded-r-lg">
                        <div className="flex justify-between text-[11px] text-purple-400/60 uppercase tracking-wider">
                            <span>TS: {new Date(t.ts).toLocaleTimeString()}</span>
                            <span>OP: APPEND</span>
                        </div>
                        <div className="text-purple-100 text-sm font-light break-words">
                            {typeof t.content === 'string' ? t.content : JSON.stringify(t.content)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MemoryFeed;
