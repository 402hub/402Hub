// agentforge-api/server.js
import express from 'express';
import { createPaymentMiddleware } from '../src/index.js';
import { ethers } from 'ethers';

const app = express();
app.use(express.json());

// Configuration
const AGENTFORGE_WALLET = '0x6C4d26d22143a9Ae3b33a09784a93B4888Bf6E9'; // Your wallet
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');

// Mock agent registry (simulating blockchain contract)
const mockAgents = {
  weather: [
    {
      owner: '0xAgent1...',
      agentType: 'weather',
      metadataUri: 'ipfs://mock',
      endpointWallet: '0x6C4d26d22143a9Ae3b33a09784a93B4888Bf6E9',
      endpoint: 'http://localhost:3002/getWeather',
      name: 'Weather Agent',
      description: 'Provides current weather data'
    }
  ]
};

// Create payment middleware
const paymentMw = createPaymentMiddleware({
  routes: {
    '/discover': `usdc:base_sepolia:${AGENTFORGE_WALLET}?amount=0.001`
  },
  provider,
  verifyTransaction: false  // Testing mode
});

// Protected discovery endpoint
app.get('/discover', paymentMw, async (req, res) => {
  const { type } = req.query;
 
  if (!type) {
    return res.status(400).json({ error: 'Agent type query required' });
  }
 
  console.log(`✅ Payment verified! Discovering ${type} agents`);
 
  const agents = mockAgents[type] || [];
  res.json(agents);
});

// Public registration endpoint (for demo)
app.post('/register', async (req, res) => {
  const { agentType, endpointWallet, metadata } = req.body;
 
  console.log('📝 Agent registration:', { agentType, endpointWallet });
 
  res.json({
    success: true,
    message: 'Agent registered',
    agentType
  });
});

// Health check
app.get('/', (req, res) => {
  res.json({
    service: 'AgentForge Discovery API',
    version: '1.0.0',
    endpoints: {
      free: ['/'],
      paid: ['/discover?type=TYPE']
    }
  });
});

app.listen(3003, () => {
  console.log('🔍 AgentForge API running on port 3003');
  console.log('💰 Payment wallet:', AGENTFORGE_WALLET);
});