
import { createPublicClient, http, parseAbi } from "viem";
import { polygon } from "viem/chains";
import { Env } from "../utils/config.ts";

const RPC = "https://polygon-bor-rpc.publicnode.com";
const EOA = "0x3528764a45bB13eC6BD8Deb1a73b5034742E6329";
const FUNDER = Env.get("POLY_FUNDER_ADDRESS") as `0x${string}`;
const USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const abi = parseAbi([
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address, address) view returns (uint256)",
]);

async function probe() {
    const client = createPublicClient({ chain: polygon, transport: http(RPC) });
    
    console.log("EOA:", EOA);
    console.log("Funder:", FUNDER);
    
    const eoaBal = await client.readContract({ address: USDC, abi, functionName: "balanceOf", args: [EOA] });
    const funderBal = await client.readContract({ address: USDC, abi, functionName: "balanceOf", args: [FUNDER] });
    
    console.log("EOA USDC Balance:", eoaBal.toString());
    console.log("Funder USDC Balance:", funderBal.toString());
    
    const code = await client.getBytecode({ address: FUNDER });
    console.log("Funder Bytecode length:", code ? code.length : 0);
    if (code && code.length > 2) {
        console.log("Funder is a contract.");
    } else {
        console.log("Funder is NOT a contract (EOA?).");
    }
}

probe().catch(console.error);
