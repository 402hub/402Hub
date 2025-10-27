# x402 Protocol SDK

> HTTP 402 Payment Required protocol for blockchain-based micropayments

A complete implementation of the x402 protocol enabling **HTTP-native micropayments** using blockchain technology. Perfect for building autonomous agent economies, API monetization, and pay-per-use services.

## 🎯 What is x402?

x402 extends the HTTP 402 "Payment Required" status code with blockchain micropayments:

1. **Client** requests a protected resource
2. **Server** responds with `402` and a payment challenge
3. **Client** pays on-chain (USDC, ETH, etc.)
4. **Client** generates cryptographic proof of payment
5. **Client** retries request with proof in `X-Payment-Proof` header
6. **Server** verifies proof and grants access

## ✨ Features

- ✅ **Complete Payment Flow** - Client SDK + Server middleware
- ✅ **On-Chain Verification** - Optional smart contract verification
- ✅ **Transaction Validation** - Verify payments actually happened
- ✅ **Replay Protection** - Prevent proof reuse
- ✅ **Multi-Chain Support** - Base, Optimism, Arbitrum, etc.
- ✅ **TypeScript Ready** - Full type definitions
- ✅ **Express Integration** - Drop-in middleware
- ✅ **Zero Configuration** - Works out of the box

## 📦 Installation

```bash
npm install x402-protocol ethers
```

## 🚀 Quick Start

### Server (API Provider)

```javascript
import express from 'express';
import { createPaymentMiddleware } from 'x402-protocol';
import { ethers } from 'ethers';

const app = express();
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');

// Define routes that require payment
const protectedRoutes = {
  '/premium-data': 'usdc:base_sepolia:0xYourWallet?amount=0.001'
};

// Add payment middleware
const paymentMw = createPaymentMiddleware({
  routes: protectedRoutes,
  provider
});

// Protected endpoint
app.get('/premium-data', paymentMw, (req, res) => {
  // Only executed if payment is verified
  res.json({ 
    data: 'Your premium content',
    paidBy: req.paymentSigner 
  });
});

app.listen(3000);
```

### Client (API Consumer)

```javascript
import { x402Pay } from 'x402-protocol';
import { ethers } from 'ethers';

// Setup wallet
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const signer = new ethers.Wallet(privateKey, provider);

// Make paid request - automatic payment handling!
const data = await x402Pay('http://api.example.com/premium-data', {}, signer);

console.log(data); // Your premium content
```

## 📚 Documentation

### Payment Challenge Format

```
token:chain:recipient?amount=X

Examples:
- usdc:base_sepolia:0x742d35Cc...?amount=0.001
- eth:optimism:0x742d35Cc...?amount=0.0001
```

### Server Middleware Options

```javascript
createPaymentMiddleware({
  routes: {
    '/endpoint': 'challenge_string'
  },
  provider: ethersProvider,          // Required: For transaction verification
  verifierContract: contractInstance, // Optional: For on-chain verification
  verifierSigner: signerWallet,      // Optional: To mark proofs as used
  verifyOnChain: true,               // Optional: Enable contract verification
  verifyTransaction: true,           // Optional: Verify TX exists (recommended)
  markUsed: true                     // Optional: Mark proofs on-chain
});
```

### Client Options

```javascript
import { X402Client } from 'x402-protocol';

const client = new X402Client(signer, {
  verifierAddress: '0x...',  // Optional: PaymentVerifier contract
  maxRetries: 1,             // Optional: Max payment attempts
  autoRetry: true            // Optional: Auto-handle 402 responses
});

// Use client for multiple requests
const response = await client.fetch('http://api.example.com/data');
const data = await response.json();
```

### Payment Proof Structure

```javascript
{
  txHash: '0x...',           // Transaction hash of payment
  token: '0x...',            // Token contract address
  recipient: '0x...',        // Payment recipient
  amount: '1000000',         // Amount in wei (6 decimals for USDC)
  timestamp: 1234567890,     // Unix timestamp
  nonce: 0,                  // User's nonce
  signature: '0x...'         // Cryptographic signature
}
```

## 🔧 Advanced Usage

### Manual Payment Flow

