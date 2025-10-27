// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title PaymentVerifier
 * @dev Verifies HTTP 402 payment proofs on-chain
 * 
 * Payment Flow:
 * 1. Client makes ERC20 payment to merchant
 * 2. Client signs a payment proof message
 * 3. Server verifies proof against this contract
 * 4. Proof includes: txHash, amount, recipient, timestamp, nonce
 */
contract PaymentVerifier {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // Track used proofs to prevent replay attacks
    mapping(bytes32 => bool) public usedProofs;
    
    // Track nonces per address to prevent replay
    mapping(address => uint256) public nonces;

    // Events
    event ProofVerified(
        address indexed payer,
        address indexed recipient,
        uint256 amount,
        bytes32 proofHash
    );

    event ProofInvalidated(bytes32 proofHash);

    /**
     * @dev Verify a payment proof
     * @param paymentTxHash The transaction hash of the payment
     * @param token The ERC20 token address
     * @param recipient The payment recipient
     * @param amount The payment amount in wei
     * @param timestamp The proof timestamp (must be recent)
     * @param nonce The sender's nonce
     * @param signature The payer's signature
     * @return bool True if proof is valid
     */
    function verifyPaymentProof(
        bytes32 paymentTxHash,
        address token,
        address recipient,
        uint256 amount,
        uint256 timestamp,
        uint256 nonce,
        bytes memory signature
    ) external view returns (bool) {
        // Check timestamp is recent (within 5 minutes)
        require(block.timestamp <= timestamp + 300, "Proof expired");
        require(timestamp <= block.timestamp + 60, "Proof timestamp too far in future");

        // Reconstruct the proof hash
        bytes32 proofHash = keccak256(
            abi.encodePacked(
                paymentTxHash,
                token,
                recipient,
                amount,
                timestamp,
                nonce
            )
        );

        // Check if proof was already used
        require(!usedProofs[proofHash], "Proof already used");

        // Recover signer from signature
        bytes32 ethSignedHash = proofHash.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);

        // Verify nonce matches
        require(nonces[signer] == nonce, "Invalid nonce");

        return true;
    }

    /**
     * @dev Mark a proof as used (called by merchant after successful verification)
     * @param paymentTxHash The transaction hash of the payment
     * @param token The ERC20 token address
     * @param recipient The payment recipient
     * @param amount The payment amount in wei
     * @param timestamp The proof timestamp
     * @param nonce The sender's nonce
     * @param signature The payer's signature
     */
    function markProofUsed(
        bytes32 paymentTxHash,
        address token,
        address recipient,
        uint256 amount,
        uint256 timestamp,
        uint256 nonce,
        bytes memory signature
    ) external {
        // Verify the proof first
        require(
            this.verifyPaymentProof(
                paymentTxHash,
                token,
                recipient,
                amount,
                timestamp,
                nonce,
                signature
            ),
            "Invalid proof"
        );

        // Reconstruct proof hash
        bytes32 proofHash = keccak256(
            abi.encodePacked(
                paymentTxHash,
                token,
                recipient,
                amount,
                timestamp,
                nonce
            )
        );

        // Mark as used
        usedProofs[proofHash] = true;

        // Increment nonce for the payer
        bytes32 ethSignedHash = proofHash.toEthSignedMessageHash();
        address payer = ethSignedHash.recover(signature);
        nonces[payer]++;

        emit ProofVerified(payer, recipient, amount, proofHash);
    }

    /**
     * @dev Verify a transaction actually transferred the claimed amount
     * Note: This is a simplified version. In production, you'd need an oracle
     * or block explorer API to verify transaction details on-chain.
     * @param token The ERC20 token address
     * @param from The sender address
     * @param to The recipient address
     * @param amount The claimed amount
     * @return bool True if transfer is valid
     */
    function verifyTransfer(
        address token,
        address from,
        address to,
        uint256 amount
    ) external view returns (bool) {
        // Check recipient actually received the tokens
        // This is a basic check - in production use events/logs
        IERC20 tokenContract = IERC20(token);
        uint256 balance = tokenContract.balanceOf(to);
        
        // Simple validation: recipient has at least the amount
        // In production, track balances before/after or use transfer events
        return balance >= amount;
    }

    /**
     * @dev Get the current nonce for an address
     */
    function getNonce(address user) external view returns (uint256) {
        return nonces[user];
    }

    /**
     * @dev Check if a proof has been used
     */
    function isProofUsed(bytes32 proofHash) external view returns (bool) {
        return usedProofs[proofHash];
    }
}
