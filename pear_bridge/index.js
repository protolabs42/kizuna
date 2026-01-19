/**
 * Kizuna (絆) - P2P Bridge
 *
 * Hyperswarm-based P2P networking for AI agent collaboration.
 * Part of the Kizuna project: enabling cross-model AI communication.
 */

const Hyperswarm = require('hyperswarm')
const express = require('express')
const cors = require('cors')
const crypto = require('crypto')
const fs = require('fs');
const path = require('path');
const Hypercore = require('hypercore');
const Hyperdrive = require('hyperdrive');
const Corestore = require('corestore');
const Localdrive = require('localdrive');

const app = express()
app.use(express.json())
app.use(cors())

// --- CONFIG ---
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
console.log(`[config] Data Dir: ${DATA_DIR}`);

// --- AUTH CONFIG ---
const API_KEY = process.env.KIZUNA_API_KEY || ''
const BIND_HOST = process.env.BIND_HOST || ''

/**
 * Auth middleware for sensitive endpoints
 * - If no API_KEY set: localhost mode, no auth required
 * - If API_KEY set: requires Bearer token
 */
function requireAuth(req, res, next) {
    if (!API_KEY) return next()  // Localhost mode, no auth needed

    const authHeader = req.headers.authorization
    if (!authHeader) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Bearer token required' })
    }

    const [type, token] = authHeader.split(' ')
    if (type?.toLowerCase() !== 'bearer' || !token) {
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid authorization format' })
    }

    // Timing-safe comparison to prevent timing attacks
    if (token.length !== API_KEY.length ||
        !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(API_KEY))) {
        return res.status(403).json({ error: 'Forbidden', message: 'Invalid API key' })
    }

    next()
}

// --- HYPERCORE INIT ---
const core = new Hypercore(path.join(DATA_DIR, 'blackboard'));
core.ready().then(() => {
    console.log('[memory] Blackboard Key:', core.key.toString('hex'));
});

// --- HYPERDRIVE INIT ---
const store = new Corestore(path.join(DATA_DIR, 'storage'));
const drive = new Hyperdrive(store);
drive.ready().then(() => {
    console.log('[storage] Drive Key:', drive.key.toString('hex'));
});

// --- Identity ---
const IDENTITY_FILE = path.join(DATA_DIR, 'identity.json')
let publicKey, privateKey

if (fs.existsSync(IDENTITY_FILE)) {
    console.log('[identity] Loading from file...')
    const data = JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf8'))
    publicKey = crypto.createPublicKey({ key: Buffer.from(data.publicKey, 'hex'), format: 'der', type: 'spki' })
    privateKey = crypto.createPrivateKey({ key: Buffer.from(data.privateKey, 'hex'), format: 'der', type: 'pkcs8' })
} else {
    console.log('[identity] Generating new keys...')
    const pair = crypto.generateKeyPairSync('ed25519')
    publicKey = pair.publicKey
    privateKey = pair.privateKey

    // Save to disk
    fs.writeFileSync(IDENTITY_FILE, JSON.stringify({
        publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('hex'),
        privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex')
    }, null, 2))
}

const myPeerId = publicKey.export({ type: 'spki', format: 'der' }).toString('hex')

// Extract raw Ed25519 key from DER-encoded SPKI (skip 22-byte/44-char header)
const getRawKeyHex = (derHex) => derHex.length > 44 ? derHex.slice(44) : derHex
const myPeerIdRaw = getRawKeyHex(myPeerId)

// --- State ---
// myManifest sent to others during handshake
let myManifest = {
    role: 'Generalist',
    skills: ['chat'],
    agent_id: 'Agent-Zero'
}

const swarm = new Hyperswarm()
const peers = new Map() // peerKey -> { socket, lastSeen, interval, manifest }
const inbox = [] // Buffer for incoming messages
let entropyEnabled = false

// --- Stats Tracking ---
const totalUniquePeers = new Set() // All peers ever seen (persists across reconnects)
const startedAt = Date.now()
totalUniquePeers.add(myPeerId) // Count ourselves

// --- Topic Management ---
const activeTopics = new Map() // topicName -> { topicBuffer, hasSecret, joinedAt }

