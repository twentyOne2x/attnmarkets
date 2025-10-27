/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/creator_vault.json`.
 */
export type CreatorVault = {
  "address": "HPjEgPTb7rrBks1oFrscBdJ7TCZ7bARzCT93X9azCK4b",
  "metadata": {
    "name": "creatorVault",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "clearSweeperDelegate",
      "discriminator": [
        109,
        228,
        224,
        119,
        129,
        4,
        67,
        59
      ],
      "accounts": [
        {
          "name": "creatorVault",
          "writable": true,
          "relations": [
            "sweeper"
          ]
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "creatorVault"
          ]
        },
        {
          "name": "sweeper",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  101,
                  101,
                  112,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "creatorVault"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "delegateSweep",
      "discriminator": [
        77,
        204,
        156,
        251,
        18,
        182,
        230,
        157
      ],
      "accounts": [
        {
          "name": "creatorVault",
          "writable": true,
          "relations": [
            "sweeper"
          ]
        },
        {
          "name": "sweeper",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  101,
                  101,
                  112,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "creatorVault"
              }
            ]
          }
        },
        {
          "name": "delegate",
          "signer": true,
          "relations": [
            "sweeper"
          ]
        },
        {
          "name": "feeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "creatorVault.pumpMint",
                "account": "CreatorVault"
              }
            ]
          }
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "delegateFeeDestination",
          "writable": true,
          "optional": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeVault",
      "discriminator": [
        48,
        191,
        163,
        44,
        71,
        129,
        63,
        164
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "pumpCreator"
        },
        {
          "name": "pumpMint"
        },
        {
          "name": "quoteMint"
        },
        {
          "name": "creatorVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  114,
                  101,
                  97,
                  116,
                  111,
                  114,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pumpMint"
              }
            ]
          }
        },
        {
          "name": "feeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pumpMint"
              }
            ]
          }
        },
        {
          "name": "syMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  121,
                  45,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pumpMint"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "splitterProgram",
          "type": "pubkey"
        },
        {
          "name": "admin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "lockCollateral",
      "discriminator": [
        161,
        216,
        135,
        122,
        12,
        104,
        211,
        101
      ],
      "accounts": [
        {
          "name": "creatorVault",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "creatorVault"
          ]
        }
      ],
      "args": [
        {
          "name": "lockExpiresAt",
          "type": {
            "option": "i64"
          }
        }
      ]
    },
    {
      "name": "mintForSplitter",
      "discriminator": [
        152,
        173,
        215,
        134,
        121,
        157,
        244,
        141
      ],
      "accounts": [
        {
          "name": "creatorVault",
          "writable": true
        },
        {
          "name": "splitterAuthority",
          "signer": true
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setPause",
      "discriminator": [
        63,
        32,
        154,
        2,
        56,
        103,
        79,
        45
      ],
      "accounts": [
        {
          "name": "creatorVault",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "creatorVault"
          ]
        }
      ],
      "args": [
        {
          "name": "paused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "setRewardsSplit",
      "discriminator": [
        38,
        112,
        28,
        141,
        164,
        243,
        116,
        66
      ],
      "accounts": [
        {
          "name": "creatorVault",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "creatorVault"
          ]
        }
      ],
      "args": [
        {
          "name": "solRewardsBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "setSweeperDelegate",
      "discriminator": [
        129,
        1,
        67,
        201,
        193,
        147,
        39,
        248
      ],
      "accounts": [
        {
          "name": "creatorVault",
          "writable": true
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true,
          "relations": [
            "creatorVault"
          ]
        },
        {
          "name": "sweeper",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  119,
                  101,
                  101,
                  112,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "creatorVault"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "delegate",
          "type": "pubkey"
        },
        {
          "name": "feeBps",
          "type": "u16"
        }
      ]
    },
    {
      "name": "transferFeesForSplitter",
      "discriminator": [
        58,
        186,
        107,
        219,
        241,
        10,
        156,
        168
      ],
      "accounts": [
        {
          "name": "creatorVault",
          "writable": true
        },
        {
          "name": "splitterAuthority",
          "signer": true
        },
        {
          "name": "feeVault",
          "writable": true
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "unlockCollateral",
      "discriminator": [
        167,
        213,
        221,
        147,
        129,
        209,
        132,
        190
      ],
      "accounts": [
        {
          "name": "creatorVault",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "creatorVault"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "updateAdmin",
      "discriminator": [
        161,
        176,
        40,
        213,
        60,
        184,
        179,
        228
      ],
      "accounts": [
        {
          "name": "creatorVault",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "creatorVault"
          ]
        }
      ],
      "args": [
        {
          "name": "newAdmin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "withdrawFees",
      "discriminator": [
        198,
        212,
        171,
        109,
        144,
        215,
        174,
        89
      ],
      "accounts": [
        {
          "name": "creatorVault",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "creatorVault"
          ]
        },
        {
          "name": "feeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "creatorVault.pumpMint",
                "account": "CreatorVault"
              }
            ]
          }
        },
        {
          "name": "destination",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "admin"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "wrapFees",
      "discriminator": [
        51,
        143,
        228,
        150,
        69,
        84,
        185,
        16
      ],
      "accounts": [
        {
          "name": "creatorVault",
          "writable": true
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "pumpMint",
          "relations": [
            "creatorVault"
          ]
        },
        {
          "name": "quoteMint",
          "relations": [
            "creatorVault"
          ]
        },
        {
          "name": "feeVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  101,
                  101,
                  45,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pumpMint"
              }
            ]
          }
        },
        {
          "name": "userQuoteAta",
          "writable": true
        },
        {
          "name": "syMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  121,
                  45,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pumpMint"
              }
            ]
          },
          "relations": [
            "creatorVault"
          ]
        },
        {
          "name": "userSyAta",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "CreatorVault",
      "discriminator": [
        200,
        135,
        38,
        98,
        35,
        236,
        238,
        12
      ]
    },
    {
      "name": "CreatorVaultSweeper",
      "discriminator": [
        176,
        5,
        12,
        173,
        189,
        21,
        121,
        199
      ]
    }
  ],
  "events": [
    {
      "name": "AdminUpdated",
      "discriminator": [
        69,
        82,
        49,
        171,
        43,
        3,
        80,
        161
      ]
    },
    {
      "name": "DelegatedFeesSwept",
      "discriminator": [
        207,
        27,
        189,
        113,
        157,
        56,
        181,
        19
      ]
    },
    {
      "name": "FeesWithdrawn",
      "discriminator": [
        234,
        15,
        0,
        119,
        148,
        241,
        40,
        21
      ]
    },
    {
      "name": "RewardsSplitUpdated",
      "discriminator": [
        23,
        15,
        108,
        35,
        212,
        47,
        15,
        54
      ]
    },
    {
      "name": "SweeperDelegateCleared",
      "discriminator": [
        189,
        57,
        133,
        82,
        62,
        57,
        239,
        251
      ]
    },
    {
      "name": "SweeperDelegateUpdated",
      "discriminator": [
        88,
        217,
        137,
        129,
        193,
        154,
        237,
        248
      ]
    },
    {
      "name": "SyMinted",
      "discriminator": [
        117,
        38,
        23,
        82,
        11,
        219,
        22,
        217
      ]
    },
    {
      "name": "VaultInitialized",
      "discriminator": [
        180,
        43,
        207,
        2,
        18,
        71,
        3,
        75
      ]
    },
    {
      "name": "VaultLockStatusChanged",
      "discriminator": [
        251,
        23,
        252,
        89,
        195,
        190,
        11,
        197
      ]
    },
    {
      "name": "VaultPauseToggled",
      "discriminator": [
        109,
        49,
        24,
        144,
        110,
        141,
        82,
        111
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "InvalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6001,
      "name": "MathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6002,
      "name": "SplitterProgramUnset",
      "msg": "Splitter program not registered"
    },
    {
      "code": 6003,
      "name": "UnauthorizedSplitter",
      "msg": "Unauthorized splitter authority"
    },
    {
      "code": 6004,
      "name": "InvalidFeeVault",
      "msg": "Fee vault address mismatch"
    },
    {
      "code": 6005,
      "name": "UnauthorizedAdmin",
      "msg": "Unauthorized admin"
    },
    {
      "code": 6006,
      "name": "InvalidAdmin",
      "msg": "Invalid admin public key"
    },
    {
      "code": 6007,
      "name": "InvalidBps",
      "msg": "Invalid basis points"
    },
    {
      "code": 6008,
      "name": "VaultPaused",
      "msg": "Vault is paused"
    },
    {
      "code": 6009,
      "name": "AdminSignatureRequired",
      "msg": "Admin signature required while vault is locked"
    },
    {
      "code": 6010,
      "name": "InsufficientVaultBalance",
      "msg": "Insufficient balance in fee vault"
    },
    {
      "code": 6011,
      "name": "InvalidWithdrawalDestination",
      "msg": "Withdrawal destination must be owned by the creator authority"
    },
    {
      "code": 6012,
      "name": "InvalidWithdrawalMint",
      "msg": "Withdrawal destination mint must match quote mint"
    },
    {
      "code": 6013,
      "name": "InvalidLockExpiry",
      "msg": "Lock expiry must be greater than or equal to the current timestamp"
    },
    {
      "code": 6014,
      "name": "InvalidSweeperDelegate",
      "msg": "Sweeper delegate must be a non-default public key"
    },
    {
      "code": 6015,
      "name": "InvalidSweeperFee",
      "msg": "Sweeper fee exceeds 100%"
    },
    {
      "code": 6016,
      "name": "VaultLockedForDelegate",
      "msg": "Vault is locked; delegate sweep is unavailable"
    },
    {
      "code": 6017,
      "name": "UnauthorizedSweeper",
      "msg": "Unauthorized sweeper delegate"
    },
    {
      "code": 6018,
      "name": "DelegateFeeDestinationRequired",
      "msg": "Delegate fee destination required"
    },
    {
      "code": 6019,
      "name": "InvalidDelegateFeeDestination",
      "msg": "Invalid delegate fee destination"
    }
  ],
  "types": [
    {
      "name": "AdminUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creatorVault",
            "type": "pubkey"
          },
          {
            "name": "previousAdmin",
            "type": "pubkey"
          },
          {
            "name": "newAdmin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "CreatorVault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "feeVaultBump",
            "type": "u8"
          },
          {
            "name": "syMintBump",
            "type": "u8"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "pumpCreator",
            "type": "pubkey"
          },
          {
            "name": "pumpMint",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "syMint",
            "type": "pubkey"
          },
          {
            "name": "splitterProgram",
            "type": "pubkey"
          },
          {
            "name": "totalFeesCollected",
            "type": "u64"
          },
          {
            "name": "totalSyMinted",
            "type": "u64"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "solRewardsBps",
            "type": "u16"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "locked",
            "type": "bool"
          },
          {
            "name": "lockExpiresAt",
            "type": "i64"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                1
              ]
            }
          }
        ]
      }
    },
    {
      "name": "CreatorVaultSweeper",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "creatorVault",
            "type": "pubkey"
          },
          {
            "name": "delegate",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          },
          {
            "name": "lastSweepTs",
            "type": "i64"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                5
              ]
            }
          }
        ]
      }
    },
    {
      "name": "DelegatedFeesSwept",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creatorVault",
            "type": "pubkey"
          },
          {
            "name": "delegate",
            "type": "pubkey"
          },
          {
            "name": "destination",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "feeAmount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "FeesWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creatorVault",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "destination",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "locked",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "RewardsSplitUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creatorVault",
            "type": "pubkey"
          },
          {
            "name": "solRewardsBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "SweeperDelegateCleared",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creatorVault",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "SweeperDelegateUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creatorVault",
            "type": "pubkey"
          },
          {
            "name": "delegate",
            "type": "pubkey"
          },
          {
            "name": "feeBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "SyMinted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "pumpMint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "VaultInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creatorVault",
            "type": "pubkey"
          },
          {
            "name": "pumpMint",
            "type": "pubkey"
          },
          {
            "name": "quoteMint",
            "type": "pubkey"
          },
          {
            "name": "syMint",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "admin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "VaultLockStatusChanged",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creatorVault",
            "type": "pubkey"
          },
          {
            "name": "locked",
            "type": "bool"
          },
          {
            "name": "lockExpiresAt",
            "type": "i64"
          },
          {
            "name": "isAuto",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "VaultPauseToggled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creatorVault",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    }
  ]
}
};
