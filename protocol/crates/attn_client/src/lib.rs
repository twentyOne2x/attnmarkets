use anchor_client::Program;
use anchor_lang::prelude::*;
use anyhow::Result;
use solana_sdk::signature::Keypair;

pub struct AttnClient {
    program: Program,
}

impl AttnClient {
    pub fn new(program: Program) -> Self {
        Self { program }
    }

    pub fn payer(&self) -> &Keypair {
        self.program.payer()
    }

    pub fn program(&self) -> &Program {
        &self.program
    }
}
