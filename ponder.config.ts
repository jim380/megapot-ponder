import { createConfig } from "ponder";

import BaseJackpotAbi from "./abis/BaseJackpot.json";

export default createConfig({
  chains: {
    base: {
      id: 8453,
      rpc: process.env.PONDER_RPC_URL_BASE!,
    },
  },
  contracts: {
    BaseJackpot: {
      chain: "base",
      abi: BaseJackpotAbi,
      address: "0x26eb7396e72b8903746b0133f7692dd1fa86bc13",
      startBlock: 27077440,
    },
  },
});
