import { createConfig } from "ponder";

import { BaseJackpotAbi } from "./abis/BaseJackpot";

const dbKind = process.env.PONDER_DB_KIND || "pglite";

function getDatabaseConfig() {
  switch (dbKind) {
    case "postgres":
      if (!process.env.DATABASE_URL) {
        throw new Error(
          "PONDER_DB_KIND is 'postgres' but DATABASE_URL is not set. Please provide a PostgreSQL connection string."
        );
      }
      console.log("Using PostgreSQL database");
      return {
        kind: "postgres" as const,
        connectionString: process.env.DATABASE_URL,
      };
    case "pglite":
    case "sqlite":
      console.log("Using SQLite (pglite) database");
      return {
        kind: "pglite" as const,
        directory: process.env.PGLITE_DIRECTORY || "./.ponder/pglite",
      };
    default:
      throw new Error(
        `Unsupported PONDER_DB_KIND: '${dbKind}'. Must be 'postgres' or 'pglite' (sqlite).`
      );
  }
}

export default createConfig({
  database: getDatabaseConfig(),
  chains: {
    base: {
      id: 8453,
      rpc: process.env.PONDER_RPC_URL_8453!,
    },
  },
  contracts: {
    BaseJackpot: {
      chain: "base",
      abi: BaseJackpotAbi,
      address: "0xbEDd4F2beBE9E3E636161E644759f3cbe3d51B95",
      startBlock: 27077440,
    },
  },
});
