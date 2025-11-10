import { z } from "zod";

const Schema = z.object({
  PORT: z.coerce.number().default(8080),
  SOLANA_RPC_URL: z.string().url().default("https://api.devnet.solana.com"),
  CLUSTER: z.enum(["devnet", "mainnet"]).default("devnet"),
  ATTN_SIGNER_BASE58: z.string().min(40),
  DRY_RUN: z.enum(["0", "1"]).default("0"),
});

export const env = Schema.parse({
  PORT: process.env.PORT,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  CLUSTER: process.env.CLUSTER,
  ATTN_SIGNER_BASE58: process.env.ATTN_SIGNER_BASE58,
  DRY_RUN: process.env.DRY_RUN ?? "0",
});
