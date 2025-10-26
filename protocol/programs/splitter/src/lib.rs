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

fn assert_token_program(program_id: &Pubkey) -> Result<()> {
    require_keys_eq!(
        *program_id,
        anchor_spl::token::ID,
        SplitterError::InvalidTokenProgram
    );
    Ok(())
}

#[program]
pub mod splitter {
    use super::*;

    pub fn create_market(ctx: Context<CreateMarket>, maturity_ts: i64) -> Result<()> {
        require!(maturity_ts > 0, SplitterError::InvalidMaturity);
        assert_token_program(ctx.accounts.token_program.key)?;
        require_keys_eq!(
            ctx.accounts.creator_vault.sy_mint,
            ctx.accounts.sy_mint.key()
        );
        require_keys_eq!(
            ctx.accounts.creator_vault.splitter_program,
            crate::ID,
            SplitterError::SplitterProgramMismatch
        );
        require_eq!(
            ctx.accounts.sy_mint.decimals,
            ctx.accounts.pt_mint.decimals,
            SplitterError::MintDecimalsMismatch
        );
        require_eq!(
            ctx.accounts.sy_mint.decimals,
            ctx.accounts.yt_mint.decimals,
            SplitterError::MintDecimalsMismatch
        );

        let creator_vault_key = ctx.accounts.creator_vault.key();
        let (expected_authority, splitter_bump) = Pubkey::find_program_address(
            &[b"splitter-authority", creator_vault_key.as_ref()],
            &crate::ID,
        );
        require_keys_eq!(
            expected_authority,
            ctx.accounts.splitter_authority.key(),
            SplitterError::InvalidSplitterAuthority
        );
        let bumps = &ctx.bumps;
        require_eq!(
            splitter_bump,
            bumps.splitter_authority,
            SplitterError::InvalidSplitterAuthority
        );
        ctx.accounts.splitter_authority.bump = bumps.splitter_authority;

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
        assert_token_program(ctx.accounts.token_program.key)?;
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
        let creator_vault_key = ctx.accounts.creator_vault.key();
        let (expected_authority, _) = Pubkey::find_program_address(
            &[b"splitter-authority", creator_vault_key.as_ref()],
            &crate::ID,
        );
        require_keys_eq!(
            expected_authority,
            ctx.accounts.splitter_authority.key(),
            SplitterError::InvalidSplitterAuthority
        );
        let splitter_bump = ctx.bumps.splitter_authority;
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

        let (expected_position, position_bump) = Pubkey::find_program_address(
            &[
                b"user-position",
                market.key().as_ref(),
                ctx.accounts.user.key().as_ref(),
            ],
            &crate::ID,
        );
        require_keys_eq!(
            expected_position,
            ctx.accounts.user_position.key(),
            SplitterError::InvalidUserPosition
        );

        let position = &mut ctx.accounts.user_position;
        if position.market == Pubkey::default() {
            position.bump = position_bump;
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
        assert_token_program(ctx.accounts.token_program.key)?;
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

        let (claimable, remainder, delta_for_market) = compute_yield_claim(
            market.fee_index,
            position.last_fee_index,
            position.pending_yield_scaled,
            ctx.accounts.user_yt_ata.amount,
            new_fee_index,
        )?;

        market.fee_index = new_fee_index;
        position.pending_yield_scaled = remainder;
        position.last_fee_index = new_fee_index;

        if claimable == 0 {
            return Ok(());
        }

        require!(
            ctx.accounts.fee_vault.amount >= claimable,
            SplitterError::InsufficientYieldLiquidity
        );

        let creator_vault_key = ctx.accounts.creator_vault.key();
        let (expected_authority, _) = Pubkey::find_program_address(
            &[b"splitter-authority", creator_vault_key.as_ref()],
            &crate::ID,
        );
        require_keys_eq!(
            expected_authority,
            ctx.accounts.splitter_authority.key(),
            SplitterError::InvalidSplitterAuthority
        );
        let splitter_bump = ctx.bumps.splitter_authority;
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
        assert_token_program(ctx.accounts.token_program.key)?;
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= ctx.accounts.market.maturity_ts,
            SplitterError::MarketNotMatured
        );
        require!(
            ctx.accounts.user_pt_ata.amount >= amount,
            SplitterError::InsufficientPtBalance
        );
        require!(
            ctx.accounts.user_yt_ata.amount >= amount,
            SplitterError::InsufficientYieldTokens
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

        let yt_burn_accounts = Burn {
            mint: ctx.accounts.yt_mint.to_account_info(),
            from: ctx.accounts.user_yt_ata.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let yt_cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            yt_burn_accounts,
        );
        token::burn(yt_cpi_ctx, amount)?;

        let creator_vault_key = ctx.accounts.creator_vault.key();
        let (expected_authority, _) = Pubkey::find_program_address(
            &[b"splitter-authority", creator_vault_key.as_ref()],
            &crate::ID,
        );
        require_keys_eq!(
            expected_authority,
            ctx.accounts.splitter_authority.key(),
            SplitterError::InvalidSplitterAuthority
        );
        let splitter_bump = ctx.bumps.splitter_authority;
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
        market.total_yt_issued = market
            .total_yt_issued
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
            ctx.accounts.creator_authority.key()
        );
        require_keys_eq!(ctx.accounts.creator_vault.admin, ctx.accounts.admin.key());
        require!(
            ctx.accounts.market.total_pt_issued == 0,
            SplitterError::OutstandingPrincipal
        );
        require!(
            ctx.accounts.pt_mint.supply == 0,
            SplitterError::OutstandingPrincipal
        );
        require_eq!(
            ctx.accounts.market.total_yt_issued,
            ctx.accounts.yt_mint.supply,
            SplitterError::YieldSupplyMismatch
        );
        require_eq!(
            ctx.accounts.market.total_yt_issued,
            0,
            SplitterError::OutstandingYield
        );
        require_eq!(
            ctx.accounts.yt_mint.supply,
            0,
            SplitterError::OutstandingYield
        );

        ctx.accounts.market.is_closed = true;

        emit!(MarketClosed {
            market: ctx.accounts.market.key(),
            authority: ctx.accounts.creator_authority.key(),
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

fn compute_yield_claim(
    current_market_index: u128,
    position_last_index: u128,
    pending_scaled: u128,
    user_yt_balance: u64,
    new_fee_index: u128,
) -> Result<(u64, u128, u128)> {
    let delta_for_market = new_fee_index
        .checked_sub(current_market_index)
        .ok_or(SplitterError::MathOverflow)?;

    let delta = new_fee_index
        .checked_sub(position_last_index)
        .ok_or(SplitterError::MathOverflow)?;

    if delta == 0 && pending_scaled == 0 {
        return Ok((0, 0, delta_for_market));
    }

    let user_balance = user_yt_balance as u128;
    let accrued_scaled = delta
        .checked_mul(user_balance)
        .ok_or(SplitterError::MathOverflow)?;

    let total_scaled = accrued_scaled
        .checked_add(pending_scaled)
        .ok_or(SplitterError::MathOverflow)?;

    let claimable = (total_scaled / FEE_INDEX_SCALE) as u64;
    let remainder = total_scaled % FEE_INDEX_SCALE;

    Ok((claimable, remainder, delta_for_market))
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
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct MintPtYt<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        constraint = creator_vault.sy_mint == market.sy_mint,
        constraint = creator_vault.splitter_program == crate::ID,
        constraint = creator_vault.key() == market.creator_vault
    )]
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
    #[account(mut, constraint = sy_mint.key() == market.sy_mint)]
    pub sy_mint: Account<'info, Mint>,
    #[account(mut, constraint = pt_mint.key() == market.pt_mint)]
    pub pt_mint: Account<'info, Mint>,
    #[account(mut, constraint = yt_mint.key() == market.yt_mint)]
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
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    pub creator_vault_program: Program<'info, creator_vault::program::CreatorVault>,
}

#[derive(Accounts)]
pub struct RedeemYield<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(mut, constraint = creator_vault.key() == market.creator_vault)]
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
        bump
    )]
    pub user_position: Account<'info, UserPosition>,
    #[account(mut, constraint = user_yt_ata.owner == user.key(), constraint = user_yt_ata.mint == market.yt_mint)]
    pub user_yt_ata: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"fee-vault", creator_vault.pump_mint.as_ref()],
        bump = creator_vault.fee_vault_bump,
        constraint = fee_vault.mint == creator_vault.quote_mint,
        constraint = fee_vault.owner == creator_vault.key()
    )]
    pub fee_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = user_quote_ata.owner == user.key(), constraint = user_quote_ata.mint == fee_vault.mint)]
    pub user_quote_ata: Account<'info, TokenAccount>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    pub creator_vault_program: Program<'info, creator_vault::program::CreatorVault>,
}

