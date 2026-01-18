import React from 'react';
import { motion } from 'framer-motion';
import { Terminal, Cpu, Play, AlertCircle } from 'lucide-react';

const A2Renderer = ({ ui, onAction }) => {
    if (!ui) return null;

    switch (ui.type) {
        case 'panel':
            return (
                <div className="bg-swarm-panel border border-slate-700 rounded-lg p-6 mb-6 flex flex-col gap-3 shadow-lg shadow-black/50">
                    {ui.title && <h3 className="text-sm font-bold text-swarm-dim uppercase tracking-wider mb-3 flex items-center gap-2"><Cpu size={14} /> {ui.title}</h3>}
                    {ui.children?.map((child, i) => <A2Renderer key={i} ui={child} onAction={onAction} />)}
                </div>
            );

        case 'column':
            return (
                <div className="flex flex-col gap-3">
                    {ui.children?.map((child, i) => <A2Renderer key={i} ui={child} onAction={onAction} />)}
                </div>
            );

        case 'row':
            return (
                <div className="flex flex-row gap-3 items-center">
                    {ui.children?.map((child, i) => <A2Renderer key={i} ui={child} onAction={onAction} />)}
                </div>
            );

        case 'text':
            const styles = {
                h1: "text-2xl font-bold text-neon-cyan",
                h2: "text-xl font-bold text-white",
                body: "text-sm text-slate-400",
                label: "text-xs font-mono text-neon-pink uppercase"
            };
            return <div className={styles[ui.variant] || styles.body}>{ui.content}</div>;

        case 'button':
            const variants = {
                primary: "bg-neon-cyan/10 text-neon-cyan border-neon-cyan hover:bg-neon-cyan hover:text-black",
                danger: "bg-neon-pink/10 text-neon-pink border-neon-pink hover:bg-neon-pink hover:text-white",
            };
            return (
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`px-5 py-3 rounded-lg border border-dashed font-mono text-sm uppercase transition-colors ${variants[ui.variant] || variants.primary}`}
                    onClick={() => onAction && onAction(ui.action, ui.payload)}
                >
                    <span className="flex items-center gap-2">
                        {ui.icon === 'play' && <Play size={12} />}
                        {ui.label}
                    </span>
                </motion.button>
            );

        case 'input':
            return (
                <input
                    type="text"
                    placeholder={ui.placeholder}
                    className="bg-black/50 border border-slate-700 text-slate-300 text-sm p-3 rounded-lg w-full focus:outline-none focus:border-neon-cyan font-mono"
                />
            )

        default:
            return <div className="text-red-500 text-xs border border-red-500 p-1">Unknown component: {ui.type}</div>;
    }
};

export default A2Renderer;
