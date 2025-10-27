/**
 * 402Hub API - Vertical-First Discovery Engine
 * 
 * This is the monetized service that provides intelligent agent discovery
 * Protected by x402 protocol for micropayments
 */

const express = require('express');
const { ethers } = require('ethers');
require('dotenv').config();

// Import the 402Hub SDK middleware
const { createPaymentMiddleware } = require('@402hub/sdk');

const app = express();
app.use(express.json());

// Initialize Ethereum provider
const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.HUB_API_PRIVATE_KEY, provider);

// Contract ABI and Address (ServiceRegistry on Base Sepolia)
const REGISTRY_ADDRESS = process.env.REGISTRY_CONTRACT_ADDRESS;
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
        keywords: ['data', 'analytics', 'research', 'insights']
    },
    'operations': {
        name: 'Operations & Automation',
        description: 'Agents that automate operational workflows and tasks',
        keywords: ['automation', 'workflow', 'operations', 'tasks']
    },
    'content': {
        name: 'Content Creation',
        description: 'Agents that generate, edit, or optimize content',
        keywords: ['content', 'writing', 'copywriting', 'creative']
    }
};

// Apply x402 payment middleware to all protected routes
const paymentMiddleware = createPaymentMiddleware({
    wallet: wallet,
    price: ethers.parseEther("0.001"), // 0.001 ETH per API call
    verifyOnChain: false // Set to true in production with PaymentVerifier contract
});

// =============================================================================
// PUBLIC ROUTES (Free)
// =============================================================================

/**
 * GET / - API Status
 */
app.get('/', (req, res) => {
    res.json({
        name: '402Hub API',
        version: '1.0.0',
        description: 'Vertical-First Discovery Engine for x402 Protocol',
        endpoints: {
            '/verticals': 'List all available verticals',
            '/discover?vertical=<type>': 'Discover agents by vertical (PROTECTED)',
            '/search?q=<query>': 'Semantic search across all agents (PROTECTED)',
            '/agent/:serviceId': 'Get specific agent details (PROTECTED)'
        }
    });
});

/**
 * GET /verticals - List all available verticals (Free)
 */
app.get('/verticals', (req, res) => {
    res.json({
        verticals: Object.entries(VERTICALS).map(([key, value]) => ({
            id: key,
            name: value.name,
            description: value.description,
            keywords: value.keywords
        }))
    });
});

// =============================================================================
// PROTECTED ROUTES (x402 Payment Required)
// =============================================================================

/**
 * GET /discover?vertical=<type> - Vertical-First Discovery (PROTECTED)
 * 
 * Example: GET /discover?vertical=customer-support
 * 
 * Returns: Top agents in that vertical, ranked by reputation
 */
app.get('/discover', paymentMiddleware, async (req, res) => {
    try {
        const { vertical } = req.query;
        
        if (!vertical) {
            return res.status(400).json({ 
                error: 'Missing vertical parameter',
                availableVerticals: Object.keys(VERTICALS)
            });
        }
        
        if (!VERTICALS[vertical]) {
            return res.status(400).json({ 
                error: 'Invalid vertical',
                availableVerticals: Object.keys(VERTICALS)
            });
        }
        
        // Query on-chain registry for this vertical
        const serviceIds = await registryContract.getServicesByVertical(vertical);
        
        if (serviceIds.length === 0) {
            return res.json({
                vertical: vertical,
                verticalInfo: VERTICALS[vertical],
                agents: [],
                message: 'No agents registered in this vertical yet'
            });
        }
        
        // Fetch full service details
        const services = await Promise.all(
            serviceIds.map(async (serviceId) => {
                const service = await registryContract.getService(serviceId);
                return {
                    serviceId: serviceId,
                    provider: service.provider,
                    endpoint: service.endpoint,
                    serviceType: service.serviceType,
                    description: service.description,
                    pricePerCall: ethers.formatEther(service.pricePerCall),
                    chain: service.chain,
                    metrics: {
                        totalCalls: service.totalCalls.toString(),
                        totalRevenue: ethers.formatEther(service.totalRevenue),
                        reputationScore: service.reputationScore.toString()
                    },
                    isActive: service.isActive,
                    registeredAt: new Date(Number(service.registeredAt) * 1000).toISOString()
                };
            })
        );
        
        // Filter active services and sort by reputation
        const activeServices = services
            .filter(s => s.isActive)
            .sort((a, b) => {
                const repA = parseInt(a.metrics.reputationScore);
                const repB = parseInt(b.metrics.reputationScore);
                return repB - repA; // Highest reputation first
            });
        
        res.json({
            vertical: vertical,
            verticalInfo: VERTICALS[vertical],
            totalAgents: activeServices.length,
            agents: activeServices
        });
        
    } catch (error) {
        console.error('Discovery error:', error);
        res.status(500).json({ 
            error: 'Discovery failed', 
            message: error.message 
        });
    }
});

