
import { createPublicClient, http, parseAbi } from "viem";
import { polygon } from "viem/chains";

const RPC = "https://polygon-bor-rpc.publicnode.com";
const EOA = "0x3528764a45bB13eC6BD8Deb1a73b5034742E6329";
const SAFE = "0xbcbae6BE8cE9AD38C4FFD71254202f2aA27a30CF";
const USDC = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

const abi = parseAbi([
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address, address) view returns (uint256)",
]);

async function probe() {
    const client = createPublicClient({ chain: polygon, transport: http(RPC) });
    
    console.log("EOA:", EOA);
    console.log("SAFE/Funder:", SAFE);
    
    const eoaBal = await client.readContract({ address: USDC, abi, functionName: "balanceOf", args: [EOA] });
    const safeBal = await client.readContract({ address: USDC, abi, functionName: "balanceOf", args: [SAFE] });
    
    console.log("EOA USDC Balance:", eoaBal.toString());
    console.log("SAFE USDC Balance:", safeBal.toString());
    
    const code = await client.getBytecode({ address: SAFE });
    console.log("SAFE Bytecode length:", code ? code.length : 0);
    if (code && code.length > 2) {
        console.log("SAFE is a contract.");
    } else {
        console.log("SAFE is NOT a contract (EOA?).");
    }
}

probe().catch(console.error);
