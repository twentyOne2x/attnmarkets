use creator_vault::CreatorVault;

#[test]
fn creator_vault_space_constant_defined() {
    assert!(CreatorVault::INIT_SPACE > 0);
}
