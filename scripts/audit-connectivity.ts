
import { ClobClient, Chain } from "@polymarket/clob-client-v2";
import { Wallet } from "@ethersproject/wallet";

const PK = process.env.POLY_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
const FUNDER = process.env.POLY_FUNDER_ADDRESS;

async function audit() {
    if (!PK) {
        throw new Error("POLY_PRIVATE_KEY is required for connectivity audit");
    }

    const signer = new Wallet(PK);
    const configs = [
        { type: 0, funder: undefined },
        { type: 1, funder: FUNDER },
        { type: 2, funder: FUNDER },
        { type: 3, funder: FUNDER },
    ];

    for (const config of configs) {
        console.log(`\n--- Testing Type ${config.type} (Funder: ${config.funder}) ---`);
        try {
            const client = new ClobClient({
                host: "https://clob.polymarket.com",
                chain: Chain.POLYGON,
                signer: signer,
                signatureType: config.type as any,
                funderAddress: config.funder,
            });

            const creds = await client.createOrDeriveApiKey();
            console.log(`API Key derived: ${creds.key}`);
            console.log("API Secret: [redacted]");
            console.log("API Passphrase: [redacted]");

            const balanceClient = new ClobClient({
                host: "https://clob.polymarket.com",
                chain: Chain.POLYGON,
                signer: signer,
                creds,
                signatureType: config.type as any,
                funderAddress: config.funder,
            });

            const balance = await balanceClient.getBalanceAllowance({ asset_type: "COLLATERAL" as any });
            console.log(`Balance: ${JSON.stringify(balance)}`);
        } catch (err: any) {
            console.log(`Error: ${err.message || err}`);
            if (err.data) console.log(`Data: ${JSON.stringify(err.data)}`);
        }
    }
}

audit().catch(console.error);
