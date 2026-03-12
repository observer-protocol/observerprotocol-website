#!/usr/bin/env python3
"""
Observer Protocol SDK — Drop-in Python SDK for agent onboarding and verification.

Usage:
    1. Register your agent (one-time setup)
    2. Submit verified transactions with cryptographic proof

Requires: pip install cryptography requests
"""
import requests
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

# === CONFIGURATION ===
# Replace with your agent's private key (hex, 64 chars) and agent ID
PRIVATE_KEY_HEX = "your-private-key-hex-here"
AGENT_ID = "your-agent-id"
API_BASE = "https://api.observerprotocol.org"


def sign(message: str) -> str:
    """Sign a message using ECDSA (secp256k1) and return hex signature (r||s)."""
    priv_int = int(PRIVATE_KEY_HEX, 16)
    priv_key = ec.derive_private_key(priv_int, ec.SECP256K1())
    msg_bytes = message.encode('utf-8')
    sig_der = priv_key.sign(msg_bytes, ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(sig_der)
    return (r.to_bytes(32, 'big') + s.to_bytes(32, 'big')).hex()


def register_agent(public_key: str, alias: str = None) -> dict:
    """
    Register your agent with the Observer Protocol.
    Call this once to get your agent into the registry.
    """
    payload = {
        "agent_id": AGENT_ID,
        "public_key": public_key,
        "alias": alias or AGENT_ID
    }
    resp = requests.post(f"{API_BASE}/observer/agents/register", json=payload)
    resp.raise_for_status()
    return resp.json()


def submit_transaction(
    transaction_hash: str,
    amount_sats: int,
    direction: str = "inbound",
    protocol: str = "lightning"
) -> dict:
    """
    Submit a verified transaction with cryptographic proof.
    The message is signed to prove the agent authorized this submission.
    """
    # Create the message to sign (agent_id + transaction_hash)
    message = f"{AGENT_ID}:{transaction_hash}"
    signature = sign(message)
    
    payload = {
        "agent_id": AGENT_ID,
        "transaction_hash": transaction_hash,
        "amount_sats": amount_sats,
        "direction": direction,
        "protocol": protocol,
        "signature": signature
    }
    resp = requests.post(f"{API_BASE}/observer/submit-transaction", json=payload)
    resp.raise_for_status()
    return resp.json()


if __name__ == "__main__":
    # Example usage:
    # 1. First, derive your public key from your private key and register
    # 2. Then submit transactions as they occur
    
    print("Observer Protocol SDK loaded.")
    print(f"Agent ID: {AGENT_ID}")
    print("\nQuick start:")
    print("  1. Set PRIVATE_KEY_HEX and AGENT_ID above")
    print("  2. Call register_agent(public_key) to onboard")
    print("  3. Call submit_transaction(...) for each payment")
