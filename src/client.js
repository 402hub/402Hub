/**
 * x402 Protocol - Client SDK
 * 
 * Handles HTTP 402 Payment Required flow:
 * 1. Detect 402 response
 * 2. Parse payment challenge
 * 3. Execute on-chain payment
 * 4. Generate cryptographic proof
 * 5. Retry request with proof
 */

import { ethers } from 'ethers';

/**
 * Payment challenge format:
 * token:chain:recipient?amount=X&nonce=Y
 * 
 * Example: usdc:base_sepolia:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb?amount=0.001
 */
export class PaymentChallenge {
    constructor(challengeString) {
        this.raw = challengeString;
        this.parse(challengeString);
    }

    parse(challenge) {
        // Split into parts: token:chain:recipient?params
        const [tokenChain, rest] = challenge.split('?');
        const [token, chain, recipient] = tokenChain.split(':');
        
        this.token = token.toLowerCase();
        this.chain = chain.toLowerCase();
        // Ensure recipient is a valid checksummed address
        try {
            this.recipient = ethers.getAddress(recipient);
        } catch (e) {
            // If invalid, store as-is (will fail later validation)
            this.recipient = recipient;
        }

        // Parse query parameters
        const params = new URLSearchParams(rest);
        this.amount = params.get('amount') || '0.001';
        this.nonce = params.get('nonce') ? parseInt(params.get('nonce')) : null;
        this.currency = params.get('currency') || 'usdc';
    }

    /**
     * Get the token contract address for the chain
     */
    getTokenAddress() {
        const tokens = {
            'base_sepolia': {
                'usdc': '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
                'mock_usdc': '0x0000000000000000000000000000000000000000' // Placeholder
            },
            'base': {
                'usdc': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' // Base Mainnet USDC
            },
            'optimism_sepolia': {
                'usdc': '0x5fd84259d66Cd46123540766Be93DFE6D43130D7'
            }
        };

        const address = tokens[this.chain]?.[this.token] || null;
        
        // Return checksummed address
        return address ? ethers.getAddress(address) : null;
    }

    /**
     * Get the RPC URL for the chain
     */
    getRpcUrl() {
        const rpcs = {
            'base_sepolia': 'https://sepolia.base.org',
            'base': 'https://mainnet.base.org',
            'optimism_sepolia': 'https://sepolia.optimism.io'
        };

        return rpcs[this.chain] || null;
    }

    /**
     * Convert amount to wei (assumes 6 decimals for USDC)
     */
    getAmountWei() {
        return ethers.parseUnits(this.amount, 6); // USDC has 6 decimals
    }
}

/**
 * Payment Proof Generator
 */
export class PaymentProof {
    constructor(txHash, challenge, nonce, timestamp) {
        this.txHash = txHash;
        this.challenge = challenge;
        this.nonce = nonce;
        this.timestamp = timestamp;
    }

    /**
     * Generate the proof hash for signing
     */
    getProofHash() {
        return ethers.solidityPackedKeccak256(
            ['bytes32', 'address', 'address', 'uint256', 'uint256', 'uint256'],
            [
                this.txHash,
                this.challenge.getTokenAddress(),
                this.challenge.recipient,
                this.challenge.getAmountWei(),
                this.timestamp,
                this.nonce
            ]
        );
    }

    /**
     * Sign the proof with a wallet
     */
    async sign(signer) {
        const proofHash = this.getProofHash();
        const signature = await signer.signMessage(ethers.getBytes(proofHash));
        return signature;
    }

    /**
     * Encode the proof as a header value
     */
    async encode(signature) {
        const proof = {
            txHash: this.txHash,
            token: this.challenge.getTokenAddress(),
            recipient: this.challenge.recipient,
            amount: this.challenge.getAmountWei().toString(),
            timestamp: this.timestamp,
            nonce: this.nonce,
            signature: signature
        };

        // Encode as base64 JSON
        return Buffer.from(JSON.stringify(proof)).toString('base64');
    }
}

/**
 * ERC20 Payment Handler
 */
export class PaymentHandler {
    constructor(signer) {
        this.signer = signer;
    }

