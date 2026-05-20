import { Env } from "../utils/config.ts";
import { PolymarketEarlyBirdClient } from "../engine/client.ts";

async function verify() {
  const client = new PolymarketEarlyBirdClient();
  await client.init();
  console.log("Client successfully initialized.");
  
  try {
    const balance = await client.getUSDCBalance();
    console.log(`Successfully authenticated! Current CLOB Balance: $${balance} USDC`);
    
    const openOrders = await client.clob.getOpenOrders();
    console.log("Successfully fetched open orders! Count:", openOrders.length);
  } catch (err) {
    console.error("Authenticated request failed:", err);
  }
}

verify().catch(console.error);