#[derive(Accounts)]
pub struct RedeemPrincipal<'info> {
    #[account(mut)]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        constraint = creator_vault.sy_mint == market.sy_mint,
        constraint = creator_vault.splitter_program == crate::ID,
        constraint = creator_vault.key() == market.creator_vault
    )]
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
    #[account(mut, constraint = user_yt_ata.owner == user.key(), constraint = user_yt_ata.mint == market.yt_mint)]
    pub user_yt_ata: Account<'info, TokenAccount>,
    #[account(mut, constraint = yt_mint.key() == market.yt_mint)]
    pub yt_mint: Account<'info, Mint>,
    #[account(address = anchor_spl::token::ID)]
    pub token_program: Program<'info, Token>,
    pub creator_vault_program: Program<'info, creator_vault::program::CreatorVault>,
}

#[derive(Accounts)]
pub struct CloseMarket<'info> {
    #[account(mut)]
    pub creator_authority: Signer<'info>,
    pub admin: Signer<'info>,
    #[account(
        constraint = creator_vault.authority == creator_authority.key(),
        constraint = creator_vault.admin == admin.key()
    )]
    pub creator_vault: Account<'info, CreatorVault>,
    #[account(mut, close = creator_authority, has_one = creator_vault)]
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
    #[msg("Creator vault not configured for this splitter")]
    SplitterProgramMismatch,
    #[msg("Splitter authority PDA mismatch")]
    InvalidSplitterAuthority,
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
    #[msg("User has insufficient YT balance")]
    InsufficientYieldTokens,
    #[msg("Outstanding principal prevents closing")]
    OutstandingPrincipal,
    #[msg("Outstanding yield prevents closing")]
    OutstandingYield,
    #[msg("User position PDA mismatch")]
    InvalidUserPosition,
    #[msg("Token program must match the SPL Token program")]
    InvalidTokenProgram,
    #[msg("Mint decimals must be aligned")]
    MintDecimalsMismatch,
    #[msg("Yield token supply accounting mismatch")]
    YieldSupplyMismatch,
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn compute_yield_claim_returns_zero_when_no_delta() {
        let result = compute_yield_claim(10, 10, 0, 42, 10).unwrap();
        assert_eq!(result, (0, 0, 0));
    }

    #[test]
    fn compute_yield_claim_handles_pending_remainder() {
        let delta = FEE_INDEX_SCALE + (FEE_INDEX_SCALE / 2);
        let pending = FEE_INDEX_SCALE / 2;
        let result =
            compute_yield_claim(0, 0, pending, 1, delta).expect("calculation should succeed");
        assert_eq!(result.0, 2);
        assert_eq!(result.1, 0);
        assert_eq!(result.2, delta);
    }

    #[test]
    fn compute_yield_claim_overflow_propagates_error() {
        let result = compute_yield_claim(0, 0, 0, 2, u128::MAX);
        assert!(matches!(result, Err(e) if e == SplitterError::MathOverflow.into()));
    }

    proptest! {
        #[test]
        fn compute_yield_claim_conserves_scaled_value(
            base_index in 0u128..1_000_000,
            delta in 0u128..1_000_000,
            lag in 0u128..1_000_000,
            pending in 0u128..1_000_000,
            user_balance in 0u64..1_000_000,
        ) {
            prop_assume!(lag <= base_index);
            let current_market_index = base_index;
            let position_last_index = base_index - lag;
            let new_fee_index = base_index
                .checked_add(delta)
                .expect("bounded above to avoid overflow");

            let (claimable, remainder, delta_for_market) = compute_yield_claim(
                current_market_index,
                position_last_index,
                pending,
                user_balance,
                new_fee_index,
            )
            .expect("bounded inputs should not overflow");

            prop_assert_eq!(delta_for_market, delta);
            let total_scaled = pending
                .checked_add((new_fee_index - position_last_index) * u128::from(user_balance))
                .unwrap();
            prop_assert_eq!(
                total_scaled,
                u128::from(claimable) * FEE_INDEX_SCALE + remainder
            );
            prop_assert!(remainder < FEE_INDEX_SCALE);
        }
    }

    proptest! {
        #[test]
        fn compute_yield_claim_is_idempotent_when_recalled(
            base_index in 0u128..1_000_000,
            delta in 0u128..1_000_000,
            user_balance in 0u64..1_000_000,
        ) {
            let new_fee_index = base_index
                .checked_add(delta)
                .expect("bounded above to avoid overflow");
            let mut position_last_index = base_index;
            let mut pending = 0u128;

            let (_first_claim, first_remainder, _) = compute_yield_claim(
                base_index,
                position_last_index,
                pending,
                user_balance,
                new_fee_index,
            )
            .expect("bounded inputs should not overflow");

            position_last_index = new_fee_index;
            pending = first_remainder;
            let (second_claim, second_remainder, _) = compute_yield_claim(
                new_fee_index,
                position_last_index,
                pending,
                user_balance,
                new_fee_index,
            )
            .expect("idempotent call should succeed");

            prop_assert_eq!(second_claim, 0);
            prop_assert_eq!(second_remainder, pending);
        }
    }
}