```javascript
import { PaymentChallenge, PaymentHandler, PaymentProof } from 'x402-protocol';

// 1. Parse challenge
const challenge = new PaymentChallenge('usdc:base_sepolia:0x742d35Cc...?amount=0.001');

// 2. Execute payment
const handler = new PaymentHandler(signer);
const txHash = await handler.executePayment(challenge);

// 3. Generate proof
const timestamp = Math.floor(Date.now() / 1000);
const proof = new PaymentProof(txHash, challenge, 0, timestamp);
const signature = await proof.sign(signer);
const encoded = await proof.encode(signature);

// 4. Make request with proof
const response = await fetch('http://api.example.com/data', {
  headers: {
    'X-Payment-Proof': encoded
  }
});
```

### Custom Verification

```javascript
import { decodeProof, verifyProofSignature, verifyPaymentTransaction } from 'x402-protocol';

// Decode proof from header
const proof = decodeProof(req.headers['x-payment-proof']);

// Verify signature
const signer = verifyProofSignature(proof);

// Verify transaction exists
const isValid = await verifyPaymentTransaction(proof, provider);
```

### Deploy PaymentVerifier Contract

```solidity
// Deploy the PaymentVerifier.sol contract
import { PaymentVerifier } from 'x402-protocol/contracts/PaymentVerifier.sol';

// Then use in middleware:
const verifier = new ethers.Contract(
  verifierAddress,
  verifierABI,
  provider
);

const paymentMw = createPaymentMiddleware({
  routes: protectedRoutes,
  provider,
  verifierContract: verifier,
  verifyOnChain: true
});
```

## 🧪 Testing

```bash
# Run the complete demo
npm run demo

# Run unit tests
npm test

# Test server only
npm run demo:server

# Test client only
npm run demo:client
```

## 🌐 Supported Networks

| Network | Chain ID | USDC Address |
|---------|----------|--------------|
| Base Sepolia | 84532 | 0x036CbD53842c5426634e7929541eC2318f3dCF7e |
| Base | 8453 | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 |
| Optimism Sepolia | 11155420 | 0x5fd84259d66Cd46123540766Be93DFE6D43130D7 |

## 🎨 Use Cases

### 1. AI Agent Marketplace (AgentForge)
```javascript
// Discovery endpoint charges for search
app.get('/discover', paymentMw, async (req, res) => {
  const agents = await findAgents(req.query.type);
  res.json(agents);
});
```

### 2. Premium API Access
```javascript
// Different pricing tiers
const routes = {
  '/api/basic': 'usdc:base:0x...?amount=0.001',
  '/api/premium': 'usdc:base:0x...?amount=0.01',
  '/api/enterprise': 'usdc:base:0x...?amount=0.1'
};
```

### 3. Pay-Per-Query AI Models
```javascript
app.post('/ai/generate', paymentMw, async (req, res) => {
  const result = await runModel(req.body.prompt);
  res.json({ result });
});
```

### 4. Agent-to-Agent Payments
```javascript
// Agent discovers and pays other agents
const weatherAgent = await x402Pay(
  'http://agentforge.com/discover?type=weather',
  {},
  agentWallet
);

const weatherData = await x402Pay(
  weatherAgent[0].endpoint,
  {},
  agentWallet
);
```

## 🔒 Security Features

- **Replay Protection**: Each proof can only be used once
- **Nonce System**: Prevents proof reuse across sessions
- **Timestamp Validation**: Proofs expire after 5 minutes
- **Transaction Verification**: Confirms payment actually happened
- **Signature Verification**: Cryptographically proves payer identity
- **Amount Validation**: Ensures correct amount was paid

## ⚡ Performance

- **Gas Optimized**: Optional on-chain verification
- **In-Memory Cache**: Fast proof lookup
- **No Database Required**: Stateless verification
- **Sub-Second Verification**: Transaction validation in <1s
- **Scalable**: Handle thousands of requests/second

## 🛠️ Development

```bash
# Clone the repo
git clone https://github.com/yourorg/x402-protocol
cd x402-protocol

# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 🔗 Links

- [Documentation](https://docs.x402.dev)
- [GitHub](https://github.com/yourorg/x402-protocol)
- [Discord](https://discord.gg/x402)
- [AgentForge](https://agentforge.ai)

## 💡 Support

- 📧 Email: support@x402.dev
- 💬 Discord: [Join our community](https://discord.gg/x402)
- 🐛 Issues: [GitHub Issues](https://github.com/yourorg/x402-protocol/issues)

---

**Built for the autonomous agent economy** 🤖💰
