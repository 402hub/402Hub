/**
 * x402 Protocol - Test Suite
 * 
 * Tests core functionality of the SDK
 */

import { ethers } from 'ethers';
import { 
    PaymentChallenge, 
    PaymentProof,
    decodeProof,
    verifyProofSignature 
} from '../src/index.js';

// Test results tracking
const results = {
    passed: 0,
    failed: 0,
    tests: []
};

function test(name, fn) {
    try {
        fn();
        results.passed++;
        results.tests.push({ name, status: 'PASS' });
        console.log(`✅ ${name}`);
    } catch (error) {
        results.failed++;
        results.tests.push({ name, status: 'FAIL', error: error.message });
        console.log(`❌ ${name}: ${error.message}`);
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🧪 x402 Protocol Test Suite');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ============================================
// Payment Challenge Tests
// ============================================

console.log('📋 Testing PaymentChallenge...\n');

test('PaymentChallenge: Parse basic challenge', () => {
    const challenge = new PaymentChallenge('usdc:base_sepolia:0xf81dc05616C47447Ffdc5a866642cDD26271D37b?amount=0.001');
    
    assertEqual(challenge.token, 'usdc');
    assertEqual(challenge.chain, 'base_sepolia');
    assertEqual(challenge.recipient, '0xf81dc05616C47447Ffdc5a866642cDD26271D37b');
    assertEqual(challenge.amount, '0.001');
});

test('PaymentChallenge: Get token address', () => {
    const challenge = new PaymentChallenge('usdc:base_sepolia:0xf81dc05616C47447Ffdc5a866642cDD26271D37b?amount=0.001');
    const address = challenge.getTokenAddress();
    
    assert(address !== null, 'Token address should not be null');
    assert(ethers.isAddress(address), 'Should be valid Ethereum address');
});

test('PaymentChallenge: Get RPC URL', () => {
    const challenge = new PaymentChallenge('usdc:base_sepolia:0xf81dc05616C47447Ffdc5a866642cDD26271D37b?amount=0.001');
    const rpcUrl = challenge.getRpcUrl();
    
    assertEqual(rpcUrl, 'https://sepolia.base.org');
});

test('PaymentChallenge: Convert amount to wei', () => {
    const challenge = new PaymentChallenge('usdc:base_sepolia:0xf81dc05616C47447Ffdc5a866642cDD26271D37b?amount=0.001');
    const amountWei = challenge.getAmountWei();
    
    // 0.001 USDC = 1000 (6 decimals)
    assertEqual(amountWei.toString(), '1000');
});

test('PaymentChallenge: Handle custom nonce', () => {
    const challenge = new PaymentChallenge('usdc:base_sepolia:0xf81dc05616C47447Ffdc5a866642cDD26271D37b?amount=0.001&nonce=5');
    
    assertEqual(challenge.nonce, 5);
});

// ============================================
// Payment Proof Tests
// ============================================

console.log('\n📋 Testing PaymentProof...\n');

test('PaymentProof: Create proof', () => {
    const challenge = new PaymentChallenge('usdc:base_sepolia:0xf81dc05616C47447Ffdc5a866642cDD26271D37b?amount=0.001');
    const txHash = '0x' + '1'.repeat(64);
    const timestamp = Math.floor(Date.now() / 1000);
    
    const proof = new PaymentProof(txHash, challenge, 0, timestamp);
    
    assertEqual(proof.txHash, txHash);
    assertEqual(proof.nonce, 0);
    assertEqual(proof.timestamp, timestamp);
});

test('PaymentProof: Generate proof hash', () => {
    const challenge = new PaymentChallenge('usdc:base_sepolia:0xf81dc05616C47447Ffdc5a866642cDD26271D37b?amount=0.001');
    const txHash = '0x' + '1'.repeat(64);
    const timestamp = Math.floor(Date.now() / 1000);
    
    const proof = new PaymentProof(txHash, challenge, 0, timestamp);
    const hash = proof.getProofHash();
    
    assert(hash.startsWith('0x'), 'Hash should start with 0x');
    assertEqual(hash.length, 66, 'Hash should be 32 bytes (66 chars with 0x)');
});

test('PaymentProof: Sign proof', async () => {
    const wallet = ethers.Wallet.createRandom();
    const challenge = new PaymentChallenge('usdc:base_sepolia:0xf81dc05616C47447Ffdc5a866642cDD26271D37b?amount=0.001');
    const txHash = '0x' + '1'.repeat(64);
    const timestamp = Math.floor(Date.now() / 1000);
    
    const proof = new PaymentProof(txHash, challenge, 0, timestamp);
    const signature = await proof.sign(wallet);
    
    assert(signature.startsWith('0x'), 'Signature should start with 0x');
    assert(signature.length > 100, 'Signature should be at least 65 bytes');
});

test('PaymentProof: Encode proof', async () => {
    const wallet = ethers.Wallet.createRandom();
    const challenge = new PaymentChallenge('usdc:base_sepolia:0xf81dc05616C47447Ffdc5a866642cDD26271D37b?amount=0.001');
    const txHash = '0x' + '1'.repeat(64);
    const timestamp = Math.floor(Date.now() / 1000);
    
    const proof = new PaymentProof(txHash, challenge, 0, timestamp);
    const signature = await proof.sign(wallet);
    const encoded = await proof.encode(signature);
    
    assert(encoded.length > 0, 'Encoded proof should not be empty');
    
    // Should be valid base64
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    
    assert(parsed.txHash !== undefined, 'Decoded proof should have txHash');
    assert(parsed.signature !== undefined, 'Decoded proof should have signature');
});

// ============================================
// Proof Verification Tests
// ============================================

console.log('\n📋 Testing Proof Verification...\n');

test('decodeProof: Decode valid proof', async () => {
    const wallet = ethers.Wallet.createRandom();
    const challenge = new PaymentChallenge('usdc:base_sepolia:0xf81dc05616C47447Ffdc5a866642cDD26271D37b?amount=0.001');
    const txHash = '0x' + '1'.repeat(64);
    const timestamp = Math.floor(Date.now() / 1000);
    
    const proof = new PaymentProof(txHash, challenge, 0, timestamp);
    const signature = await proof.sign(wallet);
    const encoded = await proof.encode(signature);
    
    const decoded = decodeProof(encoded);
    
    assertEqual(decoded.txHash, txHash);
    assertEqual(decoded.recipient, challenge.recipient);
});

test('decodeProof: Reject invalid base64', () => {
    try {
        decodeProof('not-valid-base64!!!');
        throw new Error('Should have thrown error');
    } catch (error) {
        assert(error.message.includes('Invalid proof format'), 'Should throw Invalid proof format error');
    }
});

test('verifyProofSignature: Recover signer address', async () => {
    const wallet = ethers.Wallet.createRandom();
    const challenge = new PaymentChallenge('usdc:base_sepolia:0xf81dc05616C47447Ffdc5a866642cDD26271D37b?amount=0.001');
    const txHash = '0x' + '1'.repeat(64);
    const timestamp = Math.floor(Date.now() / 1000);
    
    const proof = new PaymentProof(txHash, challenge, 0, timestamp);
    const signature = await proof.sign(wallet);
    const encoded = await proof.encode(signature);
    const decoded = decodeProof(encoded);
    
    const recoveredAddress = verifyProofSignature(decoded);
    
    assertEqual(recoveredAddress.toLowerCase(), wallet.address.toLowerCase(), 
        'Recovered address should match signer');
});

test('verifyProofSignature: Detect tampered proof', async () => {
    const wallet = ethers.Wallet.createRandom();
    const challenge = new PaymentChallenge('usdc:base_sepolia:0xf81dc05616C47447Ffdc5a866642cDD26271D37b?amount=0.001');
    const txHash = '0x' + '1'.repeat(64);
    const timestamp = Math.floor(Date.now() / 1000);
    
    const proof = new PaymentProof(txHash, challenge, 0, timestamp);
    const signature = await proof.sign(wallet);
    const encoded = await proof.encode(signature);
    const decoded = decodeProof(encoded);
    
    // Tamper with the amount
    decoded.amount = '2000'; // Changed from 1000
    
    const recoveredAddress = verifyProofSignature(decoded);
    
    // Address should NOT match because proof was tampered
    assert(recoveredAddress.toLowerCase() !== wallet.address.toLowerCase(), 
        'Tampered proof should not verify');
});

// ============================================
// Integration Tests
// ============================================

console.log('\n📋 Testing Integration...\n');

test('Full payment proof flow', async () => {
    // Create wallet
    const wallet = ethers.Wallet.createRandom();
    
    // Create challenge
    const challenge = new PaymentChallenge(
        'usdc:base_sepolia:0xf81dc05616C47447Ffdc5a866642cDD26271D37b?amount=0.001'
    );
    
    // Simulate payment (just create a fake tx hash)
    const txHash = '0x' + '2'.repeat(64);
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Create and sign proof
    const proof = new PaymentProof(txHash, challenge, 0, timestamp);
    const signature = await proof.sign(wallet);
    const encoded = await proof.encode(signature);
    
    // Server-side: decode and verify
    const decoded = decodeProof(encoded);
    const recoveredAddress = verifyProofSignature(decoded);
    
    // Verify all components
    assertEqual(decoded.txHash, txHash);
    assertEqual(decoded.recipient, challenge.recipient);
    assertEqual(decoded.amount, challenge.getAmountWei().toString());
    assertEqual(recoveredAddress.toLowerCase(), wallet.address.toLowerCase());
    
    console.log('  ├─ Challenge parsed ✓');
    console.log('  ├─ Proof signed ✓');
    console.log('  ├─ Proof encoded ✓');
    console.log('  ├─ Proof decoded ✓');
    console.log('  └─ Signature verified ✓');
});

// ============================================
// Results Summary
// ============================================

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Test Results');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log(`✅ Passed: ${results.passed}`);
console.log(`❌ Failed: ${results.failed}`);
console.log(`📝 Total:  ${results.passed + results.failed}\n`);

if (results.failed > 0) {
    console.log('Failed tests:');
    results.tests.filter(t => t.status === 'FAIL').forEach(t => {
        console.log(`  ❌ ${t.name}: ${t.error}`);
    });
    console.log();
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Exit with error code if tests failed
process.exit(results.failed > 0 ? 1 : 0);
