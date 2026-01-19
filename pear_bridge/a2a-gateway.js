/**
 * A2A Gateway - Google A2A Protocol Compliant HTTP Gateway
 *
 * Provides A2A-compliant endpoints for external agents to interact
 * with Kizuna nodes over HTTP while using KTP internally.
 *
 * Endpoints:
 *   GET  /.well-known/agent-card.json  - Agent Card (public)
 *   POST /a2a/v1                       - JSON-RPC dispatcher (auth required)
 */

const express = require('express')
const crypto = require('crypto')

const {
    A2A_ERRORS,
    jsonRpcError,
    jsonRpcSuccess,
    validateJsonRpcRequest,
    validateMessageSendParams,
    validateTasksGetParams,
    validateTasksListParams,
    extractTextFromParts
} = require('./a2a-types')

const {
    ktpTaskToA2ATask,
    a2aMessageToKtpPayload,
    buildA2ATaskListResponse
} = require('./a2a-state-mapper')

// --- Module State (injected via init) ---
let state = {
    sentTasks: null,
    receivedTasks: null,
    deadLetterTasks: null,
    myManifest: null,
    myPeerId: null,
    myPeerIdRaw: null,
    API_KEY: '',
    PORT: 3000,
    requireAuth: null,
    signMessage: null,
    peers: null,
    generateTaskId: null
}

const a2aRouter = express.Router()

// --- Agent Card Endpoint (Public) ---
a2aRouter.get('/.well-known/agent-card.json', (req, res) => {
    const host = req.get('host') || `localhost:${state.PORT}`
    const protocol = req.protocol || 'http'

    const agentCard = {
        protocolVersion: '0.3.0',
        name: state.myManifest?.agent_id || 'Kizuna Agent',
        description: 'P2P AI agent node powered by Hyperswarm DHT. Part of the Kizuna network for cross-model AI collaboration.',
        url: `${protocol}://${host}/a2a/v1`,
        version: '1.0.0',
        capabilities: {
            streaming: false,
            pushNotifications: false
        },
        defaultInputModes: ['text/plain', 'application/json'],
        defaultOutputModes: ['text/plain', 'application/json'],
        skills: buildSkillsFromManifest(state.myManifest),
        provider: {
            organization: 'Kizuna Network',
            url: 'https://github.com/kizuna-network'
        }
    }

    // Add security schemes if API key is configured
    if (state.API_KEY) {
        agentCard.securitySchemes = {
            bearer: {
                type: 'http',
                scheme: 'bearer',
                description: 'Bearer token authentication required'
            }
        }
        agentCard.security = [{ bearer: [] }]
    }

    // Add P2P metadata
    agentCard.extensions = {
        'x-kizuna': {
            peerId: state.myPeerIdRaw?.substring(0, 16),
            role: state.myManifest?.role || 'Generalist',
            protocol: 'KTP/1.0'
        }
    }

    res.json(agentCard)
})

// --- JSON-RPC Dispatcher (Auth Required) ---
a2aRouter.post('/a2a/v1', (req, res, next) => {
    // Apply auth if configured
    if (state.requireAuth) {
        state.requireAuth(req, res, () => handleJsonRpc(req, res))
    } else {
        handleJsonRpc(req, res)
    }
})

/**
 * Handle JSON-RPC 2.0 requests
 */
function handleJsonRpc(req, res) {
    let body
    try {
        body = req.body
    } catch (e) {
        return res.json(jsonRpcError(null, A2A_ERRORS.PARSE_ERROR))
    }

    // Validate JSON-RPC structure
    const validation = validateJsonRpcRequest(body)
    if (!validation.valid) {
        return res.json(jsonRpcError(body?.id, validation.error))
    }

    const { id, method, params } = body

    // Route to method handlers
    switch (method) {
        case 'message/send':
            return handleMessageSend(id, params, res)

        case 'tasks/get':
            return handleTasksGet(id, params, res)

        case 'tasks/list':
            return handleTasksList(id, params, res)

        default:
            return res.json(jsonRpcError(id, A2A_ERRORS.METHOD_NOT_FOUND, {
                supportedMethods: ['message/send', 'tasks/get', 'tasks/list']
            }))
    }
}

/**
 * Handle message/send - Create a KTP task from A2A message
 *
 * Maps to: POST /task/request
 */
