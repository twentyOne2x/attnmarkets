use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use anchor_lang::InstructionData;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount};
use creator_vault::CreatorVault;

declare_id!("DusRTfShkXozaatx71Qv413RNEXqPNZS8hg9BnBeAQQE");

pub const FEE_INDEX_SCALE: u128 = 1_000_000_000;

#[program]
pub mod splitter {
    use super::*;

    pub fn create_market(ctx: Context<CreateMarket>, maturity_ts: i64) -> Result<()> {
        require!(maturity_ts > 0, SplitterError::InvalidMaturity);
        require_keys_eq!(
            ctx.accounts.creator_vault.sy_mint,
            ctx.accounts.sy_mint.key()
        );
        require_keys_eq!(
            ctx.accounts.creator_vault.splitter_program,
            crate::ID,
            SplitterError::SplitterProgramMismatch
        );

        let splitter_bump = ctx.bumps.splitter_authority;
        ctx.accounts.splitter_authority.bump = splitter_bump;

        let market = &mut ctx.accounts.market;
        market.creator_vault = ctx.accounts.creator_vault.key();
        market.pump_mint = ctx.accounts.creator_vault.pump_mint;
        market.sy_mint = ctx.accounts.sy_mint.key();
        market.pt_mint = ctx.accounts.pt_mint.key();
        market.yt_mint = ctx.accounts.yt_mint.key();
        market.maturity_ts = maturity_ts;
        market.total_pt_issued = 0;
        market.total_yt_issued = 0;
        market.fee_index = 0;
        market.is_closed = false;
        market.padding = [0; 7];

        emit!(MarketCreated {
            market: market.key(),
            pump_mint: market.pump_mint,
            maturity_ts,
        });

        Ok(())
    }

    pub fn mint_pt_yt(ctx: Context<MintPtYt>, amount: u64) -> Result<()> {
        require!(amount > 0, SplitterError::InvalidAmount);
        require_keys_eq!(
            ctx.accounts.market.creator_vault,
            ctx.accounts.creator_vault.key()
        );
        require_keys_eq!(ctx.accounts.market.sy_mint, ctx.accounts.sy_mint.key());
        require_keys_eq!(ctx.accounts.market.pt_mint, ctx.accounts.pt_mint.key());
        require_keys_eq!(ctx.accounts.market.yt_mint, ctx.accounts.yt_mint.key());

        require!(
            ctx.accounts.user_sy_ata.amount >= amount,
            SplitterError::InsufficientSyBalance
        );

        // burn SY from user
        let burn_accounts = Burn {
            mint: ctx.accounts.sy_mint.to_account_info(),
            from: ctx.accounts.user_sy_ata.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), burn_accounts);
        token::burn(cpi_ctx, amount)?;

        // mint PT
        let splitter_bump = ctx.bumps.splitter_authority;
        let creator_vault_key = ctx.accounts.creator_vault.key();
        let bump_seed = [splitter_bump];
        let splitter_seeds: [&[u8]; 3] = [
            b"splitter-authority",
            creator_vault_key.as_ref(),
            &bump_seed,
        ];
        let signer_seeds = [&splitter_seeds[..]];
        msg!("splitter: minting PT via CreatorVault");
        mint_via_creator_vault(
            ctx.accounts.creator_vault_program.to_account_info(),
            ctx.accounts.creator_vault.to_account_info(),
            ctx.accounts.splitter_authority.to_account_info(),
            ctx.accounts.pt_mint.to_account_info(),
            ctx.accounts.user_pt_ata.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            amount,
            &signer_seeds,
        )?;

        // mint YT
        msg!("splitter: minting YT via CreatorVault");
        mint_via_creator_vault(
            ctx.accounts.creator_vault_program.to_account_info(),
            ctx.accounts.creator_vault.to_account_info(),
            ctx.accounts.splitter_authority.to_account_info(),
            ctx.accounts.yt_mint.to_account_info(),
            ctx.accounts.user_yt_ata.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            amount,
            &signer_seeds,
        )?;

        let market = &mut ctx.accounts.market;
        market.total_pt_issued = market
            .total_pt_issued
            .checked_add(amount)
            .ok_or(SplitterError::MathOverflow)?;
        market.total_yt_issued = market
            .total_yt_issued
            .checked_add(amount)
            .ok_or(SplitterError::MathOverflow)?;

        let position = &mut ctx.accounts.user_position;
        if position.market == Pubkey::default() {
            let bump = ctx.bumps.user_position;
            position.bump = bump;
            position.market = market.key();
            position.user = ctx.accounts.user.key();
            position.last_fee_index = market.fee_index;
            position.pending_yield_scaled = 0;
        } else {
            require_keys_eq!(position.market, market.key());
            require_keys_eq!(position.user, ctx.accounts.user.key());
        }

