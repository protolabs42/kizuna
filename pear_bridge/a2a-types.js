/**
 * A2A Gateway - Type Definitions and Validators
 *
 * JSON-RPC 2.0 error codes and validation utilities
 * for Google A2A protocol compliance.
 */

// --- JSON-RPC 2.0 Error Codes ---
const A2A_ERRORS = {
    PARSE_ERROR: { code: -32700, message: 'Parse error' },
    INVALID_REQUEST: { code: -32600, message: 'Invalid Request' },
    METHOD_NOT_FOUND: { code: -32601, message: 'Method not found' },
    INVALID_PARAMS: { code: -32602, message: 'Invalid params' },
    INTERNAL_ERROR: { code: -32603, message: 'Internal error' },
    // A2A-specific errors
    TASK_NOT_FOUND: { code: -32001, message: 'Task not found' },
    TASK_NOT_CANCELABLE: { code: -32002, message: 'Task not cancelable' },
    UNSUPPORTED_OPERATION: { code: -32003, message: 'Unsupported operation' }
}

/**
 * Create a JSON-RPC 2.0 error response
 */
function jsonRpcError(id, error, data = null) {
    const response = {
        jsonrpc: '2.0',
        id: id || null,
        error: {
            code: error.code,
            message: error.message
        }
    }
    if (data !== null) {
        response.error.data = data
    }
    return response
}

/**
 * Create a JSON-RPC 2.0 success response
 */
function jsonRpcSuccess(id, result) {
    return {
        jsonrpc: '2.0',
        id,
        result
    }
}

/**
 * Validate a JSON-RPC 2.0 request structure
 */
function validateJsonRpcRequest(body) {
    if (typeof body !== 'object' || body === null) {
        return { valid: false, error: A2A_ERRORS.INVALID_REQUEST }
    }

    if (body.jsonrpc !== '2.0') {
        return { valid: false, error: A2A_ERRORS.INVALID_REQUEST }
    }

    if (typeof body.method !== 'string' || body.method.length === 0) {
        return { valid: false, error: A2A_ERRORS.INVALID_REQUEST }
    }

    // id can be string, number, or null (for notifications)
    if (body.id !== undefined && body.id !== null &&
        typeof body.id !== 'string' && typeof body.id !== 'number') {
        return { valid: false, error: A2A_ERRORS.INVALID_REQUEST }
    }

    // params must be object or array if present
    if (body.params !== undefined &&
        typeof body.params !== 'object') {
        return { valid: false, error: A2A_ERRORS.INVALID_PARAMS }
    }

    return { valid: true }
}

/**
 * Validate A2A message/send params
 */
function validateMessageSendParams(params) {
    if (!params || typeof params !== 'object') {
        return { valid: false, error: 'params is required and must be an object' }
    }

    const { message } = params

    if (!message || typeof message !== 'object') {
        return { valid: false, error: 'message is required and must be an object' }
    }

    // role is required
    if (!message.role || typeof message.role !== 'string') {
        return { valid: false, error: 'message.role is required and must be a string' }
    }

    // parts is required
    if (!Array.isArray(message.parts)) {
        return { valid: false, error: 'message.parts is required and must be an array' }
    }

    // Validate each part
    for (let i = 0; i < message.parts.length; i++) {
        const part = message.parts[i]
        if (!part || typeof part !== 'object') {
            return { valid: false, error: `message.parts[${i}] must be an object` }
        }
        if (!part.kind || typeof part.kind !== 'string') {
            return { valid: false, error: `message.parts[${i}].kind is required` }
        }
        // For text parts, text is required
        if (part.kind === 'text' && typeof part.text !== 'string') {
            return { valid: false, error: `message.parts[${i}].text is required for text parts` }
        }
    }

    return { valid: true }
}

/**
 * Validate A2A tasks/get params
 */
function validateTasksGetParams(params) {
    if (!params || typeof params !== 'object') {
        return { valid: false, error: 'params is required and must be an object' }
    }

    if (!params.taskId || typeof params.taskId !== 'string') {
        return { valid: false, error: 'taskId is required and must be a string' }
    }

    return { valid: true }
}

/**
 * Validate A2A tasks/list params (optional filters)
 */
function validateTasksListParams(params) {
    // params can be empty or contain optional filters
    if (params !== undefined && params !== null && typeof params !== 'object') {
        return { valid: false, error: 'params must be an object if provided' }
    }

    return { valid: true }
}

/**
 * Extract text content from A2A message parts
 */
function extractTextFromParts(parts) {
    const textParts = []
    for (const part of parts) {
        if (part.kind === 'text' && part.text) {
            textParts.push(part.text)
        }
    }
    return textParts.join('\n')
}

module.exports = {
    A2A_ERRORS,
    jsonRpcError,
    jsonRpcSuccess,
    validateJsonRpcRequest,
    validateMessageSendParams,
    validateTasksGetParams,
    validateTasksListParams,
    extractTextFromParts
}