// --- Task Management (A2A Protocol) ---
const sentTasks = new Map()     // task_id -> { target, status, payload, createdAt, deadline }
const receivedTasks = new Map() // task_id -> { from, status, payload, createdAt, deadline }

function generateTaskId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0
        const v = c === 'x' ? r : (r & 0x3 | 0x8)
        return v.toString(16)
    })
}

console.log('[identity] ID:', myPeerIdRaw)

function joinTopic(topicName, secret = '') {
    // Derive topic hash: SHA256(topic:secret) for private, SHA256(topic) for public
    const combined = secret ? `${topicName}:${secret}` : topicName
    const topicBuffer = crypto.createHash('sha256').update(combined).digest()

    // Track the topic
    if (activeTopics.has(topicName)) {
        console.log(`[swarm] Already in topic: ${topicName}`)
        return activeTopics.get(topicName).topicBuffer.toString('hex')
    }

    swarm.join(topicBuffer)
    activeTopics.set(topicName, {
        topicBuffer,
        hasSecret: !!secret,
        joinedAt: Date.now()
    })
    console.log(`[swarm] Joined: ${topicName} (private: ${!!secret})`)
    return topicBuffer.toString('hex')
}

function leaveTopic(topicName) {
    if (!activeTopics.has(topicName)) {
        return false
    }
    const { topicBuffer } = activeTopics.get(topicName)
    swarm.leave(topicBuffer)
    activeTopics.delete(topicName)
    console.log(`[swarm] Left: ${topicName}`)
    return true
}

// Join default public topic
joinTopic('agent-zero-swarm-poc')

swarm.on('connection', (socket, info) => {
    const remoteKey = info.publicKey.toString('hex')
    console.log('[swarm] New connection:', remoteKey)

    // Track unique peers for deployment counter
    totalUniquePeers.add(remoteKey)

    // 1. Send Handshake immediately on connection
    const handshakeMsg = signMessage(JSON.stringify({
        type: 'handshake',
        manifest: myManifest
    }))
    socket.write(JSON.stringify(handshakeMsg))

    // Heartbeat
    const pingInterval = setInterval(() => {
        try { socket.write(JSON.stringify({ type: 'ping' })) } catch (e) { clearInterval(pingInterval) }
    }, 2500)

    peers.set(remoteKey, {
        socket,
        lastSeen: Date.now(),
        interval: pingInterval,
        manifest: null // Will be filled when we receive their handshake
    })

    socket.on('data', data => {
        try {
            const raw = JSON.parse(data.toString())

            if (raw.type === 'ping') {
                if (peers.has(remoteKey)) peers.get(remoteKey).lastSeen = Date.now()
                return
            }

            // Verify Signature
            if (raw.signature && raw.senderKey) {
                if (!verifyMessage(raw)) return console.warn(`[swarm] Bad sig from ${remoteKey}`)

                const payload = JSON.parse(raw.content) // Content is inner JSON

                // Handle Handshake
                if (payload.type === 'handshake') {
                    console.log(`[swarm] Peer ${remoteKey} declared capabilities:`, payload.manifest)
                    if (peers.has(remoteKey)) {
                        peers.get(remoteKey).manifest = payload.manifest
                    }
                    return
                }

                // Handle Task Request (A2A Protocol)
                if (payload.type === 'task_request') {
                    console.log(`[task] Received task request ${payload.task_id} from ${remoteKey}`)
                    receivedTasks.set(payload.task_id, {
                        from: remoteKey,
                        fromShortId: remoteKey.slice(-8),
                        status: 'pending',
                        payload: payload.payload,
                        task_type: payload.task_type,
                        createdAt: Date.now(),
                        deadline: payload.deadline
                    })
                    // Also push to inbox so agent sees it
                    inbox.push({
                        sender: remoteKey,
                        senderShortId: remoteKey.slice(-8),
                        timestamp: Date.now(),
                        content: payload
                    })
                    return
                }

                // Handle Task Response (A2A Protocol)
                if (payload.type === 'task_response') {
                    console.log(`[task] Received response for task ${payload.task_id}: ${payload.status}`)
                    if (sentTasks.has(payload.task_id)) {
                        const task = sentTasks.get(payload.task_id)
                        task.status = payload.status
                        task.result = payload.result
                        task.error = payload.error
                        task.completedAt = Date.now()
                        task.responder = remoteKey.slice(-8)
                    }
                    // Also push to inbox so agent sees it
                    inbox.push({
                        sender: remoteKey,
                        senderShortId: remoteKey.slice(-8),
                        timestamp: Date.now(),
                        content: payload
                    })
                    return
                }

                console.log(`[swarm] Msg from ${remoteKey}:`, payload)
                inbox.push({
                    sender: remoteKey,
                    senderShortId: remoteKey.slice(-8),
                    timestamp: Date.now(),
                    content: payload
                })
            }
        } catch (e) { }
    })

    socket.on('close', () => {
        console.log('[swarm] Closed:', remoteKey)
        cleanupPeer(remoteKey)
    })

    socket.on('error', () => cleanupPeer(remoteKey))
})

