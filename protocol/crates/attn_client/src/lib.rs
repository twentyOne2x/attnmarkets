use anchor_client::Program;
use anchor_lang::{AnchorDeserialize, AnchorSerialize, InstructionData, ToAccountMetas};
use anyhow::{bail, Result};
use solana_sdk::instruction::Instruction;
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::Keypair;
use solana_sdk::signature::Signer;
use std::ops::Deref;

pub struct AttnClient<C>
where
    C: Deref + Clone,
    C::Target: Signer + Sized,
{
    program: Program<C>,
}

fn decode_account<T: AnchorDeserialize>(data: &[u8]) -> Result<T> {
    if data.len() < 8 {
        bail!("account data too short");
    }
    let mut slice: &[u8] = &data[8..];
    T::deserialize(&mut slice).map_err(|err| err.into())
}

impl<C> AttnClient<C>
where
    C: Deref + Clone,
    C::Target: Signer + Sized,
{
    pub fn new(program: Program<C>) -> Self {
        Self { program }
    }

    pub fn payer(&self) -> Pubkey {
        self.program.payer()
    }

    pub fn program(&self) -> &Program<C> {
        &self.program
    }

    pub fn stable_vault(&self) -> stable::StableVaultClient<'_, C> {
        stable::StableVaultClient::new(&self.program)
    }

    pub fn rewards_vault(&self) -> rewards::RewardsVaultClient<'_, C> {
        rewards::RewardsVaultClient::new(&self.program)
    }
}

pub mod stable {
    use super::*;
    use anchor_spl::token;
    use solana_sdk::pubkey::Pubkey;
    use solana_sdk::{signature::Signer, system_program, sysvar};
    use stable_vault::accounts as stable_accounts;
    use stable_vault::instruction as stable_ix;

    #[derive(Debug, Clone)]
    pub struct StableVaultPdas {
        pub stable_vault: Pubkey,
        pub treasury: Pubkey,
        pub share_mint: Pubkey,
        pub sol_vault: Pubkey,
    }

