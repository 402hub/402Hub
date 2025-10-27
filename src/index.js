/**
 * x402 Protocol SDK
 * 
 * HTTP 402 Payment Required protocol for blockchain micropayments
 * 
 * @example Client usage:
 * ```javascript
 * import { x402Pay } from 'x402-protocol';
 * import { ethers } from 'ethers';
 * 
 * const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
 * const signer = new ethers.Wallet(privateKey, provider);
 * 
 * const data = await x402Pay('http://api.example.com/data', {}, signer);
 * ```
 * 
 * @example Server usage:
 * ```javascript
 * import express from 'express';
 * import { createPaymentMiddleware } from 'x402-protocol';
 * import { ethers } from 'ethers';
 * 
 * const app = express();
 * const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
 * 
 * const paymentMw = createPaymentMiddleware({
 *   routes: {
 *     '/premium-data': 'usdc:base_sepolia:0xYourWallet?amount=0.001'
 *   },
 *   provider
 * });
 * 
 * app.get('/premium-data', paymentMw, (req, res) => {
 *   res.json({ data: 'premium content' });
 * });
 * ```
 */

// Client exports
export {
    X402Client,
    PaymentChallenge,
    PaymentProof,
    PaymentHandler,
    x402Pay
} from './client.js';

// Server exports
export {
    createPaymentMiddleware,
    paymentMiddleware,
    decodeProof,
    verifyProofSignature,
    verifyProofOnChain,
    markProofUsed,
    verifyPaymentTransaction
} from './middleware.js';

// Utility exports
export { createMockUSDC, mintTokens } from './utils.js';

// Version
export const VERSION = '1.0.0';

// Default export with all components
import * as client from './client.js';
import * as middleware from './middleware.js';
import * as utils from './utils.js';

export default {
    ...client,
    ...middleware,
    ...utils,
    VERSION
};
