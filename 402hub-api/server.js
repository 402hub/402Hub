/**
 * 402Hub API - Vertical-First Discovery Engine
 * Standalone deployment version
 */

const express = require('express');
const { ethers } = require('ethers');
require('dotenv').config();

// Import LOCAL middleware (not from npm)
const { createPaymentMiddleware } = require('./middleware');

const app = express();
app.use(express.json());

// Initialize Ethereum provider
// FIXED: Use fallback to AGENTFORGE_PRIVATE_KEY and BASE_SEPOLIA_RPC
const provider = new ethers.JsonRpcProvider(
    process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org'
);

const privateKey = process.env.HUB_API_PRIVATE_KEY || process.env.AGENTFORGE_PRIVATE_KEY;

if (!privateKey) {
    console.error('❌ ERROR: Missing private key environment variable');
    console.error('   Please set either HUB_API_PRIVATE_KEY or AGENTFORGE_PRIVATE_KEY');
    process.exit(1);
}

// Validate private key format
if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
    console.error('❌ ERROR: Invalid private key format');
    console.error('   Private key must start with 0x and be 66 characters long');
    console.error('   Received length:', privateKey.length);
    process.exit(1);
}

const wallet = new ethers.Wallet(privateKey, provider);

// Contract ABI and Address (ServiceRegistry on Base Sepolia)
const REGISTRY_ADDRESS = process.env.REGISTRY_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';
const REGISTRY_ABI = [
    "function getServicesByVertical(string memory _vertical) external view returns (bytes32[] memory)",
    "function getService(bytes32 _serviceId) external view returns (tuple(address provider, string endpoint, string serviceType, string description, uint256 pricePerCall, string chain, uint256 totalCalls, uint256 totalRevenue, uint256 reputationScore, bool isActive, uint256 registeredAt))",
    "function getAllServices(uint256 _offset, uint256 _limit) external view returns (bytes32[] memory)",
    "function getTotalServices() external view returns (uint256)"
];

const registryContract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);

// VERTICAL-FIRST: Predefined categories for discovery
const VERTICALS = {
    'customer-support': {
        name: 'Customer Support',
        description: 'AI agents that handle customer inquiries, tickets, and support workflows',
        keywords: ['support', 'help', 'customer service', 'tickets']
    },
    'sales': {
        name: 'Sales & GTM',
        description: 'Agents that qualify leads, book meetings, and support sales processes',
        keywords: ['sales', 'lead gen', 'prospecting', 'outreach']
    },
    'data': {
        name: 'Data & Analytics',
        description: 'Agents that fetch, process, and analyze data',
        keywords: ['data', 'analytics', 'insights', 'processing']
    },
    'automation': {
        name: 'Workflow Automation',
        description: 'Agents that automate repetitive tasks and workflows',
        keywords: ['automation', 'workflow', 'task', 'process']
    },
    'creative': {
        name: 'Creative & Content',
        description: 'Agents that generate content, designs, and creative assets',
        keywords: ['content', 'creative', 'design', 'generation']
    },
    'development': {
        name: 'Development & DevOps',
        description: 'Agents that help with coding, testing, and deployment',
        keywords: ['code', 'development', 'devops', 'testing']
    }
};

// =============================================================================
// PUBLIC ENDPOINTS (No payment required)
// =============================================================================

/**
 * GET / - Health check and API info
 */
app.get('/', (req, res) => {
    res.json({
        service: '402Hub API',
        version: '1.0.0',
        description: 'Vertical-first discovery engine for x402 protocol agents',
        wallet: wallet.address,
        network: 'Base Sepolia',
        registry: REGISTRY_ADDRESS,
        endpoints: {
            public: [
                '/',
                '/verticals',
                '/health'
            ],
            premium: [
                '/discover?vertical=VERTICAL',
                '/search?q=QUERY',
                '/service/:id'
            ]
        },
        docs: 'https://github.com/your-org/402hub'
    });
});

/**
 * GET /health - Health check
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: Date.now(),
        wallet: wallet.address,
        network: 'Base Sepolia'
    });
});

/**
 * GET /verticals - List all available verticals
 * Free endpoint - no payment required
 */
app.get('/verticals', (req, res) => {
    const verticalList = Object.entries(VERTICALS).map(([slug, info]) => ({
        slug,
        name: info.name,
        description: info.description,
        count: 0 // TODO: Get actual count from registry
    }));

    res.json({
        verticals: verticalList,
        total: verticalList.length
    });
});

// =============================================================================
// PROTECTED ENDPOINTS (Payment required via x402)
// =============================================================================

