use anchor_lang::prelude::*;

declare_id!("SpLit1111111111111111111111111111111111111");

#[program]
pub mod splitter {
    use super::*;

    pub fn placeholder(_ctx: Context<Placeholder>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Placeholder {}
