/**
 * Complete x402 Protocol Example
 * 
 * This demonstrates the full payment flow:
 * 1. Server sets up protected endpoints
 * 2. Client attempts to access endpoint
 * 3. Server returns 402 with payment challenge
 * 4. Client makes on-chain payment
 * 5. Client generates proof and retries
 * 6. Server verifies proof and grants access
 */

import express from 'express';
import { ethers } from 'ethers';
import { createPaymentMiddleware } from '../src/middleware.js';
import { x402Pay, X402Client } from '../src/client.js';
import { getTokenContract, formatUSDC, displayPaymentSummary } from '../src/utils.js';

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    // Server config
    SERVER_PORT: 3000,
    SERVER_WALLET: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    
    // Network config
    NETWORK: 'base_sepolia',
    RPC_URL: 'https://sepolia.base.org',
    
    // Token config
    USDC_ADDRESS: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
    
    // Payment config
    PAYMENT_AMOUNT: '0.001', // 0.001 USDC
    
    // Test client wallet (REPLACE WITH YOUR OWN)
    CLIENT_PRIVATE_KEY: process.env.CLIENT_PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000001'
};

// ============================================
// SERVER SETUP
// ============================================

async function startServer() {
    const app = express();
    app.use(express.json());

    // Setup provider
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);

    // Define protected routes with payment challenges
    const protectedRoutes = {
        '/premium-data': `usdc:${CONFIG.NETWORK}:${CONFIG.SERVER_WALLET}?amount=${CONFIG.PAYMENT_AMOUNT}`,
        '/api/weather': `usdc:${CONFIG.NETWORK}:${CONFIG.SERVER_WALLET}?amount=${CONFIG.PAYMENT_AMOUNT}`,
        '/api/analysis': `usdc:${CONFIG.NETWORK}:${CONFIG.SERVER_WALLET}?amount=0.005` // Higher price
    };

    // Create payment middleware
    const paymentMw = createPaymentMiddleware({
        routes: protectedRoutes,
        provider,
        verifyOnChain: false, // Disable on-chain verification for demo (no gas costs)
        verifyTransaction: true, // Verify transaction exists
        markUsed: false // Don't mark on-chain (demo mode)
    });

    // ============================================
    // PUBLIC ENDPOINTS
    // ============================================

    app.get('/', (req, res) => {
        res.json({
            service: 'x402 Demo API',
            version: '1.0.0',
            endpoints: {
                public: ['/'],
                premium: ['/premium-data', '/api/weather', '/api/analysis']
            },
            payment: {
                network: CONFIG.NETWORK,
                token: 'USDC',
                address: CONFIG.USDC_ADDRESS
            }
        });
    });

    app.get('/health', (req, res) => {
        res.json({ status: 'healthy', timestamp: Date.now() });
    });

    // ============================================
    // PROTECTED ENDPOINTS (REQUIRE PAYMENT)
    // ============================================

    app.get('/premium-data', paymentMw, (req, res) => {
        console.log('\n✅ Payment verified! Serving premium data...');
        displayPaymentSummary(req.paymentProof, 'verified');

        res.json({
            message: 'Premium data access granted',
            data: {
                insights: ['AI market growing 40% YoY', 'Enterprise adoption at 65%'],
                predictions: { 2025: 'Autonomous agents mainstream' },
                analysis: 'Deep analysis of current trends...'
            },
            paidBy: req.paymentSigner,
            timestamp: Date.now()
        });
    });

    app.get('/api/weather', paymentMw, (req, res) => {
        const city = req.query.city || 'London';
        console.log(`\n✅ Payment verified! Serving weather for ${city}...`);

        res.json({
            city: city,
            temperature: '15°C',
            condition: 'Sunny',
            humidity: '65%',
            wind: '12 km/h',
            forecast: ['Mon: Sunny', 'Tue: Cloudy', 'Wed: Rain'],
            paidBy: req.paymentSigner
        });
    });

    app.get('/api/analysis', paymentMw, (req, res) => {
        console.log('\n✅ Payment verified! Serving detailed analysis...');

        res.json({
            report: 'Comprehensive Market Analysis 2025',
            sections: {
                executive_summary: 'Key findings and recommendations...',
                market_size: '$2.5T by 2026',
                competitors: ['Company A', 'Company B', 'Company C'],
                opportunities: ['AI agents', 'Blockchain payments', 'Web3']
            },
            paidBy: req.paymentSigner
        });
    });

    // Start server
    const server = app.listen(CONFIG.SERVER_PORT, () => {
        console.log('\n🚀 x402 Demo Server Started');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📍 URL: http://localhost:${CONFIG.SERVER_PORT}`);
        console.log(`💰 Payment Address: ${CONFIG.SERVER_WALLET}`);
        console.log(`🌐 Network: ${CONFIG.NETWORK}`);
        console.log(`💵 Token: USDC (${CONFIG.USDC_ADDRESS})`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    });

    return server;
}