/**
 * Payment middleware configuration
 * All discovery/search endpoints require 0.001 USDC
 */
const paymentRoutes = {
    '/discover': `usdc:base_sepolia:${wallet.address}?amount=0.001`,
    '/search': `usdc:base_sepolia:${wallet.address}?amount=0.001`,
    '/service/:id': `usdc:base_sepolia:${wallet.address}?amount=0.0005`
};

const paymentMw = createPaymentMiddleware({
    routes: paymentRoutes,
    provider,
    verifyTransaction: false, // Set to true for production
    verifyOnChain: false // Set to true if using smart contract verification
});

/**
 * GET /discover?vertical=VERTICAL - Discover agents by vertical
 * Protected by payment middleware (0.001 USDC)
 */
app.get('/discover', paymentMw, async (req, res) => {
    try {
        const { vertical } = req.query;

        if (!vertical) {
            return res.status(400).json({
                error: 'Missing vertical parameter',
                available: Object.keys(VERTICALS)
            });
        }

        if (!VERTICALS[vertical]) {
            return res.status(404).json({
                error: 'Vertical not found',
                available: Object.keys(VERTICALS)
            });
        }

        console.log(`✅ Payment verified! Discovering ${vertical} agents`);
        console.log(`   Paid by: ${req.paymentSigner}`);

        // Query blockchain registry
        let services = [];
        try {
            const serviceIds = await registryContract.getServicesByVertical(vertical);
            
            for (const id of serviceIds) {
                const service = await registryContract.getService(id);
                services.push({
                    id: id,
                    provider: service.provider,
                    endpoint: service.endpoint,
                    type: service.serviceType,
                    description: service.description,
                    pricePerCall: ethers.formatUnits(service.pricePerCall, 6), // USDC has 6 decimals
                    chain: service.chain,
                    reputation: Number(service.reputationScore),
                    totalCalls: Number(service.totalCalls),
                    isActive: service.isActive
                });
            }
        } catch (error) {
            console.error('Registry query failed:', error.message);
            // Continue with empty services array
        }

        res.json({
            vertical: VERTICALS[vertical].name,
            description: VERTICALS[vertical].description,
            services,
            total: services.length,
            paidBy: req.paymentSigner
        });

    } catch (error) {
        console.error('Discovery error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /search?q=QUERY - Search agents by keywords
 * Protected by payment middleware (0.001 USDC)
 */
app.get('/search', paymentMw, async (req, res) => {
    try {
        const { q } = req.query;

        if (!q) {
            return res.status(400).json({ error: 'Missing search query' });
        }

        console.log(`✅ Payment verified! Searching for: ${q}`);
        console.log(`   Paid by: ${req.paymentSigner}`);

        const query = q.toLowerCase();
        const matches = [];

        // Search through verticals
        for (const [slug, info] of Object.entries(VERTICALS)) {
            const searchText = `${info.name} ${info.description} ${info.keywords.join(' ')}`.toLowerCase();
            
            if (searchText.includes(query)) {
                matches.push({
                    vertical: slug,
                    name: info.name,
                    description: info.description,
                    relevance: 'high' // TODO: Implement proper relevance scoring
                });
            }
        }

        res.json({
            query: q,
            results: matches,
            total: matches.length,
            paidBy: req.paymentSigner
        });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /service/:id - Get detailed info about a specific service
 * Protected by payment middleware (0.0005 USDC)
 */
app.get('/service/:id', paymentMw, async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`✅ Payment verified! Getting service: ${id}`);
        console.log(`   Paid by: ${req.paymentSigner}`);

        // Query service from registry
        try {
            const service = await registryContract.getService(id);

            res.json({
                id,
                provider: service.provider,
                endpoint: service.endpoint,
                type: service.serviceType,
                description: service.description,
                pricePerCall: ethers.formatUnits(service.pricePerCall, 6),
                chain: service.chain,
                reputation: Number(service.reputationScore),
                totalCalls: Number(service.totalCalls),
                totalRevenue: ethers.formatUnits(service.totalRevenue, 6),
                isActive: service.isActive,
                registeredAt: Number(service.registeredAt),
                paidBy: req.paymentSigner
            });

        } catch (error) {
            console.error('Service not found:', error.message);
            res.status(404).json({ error: 'Service not found' });
        }

    } catch (error) {
        console.error('Service fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// =============================================================================
// START SERVER
// =============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 402Hub API running on port', PORT);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 Payment price: 0.001 USDC per request');
    console.log('📍 Registry contract:', REGISTRY_ADDRESS);
    console.log('💳 Wallet address:', wallet.address);
    console.log('🌐 Network: Base Sepolia');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});
