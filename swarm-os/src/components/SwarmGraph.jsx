import React, { useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

const SwarmGraph = ({ peers, myId, width, height, onNodeClick }) => {
    const data = useMemo(() => {
        const nodes = [{ id: myId, group: 'me', val: 20, label: 'ME' }];
        const links = [];

        peers.forEach(p => {
            nodes.push({
                id: p.publicKey,
                group: 'peer',
                val: 10,
                label: p.manifest?.agent_id || 'Agent',
                ...p.manifest
            });
            links.push({ source: myId, target: p.publicKey });
        });

        return { nodes, links };
    }, [peers, myId]);

    return (
        <ForceGraph2D
            width={width}
            height={height}
            graphData={data}
            nodeLabel="label"
            nodeColor={n => n.group === 'me' ? '#00F0FF' : '#FF2A6D'}
            linkColor={() => '#334155'}
            backgroundColor="transparent"
            nodeRelSize={4}
            onNodeClick={onNodeClick}
            cooldownTicks={100}
            d3VelocityDecay={0.3}
        />
    );
};

export default SwarmGraph;