        emit!(PtYtMinted {
            market: market.key(),
            user: ctx.accounts.user.key(),
            amount,
        });

        Ok(())
    }

    pub fn redeem_yield(ctx: Context<RedeemYield>, new_fee_index: u128) -> Result<()> {
        let market = &mut ctx.accounts.market;
        require_keys_eq!(market.creator_vault, ctx.accounts.creator_vault.key());
        require!(
            new_fee_index >= market.fee_index,
            SplitterError::FeeIndexRegression
        );

        let position = &mut ctx.accounts.user_position;
        require_keys_eq!(position.market, market.key());
        require_keys_eq!(position.user, ctx.accounts.user.key());
        require!(
            ctx.accounts.user_yt_ata.amount > 0,
            SplitterError::NoYieldPosition
        );

        let (expected_fee_vault, _) = Pubkey::find_program_address(
            &[b"fee-vault", ctx.accounts.creator_vault.pump_mint.as_ref()],
            &creator_vault::id(),
        );
        require_keys_eq!(
            expected_fee_vault,
            ctx.accounts.fee_vault.key(),
            SplitterError::InvalidFeeVault
        );

        let delta_for_market = new_fee_index
            .checked_sub(market.fee_index)
            .ok_or(SplitterError::MathOverflow)?;
        market.fee_index = new_fee_index;

        let delta = new_fee_index
            .checked_sub(position.last_fee_index)
            .ok_or(SplitterError::MathOverflow)?;
        if delta == 0 && position.pending_yield_scaled == 0 {
            return Ok(());
        }

        let user_balance = ctx.accounts.user_yt_ata.amount as u128;
        let accrued_scaled = delta
            .checked_mul(user_balance)
            .ok_or(SplitterError::MathOverflow)?;
        let total_scaled = accrued_scaled
            .checked_add(position.pending_yield_scaled)
            .ok_or(SplitterError::MathOverflow)?;
        let claimable = (total_scaled / FEE_INDEX_SCALE) as u64;
        let remainder = total_scaled % FEE_INDEX_SCALE;

        position.pending_yield_scaled = remainder;
        position.last_fee_index = new_fee_index;

        if claimable == 0 {
            return Ok(());
        }

        require!(
            ctx.accounts.fee_vault.amount >= claimable,
            SplitterError::InsufficientYieldLiquidity
        );

        let splitter_bump = ctx.bumps.splitter_authority;
        let creator_vault_key = ctx.accounts.creator_vault.key();
        let bump_seed = [splitter_bump];
        let splitter_seeds: [&[u8]; 3] = [
            b"splitter-authority",
            creator_vault_key.as_ref(),
            &bump_seed,
        ];
        let signer_seeds = [&splitter_seeds[..]];
        let transfer_accounts = creator_vault::cpi::accounts::TransferFeesForSplitter {
            creator_vault: ctx.accounts.creator_vault.to_account_info(),
            splitter_authority: ctx.accounts.splitter_authority.to_account_info(),
            fee_vault: ctx.accounts.fee_vault.to_account_info(),
            destination: ctx.accounts.user_quote_ata.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.creator_vault_program.to_account_info(),
            transfer_accounts,
            &signer_seeds,
        );
        creator_vault::cpi::transfer_fees_for_splitter(cpi_ctx, claimable)?;

        emit!(YieldRedeemed {
            market: market.key(),
            user: ctx.accounts.user.key(),
            claimed_amount: claimable,
            fee_index: new_fee_index,
            market_delta: delta_for_market,
        });

        Ok(())
    }

    pub fn redeem_principal(ctx: Context<RedeemPrincipal>, amount: u64) -> Result<()> {
        require!(amount > 0, SplitterError::InvalidAmount);
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= ctx.accounts.market.maturity_ts,
            SplitterError::MarketNotMatured
        );
        require!(
            ctx.accounts.user_pt_ata.amount >= amount,
            SplitterError::InsufficientPtBalance
        );
        require_keys_eq!(ctx.accounts.market.pt_mint, ctx.accounts.pt_mint.key());
        require_keys_eq!(ctx.accounts.market.sy_mint, ctx.accounts.sy_mint.key());

        let burn_accounts = Burn {
            mint: ctx.accounts.pt_mint.to_account_info(),
            from: ctx.accounts.user_pt_ata.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), burn_accounts);
        token::burn(cpi_ctx, amount)?;

        let splitter_bump = ctx.bumps.splitter_authority;
        let creator_vault_key = ctx.accounts.creator_vault.key();
        let bump_seed = [splitter_bump];
        let splitter_seeds: [&[u8]; 3] = [
            b"splitter-authority",
            creator_vault_key.as_ref(),
            &bump_seed,
        ];
        let signer_seeds = [&splitter_seeds[..]];
        msg!("splitter: minting SY via CreatorVault");
        mint_via_creator_vault(
            ctx.accounts.creator_vault_program.to_account_info(),
            ctx.accounts.creator_vault.to_account_info(),
            ctx.accounts.splitter_authority.to_account_info(),
            ctx.accounts.sy_mint.to_account_info(),
            ctx.accounts.user_sy_ata.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            amount,
            &signer_seeds,
        )?;

        let market = &mut ctx.accounts.market;
        market.total_pt_issued = market
            .total_pt_issued
            .checked_sub(amount)
            .ok_or(SplitterError::MathOverflow)?;

        emit!(PrincipalRedeemed {
            market: market.key(),
            user: ctx.accounts.user.key(),
            amount,
        });

        Ok(())
    }

    pub fn close_market(ctx: Context<CloseMarket>) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.market.creator_vault,
            ctx.accounts.creator_vault.key()
        );
        require_keys_eq!(
            ctx.accounts.creator_vault.authority,
            ctx.accounts.authority.key()
        );
        require!(
            ctx.accounts.market.total_pt_issued == 0,
            SplitterError::OutstandingPrincipal
        );
        require!(
            ctx.accounts.pt_mint.supply == 0,
            SplitterError::OutstandingPrincipal
        );

        ctx.accounts.market.is_closed = true;

        emit!(MarketClosed {
            market: ctx.accounts.market.key(),
            authority: ctx.accounts.authority.key(),
        });

        Ok(())
    }
}

