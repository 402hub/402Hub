// client-script/client.js
import { x402Pay } from '../src/index.js';
import { ethers } from 'ethers';

// Configuration
const CLIENT_PRIVATE_KEY = '0xf3ddc7f884028d5a4f94db17ac131f9a0a91665be8749dfd7a80a81fcb79ce00'; // Replace with real key
const provider = new ethers.JsonRpcProvider('https://sepolia.base.org');
const signer = new ethers.Wallet(CLIENT_PRIVATE_KEY, provider);

console.log('🔵 Client wallet:', signer.address);

async function fullDemo() {
  try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 STEP 1: Discovering Weather Agents');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
   
    // For testing without real payments, we'll simulate
    console.log('⚠️  Testing mode: Simulating payment flow...\n');
   
    // Step 1: Discover agents (would normally use x402Pay)
    console.log('🔍 Calling AgentForge discovery...');
    const discoverUrl = 'http://localhost:3003/discover?type=weather';
   
    // In testing mode, just call directly
    const response = await fetch(discoverUrl);
   
    if (response.status === 402) {
      const body = await response.json();
      console.log('✅ Received 402 Payment Challenge:');
      console.log('   Challenge:', body.challenge);
      console.log('   Message:', body.message);
      console.log('\n💡 In production, x402Pay would:');
      console.log('   1. Pay the required USDC');
      console.log('   2. Generate proof');
      console.log('   3. Retry with proof');
      console.log('   4. Get the agent list\n');
    } else {
      const agents = await response.json();
      console.log('✅ Found agents:', agents);
     
      if (agents.length > 0) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 STEP 2: Calling Weather Agent');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
       
        const agent = agents[0];
        console.log('🌤️  Calling:', agent.endpoint);
       
        const weatherResponse = await fetch(`${agent.endpoint}?city=London`);
       
        if (weatherResponse.status === 402) {
          const weatherBody = await weatherResponse.json();
          console.log('✅ Received 402 Payment Challenge:');
          console.log('   Challenge:', weatherBody.challenge);
          console.log('   Message:', weatherBody.message);
        } else {
          const weatherData = await weatherResponse.json();
          console.log('✅ Weather data received:');
          console.log(JSON.stringify(weatherData, null, 2));
        }
      }
    }
   
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Demo Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
   
    console.log('💡 Next Steps:');
    console.log('   1. Fund wallet with testnet ETH & USDC');
    console.log('   2. Enable verifyTransaction: true');
    console.log('   3. Use x402Pay() for automatic payments');
   
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

fullDemo();