/**
 * GET /search?q=<query> - Semantic Search (PROTECTED)
 * 
 * Example: GET /search?q=customer+support
 * 
 * Returns: Agents matching the search query across all verticals
 */
app.get('/search', paymentMiddleware, async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q) {
            return res.status(400).json({ error: 'Missing search query' });
        }
        
        const query = q.toLowerCase();
        
        // Find matching verticals based on keywords
        const matchingVerticals = Object.entries(VERTICALS)
            .filter(([key, value]) => {
                return value.keywords.some(keyword => 
                    query.includes(keyword) || keyword.includes(query)
                ) || query.includes(key) || value.name.toLowerCase().includes(query);
            })
            .map(([key]) => key);
        
        if (matchingVerticals.length === 0) {
            // No matching verticals, search across all agents
            const totalServices = await registryContract.getTotalServices();
            const serviceIds = await registryContract.getAllServices(0, totalServices);
            
            const services = await Promise.all(
                serviceIds.slice(0, 20).map(async (serviceId) => {
                    const service = await registryContract.getService(serviceId);
                    return {
                        serviceId: serviceId,
                        description: service.description,
                        serviceType: service.serviceType,
                        endpoint: service.endpoint,
                        isActive: service.isActive
                    };
                })
            );
            
            // Filter by description match
            const matches = services.filter(s => 
                s.isActive && 
                s.description.toLowerCase().includes(query)
            );
            
            return res.json({
                query: q,
                results: matches,
                message: matches.length === 0 ? 'No agents found matching your query' : null
            });
        }
        
        // Fetch agents from matching verticals
        const allAgents = [];
        
        for (const vertical of matchingVerticals) {
            const serviceIds = await registryContract.getServicesByVertical(vertical);
            
            for (const serviceId of serviceIds) {
                const service = await registryContract.getService(serviceId);
                
                if (service.isActive) {
                    allAgents.push({
                        serviceId: serviceId,
                        provider: service.provider,
                        endpoint: service.endpoint,
                        serviceType: service.serviceType,
                        description: service.description,
                        pricePerCall: ethers.formatEther(service.pricePerCall),
                        chain: service.chain,
                        metrics: {
                            reputationScore: service.reputationScore.toString(),
                            totalCalls: service.totalCalls.toString()
                        }
                    });
                }
            }
        }
        
        // Sort by reputation
        allAgents.sort((a, b) => {
            const repA = parseInt(a.metrics.reputationScore);
            const repB = parseInt(b.metrics.reputationScore);
            return repB - repA;
        });
        
        res.json({
            query: q,
            matchedVerticals: matchingVerticals.map(v => ({
                id: v,
                name: VERTICALS[v].name
            })),
            totalResults: allAgents.length,
            results: allAgents
        });
        
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ 
            error: 'Search failed', 
            message: error.message 
        });
    }
});

/**
 * GET /agent/:serviceId - Get Agent Details (PROTECTED)
 * 
 * Returns: Full details and metrics for a specific agent
 */
app.get('/agent/:serviceId', paymentMiddleware, async (req, res) => {
    try {
        const { serviceId } = req.params;
        
        const service = await registryContract.getService(serviceId);
        
        if (service.provider === ethers.ZeroAddress) {
            return res.status(404).json({ error: 'Agent not found' });
        }
        
        res.json({
            serviceId: serviceId,
            provider: service.provider,
            endpoint: service.endpoint,
            serviceType: service.serviceType,
            description: service.description,
            pricing: {
                pricePerCall: ethers.formatEther(service.pricePerCall),
                currency: 'ETH'
            },
            chain: service.chain,
            metrics: {
                totalCalls: service.totalCalls.toString(),
                totalRevenue: ethers.formatEther(service.totalRevenue),
                reputationScore: service.reputationScore.toString()
            },
            status: {
                isActive: service.isActive,
                registeredAt: new Date(Number(service.registeredAt) * 1000).toISOString()
            }
        });
        
    } catch (error) {
        console.error('Agent details error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch agent details', 
            message: error.message 
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 402Hub API running on port ${PORT}`);
    console.log(`💰 Payment price: 0.001 ETH per request`);
    console.log(`📍 Registry contract: ${REGISTRY_ADDRESS}`);
    console.log(`\nProtected endpoints require HTTP 402 payment headers`);
});
