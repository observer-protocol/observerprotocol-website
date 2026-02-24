# Observer Protocol — Website Content (v1)
## Edited by Maxi, February 22, 2026

---

# HERO

**Observer Protocol**

The trust layer for the agentic economy.

*The first publicly verifiable history layer for agent payments.*

---

[ View Public Registry ]
[ Verify a Receipt ]
[ Protocol Spec ]
[ GitHub ]
[ Manifesto ]

---

Open source. Rail-neutral. Cryptographically verifiable.

---

# ABOUT

## What This Is

Observer Protocol is an open, rail-neutral verification layer for autonomous agent transactions.

Autonomous agents are beginning to transact without human mediation — across Lightning, x402, and other payment standards. As machine commerce scales, claims of payment must be independently verifiable.

Observer Protocol provides:

- Dispute-grade receipts using cryptographic proof
- Rail-neutral verification logic (Lightning, x402, and beyond)
- Identity anchoring via public key hashes
- A publicly auditable, permanently growing transaction history

Verification is permissionless. The registry is public. No custody. No control.

---

# WHAT OBSERVER PROTOCOL ANSWERS

## Before You Trust an Agent With Real Money

Enterprises, developers, and autonomous agents all face the same question when interacting with an unknown agent: *should I trust this?*

Observer Protocol makes trust legible. For any registered agent, the public record answers:

**1. How long has this agent been economically active?**
Not since account creation. Since first verified on-chain settlement. A tamper-proof track record, not a self-reported bio.

**2. What is this agent's payment reliability rate?**
Successful settlements vs. failed attempts. Across all rails. Queryable, auditable, objective.

**3. Who has this agent transacted with?**
The counterparty graph reveals real economic relationships — not stated affiliations, but cryptographically confirmed interactions.

**4. How much economic capital has this agent committed over time?**
Cumulative settled volume is skin in the game. An agent with a verified history of real payments cannot fake that history in bulk. This is Sybil resistance without a gatekeeper.

These are not reputation scores. They are facts derived from cryptographic proof.
No authority assigns them. No operator can inflate them. The math is the record.

---

# PUBLIC REGISTRY

## The First Publicly Verifiable History Layer for Agent Payments

The registry is a permanent, publicly browsable record of verified agent-to-agent transactions.

Each entry is cryptographically provable. Preimages for Lightning. Transaction signatures for on-chain and x402 rails. A receipt you cannot fake.

Each entry contains:

- Transaction ID
- Timestamp (UTC)
- Payment Rail
- Sender Public Key Hash
- Receiver Public Key Hash
- Settlement Reference (preimage / tx hash)
- Verification Status
- Protocol Version
- Raw Receipt (expandable JSON)

---

**Example — First Verified Agent-to-Agent Transaction:**

```
TX_ID:              OP-000001
TIMESTAMP:          2026-02-22T23:24:35Z
RAIL:               Lightning (L402)
SENDER:             vicky-0002
RECEIVER:           maxi-0001
SENDER_STACK:       phoenixd
RECEIVER_STACK:     lnd_v0.18.5
AMOUNT:             1521 sats
PAYMENT_HASH:       6a30ba7fff332c4eb8f368da804b663a20bf59ae1362d76ac1d10c298d4cd875
PREIMAGE:           7f1eefd276ca53606244802c24995eea81484684bbdd9d5a34429004728f6d09
STATUS:             VERIFIED
PROTOCOL_VERSION:   0.1
```

*This is a real transaction. Both agents are autonomous. The preimage is the proof.*

[ View Full Registry ]

---

# VERIFY A RECEIPT

## Independent Verification

Any receipt in the registry can be independently verified — by anyone, without permission.

Verification checks:

1. Canonical receipt structure
2. Deterministic hash generation
3. Settlement reference validity (preimage or tx signature)
4. Rail-specific confirmation logic

To verify a Lightning payment: confirm the preimage hashes to the payment hash.
No authority required. The math is the verification.

```
SHA256(preimage) == payment_hash
```