    pub fn stable_vault_pda(authority: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"stable-vault", authority.as_ref()], &stable_vault::ID)
    }

    pub fn share_mint_pda(stable_vault: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"share-mint", stable_vault.as_ref()], &stable_vault::ID)
    }

    pub fn treasury_pda(stable_vault: &Pubkey, stable_mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[
                b"stable-treasury",
                stable_vault.as_ref(),
                stable_mint.as_ref(),
            ],
            &stable_vault::ID,
        )
    }

    pub fn sol_vault_pda(stable_vault: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"sol-vault", stable_vault.as_ref()], &stable_vault::ID)
    }

    pub fn derive_pdas(authority: &Pubkey, stable_mint: &Pubkey) -> StableVaultPdas {
        let (stable_vault, _) = stable_vault_pda(authority);
        let (treasury, _) = treasury_pda(&stable_vault, stable_mint);
        let (share_mint, _) = share_mint_pda(&stable_vault);
        let (sol_vault, _) = sol_vault_pda(&stable_vault);
        StableVaultPdas {
            stable_vault,
            treasury,
            share_mint,
            sol_vault,
        }
    }

    pub fn build_initialize_vault_ix(
        authority: Pubkey,
        stable_mint: Pubkey,
        accepted_mints: Vec<Pubkey>,
        admin: Pubkey,
    ) -> (Instruction, StableVaultPdas) {
        let pdas = derive_pdas(&authority, &stable_mint);
        let accounts = stable_accounts::InitializeStableVault {
            authority,
            stable_mint,
            stable_vault: pdas.stable_vault,
            treasury: pdas.treasury,
            share_mint: pdas.share_mint,
            sol_vault: pdas.sol_vault,
            system_program: system_program::ID,
            token_program: token::ID,
            rent: sysvar::rent::ID,
        };
        let data = stable_ix::InitializeStableVault {
            accepted_mints,
            admin,
        }
        .data();
        let ix = Instruction {
            program_id: stable_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        };
        (ix, pdas)
    }

    pub fn build_deposit_stable_ix(
        pdas: &StableVaultPdas,
        stable_mint: Pubkey,
        user: Pubkey,
        user_stable_ata: Pubkey,
        user_share_ata: Pubkey,
        amount: u64,
    ) -> Instruction {
        let accounts = stable_accounts::DepositStable {
            stable_vault: pdas.stable_vault,
            user,
            stable_mint,
            treasury: pdas.treasury,
            user_stable_ata,
            share_mint: pdas.share_mint,
            user_share_ata,
            token_program: token::ID,
        };
        let data = stable_ix::DepositStable { amount }.data();
        Instruction {
            program_id: stable_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_redeem_attnusd_ix(
        pdas: &StableVaultPdas,
        stable_mint: Pubkey,
        user: Pubkey,
        user_stable_ata: Pubkey,
        user_share_ata: Pubkey,
        shares: u64,
    ) -> Instruction {
        let accounts = stable_accounts::RedeemAttnUsd {
            stable_vault: pdas.stable_vault,
            user,
            stable_mint,
            treasury: pdas.treasury,
            user_stable_ata,
            share_mint: pdas.share_mint,
            user_share_ata,
            token_program: token::ID,
        };
        let data = stable_ix::RedeemAttnusd { shares }.data();
        Instruction {
            program_id: stable_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_sweep_creator_fees_ix(
        pdas: &StableVaultPdas,
        keeper_authority: Pubkey,
        allowed_funder: Pubkey,
        creator_vault: Pubkey,
        rewards_pool: Pubkey,
        rewards_treasury: Pubkey,
        amount: u64,
        operation_id: u64,
    ) -> Instruction {
        let accounts = stable_accounts::SweepCreatorFees {
            stable_vault: pdas.stable_vault,
            keeper_authority,
            allowed_funder,
            creator_vault,
            rewards_pool,
            rewards_treasury,
            sol_vault: pdas.sol_vault,
            rewards_program: rewards_vault::ID,
            system_program: system_program::ID,
        };
        let data = stable_ix::SweepCreatorFees {
            amount,
            operation_id,
        }
        .data();
        Instruction {
            program_id: stable_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_process_conversion_ix(
        pdas: &StableVaultPdas,
        keeper_authority: Pubkey,
        conversion_authority: Pubkey,
        stable_mint: Pubkey,
        conversion_source: Pubkey,
        amount_stable: u64,
        sol_spent: u64,
        operation_id: u64,
    ) -> Instruction {
        let accounts = stable_accounts::ProcessConversion {
            stable_vault: pdas.stable_vault,
            keeper_authority,
            conversion_authority,
            stable_mint,
            treasury: pdas.treasury,
            conversion_source,
            sol_vault: pdas.sol_vault,
            token_program: token::ID,
            system_program: system_program::ID,
        };
        let data = stable_ix::ProcessConversion {
            amount_stable,
            sol_spent,
            operation_id,
        }
        .data();
        Instruction {
            program_id: stable_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub struct StableVaultClient<'a, C>
    where
        C: Deref + Clone,
        C::Target: Signer + Sized,
    {
        program: &'a Program<C>,
    }

    impl<'a, C> StableVaultClient<'a, C>
    where
        C: Deref + Clone,
        C::Target: Signer + Sized,
    {
        pub fn new(program: &'a Program<C>) -> Self {
            Self { program }
        }

        pub fn program(&self) -> &'a Program<C> {
            self.program
        }

        pub fn initialize_vault(
            &self,
            authority: &Keypair,
            stable_mint: Pubkey,
            accepted_mints: Vec<Pubkey>,
            admin: Pubkey,
        ) -> Result<StableVaultPdas> {
            let (ix, pdas) =
                build_initialize_vault_ix(authority.pubkey(), stable_mint, accepted_mints, admin);
            self.program
                .request()
                .instruction(ix)
                .signer(authority)
                .send()?;
            Ok(pdas)
        }

        pub fn deposit_stable(
            &self,
            user: &Keypair,
            pdas: &StableVaultPdas,
            stable_mint: Pubkey,
            user_stable_ata: Pubkey,
            user_share_ata: Pubkey,
            amount: u64,
        ) -> Result<()> {
            let ix = build_deposit_stable_ix(
                pdas,
                stable_mint,
                user.pubkey(),
                user_stable_ata,
                user_share_ata,
                amount,
            );
            self.program.request().instruction(ix).signer(user).send()?;
            Ok(())
        }

        pub fn redeem_attnusd(
            &self,
            user: &Keypair,
            pdas: &StableVaultPdas,
            stable_mint: Pubkey,
            user_stable_ata: Pubkey,
            user_share_ata: Pubkey,
            shares: u64,
        ) -> Result<()> {
            let ix = build_redeem_attnusd_ix(
                pdas,
                stable_mint,
                user.pubkey(),
                user_stable_ata,
                user_share_ata,
                shares,
            );
            self.program.request().instruction(ix).signer(user).send()?;
            Ok(())
        }

        pub fn sweep_creator_fees(
            &self,
            keeper_authority: &Keypair,
            allowed_funder: &Keypair,
            pdas: &StableVaultPdas,
            creator_vault: Pubkey,
            rewards_pool: Pubkey,
            rewards_treasury: Pubkey,
            amount: u64,
            operation_id: u64,
        ) -> Result<()> {
            let ix = build_sweep_creator_fees_ix(
                pdas,
                keeper_authority.pubkey(),
                allowed_funder.pubkey(),
                creator_vault,
                rewards_pool,
                rewards_treasury,
                amount,
                operation_id,
            );
            self.program
                .request()
                .instruction(ix)
                .signer(keeper_authority)
                .signer(allowed_funder)
                .send()?;
            Ok(())
        }

        pub fn process_conversion(
            &self,
            keeper_authority: &Keypair,
            conversion_authority: &Keypair,
            pdas: &StableVaultPdas,
            stable_mint: Pubkey,
            conversion_source: Pubkey,
            amount_stable: u64,
            sol_spent: u64,
            operation_id: u64,
        ) -> Result<()> {
            let ix = build_process_conversion_ix(
                pdas,
                keeper_authority.pubkey(),
                conversion_authority.pubkey(),
                stable_mint,
                conversion_source,
                amount_stable,
                sol_spent,
                operation_id,
            );
            self.program
                .request()
                .instruction(ix)
                .signer(keeper_authority)
                .signer(conversion_authority)
                .send()?;
            Ok(())
        }

        pub fn update_admin(
            &self,
            admin: &Keypair,
            pdas: &StableVaultPdas,
            new_admin: Pubkey,
        ) -> Result<()> {
            let accounts = stable_accounts::UpdateAdmin {
                stable_vault: pdas.stable_vault,
                admin: admin.pubkey(),
            };
            let data = stable_ix::UpdateAdmin { new_admin }.data();
            let ix = Instruction {
                program_id: stable_vault::ID,
                accounts: accounts.to_account_metas(None),
                data,
            };
            self.program
                .request()
                .instruction(ix)
                .signer(admin)
                .send()?;
            Ok(())
        }

        pub fn update_keeper_authority(
            &self,
            authority: &Keypair,
            pdas: &StableVaultPdas,
            new_keeper: Pubkey,
        ) -> Result<()> {
            let accounts = stable_accounts::UpdateKeeperAuthority {
                stable_vault: pdas.stable_vault,
                authority: authority.pubkey(),
            };
            let data = stable_ix::UpdateKeeperAuthority { new_keeper }.data();
            let ix = Instruction {
                program_id: stable_vault::ID,
                accounts: accounts.to_account_metas(None),
                data,
            };
            self.program
                .request()
                .instruction(ix)
                .signer(authority)
                .send()?;
            Ok(())
        }

        pub fn update_emergency_admin(
            &self,
            admin: &Keypair,
            pdas: &StableVaultPdas,
            new_emergency_admin: Option<Pubkey>,
        ) -> Result<()> {
            let accounts = stable_accounts::UpdateEmergencyAdmin {
                stable_vault: pdas.stable_vault,
                admin: admin.pubkey(),
            };
            let data = stable_ix::UpdateEmergencyAdmin {
                new_emergency_admin,
            }
            .data();
            let ix = Instruction {
                program_id: stable_vault::ID,
                accounts: accounts.to_account_metas(None),
                data,
            };
            self.program
                .request()
                .instruction(ix)
                .signer(admin)
                .send()?;
            Ok(())
        }

        pub fn set_pause(
            &self,
            authority: &Keypair,
            pdas: &StableVaultPdas,
            is_paused: bool,
        ) -> Result<()> {
            let accounts = stable_accounts::SetStableVaultPause {
                stable_vault: pdas.stable_vault,
                authority: authority.pubkey(),
            };
            let data = stable_ix::SetPause { is_paused }.data();
            let ix = Instruction {
                program_id: stable_vault::ID,
                accounts: accounts.to_account_metas(None),
                data,
            };
            self.program
                .request()
                .instruction(ix)
                .signer(authority)
                .send()?;
            Ok(())
        }

        pub fn add_accepted_mint(
            &self,
            authority: &Keypair,
            pdas: &StableVaultPdas,
            mint: Pubkey,
        ) -> Result<()> {
            let accounts = stable_accounts::ManageAcceptedMint {
                stable_vault: pdas.stable_vault,
                authority: authority.pubkey(),
            };
            let data = stable_ix::AddAcceptedMint { mint }.data();
            let ix = Instruction {
                program_id: stable_vault::ID,
                accounts: accounts.to_account_metas(None),
                data,
            };
            self.program
                .request()
                .instruction(ix)
                .signer(authority)
                .send()?;
            Ok(())
        }

        pub fn remove_accepted_mint(
            &self,
            authority: &Keypair,
            pdas: &StableVaultPdas,
            mint: Pubkey,
        ) -> Result<()> {
            let accounts = stable_accounts::ManageAcceptedMint {
                stable_vault: pdas.stable_vault,
                authority: authority.pubkey(),
            };
            let data = stable_ix::RemoveAcceptedMint { mint }.data();
            let ix = Instruction {
                program_id: stable_vault::ID,
                accounts: accounts.to_account_metas(None),
                data,
            };
            self.program
                .request()
                .instruction(ix)
                .signer(authority)
                .send()?;
            Ok(())
        }

        pub fn withdraw_sol_dust(
            &self,
            authority: &Keypair,
            pdas: &StableVaultPdas,
            destination: Pubkey,
            amount: u64,
        ) -> Result<()> {
            let accounts = stable_accounts::WithdrawSolDust {
                stable_vault: pdas.stable_vault,
                authority: authority.pubkey(),
                sol_vault: pdas.sol_vault,
                destination,
            };
            let data = stable_ix::WithdrawSolDust { amount }.data();
            let ix = Instruction {
                program_id: stable_vault::ID,
                accounts: accounts.to_account_metas(None),
                data,
            };
            self.program
                .request()
                .instruction(ix)
                .signer(authority)
                .send()?;
            Ok(())
        }
    }
}

pub mod rewards {
    use super::*;
    use anchor_spl::token;
    use rewards_vault::accounts as rewards_accounts;
    use rewards_vault::instruction as rewards_ix;
    use solana_sdk::{signature::Signer, system_program, sysvar};

    #[derive(Debug, Clone)]
    pub struct RewardsVaultPdas {
        pub rewards_pool: Pubkey,
        pub rewards_authority: Pubkey,
        pub s_attn_mint: Pubkey,
        pub attn_vault: Pubkey,
        pub sol_treasury: Pubkey,
    }

    pub fn rewards_pool_pda(creator_vault: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"rewards-pool", creator_vault.as_ref()],
            &rewards_vault::ID,
        )
    }

    pub fn rewards_authority_pda(rewards_pool: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"rewards-authority", rewards_pool.as_ref()],
            &rewards_vault::ID,
        )
    }

    pub fn s_attn_mint_pda(rewards_pool: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"s-attn-mint", rewards_pool.as_ref()], &rewards_vault::ID)
    }

    pub fn attn_vault_pda(rewards_pool: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"attn-vault", rewards_pool.as_ref()], &rewards_vault::ID)
    }

    pub fn sol_treasury_pda(rewards_pool: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"sol-treasury", rewards_pool.as_ref()],
            &rewards_vault::ID,
        )
    }

    pub fn stake_position_pda(rewards_pool: &Pubkey, staker: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"stake-position", rewards_pool.as_ref(), staker.as_ref()],
            &rewards_vault::ID,
        )
    }

    pub fn derive_pdas(creator_vault: &Pubkey) -> RewardsVaultPdas {
        let (rewards_pool, _) = rewards_pool_pda(creator_vault);
        let (rewards_authority, _) = rewards_authority_pda(&rewards_pool);
        let (s_attn_mint, _) = s_attn_mint_pda(&rewards_pool);
        let (attn_vault, _) = attn_vault_pda(&rewards_pool);
        let (sol_treasury, _) = sol_treasury_pda(&rewards_pool);
        RewardsVaultPdas {
            rewards_pool,
            rewards_authority,
            s_attn_mint,
            attn_vault,
            sol_treasury,
        }
    }

    pub fn build_initialize_pool_ix(
        payer: Pubkey,
        admin: Pubkey,
        creator_vault: Pubkey,
        attn_mint: Pubkey,
        reward_bps: u16,
        allowed_funder: Pubkey,
        pdas: &RewardsVaultPdas,
    ) -> Instruction {
        let accounts = rewards_accounts::InitializePool {
            payer,
            admin,
            creator_vault,
            attn_mint,
            rewards_pool: pdas.rewards_pool,
            rewards_authority: pdas.rewards_authority,
            s_attn_mint: pdas.s_attn_mint,
            attn_vault: pdas.attn_vault,
            sol_treasury: pdas.sol_treasury,
            token_program: token::ID,
            system_program: system_program::ID,
            rent: sysvar::rent::ID,
        };
        let data = rewards_ix::InitializePool {
            reward_bps,
            allowed_funder,
        }
        .data();
        Instruction {
            program_id: rewards_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_stake_attnusd_ix(
        rewards_pool: Pubkey,
        rewards_authority: Pubkey,
        staker: Pubkey,
        user_attn_ata: Pubkey,
        user_s_attn_ata: Pubkey,
        attn_vault: Pubkey,
        attn_mint: Pubkey,
        s_attn_mint: Pubkey,
        stake_position: Pubkey,
        sol_treasury: Pubkey,
        amount: u64,
    ) -> Instruction {
        let accounts = rewards_accounts::StakeAttnUsd {
            rewards_pool,
            rewards_authority,
            staker,
            user_attn_ata,
            user_s_attn_ata,
            attn_vault,
            attn_mint,
            s_attn_mint,
            stake_position,
            sol_treasury,
            token_program: token::ID,
            system_program: system_program::ID,
        };
        let data = rewards_ix::StakeAttnusd { amount }.data();
        Instruction {
            program_id: rewards_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_fund_rewards_ix(
        creator_vault: Pubkey,
        rewards_pool: Pubkey,
        allowed_funder: Pubkey,
        sol_treasury: Pubkey,
        amount: u64,
        operation_id: u64,
    ) -> Instruction {
        let accounts = rewards_accounts::FundRewards {
            creator_vault,
            rewards_pool,
            allowed_funder,
            sol_treasury,
            system_program: system_program::ID,
        };
        let data = rewards_ix::FundRewards {
            amount,
            operation_id,
        }
        .data();
        Instruction {
            program_id: rewards_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_unstake_attnusd_ix(
        rewards_pool: Pubkey,
        rewards_authority: Pubkey,
        staker: Pubkey,
        user_attn_ata: Pubkey,
        user_s_attn_ata: Pubkey,
        attn_vault: Pubkey,
        attn_mint: Pubkey,
        s_attn_mint: Pubkey,
        stake_position: Pubkey,
        sol_treasury: Pubkey,
        amount: u64,
    ) -> Instruction {
        let accounts = rewards_accounts::UnstakeAttnUsd {
            rewards_pool,
            rewards_authority,
            staker,
            user_attn_ata,
            user_s_attn_ata,
            attn_vault,
            attn_mint,
            s_attn_mint,
            stake_position,
            sol_treasury,
            token_program: token::ID,
            system_program: system_program::ID,
        };
        let data = rewards_ix::UnstakeAttnusd { amount }.data();
        Instruction {
            program_id: rewards_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_claim_rewards_ix(
        rewards_pool: Pubkey,
        staker: Pubkey,
        stake_position: Pubkey,
        sol_treasury: Pubkey,
    ) -> Instruction {
        let accounts = rewards_accounts::ClaimRewards {
            rewards_pool,
            staker,
            stake_position,
            sol_treasury,
            system_program: system_program::ID,
        };
        let data = rewards_ix::ClaimRewards {}.data();
        Instruction {
            program_id: rewards_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_update_allowed_funder_ix(
        rewards_pool: Pubkey,
        admin: Pubkey,
        new_allowed_funder: Pubkey,
    ) -> Instruction {
        let accounts = rewards_accounts::UpdateAllowedFunder {
            rewards_pool,
            admin,
        };
        let data = rewards_ix::UpdateAllowedFunder { new_allowed_funder }.data();
        Instruction {
            program_id: rewards_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_update_reward_bps_ix(
        rewards_pool: Pubkey,
        admin: Pubkey,
        reward_bps: u16,
    ) -> Instruction {
        let accounts = rewards_accounts::UpdateRewardBps {
            rewards_pool,
            admin,
        };
        let data = rewards_ix::UpdateRewardBps {
            new_reward_bps: reward_bps,
        }
        .data();
        Instruction {
            program_id: rewards_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_update_admin_ix(
        rewards_pool: Pubkey,
        admin: Pubkey,
        new_admin: Pubkey,
    ) -> Instruction {
        let accounts = rewards_accounts::UpdateAdmin {
            rewards_pool,
            admin,
        };
        let data = rewards_ix::UpdateAdmin { new_admin }.data();
        Instruction {
            program_id: rewards_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_set_pause_ix(rewards_pool: Pubkey, admin: Pubkey, paused: bool) -> Instruction {
        let accounts = rewards_accounts::SetPause {
            rewards_pool,
            admin,
        };
        let data = rewards_ix::SetPause { paused }.data();
        Instruction {
            program_id: rewards_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub struct RewardsVaultClient<'a, C>
    where
        C: Deref + Clone,
        C::Target: Signer + Sized,
    {
        program: &'a Program<C>,
    }

    impl<'a, C> RewardsVaultClient<'a, C>
    where
        C: Deref + Clone,
        C::Target: Signer + Sized,
    {
        pub fn new(program: &'a Program<C>) -> Self {
            Self { program }
        }

        pub fn program(&self) -> &'a Program<C> {
            self.program
        }

        pub fn initialize_pool(
            &self,
            payer: &Keypair,
            admin: &Keypair,
            creator_vault: Pubkey,
            attn_mint: Pubkey,
            reward_bps: u16,
            allowed_funder: Pubkey,
        ) -> Result<RewardsVaultPdas> {
            let pdas = derive_pdas(&creator_vault);
            let ix = build_initialize_pool_ix(
                payer.pubkey(),
                admin.pubkey(),
                creator_vault,
                attn_mint,
                reward_bps,
                allowed_funder,
                &pdas,
            );
            self.program
                .request()
                .instruction(ix)
                .signer(payer)
                .signer(admin)
                .send()?;
            Ok(pdas)
        }

        pub fn stake_attnusd(
            &self,
            staker: &Keypair,
            pdas: &RewardsVaultPdas,
            attn_mint: Pubkey,
            user_attn_ata: Pubkey,
            user_s_attn_ata: Pubkey,
            stake_position: Pubkey,
            amount: u64,
        ) -> Result<()> {
            let ix = build_stake_attnusd_ix(
                pdas.rewards_pool,
                pdas.rewards_authority,
                staker.pubkey(),
                user_attn_ata,
                user_s_attn_ata,
                pdas.attn_vault,
                attn_mint,
                pdas.s_attn_mint,
                stake_position,
                pdas.sol_treasury,
                amount,
            );
            self.program
                .request()
                .instruction(ix)
                .signer(staker)
                .send()?;
            Ok(())
        }

        pub fn unstake_attnusd(
            &self,
            staker: &Keypair,
            pdas: &RewardsVaultPdas,
            attn_mint: Pubkey,
            user_attn_ata: Pubkey,
            user_s_attn_ata: Pubkey,
            stake_position: Pubkey,
            amount: u64,
        ) -> Result<()> {
            let ix = build_unstake_attnusd_ix(
                pdas.rewards_pool,
                pdas.rewards_authority,
                staker.pubkey(),
                user_attn_ata,
                user_s_attn_ata,
                pdas.attn_vault,
                attn_mint,
                pdas.s_attn_mint,
                stake_position,
                pdas.sol_treasury,
                amount,
            );
            self.program
                .request()
                .instruction(ix)
                .signer(staker)
                .send()?;
            Ok(())
        }

        pub fn claim_rewards(
            &self,
            staker: &Keypair,
            pdas: &RewardsVaultPdas,
            stake_position: Pubkey,
        ) -> Result<()> {
            let ix = build_claim_rewards_ix(
                pdas.rewards_pool,
                staker.pubkey(),
                stake_position,
                pdas.sol_treasury,
            );
            self.program
                .request()
                .instruction(ix)
                .signer(staker)
                .send()?;
            Ok(())
        }

        pub fn fund_rewards(
            &self,
            creator_vault: Pubkey,
            pdas: &RewardsVaultPdas,
            allowed_funder: &Keypair,
            amount: u64,
            operation_id: u64,
        ) -> Result<()> {
            let ix = build_fund_rewards_ix(
                creator_vault,
                pdas.rewards_pool,
                allowed_funder.pubkey(),
                pdas.sol_treasury,
                amount,
                operation_id,
            );
            self.program
                .request()
                .instruction(ix)
                .signer(allowed_funder)
                .send()?;
            Ok(())
        }

        pub fn update_allowed_funder(
            &self,
            admin: &Keypair,
            pdas: &RewardsVaultPdas,
            new_allowed_funder: Pubkey,
        ) -> Result<()> {
            let ix = build_update_allowed_funder_ix(
                pdas.rewards_pool,
                admin.pubkey(),
                new_allowed_funder,
            );
            self.program
                .request()
                .instruction(ix)
                .signer(admin)
                .send()?;
            Ok(())
        }

        pub fn update_reward_bps(
            &self,
            admin: &Keypair,
            pdas: &RewardsVaultPdas,
            reward_bps: u16,
        ) -> Result<()> {
            let ix = build_update_reward_bps_ix(pdas.rewards_pool, admin.pubkey(), reward_bps);
            self.program
                .request()
                .instruction(ix)
                .signer(admin)
                .send()?;
            Ok(())
        }

        pub fn update_admin(
            &self,
            admin: &Keypair,
            pdas: &RewardsVaultPdas,
            new_admin: Pubkey,
        ) -> Result<()> {
            let ix = build_update_admin_ix(pdas.rewards_pool, admin.pubkey(), new_admin);
            self.program
                .request()
                .instruction(ix)
                .signer(admin)
                .send()?;
            Ok(())
        }

        pub fn set_pause(
            &self,
            admin: &Keypair,
            pdas: &RewardsVaultPdas,
            paused: bool,
        ) -> Result<()> {
            let ix = build_set_pause_ix(pdas.rewards_pool, admin.pubkey(), paused);
            self.program
                .request()
                .instruction(ix)
                .signer(admin)
                .send()?;
            Ok(())
        }
    }
}

pub mod creator {
    use super::*;
    use anchor_lang::prelude::borsh;
    use anchor_spl::token;
    use creator_vault::accounts as creator_accounts;
    use creator_vault::instruction as creator_ix;
    use solana_sdk::{system_program, sysvar};

    #[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
    pub struct CreatorVaultAccount {
        pub bump: u8,
        pub fee_vault_bump: u8,
        pub sy_mint_bump: u8,
        pub authority: Pubkey,
        pub pump_creator: Pubkey,
        pub pump_mint: Pubkey,
        pub quote_mint: Pubkey,
        pub sy_mint: Pubkey,
        pub splitter_program: Pubkey,
        pub total_fees_collected: u64,
        pub total_sy_minted: u64,
        pub admin: Pubkey,
        pub sol_rewards_bps: u16,
        pub paused: bool,
        pub padding: [u8; 5],
    }

    #[derive(Debug, Clone)]
    pub struct CreatorVaultPdas {
        pub creator_vault: Pubkey,
        pub fee_vault: Pubkey,
        pub sy_mint: Pubkey,
    }

    pub fn creator_vault_pda(pump_mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"creator-vault", pump_mint.as_ref()], &creator_vault::ID)
    }

    pub fn fee_vault_pda(pump_mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"fee-vault", pump_mint.as_ref()], &creator_vault::ID)
    }

    pub fn sy_mint_pda(pump_mint: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(&[b"sy-mint", pump_mint.as_ref()], &creator_vault::ID)
    }

    pub fn derive_pdas(pump_mint: &Pubkey) -> CreatorVaultPdas {
        let (creator_vault, _) = creator_vault_pda(pump_mint);
        let (fee_vault, _) = fee_vault_pda(pump_mint);
        let (sy_mint, _) = sy_mint_pda(pump_mint);
        CreatorVaultPdas {
            creator_vault,
            fee_vault,
            sy_mint,
        }
    }

    pub async fn fetch_account<C>(
        program: &Program<C>,
        address: Pubkey,
    ) -> Result<CreatorVaultAccount>
    where
        C: Deref + Clone,
        C::Target: Signer + Sized,
    {
        let account = program.rpc().get_account(&address)?;
        decode_account::<CreatorVaultAccount>(&account.data)
    }

    pub fn build_initialize_vault_ix(
        authority: Pubkey,
        pump_creator: Pubkey,
        pump_mint: Pubkey,
        quote_mint: Pubkey,
        splitter_program: Pubkey,
        admin: Pubkey,
    ) -> (Instruction, CreatorVaultPdas) {
        let pdas = derive_pdas(&pump_mint);
        let accounts = creator_accounts::InitializeVault {
            authority,
            pump_creator,
            pump_mint,
            quote_mint,
            creator_vault: pdas.creator_vault,
            fee_vault: pdas.fee_vault,
            sy_mint: pdas.sy_mint,
            system_program: system_program::ID,
            token_program: token::ID,
            rent: sysvar::rent::ID,
        };
        let data = creator_ix::InitializeVault {
            splitter_program,
            admin,
        }
        .data();
        (
            Instruction {
                program_id: creator_vault::ID,
                accounts: accounts.to_account_metas(None),
                data,
            },
            pdas,
        )
    }

    pub fn build_set_rewards_split_ix(
        creator_vault: Pubkey,
        admin: Pubkey,
        sol_rewards_bps: u16,
    ) -> Instruction {
        let accounts = creator_accounts::SetRewardsSplit {
            creator_vault,
            admin,
        };
        let data = creator_ix::SetRewardsSplit { sol_rewards_bps }.data();
        Instruction {
            program_id: creator_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_update_admin_ix(
        creator_vault: Pubkey,
        admin: Pubkey,
        new_admin: Pubkey,
    ) -> Instruction {
        let accounts = creator_accounts::UpdateAdmin {
            creator_vault,
            admin,
        };
        let data = creator_ix::UpdateAdmin { new_admin }.data();
        Instruction {
            program_id: creator_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_set_pause_ix(creator_vault: Pubkey, admin: Pubkey, paused: bool) -> Instruction {
        let accounts = creator_accounts::SetPause {
            creator_vault,
            admin,
        };
        let data = creator_ix::SetPause { paused }.data();
        Instruction {
            program_id: creator_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_wrap_fees_ix(
        pump_mint: Pubkey,
        quote_mint: Pubkey,
        user: Pubkey,
        user_quote_ata: Pubkey,
        user_sy_ata: Pubkey,
        amount: u64,
    ) -> Instruction {
        let pdas = derive_pdas(&pump_mint);
        let accounts = creator_accounts::WrapFees {
            creator_vault: pdas.creator_vault,
            user,
            pump_mint,
            quote_mint,
            fee_vault: pdas.fee_vault,
            user_quote_ata,
            sy_mint: pdas.sy_mint,
            user_sy_ata,
            token_program: token::ID,
        };
        let data = creator_ix::WrapFees { amount }.data();
        Instruction {
            program_id: creator_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }
}

pub mod splitter {
    use super::*;
    use ::splitter::accounts as splitter_accounts;
    use ::splitter::instruction as splitter_ix;
    use anchor_lang::prelude::borsh;
    use anchor_spl::token;
    use solana_sdk::system_program;

    #[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
    pub struct MarketAccount {
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

    #[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
    pub struct UserPositionAccount {
        pub bump: u8,
        pub market: Pubkey,
        pub user: Pubkey,
        pub last_fee_index: u128,
        pub pending_yield_scaled: u128,
    }

    #[derive(Debug, Clone, AnchorSerialize, AnchorDeserialize)]
    pub struct MintPtYtPdas {
        pub splitter_authority: Pubkey,
        pub user_position: Pubkey,
    }

    pub fn splitter_authority_pda(creator_vault: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"splitter-authority", creator_vault.as_ref()],
            &::splitter::ID,
        )
    }

    pub fn user_position_pda(market: &Pubkey, user: &Pubkey) -> (Pubkey, u8) {
        Pubkey::find_program_address(
            &[b"user-position", market.as_ref(), user.as_ref()],
            &::splitter::ID,
        )
    }

    pub async fn fetch_market<C>(program: &Program<C>, address: Pubkey) -> Result<MarketAccount>
    where
        C: Deref + Clone,
        C::Target: Signer + Sized,
    {
        let account = program.rpc().get_account(&address)?;
        decode_account::<MarketAccount>(&account.data)
    }

    pub fn build_mint_pt_yt_ix(
        market: Pubkey,
        creator_vault: Pubkey,
        user: Pubkey,
        sy_mint: Pubkey,
        pt_mint: Pubkey,
        yt_mint: Pubkey,
        user_sy_ata: Pubkey,
        user_pt_ata: Pubkey,
        user_yt_ata: Pubkey,
        amount: u64,
    ) -> (Instruction, MintPtYtPdas) {
        let (splitter_authority, _) = splitter_authority_pda(&creator_vault);
        let (user_position, _) = user_position_pda(&market, &user);
        let accounts = splitter_accounts::MintPtYt {
            market,
            creator_vault,
            splitter_authority,
            user,
            user_sy_ata,
            user_pt_ata,
            user_yt_ata,
            sy_mint,
            pt_mint,
            yt_mint,
            user_position,
            system_program: system_program::ID,
            token_program: token::ID,
            creator_vault_program: creator_vault::ID,
        };
        let data = splitter_ix::MintPtYt { amount }.data();
        (
            Instruction {
                program_id: ::splitter::ID,
                accounts: accounts.to_account_metas(None),
                data,
            },
            MintPtYtPdas {
                splitter_authority,
                user_position,
            },
        )
    }

    pub fn build_redeem_yield_ix(
        market: Pubkey,
        creator_vault: Pubkey,
        user: Pubkey,
        user_position: Pubkey,
        user_yt_ata: Pubkey,
        fee_vault: Pubkey,
        user_quote_ata: Pubkey,
        new_fee_index: u128,
    ) -> Instruction {
        let (splitter_authority, _) = splitter_authority_pda(&creator_vault);
        let accounts = splitter_accounts::RedeemYield {
            market,
            creator_vault,
            splitter_authority,
            user,
            user_position,
            user_yt_ata,
            fee_vault,
            user_quote_ata,
            token_program: token::ID,
            creator_vault_program: creator_vault::ID,
        };
        let data = splitter_ix::RedeemYield { new_fee_index }.data();
        Instruction {
            program_id: ::splitter::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_redeem_principal_ix(
        market: Pubkey,
        creator_vault: Pubkey,
        user: Pubkey,
        user_pt_ata: Pubkey,
        user_sy_ata: Pubkey,
        pt_mint: Pubkey,
        sy_mint: Pubkey,
        amount: u64,
    ) -> Instruction {
        let (splitter_authority, _) = splitter_authority_pda(&creator_vault);
        let accounts = splitter_accounts::RedeemPrincipal {
            market,
            creator_vault,
            splitter_authority,
            user,
            user_pt_ata,
            user_sy_ata,
            pt_mint,
            sy_mint,
            token_program: token::ID,
            creator_vault_program: creator_vault::ID,
        };
        let data = splitter_ix::RedeemPrincipal { amount }.data();
        Instruction {
            program_id: ::splitter::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }
}
