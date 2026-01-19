/**
 * A2A Gateway - State Mapper
 *
 * Translates between Kizuna Task Protocol (KTP) states
 * and Google A2A protocol states.
 */

// --- State Mapping Table ---
// KTP State           -> A2A State
// -----------------------------------
// pending             -> submitted
// queued_for_retry    -> working
// accepted            -> working
// in_progress         -> working
// completed           -> completed
// failed              -> failed
// rejected            -> rejected

const KTP_TO_A2A_STATE = {
    'pending': 'submitted',
    'queued_for_retry': 'working',
    'accepted': 'working',
    'in_progress': 'working',
    'completed': 'completed',
    'failed': 'failed',
    'rejected': 'rejected'
}

/**
 * Convert KTP task status to A2A task state
 */
function ktpToA2AState(ktpStatus) {
    return KTP_TO_A2A_STATE[ktpStatus] || 'submitted'
}

/**
 * Convert a KTP task object to A2A Task format
 *
 * A2A Task structure:
 * {
 *   id: string,
 *   contextId: string,
 *   status: { state: string, message?: string, timestamp?: string },
 *   artifacts?: [ { id, name, parts, ... } ],
 *   history?: [ messages ]
 * }
 */
function ktpTaskToA2ATask(ktpTask, taskId, direction = 'sent') {
    const a2aState = ktpToA2AState(ktpTask.status)

    const a2aTask = {
        id: taskId,
        contextId: ktpTask.contextId || taskId, // Use task ID as context if not set
        status: {
            state: a2aState,
            timestamp: new Date(ktpTask.createdAt || Date.now()).toISOString()
        }
    }

    // Add error message if failed
    if (ktpTask.error) {
        a2aTask.status.message = ktpTask.error
    }

    // Add failure reason from dead letter queue
    if (ktpTask.failureReason) {
        a2aTask.status.message = ktpTask.failureReason
    }

    // Add artifacts if task completed with result
    if (ktpTask.result !== undefined && ktpTask.result !== null) {
        a2aTask.artifacts = [{
            id: `${taskId}-result`,
            name: 'result',
            parts: [
                {
                    kind: typeof ktpTask.result === 'string' ? 'text' : 'data',
                    ...(typeof ktpTask.result === 'string'
                        ? { text: ktpTask.result }
                        : { data: ktpTask.result })
                }
            ]
        }]
    }

    // Add metadata
    a2aTask.metadata = {
        direction,
        target: ktpTask.target,
        taskType: ktpTask.task_type,
        ktpStatus: ktpTask.status,
        createdAt: ktpTask.createdAt,
        completedAt: ktpTask.completedAt,
        deadline: ktpTask.deadline
    }

    // Include original payload description in history
    if (ktpTask.payload && ktpTask.payload.description) {
        a2aTask.history = [{
            role: direction === 'sent' ? 'user' : 'assistant',
            parts: [{
                kind: 'text',
                text: ktpTask.payload.description
            }]
        }]
    }

    return a2aTask
}

/**
 * Convert A2A message parts to KTP task payload
 *
 * A2A Message:
 * { role: 'user', parts: [{ kind: 'text', text: '...' }] }
 *
 * KTP Payload:
 * { description: '...', context: {}, priority: 'medium' }
 */
function a2aMessageToKtpPayload(message, options = {}) {
    const textParts = []
    const dataParts = []

    // Extract content from parts
    for (const part of (message.parts || [])) {
        if (part.kind === 'text' && part.text) {
            textParts.push(part.text)
        } else if (part.kind === 'data' && part.data) {
            dataParts.push(part.data)
        } else if (part.kind === 'file') {
            // File references stored in context
            dataParts.push({ file: part.uri || part.name })
        }
    }

    return {
        description: textParts.join('\n') || 'A2A task',
        context: {
            a2a_message: message,
            data_parts: dataParts.length > 0 ? dataParts : undefined,
            ...options.context
        },
        priority: options.priority || 'medium'
    }
}

/**
 * Build A2A-formatted task list response
 */
function buildA2ATaskListResponse(sentTasks, receivedTasks, deadLetterTasks, filters = {}) {
    const tasks = []

    // Add sent tasks
    for (const [taskId, task] of sentTasks.entries()) {
        const a2aTask = ktpTaskToA2ATask(task, taskId, 'sent')

        // Apply filters
        if (filters.state && a2aTask.status.state !== filters.state) continue
        if (filters.contextId && a2aTask.contextId !== filters.contextId) continue

        tasks.push(a2aTask)
    }

    // Add received tasks
    for (const [taskId, task] of receivedTasks.entries()) {
        const a2aTask = ktpTaskToA2ATask(task, taskId, 'received')

        // Apply filters
        if (filters.state && a2aTask.status.state !== filters.state) continue
        if (filters.contextId && a2aTask.contextId !== filters.contextId) continue

        tasks.push(a2aTask)
    }

    // Add dead letter tasks
    for (const [taskId, task] of deadLetterTasks.entries()) {
        const a2aTask = ktpTaskToA2ATask(task, taskId, 'failed')

        // Apply filters
        if (filters.state && a2aTask.status.state !== filters.state) continue
        if (filters.contextId && a2aTask.contextId !== filters.contextId) continue

        tasks.push(a2aTask)
    }

    // Sort by creation time, newest first
    tasks.sort((a, b) => {
        const aTime = a.metadata?.createdAt || 0
        const bTime = b.metadata?.createdAt || 0
        return bTime - aTime
    })

    return tasks
}

module.exports = {
    KTP_TO_A2A_STATE,
    ktpToA2AState,
    ktpTaskToA2ATask,
    a2aMessageToKtpPayload,
    buildA2ATaskListResponse
}
