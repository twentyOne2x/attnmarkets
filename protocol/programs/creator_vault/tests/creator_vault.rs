use creator_vault::CreatorVault;

#[test]
fn creator_vault_space_constant() {
    // Ensure the serialized size covers expected fields (bump bytes + pubkeys + counters)
    assert!(CreatorVault::INIT_SPACE >= (1 + 1 + 1 + 5 * 32 + 2 * 8));
}
