/**
 * x402 Protocol - Utilities
 * 
 * Helper functions for testing and deployment
 */

import { ethers } from 'ethers';

/**
 * Mock USDC ERC20 Token for testing
 */
export const MOCK_USDC_ABI = [
    'constructor()',
    'function mint(address to, uint256 amount) public',
    'function transfer(address to, uint256 amount) public returns (bool)',
    'function balanceOf(address account) public view returns (uint256)',
    'function approve(address spender, uint256 amount) public returns (bool)',
    'function allowance(address owner, address spender) public view returns (uint256)',
    'function decimals() public view returns (uint8)',
    'function symbol() public view returns (string)',
    'function name() public view returns (string)'
];

export const MOCK_USDC_BYTECODE = '0x608060405234801561001057600080fd5b50610c3e806100206000396000f3fe608060405234801561001057600080fd5b50600436106100a95760003560e01c8063395093511161007157806339509351146101325780633950935114610132578063a457c2d714610132578063dd62ed3e14610132578063a9059cbb14610132576100a9565b806306fdde03146100ae578063095ea7b3146100e657806318160ddd1461010457806323b872dd1461011e578063313ce5671461013e575b600080fd5b6100b661015c565b6040516100dd9190610a5f565b60405180910390f35b6100ee6101ee565b6040516100fb9190610a44565b60405180910390f35b61010c610220565b60405161011b9190610b3e565b60405180910390f35b610126610226565b6040516101339190610a44565b60405180910390f35b610146610281565b6040516101539190610b59565b60405180910390f35b60606003805461016b90610ba4565b80601f016020809104026020016040519081016040528092919081815260200182805461019790610ba4565b80156101e45780601f106101b9576101008083540402835291602001916101e4565b820191906000526020600020905b8154815290600101906020018083116101c757829003601f168201915b5050505050905090565b60006102196101fb61028a565b8461021485610206856102df565b61030f90919063ffffffff16565b61036d565b9050919050565b60025490565b600061027861023361028a565b8461027385604051806060016040528060258152602001610be4602591396001600061025d61028a565b73ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000205461052e9092919063ffffffff16565b61036d565b50600190565b60006009905090565b600033905090565b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff1603610309576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161030090610ad4565b60405180910390fd5b92915050565b6000808284610314919061076d565b905083811015610365576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161035c90610a94565b60405180910390fd5b809150509392505050565b600073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff16036103dc576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016103d390610b1e565b60405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168273ffffffffffffffffffffffffffffffffffffffff160361044b576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161044290610a74565b60405180910390fd5b80600160008573ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020819055508173ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925836040516105219190610b3e565b60405180910390a3505050565b6000838311158290610576576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161056d9190610a5f565b60405180910390fd5b506000838503905080915050939250505056fea2646970667358221220';

/**
 * Deploy a mock USDC contract for testing
 */
export async function createMockUSDC(signer) {
    const factory = new ethers.ContractFactory(
        MOCK_USDC_ABI,
        MOCK_USDC_BYTECODE,
        signer
    );

    const contract = await factory.deploy();
    await contract.waitForDeployment();
    
    const address = await contract.getAddress();
    console.log(`Mock USDC deployed at: ${address}`);

    return contract;
}

/**
 * Mint tokens to an address (for testing)
 */
export async function mintTokens(tokenContract, to, amount) {
    const tx = await tokenContract.mint(to, ethers.parseUnits(amount, 6));
    await tx.wait();
    console.log(`Minted ${amount} tokens to ${to}`);
}

/**
 * Format USDC amount (6 decimals)
 */
export function formatUSDC(amount) {
    return ethers.formatUnits(amount, 6);
}

/**
 * Parse USDC amount (6 decimals)
 */
export function parseUSDC(amount) {
    return ethers.parseUnits(amount, 6);
}

/**
 * Get token contract instance
 */
export function getTokenContract(address, signerOrProvider) {
    const abi = [
        'function transfer(address to, uint256 amount) returns (bool)',
        'function approve(address spender, uint256 amount) returns (bool)',
        'function balanceOf(address owner) view returns (uint256)',
        'function allowance(address owner, address spender) view returns (uint256)',
        'function decimals() view returns (uint8)',
        'function symbol() view returns (string)',
        'function name() view returns (string)'
    ];

    return new ethers.Contract(address, abi, signerOrProvider);
}

/**
 * Get PaymentVerifier contract instance
 */
export function getVerifierContract(address, signerOrProvider) {
    const abi = [
        'function verifyPaymentProof(bytes32 paymentTxHash, address token, address recipient, uint256 amount, uint256 timestamp, uint256 nonce, bytes signature) view returns (bool)',
        'function markProofUsed(bytes32 paymentTxHash, address token, address recipient, uint256 amount, uint256 timestamp, uint256 nonce, bytes signature)',
        'function getNonce(address user) view returns (uint256)',
        'function isProofUsed(bytes32 proofHash) view returns (bool)'
    ];

    return new ethers.Contract(address, abi, signerOrProvider);
}

/**
 * Wait for transaction with retries
 */
export async function waitForTransaction(provider, txHash, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
            return receipt;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error(`Transaction ${txHash} not confirmed after ${maxAttempts} attempts`);
}

/**
 * Create a test wallet with ETH and USDC
 */
export async function createTestWallet(provider, usdcAddress, amount = '10') {
    const wallet = ethers.Wallet.createRandom().connect(provider);
    console.log(`Created test wallet: ${wallet.address}`);
    console.log(`Private key: ${wallet.privateKey}`);
    
    // Note: In real testing, you'd need to fund this wallet
    // and mint USDC to it
    
    return wallet;
}

/**
 * Display payment summary
 */
export function displayPaymentSummary(proof, status = 'verified') {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 PAYMENT SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Status: ${status.toUpperCase()}`);
    console.log(`Transaction: ${proof.txHash}`);
    console.log(`Amount: ${formatUSDC(proof.amount)} USDC`);
    console.log(`Recipient: ${proof.recipient}`);
    console.log(`Timestamp: ${new Date(proof.timestamp * 1000).toISOString()}`);
    console.log(`Nonce: ${proof.nonce}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

/**
 * Validate Ethereum address
 */
export function isValidAddress(address) {
    return ethers.isAddress(address);
}

/**
 * Shorten address for display
 */
export function shortenAddress(address) {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Export all utilities
export default {
    createMockUSDC,
    mintTokens,
    formatUSDC,
    parseUSDC,
    getTokenContract,
    getVerifierContract,
    waitForTransaction,
    createTestWallet,
    displayPaymentSummary,
    isValidAddress,
    shortenAddress,
    MOCK_USDC_ABI,
    MOCK_USDC_BYTECODE
};