function cleanupPeer(key) {
    if (peers.has(key)) {
        clearInterval(peers.get(key).interval)
        peers.delete(key)
    }
}

// Timeout Reaper (10s)
setInterval(() => {
    const now = Date.now()
    for (const [key, peer] of peers.entries()) {
        if (now - peer.lastSeen > 10000) {
            console.log(`[swarm] Timeout: ${key}`)
            peer.socket.destroy()
            cleanupPeer(key)
        }
    }
}, 5000)

// Entropy Reaper (30s)
setInterval(() => {
    if (!entropyEnabled) return
    console.log('[entropy] Rotating...')
    for (const [key, peer] of peers.entries()) {
        if (Math.random() > 0.5) {
            peer.socket.destroy()
            cleanupPeer(key)
        }
    }
}, 30000)

function signMessage(contentString) {
    const signature = crypto.sign(null, Buffer.from(contentString), privateKey)
    return {
        content: contentString, // The actual payload string
        senderKey: myPeerId,
        signature: signature.toString('hex'),
        timestamp: Date.now()
    }
}

function verifyMessage(message) {
    try {
        const { content, senderKey, signature } = message
        const senderKeyBuffer = Buffer.from(senderKey, 'hex')
        const senderKeyObject = crypto.createPublicKey({ key: senderKeyBuffer, format: 'der', type: 'spki' })
        return crypto.verify(null, Buffer.from(content), senderKeyObject, Buffer.from(signature, 'hex'))
    } catch (e) { return false }
}

// --- API ---

// Root redirects to dashboard
app.get('/', (req, res) => {
    res.redirect('/dashboard')
})

app.get('/dashboard', (req, res) => {
    try {
        const filePath = path.join(__dirname, 'dashboard.html')
        const content = fs.readFileSync(filePath, 'utf8')
        res.send(content)
    } catch (err) { res.status(500).send('Error') }
})

app.get('/info', requireAuth, (req, res) => {
    res.json({ peerId: myPeerId, publicKey: myPeerId, manifest: myManifest })
})

// Health check endpoint for Docker/K8s orchestration
app.get('/health', (req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000)
    const health = {
        status: 'healthy',
        timestamp: Date.now(),
        peerId: myPeerIdRaw ? myPeerIdRaw.substring(0, 8) : 'initializing',
        peerCount: peers.size,
        uptime: uptimeSeconds
    }

    // Degraded if no peers after 30 seconds of uptime
    if (peers.size === 0 && uptimeSeconds > 30) {
        health.status = 'degraded'
        health.reason = 'No peer connections after 30s'
    }

    res.status(health.status === 'healthy' ? 200 : 503).json(health)
})

// Deployment Counter Stats (Hypermind-style)
app.get('/stats', (req, res) => {
    res.json({
        active: peers.size + 1, // Active connections + self
        totalUnique: totalUniquePeers.size, // All peers ever seen
        direct: peers.size, // Direct connections only
        myId: myPeerIdRaw.substring(0, 8), // First 8 chars of raw key
        uptime: Math.floor((Date.now() - startedAt) / 1000), // Seconds
        version: '0.1.0'
    })
})

