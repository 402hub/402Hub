/**
 * x402 Protocol Payment Middleware
 * Standalone version for 402Hub API deployment
 */

const { ethers } = require('ethers');

/**
 * Parse x402 payment challenge string
 * Format: token:chain:recipient?amount=X&nonce=Y
 */
function parseChallenge(challengeString) {
    const [tokenChain, rest] = challengeString.split('?');
    const [token, chain, recipient] = tokenChain.split(':');
    
    const params = new URLSearchParams(rest || '');
    
    return {
        token: token.toLowerCase(),
        chain: chain.toLowerCase(),
        recipient: ethers.getAddress(recipient),
        amount: params.get('amount') || '0.001',
        nonce: params.get('nonce') ? parseInt(params.get('nonce')) : Date.now()
    };
}

/**
 * Get token contract address for a given chain
 */
function getTokenAddress(chain, token) {
    const tokens = {
        'base_sepolia': {
            'usdc': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        },
        'base': {
            'usdc': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
        }
    };
    
    return tokens[chain]?.[token] || null;
}

/**
 * Decode payment proof from base64
 */
function decodeProof(proofBase64) {
    try {
        const jsonStr = Buffer.from(proofBase64, 'base64').toString('utf8');
        return JSON.parse(jsonStr);
    } catch (error) {
        throw new Error('Invalid proof format');
    }
}

/**
 * Verify proof signature
 */
function verifyProofSignature(proof) {
    try {
        const message = `x402:${proof.txHash}:${proof.recipient}:${proof.amount}:${proof.nonce}`;
        const recoveredAddress = ethers.verifyMessage(message, proof.signature);
        return recoveredAddress;
    } catch (error) {
        throw new Error('Invalid signature');
    }
}

/**
 * Verify payment transaction on-chain
 */
async function verifyPaymentTransaction(provider, txHash, expectedRecipient, expectedAmount, tokenAddress) {
    try {
        const tx = await provider.getTransaction(txHash);
        
        if (!tx) {
            throw new Error('Transaction not found');
        }

        // For native ETH payments
        if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
            if (tx.to.toLowerCase() !== expectedRecipient.toLowerCase()) {
                throw new Error('Transaction recipient mismatch');
            }
            
            if (tx.value < ethers.parseEther(expectedAmount)) {
                throw new Error('Transaction amount insufficient');
            }
            
            return true;
        }

        // For ERC20 token payments (USDC)
        if (tx.to.toLowerCase() !== tokenAddress.toLowerCase()) {
            throw new Error('Transaction not to token contract');
        }

        // Decode transfer function call
        const iface = new ethers.Interface([
            'function transfer(address to, uint256 amount)',
            'function approve(address spender, uint256 amount)'
        ]);

        try {
            const decoded = iface.parseTransaction({ data: tx.data });
            
            if (decoded.name === 'transfer') {
                const [to, amount] = decoded.args;
                
                if (to.toLowerCase() !== expectedRecipient.toLowerCase()) {
                    throw new Error('Transfer recipient mismatch');
                }
                
                // USDC has 6 decimals
                const expectedAmountWei = ethers.parseUnits(expectedAmount, 6);
                if (amount < expectedAmountWei) {
                    throw new Error('Transfer amount insufficient');
                }
                
                return true;
            }
        } catch (e) {
            throw new Error('Invalid token transfer transaction');
        }

        throw new Error('Transaction is not a valid transfer');
        
    } catch (error) {
        throw error;
    }
}

/**
 * Create Express middleware for x402 payment protection
 * 
 * @param {Object} options - Middleware configuration
 * @param {Object} options.routes - Map of routes to payment challenges
 * @param {ethers.Provider} options.provider - Ethereum provider
 * @param {boolean} options.verifyTransaction - Whether to verify transactions on-chain
 * @param {boolean} options.verifyOnChain - Whether to use smart contract verification
 * @param {boolean} options.markUsed - Whether to mark proofs as used (requires on-chain call)
 */
function createPaymentMiddleware(options) {
    const {
        routes = {},
        provider,
        verifyTransaction = false,
        verifyOnChain = false,
        markUsed = false
    } = options;

    return async function paymentMiddleware(req, res, next) {
        // Check if this route requires payment
        let challengeString = null;
        
        // Exact match
        if (routes[req.path]) {
            challengeString = routes[req.path];
        } else {
            // Pattern match (e.g., /service/:id)
            for (const [pattern, challenge] of Object.entries(routes)) {
                if (matchRoute(pattern, req.path)) {
                    challengeString = challenge;
                    break;
                }
            }
        }

        // If no payment required for this route, continue
        if (!challengeString) {
            return next();
        }

        // Parse the challenge
        const challenge = parseChallenge(challengeString);

        // Check for payment proof header
        const proofHeader = req.headers['x-payment-proof'];

        if (!proofHeader) {
            // No proof provided - return 402 Payment Required
            return res.status(402).json({
                error: 'Payment Required',
                challenge: challengeString,
                message: 'Please pay and provide proof in X-Payment-Proof header',
                details: {
                    amount: challenge.amount,
                    token: challenge.token.toUpperCase(),
                    chain: challenge.chain,
                    recipient: challenge.recipient
                }
            });
        }

        // Decode and verify proof
        try {
            const proof = decodeProof(proofHeader);

            // Basic validation
            if (!proof.txHash || !proof.signature || !proof.recipient || !proof.amount) {
                return res.status(403).json({
                    error: 'Invalid proof format',
                    message: 'Proof must contain txHash, signature, recipient, and amount'
                });
            }

            // Verify signature
            const signer = verifyProofSignature(proof);
            req.paymentSigner = signer;

            // Verify recipient matches
            if (proof.recipient.toLowerCase() !== challenge.recipient.toLowerCase()) {
                return res.status(403).json({
                    error: 'Payment recipient mismatch',
                    expected: challenge.recipient,
                    received: proof.recipient
                });
            }

            // Verify amount is sufficient
            if (parseFloat(proof.amount) < parseFloat(challenge.amount)) {
                return res.status(403).json({
                    error: 'Insufficient payment amount',
                    required: challenge.amount,
                    received: proof.amount
                });
            }

            // Optional: Verify transaction on-chain
            if (verifyTransaction) {
                const tokenAddress = getTokenAddress(challenge.chain, challenge.token);
                
                await verifyPaymentTransaction(
                    provider,
                    proof.txHash,
                    challenge.recipient,
                    challenge.amount,
                    tokenAddress
                );
            }

            // Optional: Mark proof as used on-chain (requires smart contract)
            if (verifyOnChain && markUsed) {
                // This would require deploying a verifier contract
                // For now, we skip this in standalone mode
                console.log('⚠️  On-chain verification not implemented in standalone mode');
            }

            // Payment verified - allow access
            console.log(`✅ Payment verified: ${proof.amount} ${challenge.token.toUpperCase()} from ${signer}`);
            next();

        } catch (error) {
            console.error('Payment verification failed:', error.message);
            return res.status(403).json({
                error: 'Payment verification failed',
                message: error.message
            });
        }
    };
}

/**
 * Simple route pattern matcher
 */
function matchRoute(pattern, path) {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);

    if (patternParts.length !== pathParts.length) {
        return false;
    }

    return patternParts.every((part, i) => {
        return part.startsWith(':') || part === pathParts[i];
    });
}

module.exports = {
    createPaymentMiddleware,
    decodeProof,
    verifyProofSignature,
    verifyPaymentTransaction,
    parseChallenge,
    getTokenAddress
};