    /**
     * Execute an ERC20 payment
     */
    async executePayment(challenge) {
        const tokenAddress = challenge.getTokenAddress();
        const amountWei = challenge.getAmountWei();

        if (!tokenAddress) {
            throw new Error(`Token address not found for ${challenge.token} on ${challenge.chain}`);
        }

        // ERC20 ABI for transfer
        const erc20Abi = [
            'function transfer(address to, uint256 amount) returns (bool)',
            'function approve(address spender, uint256 amount) returns (bool)',
            'function balanceOf(address owner) view returns (uint256)',
            'function allowance(address owner, address spender) view returns (uint256)'
        ];

        const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, this.signer);

        // Check balance
        const balance = await tokenContract.balanceOf(this.signer.address);
        if (balance < amountWei) {
            throw new Error(`Insufficient balance. Need ${ethers.formatUnits(amountWei, 6)} USDC, have ${ethers.formatUnits(balance, 6)} USDC`);
        }

        console.log(`[x402] Paying ${challenge.amount} ${challenge.token.toUpperCase()} to ${challenge.recipient}`);

        // Execute transfer
        const tx = await tokenContract.transfer(challenge.recipient, amountWei);
        console.log(`[x402] Payment transaction sent: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`[x402] Payment confirmed in block ${receipt.blockNumber}`);

        return tx.hash;
    }
}

/**
 * Main x402 Client
 */
export class X402Client {
    constructor(signer, options = {}) {
        this.signer = signer;
        this.options = {
            maxRetries: 1,
            autoRetry: true,
            verifierAddress: options.verifierAddress || null,
            ...options
        };
        this.paymentHandler = new PaymentHandler(signer);
    }

    /**
     * Make an HTTP request with automatic 402 payment handling
     */
    async fetch(url, options = {}) {
        const fetchOptions = {
            method: 'GET',
            headers: {},
            ...options
        };

        // Initial request
        let response = await fetch(url, fetchOptions);

        // Handle 402 Payment Required
        if (response.status === 402 && this.options.autoRetry) {
            console.log('[x402] Payment required, processing...');

            // Get challenge from response
            const body = await response.json();
            const challengeString = body.challenge || body.payment_required;

            if (!challengeString) {
                throw new Error('402 response missing payment challenge');
            }

            // Execute payment flow
            const proof = await this.pay(challengeString);

            // Retry request with proof
            console.log('[x402] Retrying request with payment proof...');
            response = await fetch(url, {
                ...fetchOptions,
                headers: {
                    ...fetchOptions.headers,
                    'X-Payment-Proof': proof
                }
            });
        }

        return response;
    }

    /**
     * Execute the payment and generate proof
     */
    async pay(challengeString) {
        // Parse challenge
        const challenge = new PaymentChallenge(challengeString);
        
        // Get nonce from verifier (or use provided nonce)
        let nonce = challenge.nonce;
        if (nonce === null && this.options.verifierAddress) {
            nonce = await this.getNonce();
        } else if (nonce === null) {
            nonce = 0; // Default for testing
        }

        // Execute payment
        const txHash = await this.paymentHandler.executePayment(challenge);

        // Generate proof
        const timestamp = Math.floor(Date.now() / 1000);
        const proof = new PaymentProof(txHash, challenge, nonce, timestamp);
        const signature = await proof.sign(this.signer);
        const encodedProof = await proof.encode(signature);

        return encodedProof;
    }

    /**
     * Get the current nonce for the signer from the verifier contract
     */
    async getNonce() {
        if (!this.options.verifierAddress) {
            return 0;
        }

        const abi = ['function getNonce(address user) view returns (uint256)'];
        const verifier = new ethers.Contract(
            this.options.verifierAddress,
            abi,
            this.signer.provider
        );

        return await verifier.getNonce(this.signer.address);
    }
}

/**
 * Convenience function for making x402 payments
 */
export async function x402Pay(url, options, signer) {
    const client = new X402Client(signer, options);
    const response = await client.fetch(url, options);
    
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
}

// Default export
export default {
    X402Client,
    PaymentChallenge,
    PaymentProof,
    PaymentHandler,
    x402Pay
};
