// weather-agent/agent.js
import express from 'express';
import { createPaymentMiddleware } from '../src/index.js';
import { ethers } from 'ethers';

const app = express();
app.use(express.json());

// Configuration
const AGENT_PAYMENT_WALLET = '0x6C4d26d22143a9Ae3b33a09784a93B4888Bf6E9'; // Your wallet
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');

// Create payment middleware
const paymentMw = createPaymentMiddleware({
  routes: {
    '/getWeather': `usdc:base_sepolia:${AGENT_PAYMENT_WALLET}?amount=0.0005`
  },
  provider,
  verifyTransaction: false  // Testing mode
});

// Protected weather endpoint
app.get('/getWeather', paymentMw, async (req, res) => {
  const { city } = req.query;
 
  if (!city) {
    return res.status(400).json({ error: "City query required" });
  }
 
  console.log(`✅ Payment verified! Serving weather for ${city}`);
 
  res.json({
    city: city,
    temp: "15°C",
    condition: "Sunny",
    humidity: "65%",
    wind: "12 km/h"
  });
});

// Health check
app.get('/', (req, res) => {
  res.json({
    service: 'Weather Agent',
    status: 'online',
    endpoint: '/getWeather?city=CITYNAME'
  });
});

app.listen(3002, () => {
  console.log('🌤️  Weather Agent running on port 3002');
  console.log('💰 Payment wallet:', AGENT_PAYMENT_WALLET);
});