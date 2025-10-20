use anchor_lang::prelude::*;

declare_id!("AMM11111111111111111111111111111111111111");

#[program]
pub mod amm {
    use super::*;

    pub fn placeholder(_ctx: Context<Placeholder>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Placeholder {}