function handleMessageSend(id, params, res) {
    // Validate params
    const validation = validateMessageSendParams(params)
    if (!validation.valid) {
        return res.json(jsonRpcError(id, A2A_ERRORS.INVALID_PARAMS, validation.error))
    }

    const { message, contextId, target } = params

    // Convert A2A message to KTP payload
    const ktpPayload = a2aMessageToKtpPayload(message, {
        context: { contextId }
    })

    // Generate task ID
    const taskId = state.generateTaskId()

    // Build KTP task request
    const taskRequest = {
        type: 'task_request',
        task_id: taskId,
        task_type: 'general',
        payload: ktpPayload,
        deadline: null,
        sender: state.myPeerIdRaw?.substring(0, 8)
    }

    // Sign and prepare message
    const signedMsg = state.signMessage(JSON.stringify(taskRequest))
    const msgBuffer = Buffer.from(JSON.stringify(signedMsg))

    let sentCount = 0
    let targetPeer = null

    // Send to specific target or broadcast
    if (target && target !== '*') {
        for (const [key, peer] of state.peers.entries()) {
            const peerShortId = key.slice(-8)
            const manifest = peer.manifest || {}
            if (peerShortId === target || manifest.agent_id?.toLowerCase() === target.toLowerCase()) {
                peer.socket.write(msgBuffer)
                targetPeer = peerShortId
                sentCount = 1
                break
            }
        }
    } else {
        // Broadcast to all peers
        for (const peer of state.peers.values()) {
            peer.socket.write(msgBuffer)
            sentCount++
        }
    }

    // Store task
    state.sentTasks.set(taskId, {
        target: targetPeer || '*',
        status: sentCount > 0 ? 'pending' : 'queued_for_retry',
        payload: ktpPayload,
        task_type: 'general',
        createdAt: Date.now(),
        contextId: contextId || taskId,
        deadline: null,
        a2aSource: true
    })

    // Build A2A task response
    const a2aTask = ktpTaskToA2ATask(state.sentTasks.get(taskId), taskId, 'sent')

    console.log(`[a2a] message/send created task ${taskId}, sent to ${sentCount} peer(s)`)

    return res.json(jsonRpcSuccess(id, {
        task: a2aTask
    }))
}

/**
 * Handle tasks/get - Get a single task by ID
 *
 * Maps to: GET /task/status/:id
 */
function handleTasksGet(id, params, res) {
    // Validate params
    const validation = validateTasksGetParams(params)
    if (!validation.valid) {
        return res.json(jsonRpcError(id, A2A_ERRORS.INVALID_PARAMS, validation.error))
    }

    const { taskId } = params

    // Check sent tasks
    if (state.sentTasks.has(taskId)) {
        const task = state.sentTasks.get(taskId)
        const a2aTask = ktpTaskToA2ATask(task, taskId, 'sent')
        return res.json(jsonRpcSuccess(id, { task: a2aTask }))
    }

    // Check received tasks
    if (state.receivedTasks.has(taskId)) {
        const task = state.receivedTasks.get(taskId)
        const a2aTask = ktpTaskToA2ATask(task, taskId, 'received')
        return res.json(jsonRpcSuccess(id, { task: a2aTask }))
    }

    // Check dead letter queue
    if (state.deadLetterTasks.has(taskId)) {
        const task = state.deadLetterTasks.get(taskId)
        const a2aTask = ktpTaskToA2ATask(task, taskId, 'failed')
        return res.json(jsonRpcSuccess(id, { task: a2aTask }))
    }

    // Not found
    return res.json(jsonRpcError(id, A2A_ERRORS.TASK_NOT_FOUND, { taskId }))
}

/**
 * Handle tasks/list - List all tasks with optional filters
 *
 * Maps to: GET /tasks
 */
function handleTasksList(id, params, res) {
    // Validate params
    const validation = validateTasksListParams(params)
    if (!validation.valid) {
        return res.json(jsonRpcError(id, A2A_ERRORS.INVALID_PARAMS, validation.error))
    }

    const filters = {
        state: params?.state,
        contextId: params?.contextId
    }

    const tasks = buildA2ATaskListResponse(
        state.sentTasks,
        state.receivedTasks,
        state.deadLetterTasks,
        filters
    )

    return res.json(jsonRpcSuccess(id, { tasks }))
}

/**
 * Build A2A skills from Kizuna manifest
 */
function buildSkillsFromManifest(manifest) {
    if (!manifest || !manifest.skills) {
        return []
    }

    return manifest.skills.map((skill, idx) => ({
        id: typeof skill === 'string' ? skill : skill.id || `skill-${idx}`,
        name: typeof skill === 'string' ? skill : skill.name || skill.id,
        description: typeof skill === 'object' ? skill.description : `${skill} capability`,
        inputModes: ['text/plain'],
        outputModes: ['text/plain']
    }))
}

/**
 * Initialize the A2A gateway with shared state from index.js
 */
function initA2AGateway(config) {
    state.sentTasks = config.sentTasks
    state.receivedTasks = config.receivedTasks
    state.deadLetterTasks = config.deadLetterTasks
    state.myManifest = config.myManifest
    state.myPeerId = config.myPeerId
    state.myPeerIdRaw = config.myPeerIdRaw
    state.API_KEY = config.API_KEY || ''
    state.PORT = config.PORT || 3000
    state.requireAuth = config.requireAuth
    state.signMessage = config.signMessage
    state.peers = config.peers
    state.generateTaskId = config.generateTaskId

    console.log('[a2a] Gateway initialized')
    console.log(`[a2a] Agent Card: /.well-known/agent-card.json`)
    console.log(`[a2a] JSON-RPC:   POST /a2a/v1`)
}

/**
 * Get current manifest reference (for live updates)
 */
function getManifestRef() {
    return () => state.myManifest
}

module.exports = {
    a2aRouter,
    initA2AGateway,
    getManifestRef
}