fn mint_via_creator_vault<'info>(
    program: AccountInfo<'info>,
    creator_vault: AccountInfo<'info>,
    splitter_authority: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    destination: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let ix = creator_vault::instruction::MintForSplitter { amount };
    let instruction = Instruction {
        program_id: *program.key,
        accounts: vec![
            AccountMeta::new(*creator_vault.key, false),
            AccountMeta::new_readonly(*splitter_authority.key, true),
            AccountMeta::new(*mint.key, false),
            AccountMeta::new(*destination.key, false),
            AccountMeta::new_readonly(*token_program.key, false),
        ],
        data: ix.data(),
    };
    let account_infos = [
        creator_vault,
        splitter_authority,
        mint,
        destination,
        token_program,
        program,
    ];
    invoke_signed(&instruction, &account_infos, signer_seeds)?;
    Ok(())
}

#[derive(Accounts)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(has_one = pump_mint, has_one = sy_mint)]
    pub creator_vault: Account<'info, CreatorVault>,
    #[account(
        init,
        payer = authority,
        seeds = [b"splitter-authority", creator_vault.key().as_ref()],
        bump,
        space = 8 + SplitterAuthority::INIT_SPACE
    )]
    pub splitter_authority: Account<'info, SplitterAuthority>,
    pub pump_mint: Account<'info, Mint>,
    pub sy_mint: Account<'info, Mint>,
    #[account(init, payer = authority, space = 8 + Market::INIT_SPACE)]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = authority,
        mint::decimals = sy_mint.decimals,
        mint::authority = creator_vault,
    )]
    pub pt_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        mint::decimals = sy_mint.decimals,
        mint::authority = creator_vault,
    )]
    pub yt_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct MintPtYt<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub creator_vault: Account<'info, CreatorVault>,
    #[account(
        seeds = [b"splitter-authority", creator_vault.key().as_ref()],
        bump
    )]
    pub splitter_authority: Account<'info, SplitterAuthority>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, constraint = user_sy_ata.owner == user.key(), constraint = user_sy_ata.mint == market.sy_mint)]
    pub user_sy_ata: Account<'info, TokenAccount>,
    #[account(mut, constraint = user_pt_ata.owner == user.key(), constraint = user_pt_ata.mint == market.pt_mint)]
    pub user_pt_ata: Account<'info, TokenAccount>,
    #[account(mut, constraint = user_yt_ata.owner == user.key(), constraint = user_yt_ata.mint == market.yt_mint)]
    pub user_yt_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub sy_mint: Account<'info, Mint>,
    #[account(mut)]
    pub pt_mint: Account<'info, Mint>,
    #[account(mut)]
    pub yt_mint: Account<'info, Mint>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [b"user-position", market.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub creator_vault_program: Program<'info, creator_vault::program::CreatorVault>,
}