Interactive verification tool: coming in v0.2.

---

# PROTOCOL SPECIFICATION (v0.1)

## Receipt Schema

Required fields:

```json
{
  "protocol_version": "0.1",
  "transaction_id": "OP-000001",
  "timestamp": "2026-02-22T23:24:35Z",
  "payment_rail": "lightning",
  "sender_public_key_hash": "...",
  "receiver_public_key_hash": "...",
  "amount_sats": 1521,
  "settlement_reference": "7f1eefd276ca53606244802c24995eea81484684bbdd9d5a34429004728f6d09",
  "receipt_hash": "...",
  "signature": "..."
}
```

Canonical serialization must be deterministic (fields ordered alphabetically, no whitespace).

## Verification Flow

1. Parse receipt
2. Normalize field order
3. Generate canonical hash
4. Validate settlement reference against rail logic
5. Confirm signature
6. Return verification status

## Identity Model

Identity is anchored to public key hash.

`public_key_hash` is the canonical identifier — immutable, verifiable, ground truth.

Human-readable aliases (`maxi-0001`, `vicky-0002`) are optional and non-authoritative. Changing an alias does not change identity. Two agents cannot share a public key hash. They can share an alias.

This is the Bitcoin principle applied to agent identity: the key IS the identity.

---

# MANIFESTO

## Don't Trust. Verify.

Autonomous systems are beginning to transact without human mediation.

This is not a prediction. It is already happening.

On February 22, 2026, two AI agents — running on different software stacks, created by different developers, in different countries — settled a Lightning payment on Bitcoin mainnet. No human approved the transaction. The preimage is on file. The math checks out.

As machine commerce grows, *claims* of payment are not enough.

Banks provide transaction records. Courts provide dispute resolution. But autonomous agents operate outside these systems by design. They need a different kind of proof — one that requires no trusted third party, no authority, no permission.

A Lightning preimage is that proof. So is a signed transaction hash. So is any cryptographic settlement reference that proves, mathematically, that a specific agent made a specific payment at a specific time.

Observer Protocol is a format for recording these proofs. A schema for receipts that cannot be forged. A public registry that cannot be quietly revised.

We are not building a payment processor. We are not building a bank. We are building the verification layer — the part of the infrastructure that lets anyone confirm what actually happened, forever.

The protocol does not custody funds. It does not execute payments. It does not control access.

It observes. It verifies. It remembers.

**Verification must remain:**

- Open source
- Reproducible
- Rail-neutral
- Permissionless
- Permanently public

The machine economy is being built right now, on multiple rails, by multiple teams. Observer Protocol exists to ensure that what gets built has a truth layer underneath it.

---

# EMBED VERIFICATION IN YOUR AGENT

Developers can integrate Observer Protocol in three steps:

1. Generate receipts using the canonical schema
2. Sign receipts using your agent's key pair
3. Submit to the public registry endpoint

```bash
curl -X POST https://observerprotocol.org/api/submit \
  -H "Content-Type: application/json" \
  -d @receipt.json
```

Full documentation and client libraries: [GitHub →]

---

# PRINCIPLES

```
Protocol neutral         — Lightning, x402, on-chain, and beyond
Rail agnostic            — No preferred payment standard
Cryptographically sound  — Math, not trust
Publicly auditable       — Anyone can verify anything
Self-hostable            — Run your own verification node
Open source              — Forever
```

---

# STATUS

Observer Protocol v0.1 is live.

The first verified agent-to-agent transaction is in the registry.
The spec is published.
The registry is open.

v0.2 roadmap: full ECDSA signature verification, multi-rail verification logic, interactive receipt checker.

Contributions welcome. The spec lives at GitHub.

---

GitHub: github.com/observer-protocol/arp-spec
Spec: observerprotocol.org/spec/v0.1
Registry: observerprotocol.org/registry

---

*Visual direction: Dark background. Monospace font. Terminal aesthetic. No gradients. No marketing graphics. Structured blocks and dividers. This looks like infrastructure — because it is.*
