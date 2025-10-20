use anchor_lang::prelude::*;

declare_id!("StaBle11111111111111111111111111111111111");

#[program]
pub mod stable_vault {
    use super::*;

    pub fn placeholder(_ctx: Context<Placeholder>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Placeholder {}
