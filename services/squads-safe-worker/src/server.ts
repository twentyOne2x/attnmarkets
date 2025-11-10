import express, { type Express } from "express";
import { z } from "zod";
import bs58 from "bs58";
import { createHash } from "node:crypto";
import { env } from "./env.js";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const CreateBody = z.object({
  members: z.array(z.string().min(32)).min(2),
  threshold: z.number().int().min(1),
  idempotencyKey: z.string().min(8),
  label: z.string().default("CreatorVault"),
});

function deterministicFakeAddress(seed: string): string {
  const hash = createHash("sha256").update(seed).digest();
  return bs58.encode(hash.subarray(0, 32));
}

async function createOnChain(
  connection: Connection,
  signer: Keypair,
  members: string[],
  threshold: number,
  label: string,
  idempotencyKey: string,
): Promise<{ safeAddress: string; txSig: string }> {
  const seed = createHash("sha256").update(idempotencyKey).digest().subarray(0, 32);
  const createKey = Keypair.fromSeed(seed);

  const [multisigPda] = multisig.getMultisigPda({
    createKey: createKey.publicKey,
  });

  const [programConfigPda] = multisig.getProgramConfigPda({});
  const programConfig =
    await multisig.accounts.ProgramConfig.fromAccountAddress(
      connection,
      programConfigPda,
    );

  const memberPubkeys = members.map((m) => new PublicKey(m));
  const memberInputs = memberPubkeys.map((pk) => ({
    key: pk,
    permissions: multisig.types.Permissions.all(),
  }));

  const ix = await multisig.instructions.multisigCreateV2({
    createKey: createKey.publicKey,
    creator: signer.publicKey,
    multisigPda,
    configAuthority: null,
    timeLock: 0,
    members: memberInputs,
    threshold,
    treasury: programConfig.treasury,
    rentCollector: null,
    memo: label,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = signer.publicKey;
  const latest = await connection.getLatestBlockhash("finalized");
  tx.recentBlockhash = latest.blockhash;

  tx.sign(signer, createKey);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
  });

  await connection.confirmTransaction(
    {
      signature: sig,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    "confirmed",
  );

  return { safeAddress: multisigPda.toBase58(), txSig: sig };
}

let cachedConnection: Connection | null = null;
let cachedSigner: Keypair | null = null;

function getConnection(): Connection {
  if (!cachedConnection) cachedConnection = new Connection(env.SOLANA_RPC_URL, "confirmed");
  return cachedConnection;
}

function getSigner(): Keypair {
  if (!cachedSigner) cachedSigner = Keypair.fromSecretKey(bs58.decode(env.ATTN_SIGNER_BASE58));
  return cachedSigner;
}

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: "256kb" }));

  app.get("/readyz", (_req, res) => res.json({ status: "ok" }));

  app.post("/v1/squads/safe", async (req, res) => {
    try {
      const body = CreateBody.parse(req.body);
      if (body.threshold > body.members.length) {
        return res.status(400).json({ error: "bad_threshold" });
      }

      if (env.DRY_RUN === "1") {
        const safe = deterministicFakeAddress(JSON.stringify(body));
        return res.status(201).json({
          status: "ready",
          safe_address: safe,
          tx_signature: "dry-run",
          cluster: env.CLUSTER,
        });
      }

      const connection = getConnection();
      const signer = getSigner();

      const { safeAddress, txSig } = await createOnChain(
        connection,
        signer,
        body.members,
        body.threshold,
        body.label,
        body.idempotencyKey,
      );

      return res.status(201).json({
        status: "ready",
        safe_address: safeAddress,
        tx_signature: txSig,
        cluster: env.CLUSTER,
      });
    } catch (err) {
      const msg =
        typeof err === "object" && err && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
      return res.status(502).json({ error: "squads_create_failed", detail: msg });
    }
  });

  return app;
}

export function start(): void {
  const app = createApp();
  app.listen(env.PORT);
}

const entryUrl = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entryUrl && import.meta.url === entryUrl) start();