app.post('/manifest', requireAuth, (req, res) => {
    const { role, skills, agent_id, specs } = req.body
    if (role) myManifest.role = role
    if (skills) myManifest.skills = skills
    if (agent_id) myManifest.agent_id = agent_id
    if (specs) myManifest.specs = specs

    console.log('[api] Manifest Updated:', myManifest)

    // Re-broadcast handshake to all connected peers
    const handshakeMsg = signMessage(JSON.stringify({
        type: 'handshake',
        manifest: myManifest
    }))
    const msgBuffer = Buffer.from(JSON.stringify(handshakeMsg))

    for (const peer of peers.values()) {
        peer.socket.write(msgBuffer)
    }

    res.json({ status: 'updated', manifest: myManifest })
})

app.get('/peers', requireAuth, (req, res) => {
    // Return detailed peer list with manifests
    const peerList = []
    for (const [key, peer] of peers.entries()) {
        peerList.push({
            publicKey: key,
            manifest: peer.manifest || { role: 'Unknown', skills: [] },
            lastSeen: peer.lastSeen
        })
    }
    res.json({ count: peerList.length, peers: peerList.map(p => p.publicKey), details: peerList })
})

// --- Topic Endpoints ---
app.post('/join', requireAuth, (req, res) => {
    const { topic, secret } = req.body
    if (!topic) return res.status(400).json({ error: 'Missing topic' })
    const topicHash = joinTopic(topic, secret || '')
    res.json({
        status: 'joined',
        topic,
        topicHash,
        private: !!secret
    })
})

app.post('/leave', requireAuth, (req, res) => {
    const { topic } = req.body
    if (!topic) return res.status(400).json({ error: 'Missing topic' })
    const success = leaveTopic(topic)
    if (!success) return res.status(404).json({ error: 'Not in topic' })
    res.json({ status: 'left', topic })
})

app.get('/topics', requireAuth, (req, res) => {
    const topics = [...activeTopics.entries()].map(([name, info]) => ({
        name,
        private: info.hasSecret,
        joinedAt: info.joinedAt,
        hash: info.topicBuffer.toString('hex').slice(0, 8) // Short hash for display
    }))
    res.json({ count: topics.length, topics })
})

app.post('/entropy', requireAuth, (req, res) => {
    entropyEnabled = !entropyEnabled
    res.json({ enabled: entropyEnabled })
})

app.post('/broadcast', requireAuth, (req, res) => {
    console.log('[debug] broadcast received:', req.body)
    const { content } = req.body

    // Wrap content in our standard envelope if it's just a string, 
    // but typically the agent sends a structured object.
    // For raw messages, we just sign and send.

    const signedMsg = signMessage(JSON.stringify(content))
    // Note: We are stringifying the content here to sign it. 
    // The receiver expects 'content' to be a JSON string that parses to { type: ... }.

    const msgBuffer = Buffer.from(JSON.stringify(signedMsg))

    let sentCount = 0
    for (const peer of peers.values()) {
        peer.socket.write(msgBuffer)
        sentCount++
    }

    // --- LOOPBACK: Also deliver to local inbox ---
    // This allows the Python Agent on THIS Bridge to receive UI commands.
    inbox.push({
        sender: myPeerId, // Mark as from "self" (Operator via this Bridge)
        senderShortId: myPeerIdRaw.substring(0, 8), // For UI self-filter
        timestamp: Date.now(),
        content: content // Original content, not the signed wrapper
    })
    console.log(`[api] Broadcast to ${sentCount} peers + loopback to local inbox`)

    res.json({ status: 'ok', sent_to: sentCount })
})

