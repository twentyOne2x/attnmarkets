/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/splitter.json`.
 */
export type Splitter = {
  "address": "AmGu31S9SPLXj12etgXKnuVMzTNb653mRjkSqU8bgaPN",
  "metadata": {
    "name": "splitter",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "closeMarket",
      "discriminator": [
        88,
        154,
        248,
        186,
        48,
        14,
        123,
        244
      ],
      "accounts": [
        {
          "name": "creatorAuthority",
          "writable": true,
          "signer": true
        },
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "creatorVault",
          "relations": [
            "market"
          ]
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "ptMint",
          "writable": true
        },
        {
          "name": "ytMint",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "createMarket",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "creatorVault"
        },
        {
          "name": "splitterAuthority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  112,
                  108,
                  105,
                  116,
                  116,
                  101,
                  114,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
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
          "name": "pumpMint",
          "relations": [
            "creatorVault"
          ]
        },
        {
          "name": "syMint",
          "relations": [
            "creatorVault"
          ]
        },
        {
          "name": "market",
          "writable": true,
          "signer": true
        },
        {
          "name": "ptMint",
          "writable": true,
          "signer": true
        },
        {
          "name": "ytMint",
          "writable": true,
          "signer": true
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
          "name": "maturityTs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "mintPtYt",
      "discriminator": [
        243,
        42,
        192,
        244,
        56,
        133,
        237,
        59
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "creatorVault",
          "writable": true
        },
        {
          "name": "splitterAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  112,
                  108,
                  105,
                  116,
                  116,
                  101,
                  114,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
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
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "userSyAta",
          "writable": true
        },
        {
          "name": "userPtAta",
          "writable": true
        },
        {
          "name": "userYtAta",
          "writable": true
        },
        {
          "name": "syMint",
          "writable": true
        },
        {
          "name": "ptMint",
          "writable": true
        },
        {
          "name": "ytMint",
          "writable": true
        },
        {
          "name": "userPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  45,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "user"
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
          "name": "creatorVaultProgram",
          "address": "HDztZyNcij21HhF5SR6rhk9wx9qx6yViebUrVU9W6C86"
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
      "name": "redeemPrincipal",
      "discriminator": [
        146,
        17,
        79,
        16,
        88,
        228,
        232,
        111
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "creatorVault",
          "writable": true
        },
        {
          "name": "splitterAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  112,
                  108,
                  105,
                  116,
                  116,
                  101,
                  114,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
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
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "userPtAta",
          "writable": true
        },
        {
          "name": "userSyAta",
          "writable": true
        },
        {
          "name": "ptMint",
          "writable": true
        },
        {
          "name": "syMint",
          "writable": true
        },
        {
          "name": "userYtAta",
          "writable": true
        },
        {
          "name": "ytMint",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "creatorVaultProgram",
          "address": "HDztZyNcij21HhF5SR6rhk9wx9qx6yViebUrVU9W6C86"
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
      "name": "redeemYield",
      "discriminator": [
        232,
        70,
        202,
        63,
        211,
        113,
        10,
        236
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "creatorVault",
          "writable": true
        },
        {
          "name": "splitterAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  112,
                  108,
                  105,
                  116,
                  116,
                  101,
                  114,
                  45,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
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
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "userPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  45,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "userYtAta",
          "writable": true
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
                "path": "creator_vault.pump_mint",
                "account": "creatorVault"
              }
            ]
          }
        },
        {
          "name": "userQuoteAta",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "creatorVaultProgram",
          "address": "HDztZyNcij21HhF5SR6rhk9wx9qx6yViebUrVU9W6C86"
        }
      ],
      "args": [
        {
          "name": "newFeeIndex",
          "type": "u128"
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
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "splitterAuthority",
      "discriminator": [
        185,
        243,
        177,
        120,
        39,
        73,
        190,
        108
      ]
    },
    {
      "name": "userPosition",
      "discriminator": [
        251,
        248,
        209,
        245,
        83,
        234,
        17,
        27
      ]
    }
  ],
  "events": [
    {
      "name": "marketClosed",
      "discriminator": [
        86,
        91,
        119,
        43,
        94,
        0,
        217,
        113
      ]
    },
    {
      "name": "marketCreated",
      "discriminator": [
        88,
        184,
        130,
        231,
        226,
        84,
        6,
        58
      ]
    },
    {
      "name": "principalRedeemed",
      "discriminator": [
        114,
        199,
        124,
        179,
        158,
        84,
        242,
        15
      ]
    },
    {
      "name": "ptYtMinted",
      "discriminator": [
        147,
        17,
        51,
        128,
        18,
        106,
        82,
        222
      ]
    },
    {
      "name": "yieldRedeemed",
      "discriminator": [
        146,
        205,
        76,
        218,
        82,
        193,
        102,
        135
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidMaturity",
      "msg": "Maturity must be positive"
    },
    {
      "code": 6001,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6002,
      "name": "mathOverflow",
      "msg": "Math overflow"
    },
    {
      "code": 6003,
      "name": "insufficientSyBalance",
      "msg": "Insufficient SY balance to split"
    },
    {
      "code": 6004,
      "name": "splitterProgramMismatch",
      "msg": "Creator vault not configured for this splitter"
    },
    {
      "code": 6005,
      "name": "invalidSplitterAuthority",
      "msg": "Splitter authority PDA mismatch"
    },
    {
      "code": 6006,
      "name": "feeIndexRegression",
      "msg": "Fee index cannot decrease"
    },
    {
      "code": 6007,
      "name": "noYieldPosition",
      "msg": "User has no YT balance"
    },
    {
      "code": 6008,
      "name": "insufficientYieldLiquidity",
      "msg": "Insufficient liquidity in fee vault"
    },
    {
      "code": 6009,
      "name": "invalidFeeVault",
      "msg": "Fee vault address mismatch"
    },
    {
      "code": 6010,
      "name": "marketNotMatured",
      "msg": "Market has not matured"
    },
    {
      "code": 6011,
      "name": "insufficientPtBalance",
      "msg": "User has insufficient PT balance"
    },
    {
      "code": 6012,
      "name": "insufficientYieldTokens",
      "msg": "User has insufficient YT balance"
    },
    {
      "code": 6013,
      "name": "outstandingPrincipal",
      "msg": "Outstanding principal prevents closing"
    },
    {
      "code": 6014,
      "name": "outstandingYield",
      "msg": "Outstanding yield prevents closing"
    },
    {
      "code": 6015,
      "name": "invalidUserPosition",
      "msg": "User position PDA mismatch"
    },
    {
      "code": 6016,
      "name": "invalidTokenProgram",
      "msg": "Token program must match the SPL Token program"
    },
    {
      "code": 6017,
      "name": "mintDecimalsMismatch",
      "msg": "Mint decimals must be aligned"
    },
    {
      "code": 6018,
      "name": "yieldSupplyMismatch",
      "msg": "Yield token supply accounting mismatch"
    },
    {
      "code": 6019,
      "name": "marketClosed",
      "msg": "Market is closed"
    }
  ],
  "types": [
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
      "name": "market",
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
            "name": "syMint",
            "type": "pubkey"
          },
          {
            "name": "ptMint",
            "type": "pubkey"
          },
          {
            "name": "ytMint",
            "type": "pubkey"
          },
          {
            "name": "maturityTs",
            "type": "i64"
          },
          {
            "name": "feeIndex",
            "type": "u128"
          },
          {
            "name": "totalPtIssued",
            "type": "u64"
          },
          {
            "name": "totalYtIssued",
            "type": "u64"
          },
          {
            "name": "isClosed",
            "type": "bool"
          },
          {
            "name": "padding",
            "type": {
              "array": [
                "u8",
                7
              ]
            }
          }
        ]
      }
    },
    {
      "name": "marketClosed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "creatorAuthority",
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
      "name": "marketCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "pumpMint",
            "type": "pubkey"
          },
          {
            "name": "maturityTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "principalRedeemed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "user",
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
      "name": "ptYtMinted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "user",
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
      "name": "splitterAuthority",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "userPosition",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "lastFeeIndex",
            "type": "u128"
          },
          {
            "name": "pendingYieldScaled",
            "type": "u128"
          }
        ]
      }
    },
    {
      "name": "yieldRedeemed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "claimedAmount",
            "type": "u64"
          },
          {
            "name": "feeIndex",
            "type": "u128"
          },
          {
            "name": "marketDelta",
            "type": "u128"
          }
        ]
      }
    }
  ]
};
