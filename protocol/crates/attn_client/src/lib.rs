use anchor_client::Program;
use anchor_lang::{InstructionData, ToAccountMetas};
use anyhow::Result;
use solana_sdk::instruction::Instruction;
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

    pub fn stable_vault(&self) -> stable::StableVaultClient {
        stable::StableVaultClient::new(&self.program)
    }
}

pub mod stable {
    use super::*;
    use anchor_spl::token;
    use solana_sdk::pubkey::Pubkey;
    use solana_sdk::{system_program, sysvar};
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
        let data = stable_ix::InitializeStableVault { accepted_mints }.data();
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
        let data = stable_ix::RedeemAttnUsd { shares }.data();
        Instruction {
            program_id: stable_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_sweep_creator_fees_ix(
        pdas: &StableVaultPdas,
        authority: Pubkey,
        fee_source: Pubkey,
        amount: u64,
    ) -> Instruction {
        let accounts = stable_accounts::SweepCreatorFees {
            stable_vault: pdas.stable_vault,
            authority,
            fee_source,
            sol_vault: pdas.sol_vault,
            system_program: system_program::ID,
        };
        let data = stable_ix::SweepCreatorFees { amount }.data();
        Instruction {
            program_id: stable_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub fn build_process_conversion_ix(
        pdas: &StableVaultPdas,
        authority: Pubkey,
        conversion_authority: Pubkey,
        stable_mint: Pubkey,
        conversion_source: Pubkey,
        amount_stable: u64,
        sol_spent: u64,
    ) -> Instruction {
        let accounts = stable_accounts::ProcessConversion {
            stable_vault: pdas.stable_vault,
            authority,
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
        }
        .data();
        Instruction {
            program_id: stable_vault::ID,
            accounts: accounts.to_account_metas(None),
            data,
        }
    }

    pub struct StableVaultClient<'a> {
        program: &'a Program,
    }

    impl<'a> StableVaultClient<'a> {
        pub fn new(program: &'a Program) -> Self {
            Self { program }
        }

        pub fn program(&self) -> &'a Program {
            self.program
        }

        pub fn initialize_vault(
            &self,
            authority: &Keypair,
            stable_mint: Pubkey,
            accepted_mints: Vec<Pubkey>,
        ) -> Result<StableVaultPdas> {
            let (ix, pdas) =
                build_initialize_vault_ix(authority.pubkey(), stable_mint, accepted_mints);
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
            authority: &Keypair,
            fee_source: &Keypair,
            pdas: &StableVaultPdas,
            amount: u64,
        ) -> Result<()> {
            let ix =
                build_sweep_creator_fees_ix(pdas, authority.pubkey(), fee_source.pubkey(), amount);
            self.program
                .request()
                .instruction(ix)
                .signer(authority)
                .signer(fee_source)
                .send()?;
            Ok(())
        }

        pub fn process_conversion(
            &self,
            authority: &Keypair,
            conversion_authority: &Keypair,
            pdas: &StableVaultPdas,
            stable_mint: Pubkey,
            conversion_source: Pubkey,
            amount_stable: u64,
            sol_spent: u64,
        ) -> Result<()> {
            let ix = build_process_conversion_ix(
                pdas,
                authority.pubkey(),
                conversion_authority.pubkey(),
                stable_mint,
                conversion_source,
                amount_stable,
                sol_spent,
            );
            self.program
                .request()
                .instruction(ix)
                .signer(authority)
                .signer(conversion_authority)
                .send()?;
            Ok(())
        }
    }
}
