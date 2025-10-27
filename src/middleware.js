/**
 * x402 Protocol - Server Middleware
 * 
 * Express middleware for verifying HTTP 402 payment proofs
 */

import { ethers } from 'ethers';

/**
 * Decode a payment proof from the X-Payment-Proof header
 */
export function decodeProof(proofHeader) {
    try {
        const decoded = Buffer.from(proofHeader, 'base64').toString('utf-8');
        const proof = JSON.parse(decoded);
        
        // Validate required fields
        const required = ['txHash', 'token', 'recipient', 'amount', 'timestamp', 'nonce', 'signature'];
        for (const field of required) {
            if (!proof[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        return proof;
    } catch (error) {
        throw new Error(`Invalid proof format: ${error.message}`);
    }
}

/**
 * Verify the signature of a payment proof
 */
export function verifyProofSignature(proof) {
    // Reconstruct the proof hash
    const proofHash = ethers.solidityPackedKeccak256(
        ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
        [
            proof.txHash,
            proof.token,
            proof.recipient,
            proof.amount,
            proof.timestamp,
            proof.nonce
        ]
    );

    // Recover signer from signature
    const messageHash = ethers.hashMessage(ethers.getBytes(proofHash));
    const recoveredAddress = ethers.recoverAddress(messageHash, proof.signature);

    return recoveredAddress;
}

/**
 * Verify proof on-chain using PaymentVerifier contract
 */
export async function verifyProofOnChain(proof, verifierContract) {
    try {
        const isValid = await verifierContract.verifyPaymentProof(
            proof.txHash,
            proof.token,
            proof.recipient,
            proof.amount,
            proof.timestamp,
            proof.nonce,
            proof.signature
        );

        return isValid;
    } catch (error) {
        console.error('[x402] On-chain verification failed:', error.message);
        return false;
    }
}

/**
 * Mark proof as used on-chain
 */
export async function markProofUsed(proof, verifierContract, signer) {
    try {
        const tx = await verifierContract.connect(signer).markProofUsed(
            proof.txHash,
            proof.token,
            proof.recipient,
            proof.amount,
            proof.timestamp,
            proof.nonce,
            proof.signature
        );

        await tx.wait();
        return true;
    } catch (error) {
        console.error('[x402] Failed to mark proof as used:', error.message);
        return false;
    }
}

/**
 * Verify the payment transaction exists and has correct amount
 */
export async function verifyPaymentTransaction(proof, provider) {
    try {
        const tx = await provider.getTransaction(proof.txHash);
        
        if (!tx) {
            console.error('[x402] Transaction not found:', proof.txHash);
            return false;
        }

        // Check if transaction is confirmed
        if (!tx.blockNumber) {
            console.error('[x402] Transaction not yet confirmed');
            return false;
        }

        const receipt = await provider.getTransactionReceipt(proof.txHash);
        if (receipt.status !== 1) {
            console.error('[x402] Transaction failed');
            return false;
        }

        // Decode transaction data to verify it's a transfer to the correct recipient
        // ERC20 transfer function signature: 0xa9059cbb
        if (tx.data.startsWith('0xa9059cbb')) {
            const iface = new ethers.Interface([
                'function transfer(address to, uint256 amount)'
            ]);
            const decoded = iface.parseTransaction({ data: tx.data });
            
            // Verify recipient and amount
            if (decoded.args[0].toLowerCase() !== proof.recipient.toLowerCase()) {
                console.error('[x402] Recipient mismatch in transaction');
                return false;
            }

            if (decoded.args[1].toString() !== proof.amount.toString()) {
                console.error('[x402] Amount mismatch in transaction');
                return false;
            }
        }

        return true;
    } catch (error) {
        console.error('[x402] Error verifying transaction:', error.message);
        return false;
    }
}

/**
 * Payment Middleware Configuration
 */
export class PaymentMiddlewareConfig {
    constructor(options = {}) {
        this.routes = options.routes || {};
        this.provider = options.provider;
        this.verifierContract = options.verifierContract;
        this.verifierSigner = options.verifierSigner;
        this.verifyOnChain = options.verifyOnChain !== false; // Default true
        this.verifyTransaction = options.verifyTransaction !== false; // Default true
        this.markUsed = options.markUsed !== false; // Default true
        this.proofCache = new Map(); // Cache used proofs in memory
    }

    /**
     * Get the payment challenge for a route
     */
    getChallengeForRoute(path) {
        return this.routes[path] || null;
    }

    /**
     * Check if a proof has been used (memory cache)
     */
    isProofUsedInCache(proofHash) {
        return this.proofCache.has(proofHash);
    }

    /**
     * Mark proof as used in cache
     */
    markProofInCache(proofHash) {
        this.proofCache.set(proofHash, Date.now());
        
        // Clean up old entries (older than 10 minutes)
        const cutoff = Date.now() - 600000;
        for (const [hash, timestamp] of this.proofCache.entries()) {
            if (timestamp < cutoff) {
                this.proofCache.delete(hash);
            }
        }
    }
}

/**
 * Create payment middleware
 */
export function createPaymentMiddleware(options) {
    const config = new PaymentMiddlewareConfig(options);

    return async function paymentMiddleware(req, res, next) {
        const challenge = config.getChallengeForRoute(req.path);

        // If route doesn't require payment, continue
        if (!challenge) {
            return next();
        }

        // Check for payment proof header
        const proofHeader = req.headers['x-payment-proof'];

        if (!proofHeader) {
            // No proof provided - return 402
            return res.status(402).json({
                error: 'Payment required',
                challenge: challenge,
                message: 'This endpoint requires payment. Please include X-Payment-Proof header.'
            });
        }

        try {
            // Decode proof
            const proof = decodeProof(proofHeader);
            console.log('[x402] Received payment proof from:', proof.recipient);

            // Calculate proof hash for cache checking
            const proofHash = ethers.solidityPackedKeccak256(
                ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
                [
                    proof.txHash,
                    proof.token,
                    proof.recipient,
                    proof.amount,
                    proof.timestamp,
                    proof.nonce
                ]
            );

            // Check if proof was already used (in-memory cache)
            if (config.isProofUsedInCache(proofHash)) {
                return res.status(403).json({
                    error: 'Payment proof already used',
                    message: 'This payment proof has been used already. Please make a new payment.'
                });
            }

            // Verify timestamp (must be within 5 minutes)
            const now = Math.floor(Date.now() / 1000);
            if (proof.timestamp < now - 300 || proof.timestamp > now + 60) {
                return res.status(403).json({
                    error: 'Payment proof expired or invalid timestamp'
                });
            }

            // Verify signature
            const signer = verifyProofSignature(proof);
            console.log('[x402] Proof signed by:', signer);

            // Verify the payment transaction exists and is valid
            if (config.verifyTransaction && config.provider) {
                const txValid = await verifyPaymentTransaction(proof, config.provider);
                if (!txValid) {
                    return res.status(403).json({
                        error: 'Payment transaction invalid or not found'
                    });
                }
                console.log('[x402] Transaction verified:', proof.txHash);
            }

            // Verify on-chain (optional, more secure but costs gas)
            if (config.verifyOnChain && config.verifierContract) {
                const isValid = await verifyProofOnChain(proof, config.verifierContract);
                if (!isValid) {
                    return res.status(403).json({
                        error: 'Payment proof verification failed'
                    });
                }
                console.log('[x402] On-chain verification passed');

                // Mark proof as used on-chain
                if (config.markUsed && config.verifierSigner) {
                    await markProofUsed(proof, config.verifierContract, config.verifierSigner);
                    console.log('[x402] Proof marked as used on-chain');
                }
            }

            // Mark proof as used in cache
            config.markProofInCache(proofHash);

            // Attach proof to request for downstream handlers
            req.paymentProof = proof;
            req.paymentSigner = signer;

            console.log('[x402] ✓ Payment verified, granting access');
            next();

        } catch (error) {
            console.error('[x402] Proof verification error:', error.message);
            return res.status(403).json({
                error: 'Invalid payment proof',
                message: error.message
            });
        }
    };
}

/**
 * Legacy function name for backwards compatibility
 */
export function paymentMiddleware(routes, provider, options = {}) {
    return createPaymentMiddleware({
        routes,
        provider,
        ...options
    });
}

// Default export
export default {
    createPaymentMiddleware,
    paymentMiddleware,
    decodeProof,
    verifyProofSignature,
    verifyProofOnChain,
    markProofUsed,
    verifyPaymentTransaction
};
