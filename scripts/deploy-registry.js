const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying ServiceRegistry to Base Sepolia...\n");
  
  // Get the contract factory
  const ServiceRegistry = await hre.ethers.getContractFactory("ServiceRegistry");
  
  console.log("📝 Deploying contract...");
  const registry = await ServiceRegistry.deploy();
  
  // Wait for deployment to complete
  await registry.waitForDeployment();
  
  // Get the deployed contract address
  const address = await registry.getAddress();
  
  console.log("\n✅ SUCCESS! ServiceRegistry deployed!\n");
  console.log("📍 Contract Address:", address);
  console.log("🔗 View on BaseScan:", `https://sepolia.basescan.org/address/${address}`);
  
  console.log("\n📋 NEXT STEPS:\n");
  console.log("1. Copy the contract address above");
  console.log("2. Update your 402hub-api/.env file:");
  console.log(`   REGISTRY_CONTRACT_ADDRESS=${address}`);
  console.log("\n3. Verify the contract on BaseScan (optional):");
  console.log(`   npx hardhat verify --network baseSepolia ${address}`);
  
  console.log("\n🎉 Deployment complete! You're ready to launch the API.\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:", error);
    process.exit(1);
  });
