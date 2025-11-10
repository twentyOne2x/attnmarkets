import { describe, it, expect } from "vitest";
import supertest from "supertest";
process.env.DRY_RUN = "1";
process.env.ATTN_SIGNER_BASE58 =
    "11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111";
process.env.SOLANA_RPC_URL = "https://api.devnet.solana.com";
process.env.CLUSTER = "devnet";
const { createApp } = await import("../src/server");
const app = createApp();
describe("POST /v1/squads/safe (DRY_RUN)", () => {
    it("returns ready with deterministic fake address", async () => {
        const requestBody = {
            members: [
                "BVQHZaUHBTwk2mfUFsaHdbBhe5EkxNz8nPeynmbfXr2i",
                "Eh1w8dPqf2wzK8s1Zp2W8E3rS9jZkQ1mV7kQvQ5sXqQK",
            ],
            threshold: 2,
            idempotencyKey: "idem-123",
            label: "CreatorVault",
        };
        const resp1 = await supertest(app)
            .post("/v1/squads/safe")
            .send(requestBody)
            .expect(201);
        expect(resp1.body.status).toBe("ready");
        expect(resp1.body.cluster).toBe("devnet");
        expect(resp1.body.tx_signature).toBe("dry-run");
        expect(typeof resp1.body.safe_address).toBe("string");
        expect(resp1.body.safe_address.length).toBeGreaterThan(10);
        const resp2 = await supertest(app)
            .post("/v1/squads/safe")
            .send(requestBody)
            .expect(201);
        expect(resp2.body.safe_address).toBe(resp1.body.safe_address);
    });
});
