use anchor_lang::prelude::*;

declare_id!("4DSYe8VteU1vLgwGrTeoyGLZdsCG87srCVLkVqza3keg");

#[program]
pub mod amm {
    use super::*;

    pub fn placeholder(_ctx: Context<Placeholder>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Placeholder {}
