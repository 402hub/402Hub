/**
 * 402Hub Payment Middleware (Standalone Version)
 * This is a self-contained version for the API deployment
 */

const { ethers } = require('ethers');

/**
 * Create Express middleware for x402 payment protection
 */
function createPaymentMiddleware(options) {
  const { wallet, price, verifyOnChain = false } = options;

  return async function paymentMiddleware(req, res, next) {
    // Check for payment headers
    const paymentProof = req.headers['x-payment-proof'];
    const paymentTo = req.headers['x-payment-to'];
    const paymentAmount = req.headers['x-payment-amount'];
    const paymentTxHash = req.headers['x-payment-txhash'];

    // If no payment headers, return 402 Payment Required
    if (!paymentProof || !paymentTo || !paymentAmount || !paymentTxHash) {
      return res.status(402).json({
        error: 'Payment Required',
        message: 'This endpoint requires payment',
        paymentDetails: {
          recipient: wallet.address,
          amount: ethers.formatEther(price),
          currency: 'ETH'
        },
        instructions: {
          '1': 'Send payment transaction to the recipient address',
          '2': 'Include these headers in your request:',
          'headers': {
            'X-Payment-Proof': 'Signature of payment',
            'X-Payment-To': 'Recipient address',
            'X-Payment-Amount': 'Amount in wei',
            'X-Payment-TxHash': 'Transaction hash'
          }
        }
      });
    }

    // Verify payment recipient
    if (paymentTo.toLowerCase() !== wallet.address.toLowerCase()) {
      return res.status(403).json({
        error: 'Invalid payment recipient',
        expected: wallet.address,
        received: paymentTo
      });
    }

    // Verify payment amount
    const paidAmount = BigInt(paymentAmount);
    if (paidAmount < price) {
      return res.status(403).json({
        error: 'Insufficient payment',
        required: ethers.formatEther(price),
        received: ethers.formatEther(paidAmount)
      });
    }

    // If on-chain verification is enabled, verify the transaction
    if (verifyOnChain) {
      try {
        const provider = wallet.provider;
        const tx = await provider.getTransaction(paymentTxHash);
        
        if (!tx) {
          return res.status(403).json({
            error: 'Transaction not found',
            txHash: paymentTxHash
          });
        }

        if (tx.to.toLowerCase() !== wallet.address.toLowerCase()) {
          return res.status(403).json({
            error: 'Transaction recipient mismatch',
            expected: wallet.address,
            actual: tx.to
          });
        }

        if (tx.value < price) {
          return res.status(403).json({
            error: 'Transaction amount insufficient',
            required: ethers.formatEther(price),
            actual: ethers.formatEther(tx.value)
          });
        }

        // Wait for confirmation
        const receipt = await tx.wait(1);
        if (receipt.status === 0) {
          return res.status(403).json({
            error: 'Transaction failed',
            txHash: paymentTxHash
          });
        }
      } catch (error) {
        console.error('Payment verification error:', error);
        return res.status(500).json({
          error: 'Payment verification failed',
          message: error.message
        });
      }
    } else {
      // Basic verification - just check the signature
      try {
        // Verify the payment proof signature
        const message = `Payment: ${paymentAmount} to ${paymentTo} (${paymentTxHash})`;
        const recoveredAddress = ethers.verifyMessage(message, paymentProof);
        
        // In production, you'd verify this matches an expected payer
        console.log('Payment verified from:', recoveredAddress);
      } catch (error) {
        console.error('Signature verification error:', error);
        return res.status(403).json({
          error: 'Invalid payment proof',
          message: error.message
        });
      }
    }

    // Payment verified - allow access
    console.log(`✓ Payment verified: ${ethers.formatEther(paidAmount)} ETH`);
    next();
  };
}

module.exports = { createPaymentMiddleware };