// ============================================
// CLIENT SETUP
// ============================================

async function runClient() {
    console.log('\n🔵 Starting x402 Client Demo');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Setup wallet
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const signer = new ethers.Wallet(CONFIG.CLIENT_PRIVATE_KEY, provider);

    console.log(`📍 Client wallet: ${signer.address}`);

    // Check balance
    try {
        const usdcContract = getTokenContract(CONFIG.USDC_ADDRESS, provider);
        const balance = await usdcContract.balanceOf(signer.address);
        console.log(`💰 USDC Balance: ${formatUSDC(balance)} USDC`);

        if (balance < ethers.parseUnits('0.001', 6)) {
            console.log('\n⚠️  Warning: Insufficient USDC balance for demo');
            console.log('Please fund your wallet with testnet USDC');
            console.log(`Wallet: ${signer.address}`);
            console.log('\nYou can get testnet USDC from:');
            console.log('- Base Sepolia Faucet: https://faucet.quicknode.com/base/sepolia');
            return;
        }
    } catch (error) {
        console.log(`⚠️  Could not check balance: ${error.message}`);
    }

    // ============================================
    // DEMO 1: Simple x402Pay function
    // ============================================

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 DEMO 1: Simple x402Pay');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
        const url = `http://localhost:${CONFIG.SERVER_PORT}/premium-data`;
        console.log(`Requesting: ${url}`);

        const data = await x402Pay(url, {}, signer);
        
        console.log('\n✅ SUCCESS! Received data:');
        console.log(JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('❌ Error:', error.message);
    }

    // ============================================
    // DEMO 2: Using X402Client for multiple requests
    // ============================================

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 DEMO 2: Multiple Requests');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
        const client = new X402Client(signer);

        // Request 1: Weather
        console.log('Requesting weather data...');
        const weatherResponse = await client.fetch(
            `http://localhost:${CONFIG.SERVER_PORT}/api/weather?city=Tokyo`
        );
        const weatherData = await weatherResponse.json();
        console.log('✅ Weather:', weatherData);

        // Request 2: Analysis (higher price)
        console.log('\nRequesting analysis data...');
        const analysisResponse = await client.fetch(
            `http://localhost:${CONFIG.SERVER_PORT}/api/analysis`
        );
        const analysisData = await analysisResponse.json();
        console.log('✅ Analysis:', analysisData.report);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Demo Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║     x402 Protocol - Complete Demo         ║');
    console.log('║   HTTP 402 + Blockchain Micropayments      ║');
    console.log('╚════════════════════════════════════════════╝\n');

    const runMode = process.argv[2] || 'both';

    if (runMode === 'server' || runMode === 'both') {
        await startServer();
    }

    if (runMode === 'client' || runMode === 'both') {
        // Wait for server to start
        if (runMode === 'both') {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        await runClient();
    }

    // Keep server running if in server or both mode
    if (runMode === 'server' || runMode === 'both') {
        console.log('Server running. Press Ctrl+C to stop.\n');
    } else {
        process.exit(0);
    }
}

// Handle errors
process.on('uncaughtException', (error) => {
    console.error('\n❌ Uncaught Exception:', error.message);
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    console.error('\n❌ Unhandled Rejection:', error.message);
    process.exit(1);
});

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

export { startServer, runClient };
