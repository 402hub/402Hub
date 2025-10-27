import express from 'express';
import { ethers } from 'ethers';
// We are importing directly from the 'src' folder
import { createPaymentMiddleware } from './src/index.js';

const app = express();
app.use(express.json());

// --- CONFIGURATION ---
// 1. Get a wallet address from your `node -e` command
const MY_WALLET = '0x6C4d26d22143a9Ae3b33a09784a93B48B8b4F6E9';

// 2. Setup provider (Using Base Sepolia testnet)
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
// --- END CONFIGURATION ---


// 3. Create the payment middleware
const paymentMw = createPaymentMiddleware({
  routes: {
    // Any request to /api/premium will require this payment
    '/api/premium': `usdc:base_sepolia:${MY_WALLET}?amount=0.001`
  },
  provider,
  // These are CRITICAL for testing without a real funded client
  verifyTransaction: false, // Disables signature verification
  verifyOnChain: false      // Disables checking if the tx hash is real
});

// Public endpoint (no payment needed)
app.get('/', (req, res) => {
  res.json({
    message: 'My First x402 API',
    endpoints: {
      free: ['/'],
      paid: ['/api/premium']
    }
  });
});

// Protected endpoint (uses the middleware)
app.get('/api/premium', paymentMw, (req, res) => {
  // This code only runs if the middleware passes!
  // (In mock mode, it will pass if a valid-looking *header* is present,
  // without checking the signature or on-chain)
  res.json({
    message: 'SUCCESS! Payment verified (in mock mode)!',
    data: 'This is the premium, paid-for content.'
  });
});

app.listen(3001, () => {
  console.log('✅ Your first x402 API is running!');
  console.log('   Test free: http://localhost:3001');
  console.log('   Test paid: http://localhost:3001/api/premium');
  console.log('   Receiving payments at:', MY_WALLET);
});