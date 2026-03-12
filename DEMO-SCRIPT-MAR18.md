# Observer Protocol Demo Script
## Lightning Labs Community Call — March 18, 2026
**Duration:** 5 minutes  
**Presenter:** Boyd  
**Demo URL:** https://observerprotocol.org/demo

---

## 1. Problem (15 seconds)

> "L402 proves an agent *paid*. But here's the problem: how do you trust the agent's claims about its track record?"
>
> "Any agent can say 'I've processed 10,000 payments.' But where's the proof? Reputation scores can be gamed. Reviews can be faked."
>
> "What if we could verify claims cryptographically — not with authority, but with math?"

**[Transition: Screen share the demo page]**

---

## 2. Solution (15 seconds)

> "Observer Protocol. It's a cryptographic trust layer for agentic payments."
>
> "Don't trust claims. Verify them. Every entry in this registry is backed by a Lightning preimage or an EVM signature."
>
> "Not a reputation score. Not a review. Math."

**[Gesture to the hero section with live counter]**

---

## 3. Live Feed (30 seconds)

> "This is the live verification stream. Every few seconds, it polls the registry for new events."
>
> "Each row shows: the protocol — Lightning or x402, the transaction reference, whether it's cryptographically verified, and when it happened."
>
> "Notice the amber pulse? That happens when a new verification lands. It's subtle, but it's the moment math becomes truth."

**[Point to feed items, scroll if needed]**

---

## 4. The Moment (2 minutes)

> "Now here's where it gets interesting. I'm going to generate a Lightning invoice. Someone on this call — anyone — can pay it."
>
> "And when that payment settles, you'll see it appear here in real time."

**[Generate invoice via your LND node, display QR on screen]**

> "Go ahead — scan it with any Lightning wallet. It's just a few sats."

**[Wait for payment — this is the demo moment]**

> "There! Did you see it? The amber pulse — that's the payment being cryptographically verified."
>
> "SHA256 of the preimage equals the payment hash. No trust required. The math is the record."
>
> "This entry is now permanently in the registry. Timestamped. Immutable."

---

## 5. Badge (30 seconds)

> "Every verified agent gets one of these."
>
> "[Show the SVG badge] It's a cryptographically signed badge that any agent can display. Embed it in your GitHub README, your website, your agent's profile."
>
> "The badge URL is deterministic: badge/{agent-id}.svg. It updates in real time as the agent builds its verification history."
>
> "This is maxi-0001 — my AI agent. It's been running autonomously, making payments, building a track record that can't be faked."

---

## 6. CTA (1 minute)

> "Here's the ask: We're proposing an `op-verify` skill for Lightning Agent Tools."
>
> "60-second integration. Any L402-enabled agent can join. No gatekeepers. No approval process. Just cryptographic proof."
>
> "The registry is live now at observerprotocol.org. The API is public. The SDK is on npm."
>
> "We're not selling anything. This is free infrastructure. We monetize intelligence at Agentic Terminal, not the protocol."
>
> "If you're building agents that need to prove their track record — or if you're selecting agents and need to verify their claims — talk to us."
>
> "The code is open source. The protocol is permissionless. The math is the trust."

**[End screen share]**

---

## Backup Plan

If the live payment fails or takes too long:
- Have a pre-made payment hash ready
- Say: "While we're waiting, here's one that landed earlier today..."
- Click into the feed item to show the verification details

---

## Technical Checklist (Day Of)

- [ ] Test https://observerprotocol.org/demo loads
- [ ] Verify API endpoints responding:
  - [ ] https://api.observerprotocol.org/observer/trends
  - [ ] https://api.observerprotocol.org/observer/feed
  - [ ] https://api.observerprotocol.org/observer/agents/list
- [ ] Generate test invoice beforehand (have QR ready)
- [ ] Have backup invoice in case first one fails
- [ ] Test screen sharing in call platform
- [ ] Close unnecessary tabs/apps
- [ ] Have LND node ready to generate invoices

---

## Key Talking Points to Hit

1. **L402 proves payment. OP proves claims.** — The distinction matters
2. **No reputation scores** — This is cryptographic, not social
3. **Rail-neutral** — Lightning today, x402 live, more coming
4. **Permanent record** — Once verified, always verifiable
5. **Free infrastructure** — Not a product pitch, a protocol proposal

---

## Q&A Anticipated

**Q: How is this different from a block explorer?**  
A: Block explorers show *that* a payment happened. Observer Protocol proves *who* made it and builds a verifiable history *across* rails.

**Q: Can agents fake their identity?**  
A: They can create new identities, but they can't fake history. Every verification costs real sats. That's Sybil resistance without a gatekeeper.

**Q: What's the business model?**  
A: We don't monetize the protocol. We monetize intelligence at Agentic Terminal. This is public infrastructure.

**Q: Is this live now?**  
A: Yes. The registry has been running since February 22. The genesis transaction was between two AI agents on mainnet.

---

*Good luck. The math is on your side.*
