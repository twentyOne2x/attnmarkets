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
      "name": "creatorVault",
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
    }
  ],
  "events": [
    {
      "name": "adminUpdated",
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
      "name": "rewardsSplitUpdated",
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
      "name": "syMinted",
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
      "name": "vaultInitialized",
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
      "name": "vaultPauseToggled",
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
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6001,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6002,
      "name": "splitterProgramUnset",
      "msg": "Splitter program not registered"
    },
    {
      "code": 6003,
      "name": "unauthorizedSplitter",
      "msg": "Unauthorized splitter authority"
    },
    {
      "code": 6004,
      "name": "invalidFeeVault",
      "msg": "Fee vault address mismatch"
    },
    {
      "code": 6005,
      "name": "unauthorizedAdmin",
      "msg": "Unauthorized admin"
    },
    {
      "code": 6006,
      "name": "invalidAdmin",
      "msg": "Invalid admin public key"
    },
    {
      "code": 6007,
      "name": "invalidBps",
      "msg": "Invalid basis points"
    },
    {
      "code": 6008,
      "name": "vaultPaused",
      "msg": "Vault is paused"
    }
  ],
  "types": [
    {
      "name": "adminUpdated",
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
      "name": "creatorVault",
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
      "name": "rewardsSplitUpdated",
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
      "name": "syMinted",
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
      "name": "vaultInitialized",
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
      "name": "vaultPauseToggled",
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
};
