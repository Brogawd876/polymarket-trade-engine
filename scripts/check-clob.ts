import { Env } from "../utils/config.ts";
import { PolymarketEarlyBirdClient } from "../engine/client.ts";

async function verify() {
  const client = new PolymarketEarlyBirdClient();
  await client.init();
  console.log("Client successfully initialized.");
  
  try {
    const balance = await client.getUSDCBalance();
    console.log(`Successfully authenticated! Current CLOB Balance: $${balance} USDC`);
    
    // Check if we can fetch open orders for a dummy condition ID or similar
    const dummyConditionId = "0xe5f284bb87522d715d2a2333cfc25c345388c69f88eb88f918e88ff918e88ff9";
    const openOrders = await client.getOpenOrderIds(dummyConditionId);
    console.log("Successfully fetched open orders! Count:", openOrders.size);
  } catch (err) {
    console.error("Authenticated request failed:", err);
  }
}

verify().catch(console.error);
