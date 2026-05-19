
import { ClobClient, Chain, Side } from "@polymarket/clob-client-v2";
import { Wallet } from "@ethersproject/wallet";

const PK = process.env.POLY_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
const FUNDER = process.env.POLY_FUNDER_ADDRESS;
const tokenId = process.env.POLY_TEST_TOKEN_ID;

async function testOrder() {
    const key = process.env.POLY_API_KEY;
    const secret = process.env.POLY_API_SECRET;
    const passphrase = process.env.POLY_API_PASSPHRASE;

    if (!PK || !FUNDER || !tokenId || !key || !secret || !passphrase) {
        throw new Error("POLY_PRIVATE_KEY, POLY_FUNDER_ADDRESS, POLY_TEST_TOKEN_ID, POLY_API_KEY, POLY_API_SECRET, and POLY_API_PASSPHRASE are required");
    }

    const creds = { key, secret, passphrase };

    const signer = new Wallet(PK);
    const client = new ClobClient({
        host: "https://clob.polymarket.com",
        chain: Chain.POLYGON,
        signer: signer,
        creds,
        signatureType: 3 as any,
        funderAddress: FUNDER,
    });

    console.log("Testing order placement...");
    try {
        // Use an intentionally tiny maker-side probe configured by env; do not run in strategy loops.
        const resp = await client.createAndPostOrder({
            tokenID: tokenId,
            price: 0.01,
            size: 10,
            side: Side.BUY,
        }, { tickSize: "0.01" });
        
        console.log("Order response:", JSON.stringify(resp));
    } catch (err: any) {
        console.log("Order failed!");
        console.log("Error:", err.message);
        if (err.data) console.log("Data:", JSON.stringify(err.data));
    }
}

testOrder().catch(console.error);
