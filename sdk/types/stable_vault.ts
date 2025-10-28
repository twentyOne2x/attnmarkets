/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/stable_vault.json`.
 */
export type StableVault = {
  "address": "98jhX2iz4cec2evPKhLwA1HriVEbUAsMBo61bQpSef5Z",
  "metadata": {
    "name": "stableVault",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "addAcceptedMint",
      "discriminator": [
        241,
        72,
        208,
        73,
        223,
        58,
        81,
        69
      ],
      "accounts": [
        {
          "name": "stableVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
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
                "path": "stable_vault.authority_seed",
                "account": "stableVault"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "mint",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "depositStable",
      "discriminator": [
        89,
        248,
        131,
        239,
        11,
        219,
        163,
        160
      ],
      "accounts": [
        {
          "name": "stableVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
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
                "path": "stable_vault.authority_seed",
                "account": "stableVault"
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "stableMint",
          "writable": true,
          "relations": [
            "stableVault"
          ]
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  45,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "stableVault"
              },
              {
                "kind": "account",
                "path": "stableMint"
              }
            ]
          },
          "relations": [
            "stableVault"
          ]
        },
        {
          "name": "userStableAta",
          "writable": true
        },
        {
          "name": "shareMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  45,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "stableVault"
              }
            ]
          },
          "relations": [
            "stableVault"
          ]
        },
        {
          "name": "userShareAta",
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
      "name": "initializeStableVault",
      "discriminator": [
        182,
        82,
        51,
        122,
        131,
        231,
        80,
        158
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "stableMint",
          "writable": true
        },
        {
          "name": "stableVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
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
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  45,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "stableVault"
              },
              {
                "kind": "account",
                "path": "stableMint"
              }
            ]
          }
        },
        {
          "name": "shareMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  45,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "stableVault"
              }
            ]
          }
        },
        {
          "name": "solVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
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
                "path": "stableVault"
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
          "name": "acceptedMints",
          "type": {
            "vec": "pubkey"
          }
        },
        {
          "name": "admin",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "processConversion",
      "discriminator": [
        39,
        31,
        38,
        31,
        0,
        42,
        50,
        213
      ],
      "accounts": [
        {
          "name": "stableVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
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
                "path": "stable_vault.authority_seed",
                "account": "stableVault"
              }
            ]
          }
        },
        {
          "name": "keeperAuthority",
          "signer": true,
          "relations": [
            "stableVault"
          ]
        },
        {
          "name": "conversionAuthority",
          "writable": true,
          "signer": true
        },
        {
          "name": "stableMint",
          "writable": true,
          "relations": [
            "stableVault"
          ]
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  45,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "stableVault"
              },
              {
                "kind": "account",
                "path": "stableMint"
              }
            ]
          },
          "relations": [
            "stableVault"
          ]
        },
        {
          "name": "conversionSource",
          "writable": true
        },
        {
          "name": "solVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
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
                "path": "stableVault"
              }
            ]
          },
          "relations": [
            "stableVault"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amountStable",
          "type": "u64"
        },
        {
          "name": "solSpent",
          "type": "u64"
        },
        {
          "name": "operationId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "redeemAttnusd",
      "discriminator": [
        191,
        129,
        110,
        163,
        86,
        204,
        103,
        103
      ],
      "accounts": [
        {
          "name": "stableVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
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
                "path": "stable_vault.authority_seed",
                "account": "stableVault"
              }
            ]
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "stableMint",
          "writable": true,
          "relations": [
            "stableVault"
          ]
        },
        {
          "name": "treasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
                  101,
                  45,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "stableVault"
              },
              {
                "kind": "account",
                "path": "stableMint"
              }
            ]
          },
          "relations": [
            "stableVault"
          ]
        },
        {
          "name": "userStableAta",
          "writable": true
        },
        {
          "name": "shareMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  104,
                  97,
                  114,
                  101,
                  45,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "stableVault"
              }
            ]
          },
          "relations": [
            "stableVault"
          ]
        },
        {
          "name": "userShareAta",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "shares",
          "type": "u64"
        }
      ]
    },
    {
      "name": "removeAcceptedMint",
      "discriminator": [
        71,
        204,
        181,
        197,
        187,
        85,
        94,
        99
      ],
      "accounts": [
        {
          "name": "stableVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
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
                "path": "stable_vault.authority_seed",
                "account": "stableVault"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "mint",
          "type": "pubkey"
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
          "name": "stableVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
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
                "path": "stable_vault.authority_seed",
                "account": "stableVault"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "isPaused",
          "type": "bool"
        }
      ]
    },
    {
      "name": "sweepCreatorFees",
      "discriminator": [
        55,
        153,
        74,
        11,
        46,
        80,
        131,
        136
      ],
      "accounts": [
        {
          "name": "stableVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
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
                "path": "stable_vault.authority_seed",
                "account": "stableVault"
              }
            ]
          }
        },
        {
          "name": "keeperAuthority",
          "signer": true,
          "relations": [
            "stableVault"
          ]
        },
        {
          "name": "allowedFunder",
          "writable": true,
          "signer": true
        },
        {
          "name": "creatorVault",
          "relations": [
            "rewardsPool"
          ]
        },
        {
          "name": "rewardsPool",
          "writable": true
        },
        {
          "name": "rewardsTreasury",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
                  45,
                  116,
                  114,
                  101,
                  97,
                  115,
                  117,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "rewardsPool"
              }
            ]
          }
        },
        {
          "name": "solVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
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
                "path": "stableVault"
              }
            ]
          },
          "relations": [
            "stableVault"
          ]
        },
        {
          "name": "rewardsProgram",
          "address": "6M8TEGPJhspXoYtDvY5vd9DHg7ojCPgbrqjaWoZa2dfw"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "operationId",
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
          "name": "stableVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
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
                "path": "stable_vault.authority_seed",
                "account": "stableVault"
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true
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
      "name": "updateEmergencyAdmin",
      "discriminator": [
        0,
        151,
        135,
        77,
        222,
        186,
        220,
        9
      ],
      "accounts": [
        {
          "name": "stableVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
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
                "path": "stable_vault.authority_seed",
                "account": "stableVault"
              }
            ]
          }
        },
        {
          "name": "admin",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "newEmergencyAdmin",
          "type": {
            "option": "pubkey"
          }
        }
      ]
    },
    {
      "name": "updateKeeperAuthority",
      "discriminator": [
        21,
        157,
        181,
        31,
        82,
        153,
        235,
        112
      ],
      "accounts": [
        {
          "name": "stableVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
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
                "path": "stable_vault.authority_seed",
                "account": "stableVault"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "newKeeper",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "withdrawSolDust",
      "discriminator": [
        243,
        29,
        75,
        32,
        65,
        63,
        113,
        154
      ],
      "accounts": [
        {
          "name": "stableVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  98,
                  108,
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
                "path": "stable_vault.authority_seed",
                "account": "stableVault"
              }
            ]
          }
        },
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "solVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  111,
                  108,
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
                "path": "stableVault"
              }
            ]
          },
          "relations": [
            "stableVault"
          ]
        },
        {
          "name": "destination",
          "writable": true
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
    },
    {
      "name": "rewardsPool",
      "discriminator": [
        107,
        36,
        119,
        42,
        181,
        249,
        18,
        37
      ]
    },
    {
      "name": "stableVault",
      "discriminator": [
        193,
        22,
        242,
        61,
        43,
        22,
        160,
        118
      ]
    }
  ],
  "events": [
    {
      "name": "acceptedMintAdded",
      "discriminator": [
        186,
        69,
        25,
        108,
        217,
        85,
        27,
        8
      ]
    },
    {
      "name": "acceptedMintRemoved",
      "discriminator": [
        178,
        1,
        210,
        96,
        61,
        190,
        27,
        235
      ]
    },
    {
      "name": "attnUsdMinted",
      "discriminator": [
        211,
        59,
        101,
        32,
        112,
        190,
        56,
        61
      ]
    },
    {
      "name": "attnUsdRedeemed",
      "discriminator": [
        29,
        164,
        74,
        63,
        211,
        81,
        202,
        137
      ]
    },
    {
      "name": "conversionProcessed",
      "discriminator": [
        60,
        137,
        141,
        48,
        141,
        75,
        235,
        157
      ]
    },
    {
      "name": "creatorFeesSwept",
      "discriminator": [
        136,
        130,
        101,
        166,
        125,
        35,
        133,
        25
      ]
    },
    {
      "name": "emergencyAdminUpdated",
      "discriminator": [
        81,
        240,
        0,
        255,
        45,
        130,
        71,
        244
      ]
    },
    {
      "name": "keeperAuthorityUpdated",
      "discriminator": [
        117,
        210,
        216,
        152,
        224,
        97,
        65,
        228
      ]
    },
    {
      "name": "solDustWithdrawn",
      "discriminator": [
        124,
        14,
        95,
        68,
        211,
        179,
        10,
        170
      ]
    },
    {
      "name": "stableVaultAdminUpdated",
      "discriminator": [
        22,
        31,
        17,
        204,
        153,
        89,
        130,
        128
      ]
    },
    {
      "name": "stableVaultInitialized",
      "discriminator": [
        47,
        206,
        127,
        129,
        91,
        178,
        96,
        219
      ]
    },
    {
      "name": "stableVaultPauseToggled",
      "discriminator": [
        132,
        50,
        190,
        128,
        182,
        77,
        250,
        75
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
      "name": "vaultPaused",
      "msg": "Vault is paused"
    },
    {
      "code": 6002,
      "name": "invalidBps",
      "msg": "Invalid basis points"
    },
    {
      "code": 6003,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6004,
      "name": "invalidVaultState",
      "msg": "Invalid vault state"
    },
    {
      "code": 6005,
      "name": "amountTooSmall",
      "msg": "Deposit amount too small for share precision"
    },
    {
      "code": 6006,
      "name": "unsupportedMint",
      "msg": "Unsupported mint for this vault"
    },
    {
      "code": 6007,
      "name": "noAcceptedMints",
      "msg": "No accepted mints provided"
    },
    {
      "code": 6008,
      "name": "tooManyAcceptedMints",
      "msg": "Too many accepted mints provided"
    },
    {
      "code": 6009,
      "name": "mintAlreadyAccepted",
      "msg": "Mint already accepted"
    },
    {
      "code": 6010,
      "name": "mintNotAccepted",
      "msg": "Mint not accepted"
    },
    {
      "code": 6011,
      "name": "operationOutOfOrder",
      "msg": "Operation id out of order"
    },
    {
      "code": 6012,
      "name": "insufficientDustBalance",
      "msg": "Insufficient SOL available outside pending balance"
    },
    {
      "code": 6013,
      "name": "unauthorized",
      "msg": "Unauthorized caller"
    },
    {
      "code": 6014,
      "name": "unauthorizedKeeper",
      "msg": "Unauthorized keeper"
    },
    {
      "code": 6015,
      "name": "unauthorizedAdmin",
      "msg": "Unauthorized admin"
    },
    {
      "code": 6016,
      "name": "invalidAdmin",
      "msg": "Invalid admin public key"
    },
    {
      "code": 6017,
      "name": "invalidKeeper",
      "msg": "Invalid keeper public key"
    },
    {
      "code": 6018,
      "name": "insufficientShares",
      "msg": "Insufficient shares to redeem"
    },
    {
      "code": 6019,
      "name": "insufficientPendingSol",
      "msg": "Insufficient pending SOL for conversion"
    },
    {
      "code": 6020,
      "name": "creatorVaultPaused",
      "msg": "Creator vault is paused"
    },
    {
      "code": 6021,
      "name": "cannotRemovePrimaryMint",
      "msg": "Cannot remove primary stable mint"
    },
    {
      "code": 6022,
      "name": "invalidMint",
      "msg": "Invalid mint"
    },
    {
      "code": 6023,
      "name": "invalidStableVaultPda",
      "msg": "Stable vault PDA mismatch"
    },
    {
      "code": 6024,
      "name": "invalidTreasuryPda",
      "msg": "Treasury PDA mismatch"
    },
    {
      "code": 6025,
      "name": "invalidShareMintPda",
      "msg": "Share mint PDA mismatch"
    },
    {
      "code": 6026,
      "name": "invalidSolVaultPda",
      "msg": "SOL vault PDA mismatch"
    }
  ],
  "types": [
    {
      "name": "acceptedMintAdded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stableVault",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "acceptedMintRemoved",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stableVault",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "attnUsdMinted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "depositedAmount",
            "type": "u64"
          },
          {
            "name": "mintedShares",
            "type": "u64"
          },
          {
            "name": "pricePerShare",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "attnUsdRedeemed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "redeemedShares",
            "type": "u64"
          },
          {
            "name": "returnedAmount",
            "type": "u64"
          },
          {
            "name": "pricePerShare",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "conversionProcessed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stableVault",
            "type": "pubkey"
          },
          {
            "name": "executor",
            "type": "pubkey"
          },
          {
            "name": "stableReceived",
            "type": "u64"
          },
          {
            "name": "solSpent",
            "type": "u64"
          },
          {
            "name": "pendingSol",
            "type": "u64"
          },
          {
            "name": "operationId",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "creatorFeesSwept",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stableVault",
            "type": "pubkey"
          },
          {
            "name": "keeperAuthority",
            "type": "pubkey"
          },
          {
            "name": "amountLamports",
            "type": "u64"
          },
          {
            "name": "solRewardsBps",
            "type": "u16"
          },
          {
            "name": "solRewardsLamports",
            "type": "u64"
          },
          {
            "name": "convertedLamports",
            "type": "u64"
          },
          {
            "name": "pendingSol",
            "type": "u64"
          },
          {
            "name": "operationId",
            "type": "u64"
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
      "name": "emergencyAdminUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stableVault",
            "type": "pubkey"
          },
          {
            "name": "previousEmergencyAdmin",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "newEmergencyAdmin",
            "type": {
              "option": "pubkey"
            }
          }
        ]
      }
    },
    {
      "name": "keeperAuthorityUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stableVault",
            "type": "pubkey"
          },
          {
            "name": "keeperAuthority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "rewardsPool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "authorityBump",
            "type": "u8"
          },
          {
            "name": "treasuryBump",
            "type": "u8"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "creatorVault",
            "type": "pubkey"
          },
          {
            "name": "attnMint",
            "type": "pubkey"
          },
          {
            "name": "sAttnMint",
            "type": "pubkey"
          },
          {
            "name": "attnVault",
            "type": "pubkey"
          },
          {
            "name": "totalStaked",
            "type": "u64"
          },
          {
            "name": "solPerShare",
            "type": "u128"
          },
          {
            "name": "pendingRewards",
            "type": "u64"
          },
          {
            "name": "rewardBps",
            "type": "u16"
          },
          {
            "name": "allowedFunder",
            "type": "pubkey"
          },
          {
            "name": "lastTreasuryBalance",
            "type": "u64"
          },
          {
            "name": "lastFundId",
            "type": "u64"
          },
          {
            "name": "isPaused",
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
      "name": "solDustWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stableVault",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "remainingDust",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "stableVault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "treasuryBump",
            "type": "u8"
          },
          {
            "name": "solVaultBump",
            "type": "u8"
          },
          {
            "name": "shareMintBump",
            "type": "u8"
          },
          {
            "name": "authoritySeed",
            "type": "pubkey"
          },
          {
            "name": "keeperAuthority",
            "type": "pubkey"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "emergencyAdmin",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "shareMint",
            "type": "pubkey"
          },
          {
            "name": "stableMint",
            "type": "pubkey"
          },
          {
            "name": "treasury",
            "type": "pubkey"
          },
          {
            "name": "solVault",
            "type": "pubkey"
          },
          {
            "name": "totalAssets",
            "type": "u64"
          },
          {
            "name": "totalShares",
            "type": "u64"
          },
          {
            "name": "pendingSol",
            "type": "u64"
          },
          {
            "name": "lastSweepId",
            "type": "u64"
          },
          {
            "name": "lastConversionId",
            "type": "u64"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "acceptedMints",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "stableVaultAdminUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stableVault",
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
      "name": "stableVaultInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stableVault",
            "type": "pubkey"
          },
          {
            "name": "authoritySeed",
            "type": "pubkey"
          },
          {
            "name": "shareMint",
            "type": "pubkey"
          },
          {
            "name": "stableMint",
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
      "name": "stableVaultPauseToggled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stableVault",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "isPaused",
            "type": "bool"
          }
        ]
      }
    }
  ]
};
