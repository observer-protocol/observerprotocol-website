# Verification samples

Three artifacts for anyone checking that the Observer Protocol verifier does what this site says
it does. All three are served publicly and are meant to be downloaded.

| File | Expected verdict | Reason the engine returns |
|---|---|---|
| `verifies-delegation-mandate.json` | **allow: true** | `credential verified` |
| `must-not-verify-tampered-signature.json` | **allow: false** | `[proof] eddsa-jcs-2022 signature does not verify against the issuer key` |
| `must-not-verify-expired-mandate.json` | **allow: false** | `validity: credential expired (validUntil 2026-02-01T00:00:00Z)` |

Measured with `@observer-protocol/policy-engine@1.0.0-rc.12` on 13 August 2026, and byte-identical
to the rc.10 run of the same day and the rc.5 run of 8 August 2026 that this table cited before
them. The reason strings above are the engine's own output, copied from the run, not paraphrases.
rc.12 is what `npm install @observer-protocol/policy-engine` serves today.

## What each one is

**`verifies-delegation-mandate.json`** is a byte-identical copy of
`/credentials/maxi-0001-trading-mandate-2026-08.json`, a real `ObserverDelegationCredential` issued
by `did:web:bitcoinsingularity.ai` to `did:web:observerprotocol.org:agents:maxi-0001`. It is here so
the passing and failing cases sit in one directory.

**`must-not-verify-tampered-signature.json`** is that credential with a single character changed
inside `proof.proofValue`. Every other byte is identical. It exists to show that the signature check
is real: if it verified, nothing else on this site would be worth reading.

**`must-not-verify-expired-mandate.json`** is that credential with `validFrom` and `validUntil`
moved into the past. Note that its signature no longer covers the altered document either — the
validity window is checked first, so this is what the engine reports. Both defects are present; the
first one reached is the one named.

## These are deliberately broken

The two `must-not-verify-*` files are not valid credentials and are not evidence of anything about
the agent named inside them. They are test fixtures for the verifier. Do not treat a file in this
directory as an authorisation for anything.