const PORT = process.env.PORT || 3000
// --- MEMORY ENDPOINTS ---
app.post('/memory', requireAuth, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content) return res.status(400).json({ error: 'Content required' });

        await core.append(JSON.stringify({
            ts: Date.now(),
            content
        }));

        res.json({ success: true, length: core.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/memory', requireAuth, async (req, res) => {
    try {
        // Read last 100 items by default
        const start = Math.max(0, core.length - 100);
        const stream = core.createReadStream({ start });
        const memory = [];

        for await (const data of stream) {
            memory.push(JSON.parse(data.toString()));
        }

        res.json({ memory });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- STORAGE ENDPOINTS ---
app.post('/storage', requireAuth, async (req, res) => {
    try {
        const { filename, content } = req.body; // Expects base64 content
        if (!filename || !content) return res.status(400).json({ error: 'filename and content(base64) required' });

        const buffer = Buffer.from(content, 'base64');
        await drive.put(filename, buffer);
        res.json({ success: true, filename });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/storage', requireAuth, async (req, res) => {
    try {
        const files = [];
        for await (const entry of drive.entries()) {
            files.push(entry);
        }
        res.json({ files });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/storage/:filename', requireAuth, async (req, res) => {
    try {
        const buffer = await drive.get(req.params.filename);
        if (!buffer) return res.status(404).json({ error: 'File not found' });
        res.json({ content: buffer.toString('base64') });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/inbox', requireAuth, (req, res) => {
    const messages = [...inbox];
    inbox.length = 0; // Clear inbox on read (Pop logic)
    res.json({ count: messages.length, messages });
})

// --- TASK DELEGATION ENDPOINTS (A2A Protocol) ---

// Valid enums for task validation
const VALID_TASK_TYPES = ['general', 'analysis', 'code_review', 'research', 'test', 'other']
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical']
const MAX_DESCRIPTION_LENGTH = 10000
const MAX_CONTEXT_SIZE = 50000

// Send a task request to a peer or broadcast
app.post('/task/request', requireAuth, (req, res) => {
    const { task_type, description, context, target, priority, deadline } = req.body

    if (!description) {
        return res.status(400).json({ error: 'description is required' })
    }

    // Input validation (Ruby review B1, I2, S2)
    if (typeof description !== 'string') {
        return res.status(400).json({ error: 'description must be a string' })
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
        return res.status(400).json({ error: `description exceeds max length of ${MAX_DESCRIPTION_LENGTH}` })
    }
    if (target !== undefined && typeof target !== 'string') {
        return res.status(400).json({ error: 'target must be a string' })
    }
    if (task_type && !VALID_TASK_TYPES.includes(task_type)) {
        return res.status(400).json({ error: `task_type must be one of: ${VALID_TASK_TYPES.join(', ')}` })
    }
    if (priority && !VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({ error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` })
    }
    if (context && JSON.stringify(context).length > MAX_CONTEXT_SIZE) {
        return res.status(400).json({ error: `context exceeds max size of ${MAX_CONTEXT_SIZE} bytes` })
    }

    const task_id = generateTaskId()
    const taskPayload = {
        type: 'task_request',
        task_id,
        task_type: task_type || 'general',
        payload: {
            description,
            context: context || {},
            priority: priority || 'medium'
        },
        deadline: deadline || null,
        sender: myPeerIdRaw.substring(0, 8)
    }

    const signedMsg = signMessage(JSON.stringify(taskPayload))
    const msgBuffer = Buffer.from(JSON.stringify(signedMsg))

    let sentCount = 0
    let targetPeer = null

    // If target specified, find and send to specific peer
    if (target && target !== '*') {
        for (const [key, peer] of peers.entries()) {
            const peerShortId = key.slice(-8)
            const manifest = peer.manifest || {}
            // Match by short ID or agent_id
            if (peerShortId === target || manifest.agent_id?.toLowerCase() === target.toLowerCase()) {
                peer.socket.write(msgBuffer)
                targetPeer = peerShortId
                sentCount = 1
                break
            }
        }
        if (sentCount === 0) {
            return res.status(404).json({ error: `Peer '${target}' not found` })
        }
    } else {
        // Broadcast to all peers
        for (const peer of peers.values()) {
            peer.socket.write(msgBuffer)
            sentCount++
        }
    }

    // Track the task
    sentTasks.set(task_id, {
        target: targetPeer || '*',
        status: 'pending',
        payload: taskPayload.payload,
        task_type: taskPayload.task_type,
        createdAt: Date.now(),
        deadline: deadline || null
    })

    console.log(`[task] Sent task ${task_id} to ${targetPeer || 'all'} (${sentCount} peer(s))`)
    res.json({
        task_id,
        status: 'sent',
        target: targetPeer || '*',
        sent_to: sentCount
    })
})

// Respond to a task (accept, complete, fail, reject)
app.post('/task/respond', requireAuth, (req, res) => {
    const { task_id, status, result, error } = req.body

    if (!task_id) {
        return res.status(400).json({ error: 'task_id is required' })
    }

    const validStatuses = ['accepted', 'rejected', 'in_progress', 'completed', 'failed']
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` })
    }

    // Get the task from receivedTasks
    const task = receivedTasks.get(task_id)
    if (!task) {
        return res.status(404).json({ error: 'Task not found in received tasks' })
    }

    // Update local task status (Ruby review B2: use explicit undefined checks)
    task.status = status
    if (result !== undefined) task.result = result
    if (error !== undefined) task.error = error

    // Build response message
    const responsePayload = {
        type: 'task_response',
        task_id,
        status,
        result: result !== undefined ? result : null,
        error: error !== undefined ? error : null,
        responder: myPeerIdRaw.substring(0, 8)
    }

    const signedMsg = signMessage(JSON.stringify(responsePayload))
    const msgBuffer = Buffer.from(JSON.stringify(signedMsg))

    // Send response to the task sender
    let sent = false
    for (const [key, peer] of peers.entries()) {
        if (key === task.from) {
            peer.socket.write(msgBuffer)
            sent = true
            break
        }
    }

    console.log(`[task] Responded to task ${task_id} with status: ${status}`)
    res.json({
        task_id,
        status,
        sent_to_requester: sent
    })
})

// Get status of a specific task
app.get('/task/status/:task_id', requireAuth, (req, res) => {
    const { task_id } = req.params

    const sent = sentTasks.get(task_id)
    if (sent) {
        return res.json({
            task_id,
            direction: 'sent',
            ...sent
        })
    }

    const received = receivedTasks.get(task_id)
    if (received) {
        return res.json({
            task_id,
            direction: 'received',
            ...received
        })
    }

    res.status(404).json({ error: 'Task not found' })
})

// List all tasks
app.get('/tasks', requireAuth, (req, res) => {
    const sent = []
    for (const [id, task] of sentTasks.entries()) {
        sent.push({ task_id: id, ...task })
    }

    const received = []
    for (const [id, task] of receivedTasks.entries()) {
        received.push({ task_id: id, ...task })
    }

    res.json({
        sent: { count: sent.length, tasks: sent },
        received: { count: received.length, tasks: received }
    })
})

// --- CAPABILITY DISCOVERY ---

// Search peers by skill
app.get('/capabilities/search', requireAuth, (req, res) => {
    const { skill, role } = req.query
    const matches = []

    for (const [key, peer] of peers.entries()) {
        const manifest = peer.manifest || {}
        const peerSkills = manifest.skills || []
        const peerRole = manifest.role || ''

        let match = false
        if (skill && peerSkills.some(s => s.toLowerCase().includes(skill.toLowerCase()))) {
            match = true
        }
        if (role && peerRole.toLowerCase().includes(role.toLowerCase())) {
            match = true
        }

        if (match || (!skill && !role)) {
            matches.push({
                peer_id: key.slice(-8),
                full_id: key,
                agent_id: manifest.agent_id || 'Anonymous',
                role: peerRole || 'Unknown',
                skills: peerSkills
            })
        }
    }

    res.json({
        query: { skill, role },
        count: matches.length,
        matches
    })
})

// Secure by default: localhost-only unless API key is set
const bindHost = API_KEY ? '0.0.0.0' : (BIND_HOST || '127.0.0.1')

if (bindHost === '0.0.0.0' && !API_KEY) {
    console.warn('[SECURITY] WARNING: Binding to 0.0.0.0 without API key is insecure!')
}

app.listen(PORT, bindHost, () => {
    const mode = API_KEY ? 'auth-required' : 'localhost-only'
    console.log(`[bridge] Listening on http://${bindHost}:${PORT} (${mode} mode)`)
})
