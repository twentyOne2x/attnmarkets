/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/rewards_vault.json`.
 */
export type RewardsVault = {
  "address": "6M8TEGPJhspXoYtDvY5vd9DHg7ojCPgbrqjaWoZa2dfw",
  "metadata": {
    "name": "rewardsVault",
    "version": "0.1.0",
    "spec": "0.1.0"
  },
  "instructions": [
    {
      "name": "claimRewards",
      "discriminator": [
        4,
        144,
        132,
        71,
        116,
        23,
        151,
        80
      ],
      "accounts": [
        {
          "name": "rewardsPool",
          "writable": true
        },
        {
          "name": "staker",
          "writable": true,
          "signer": true
        },
        {
          "name": "stakePosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
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
                "path": "rewardsPool"
              },
              {
                "kind": "account",
                "path": "staker"
              }
            ]
          }
        },
        {
          "name": "solTreasury",
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
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "fundRewards",
      "discriminator": [
        114,
        64,
        163,
        112,
        175,
        167,
        19,
        121
      ],
      "accounts": [
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
          "name": "allowedFunder",
          "writable": true,
          "signer": true,
          "relations": [
            "rewardsPool"
          ]
        },
        {
          "name": "solTreasury",
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
      "name": "initializePool",
      "discriminator": [
        95,
        180,
        10,
        172,
        84,
        174,
        232,
        40
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "creatorVault"
        },
        {
          "name": "attnMint"
        },
        {
          "name": "rewardsPool",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  115,
                  45,
                  112,
                  111,
                  111,
                  108
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
          "name": "rewardsAuthority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  115,
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
                "path": "rewardsPool"
              }
            ]
          }
        },
        {
          "name": "sAttnMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  45,
                  97,
                  116,
                  116,
                  110,
                  45,
                  109,
                  105,
                  110,
                  116
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
          "name": "attnVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  116,
                  116,
                  110,
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
                "path": "rewardsPool"
              }
            ]
          }
        },
        {
          "name": "solTreasury",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "rewardBps",
          "type": "u16"
        },
        {
          "name": "allowedFunder",
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
          "name": "rewardsPool",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "rewardsPool"
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
      "name": "stakeAttnusd",
      "discriminator": [
        227,
        42,
        91,
        173,
        181,
        254,
        122,
        200
      ],
      "accounts": [
        {
          "name": "rewardsPool",
          "writable": true
        },
        {
          "name": "rewardsAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  115,
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
                "path": "rewardsPool"
              }
            ]
          }
        },
        {
          "name": "staker",
          "writable": true,
          "signer": true
        },
        {
          "name": "userAttnAta",
          "writable": true
        },
        {
          "name": "userSAttnAta",
          "writable": true
        },
        {
          "name": "attnVault",
          "writable": true,
          "relations": [
            "rewardsPool"
          ]
        },
        {
          "name": "attnMint",
          "relations": [
            "rewardsPool"
          ]
        },
        {
          "name": "sAttnMint",
          "writable": true,
          "relations": [
            "rewardsPool"
          ]
        },
        {
          "name": "stakePosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
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
                "path": "rewardsPool"
              },
              {
                "kind": "account",
                "path": "staker"
              }
            ]
          }
        },
        {
          "name": "solTreasury",
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
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "unstakeAttnusd",
      "discriminator": [
        26,
        111,
        222,
        103,
        93,
        250,
        232,
        200
      ],
      "accounts": [
        {
          "name": "rewardsPool",
          "writable": true
        },
        {
          "name": "rewardsAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  115,
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
                "path": "rewardsPool"
              }
            ]
          }
        },
        {
          "name": "staker",
          "writable": true,
          "signer": true
        },
        {
          "name": "userAttnAta",
          "writable": true
        },
        {
          "name": "userSAttnAta",
          "writable": true
        },
        {
          "name": "attnVault",
          "writable": true,
          "relations": [
            "rewardsPool"
          ]
        },
        {
          "name": "attnMint",
          "relations": [
            "rewardsPool"
          ]
        },
        {
          "name": "sAttnMint",
          "writable": true,
          "relations": [
            "rewardsPool"
          ]
        },
        {
          "name": "stakePosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  115,
                  116,
                  97,
                  107,
                  101,
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
                "path": "rewardsPool"
              },
              {
                "kind": "account",
                "path": "staker"
              }
            ]
          }
        },
        {
          "name": "solTreasury",
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
          "name": "rewardsPool",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "rewardsPool"
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
      "name": "updateAllowedFunder",
      "discriminator": [
        4,
        131,
        95,
        82,
        230,
        147,
        43,
        214
      ],
      "accounts": [
        {
          "name": "rewardsPool",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "rewardsPool"
          ]
        }
      ],
      "args": [
        {
          "name": "newAllowedFunder",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "updateRewardBps",
      "discriminator": [
        53,
        156,
        41,
        228,
        190,
        167,
        121,
        120
      ],
      "accounts": [
        {
          "name": "rewardsPool",
          "writable": true
        },
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "rewardsPool"
          ]
        }
      ],
      "args": [
        {
          "name": "newRewardBps",
          "type": "u16"
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
      "name": "stakePosition",
      "discriminator": [
        78,
        165,
        30,
        111,
        171,
        125,
        11,
        220
      ]
    }
  ],
  "events": [
    {
      "name": "allowedFunderUpdated",
      "discriminator": [
        144,
        252,
        126,
        90,
        187,
        50,
        166,
        136
      ]
    },
    {
      "name": "rewardBpsUpdated",
      "discriminator": [
        211,
        46,
        6,
        243,
        105,
        251,
        219,
        198
      ]
    },
    {
      "name": "rewardsAdminUpdated",
      "discriminator": [
        83,
        68,
        182,
        163,
        47,
        159,
        199,
        96
      ]
    },
    {
      "name": "rewardsClaimed",
      "discriminator": [
        75,
        98,
        88,
        18,
        219,
        112,
        88,
        121
      ]
    },
    {
      "name": "rewardsFunded",
      "discriminator": [
        84,
        233,
        245,
        203,
        228,
        147,
        165,
        92
      ]
    },
    {
      "name": "rewardsPoolInitialized",
      "discriminator": [
        105,
        221,
        214,
        239,
        80,
        216,
        120,
        65
      ]
    },
    {
      "name": "rewardsPoolPaused",
      "discriminator": [
        98,
        3,
        79,
        251,
        25,
        224,
        67,
        197
      ]
    },
    {
      "name": "staked",
      "discriminator": [
        11,
        146,
        45,
        205,
        230,
        58,
        213,
        240
      ]
    },
    {
      "name": "unstaked",
      "discriminator": [
        27,
        179,
        156,
        215,
        47,
        71,
        195,
        7
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
      "name": "invalidBps",
      "msg": "Invalid reward basis points"
    },
    {
      "code": 6003,
      "name": "positionPoolMismatch",
      "msg": "Stake position pool mismatch"
    },
    {
      "code": 6004,
      "name": "positionOwnerMismatch",
      "msg": "Stake position owner mismatch"
    },
    {
      "code": 6005,
      "name": "insufficientStake",
      "msg": "Insufficient staked balance"
    },
    {
      "code": 6006,
      "name": "unauthorizedCreatorVault",
      "msg": "Creator vault mismatch"
    },
    {
      "code": 6007,
      "name": "insufficientTreasury",
      "msg": "Insufficient SOL in treasury"
    },
    {
      "code": 6008,
      "name": "unauthorizedFunder",
      "msg": "Unauthorized funder"
    },
    {
      "code": 6009,
      "name": "treasuryBalanceRegression",
      "msg": "Treasury balance decreased unexpectedly"
    },
    {
      "code": 6010,
      "name": "invalidTreasuryOwner",
      "msg": "Treasury owner must be system program"
    },
    {
      "code": 6011,
      "name": "invalidAllowedFunder",
      "msg": "Allowed funder must be set"
    },
    {
      "code": 6012,
      "name": "invalidTreasuryAccount",
      "msg": "Treasury PDA mismatch"
    },
    {
      "code": 6013,
      "name": "unauthorizedAdmin",
      "msg": "Unauthorized admin"
    },
    {
      "code": 6014,
      "name": "invalidAdmin",
      "msg": "Invalid admin public key"
    },
    {
      "code": 6015,
      "name": "poolPaused",
      "msg": "Rewards pool is paused"
    },
    {
      "code": 6016,
      "name": "indexInvariant",
      "msg": "Index must remain unchanged when no stake is present"
    },
    {
      "code": 6017,
      "name": "pendingRewardsInvariant",
      "msg": "Pending rewards must accumulate when no stake is present"
    },
    {
      "code": 6018,
      "name": "operationOutOfOrder",
      "msg": "Operation id out of order"
    }
  ],
  "types": [
    {
      "name": "allowedFunderUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "allowedFunder",
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
      "name": "rewardBpsUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "rewardBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "rewardsAdminUpdated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
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
      "name": "rewardsClaimed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
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
      "name": "rewardsFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "sourceAmount",
            "type": "u64"
          },
          {
            "name": "solPerShare",
            "type": "u128"
          },
          {
            "name": "treasuryBalance",
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
      "name": "rewardsPoolInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
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
            "name": "rewardBps",
            "type": "u16"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "allowedFunder",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "rewardsPoolPaused",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "paused",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "stakePosition",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "stakedAmount",
            "type": "u64"
          },
          {
            "name": "rewardDebt",
            "type": "u128"
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
      "name": "staked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalStaked",
            "type": "u64"
          },
          {
            "name": "claimed",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "unstaked",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pool",
            "type": "pubkey"
          },
          {
            "name": "user",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "totalStaked",
            "type": "u64"
          },
          {
            "name": "claimed",
            "type": "u64"
          }
        ]
      }
    }
  ]
};
