const Hyperswarm = require('hyperswarm')
const crypto = require('crypto')

const swarm = new Hyperswarm()
const topic = crypto.createHash('sha256').update('agent-zero-swarm-poc').digest()

console.log('Test Peer joining swarm...')
swarm.join(topic)

swarm.on('connection', (socket, info) => {
    const remoteKey = info.publicKey.toString('hex')
    console.log('Connected to:', remoteKey)

    // Wait a bit then send a message
    setTimeout(() => {
        const msg = JSON.stringify({
            type: 'direct',
            content: JSON.stringify({ type: 'GREETING', text: 'Hello from Test Peer' }),
            senderKey: 'test-peer-key',
            signature: 'mock-sig' // The bridge currently verifies sigs, so this might fail if I don't sign properly.
            // Wait, the bridge logic checks: verifyMessage(raw)
            // I need to generate a real key pair to sign properly if the bridge enforces it.
        })

        // Let's look at bridge logic:
        // if (raw.signature && raw.senderKey) { if (!verifyMessage(raw)) ... }
        // So I must sign it.

        sendSignedMessage(socket, { type: 'GREETING', text: 'Hello from Test Peer' })
    }, 1000)
})

// Quick Key Gen
const pair = crypto.generateKeyPairSync('ed25519')
const publicKey = pair.publicKey
const privateKey = pair.privateKey
const myId = publicKey.export({ type: 'spki', format: 'der' }).toString('hex')

function sendSignedMessage(socket, payloadObj) {
    const contentString = JSON.stringify(payloadObj)
    const signature = crypto.sign(null, Buffer.from(contentString), privateKey)

    const envelope = {
        content: contentString,
        senderKey: myId,
        signature: signature.toString('hex'),
        timestamp: Date.now()
    }

    socket.write(JSON.stringify(envelope))
    console.log('Sent signed message to peer')
}