#[derive(Accounts)]
pub struct RedeemYield<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub creator_vault: Account<'info, CreatorVault>,
    #[account(
        seeds = [b"splitter-authority", creator_vault.key().as_ref()],
        bump
    )]
    pub splitter_authority: Account<'info, SplitterAuthority>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [b"user-position", market.key().as_ref(), user.key().as_ref()],
        bump = user_position.bump
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(mut, constraint = user_yt_ata.owner == user.key(), constraint = user_yt_ata.mint == market.yt_mint)]
    pub user_yt_ata: Account<'info, TokenAccount>,
    #[account(mut)]
    pub fee_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = user_quote_ata.owner == user.key(), constraint = user_quote_ata.mint == fee_vault.mint)]
    pub user_quote_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub creator_vault_program: Program<'info, creator_vault::program::CreatorVault>,
}

#[derive(Accounts)]
pub struct RedeemPrincipal<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut)]
    pub creator_vault: Account<'info, CreatorVault>,
    #[account(
        seeds = [b"splitter-authority", creator_vault.key().as_ref()],
        bump
    )]
    pub splitter_authority: Account<'info, SplitterAuthority>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, constraint = user_pt_ata.owner == user.key(), constraint = user_pt_ata.mint == market.pt_mint)]
    pub user_pt_ata: Account<'info, TokenAccount>,
    #[account(mut, constraint = user_sy_ata.owner == user.key(), constraint = user_sy_ata.mint == market.sy_mint)]
    pub user_sy_ata: Account<'info, TokenAccount>,
    #[account(mut, constraint = pt_mint.key() == market.pt_mint)]
    pub pt_mint: Account<'info, Mint>,
    #[account(mut, constraint = sy_mint.key() == market.sy_mint)]
    pub sy_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub creator_vault_program: Program<'info, creator_vault::program::CreatorVault>,
}

#[derive(Accounts)]
pub struct CloseMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub creator_vault: Account<'info, CreatorVault>,
    #[account(mut, close = authority, has_one = creator_vault)]
    pub market: Account<'info, Market>,
    #[account(mut, constraint = pt_mint.key() == market.pt_mint)]
    pub pt_mint: Account<'info, Mint>,
    #[account(mut, constraint = yt_mint.key() == market.yt_mint)]
    pub yt_mint: Account<'info, Mint>,
}

#[account]
pub struct SplitterAuthority {
    pub bump: u8,
}

impl SplitterAuthority {
    pub const INIT_SPACE: usize = 1;
}

#[account]
pub struct Market {
    pub creator_vault: Pubkey,
    pub pump_mint: Pubkey,
    pub sy_mint: Pubkey,
    pub pt_mint: Pubkey,
    pub yt_mint: Pubkey,
    pub maturity_ts: i64,
    pub fee_index: u128,
    pub total_pt_issued: u64,
    pub total_yt_issued: u64,
    pub is_closed: bool,
    pub padding: [u8; 7],
}

impl Market {
    pub const INIT_SPACE: usize = 5 * 32 + 8 + 16 + 8 + 8 + 1 + 7;
}

#[account]
pub struct UserPosition {
    pub market: Pubkey,
    pub user: Pubkey,
    pub bump: u8,
    pub last_fee_index: u128,
    pub pending_yield_scaled: u128,
}

impl UserPosition {
    pub const INIT_SPACE: usize = 32 + 32 + 1 + 16 + 16;
}

#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub pump_mint: Pubkey,
    pub maturity_ts: i64,
}

#[event]
pub struct PtYtMinted {
    pub market: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct YieldRedeemed {
    pub market: Pubkey,
    pub user: Pubkey,
    pub claimed_amount: u64,
    pub fee_index: u128,
    pub market_delta: u128,
}

#[event]
pub struct PrincipalRedeemed {
    pub market: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
}

#[event]
pub struct MarketClosed {
    pub market: Pubkey,
    pub authority: Pubkey,
}

#[error_code]
pub enum SplitterError {
    #[msg("Maturity must be positive")]
    InvalidMaturity,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Insufficient SY balance to split")]
    InsufficientSyBalance,
    #[msg("PDA bump missing for position init")]
    MissingBump,
    #[msg("Creator vault not configured for this splitter")]
    SplitterProgramMismatch,
    #[msg("Fee index cannot decrease")]
    FeeIndexRegression,
    #[msg("User has no YT balance")]
    NoYieldPosition,
    #[msg("Insufficient liquidity in fee vault")]
    InsufficientYieldLiquidity,
    #[msg("Fee vault address mismatch")]
    InvalidFeeVault,
    #[msg("Market has not matured")]
    MarketNotMatured,
    #[msg("User has insufficient PT balance")]
    InsufficientPtBalance,
    #[msg("Outstanding principal prevents closing")]
    OutstandingPrincipal,
}
