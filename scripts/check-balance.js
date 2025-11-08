const hre = require("hardhat");

async function main() {
  console.log("💰 Checking wallet balance on Base Sepolia...\n");
  
  const [deployer] = await hre.ethers.getSigners();
  const address = await deployer.getAddress();
  const balance = await hre.ethers.provider.getBalance(address);
  
  console.log("📍 Wallet Address:", address);
  console.log("💵 Balance:", hre.ethers.formatEther(balance), "ETH");
  
  if (balance < hre.ethers.parseEther("0.001")) {
    console.log("\n⚠️  WARNING: Low balance!");
    console.log("You need at least 0.001 ETH to deploy contracts.");
    console.log("\n📥 Get testnet ETH from:");
    console.log("   https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet");
  } else {
    console.log("\n✅ Balance sufficient for deployment!");
  }
  
  console.log("\n🔗 View on BaseScan:");
  console.log(`   https://sepolia.basescan.org/address/${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
