const hre = require("hardhat");
require("dotenv").config();

async function main() {
  // Replace with your deployed contract address
  const REGISTRY_ADDRESS = process.env.REGISTRY_CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000";
  
  if (REGISTRY_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.error("❌ ERROR: Please set REGISTRY_CONTRACT_ADDRESS in your .env file");
    console.error("   Get it from your deployment output");
    process.exit(1);
  }
  
  console.log("📝 Registering test service to ServiceRegistry...\n");
  console.log("📍 Registry Address:", REGISTRY_ADDRESS);
  
  // Get the contract instance
  const ServiceRegistry = await hre.ethers.getContractFactory("ServiceRegistry");
  const registry = ServiceRegistry.attach(REGISTRY_ADDRESS);
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("👤 Registering from:", await deployer.getAddress());
  
  // Register a test weather service
  console.log("\n⏳ Submitting transaction...");
  const tx = await registry.registerService(
    "https://test-weather-api.example.com/weather",  // endpoint
    "data",                                          // serviceType (vertical)
    "Test Weather API - Returns mock weather data for testing 402Hub discovery",  // description
    hre.ethers.parseEther("0.001"),                 // pricePerCall (0.001 ETH)
    "base_sepolia"                                   // chain
  );
  
  console.log("📋 Transaction submitted:", tx.hash);
  console.log("⏳ Waiting for confirmation...");
  
  const receipt = await tx.wait();
  
  console.log("\n✅ SUCCESS! Service registered!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📍 Transaction:", `https://sepolia.basescan.org/tx/${receipt.hash}`);
  console.log("⛽ Gas used:", receipt.gasUsed.toString());
  
  // Parse the ServiceRegistered event to get the service ID
  const iface = new hre.ethers.Interface([
    "event ServiceRegistered(bytes32 indexed serviceId, address indexed provider, string endpoint, string serviceType, uint256 pricePerCall)"
  ]);
  
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed.name === "ServiceRegistered") {
        console.log("🆔 Service ID:", parsed.args.serviceId);
        console.log("👤 Provider:", parsed.args.provider);
        console.log("🔗 Endpoint:", parsed.args.endpoint);
        console.log("📂 Vertical:", parsed.args.serviceType);
        console.log("💰 Price:", hre.ethers.formatEther(parsed.args.pricePerCall), "ETH");
      }
    } catch (e) {
      // Not the event we're looking for
    }
  }
  
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  
  console.log("\n🧪 Test discovery with:");
  console.log("   curl https://402hub-production.up.railway.app/discover?vertical=data");
  
  console.log("\n📊 View all services:");
  console.log("   curl https://402hub-production.up.railway.app/verticals");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Registration failed:", error);
    process.exit(1);
  });
