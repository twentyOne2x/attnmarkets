#![cfg_attr(target_arch = "bpf", no_std)]

use anchor_lang::accounts::account::Account;
use anchor_lang::accounts::account_loader::AccountLoader;
use anchor_lang::accounts::interface::Interface;
use anchor_lang::accounts::interface_account::InterfaceAccount;
use anchor_lang::accounts::program::Program;
use anchor_lang::accounts::system_account::SystemAccount;
use anchor_lang::accounts::sysvar::Sysvar as SysvarAccount;
use anchor_lang::prelude::*;
use anchor_lang::{AccountDeserialize, AccountSerialize, CheckId, CheckOwner, Owner, ZeroCopy};

pub trait TryFromAccountInfo<'info>: Sized {
    fn try_from(program_id: &Pubkey, account: &'info AccountInfo<'info>) -> Result<Self>;
    fn try_from_unchecked(program_id: &Pubkey, account: &'info AccountInfo<'info>) -> Result<Self> {
        Self::try_from(program_id, account)
    }
}

pub fn try_from<'info, T>(program_id: &Pubkey, account: &'info AccountInfo<'info>) -> Result<T>
where
    T: TryFromAccountInfo<'info>,
{
    T::try_from(program_id, account)
}

pub fn try_from_unchecked<'info, T>(
    program_id: &Pubkey,
    account: &'info AccountInfo<'info>,
) -> Result<T>
where
    T: TryFromAccountInfo<'info>,
{
    T::try_from_unchecked(program_id, account)
}

impl<'info, T> TryFromAccountInfo<'info> for Account<'info, T>
where
    T: AccountSerialize + AccountDeserialize + Owner + Clone,
{
    fn try_from(_: &Pubkey, account: &'info AccountInfo<'info>) -> Result<Self> {
        Account::try_from(account)
    }

    fn try_from_unchecked(_: &Pubkey, account: &'info AccountInfo<'info>) -> Result<Self> {
        Account::try_from_unchecked(account)
    }
}

impl<'info, T> TryFromAccountInfo<'info> for AccountLoader<'info, T>
where
    T: ZeroCopy + Owner,
{
    fn try_from(_: &Pubkey, account: &'info AccountInfo<'info>) -> Result<Self> {
        AccountLoader::try_from(account)
    }

    fn try_from_unchecked(program_id: &Pubkey, account: &'info AccountInfo<'info>) -> Result<Self> {
        AccountLoader::try_from_unchecked(program_id, account)
    }
}

impl<'info, T: Id> TryFromAccountInfo<'info> for Program<'info, T> {
    fn try_from(_: &Pubkey, account: &'info AccountInfo<'info>) -> Result<Self> {
        <Program<'info, T> as core::convert::TryFrom<&AccountInfo<'info>>>::try_from(account)
            .map_err(Into::into)
    }
}

impl<'info, T: CheckId> TryFromAccountInfo<'info> for Interface<'info, T> {
    fn try_from(_: &Pubkey, account: &'info AccountInfo<'info>) -> Result<Self> {
        <Interface<'info, T> as core::convert::TryFrom<&AccountInfo<'info>>>::try_from(account)
            .map_err(Into::into)
    }
}

impl<'info, T> TryFromAccountInfo<'info> for InterfaceAccount<'info, T>
where
    T: AccountSerialize + AccountDeserialize + CheckOwner + Clone,
{
    fn try_from(_: &Pubkey, account: &'info AccountInfo<'info>) -> Result<Self> {
        anchor_lang::accounts::interface_account::InterfaceAccount::<'info, T>::try_from(account)
    }

    fn try_from_unchecked(_: &Pubkey, account: &'info AccountInfo<'info>) -> Result<Self> {
        anchor_lang::accounts::interface_account::InterfaceAccount::<'info, T>::try_from_unchecked(account)
    }
}

impl<'info, T> TryFromAccountInfo<'info> for SysvarAccount<'info, T>
where
    T: anchor_lang::solana_program::sysvar::Sysvar,
{
    fn try_from(_: &Pubkey, account: &'info AccountInfo<'info>) -> Result<Self> {
        SysvarAccount::from_account_info(account)
    }
}

impl<'info> TryFromAccountInfo<'info> for SystemAccount<'info> {
    fn try_from(_: &Pubkey, account: &'info AccountInfo<'info>) -> Result<Self> {
        SystemAccount::try_from(account)
    }
}
