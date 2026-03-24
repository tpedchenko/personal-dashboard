"""AES-256-GCM decryption compatible with Next.js encryption module.

The Next.js side encrypts secrets as: iv:authTag:ciphertext (base64-encoded).
This module decrypts them using the same ENCRYPTION_KEY env var (64-char hex = 32 bytes).
"""
import os
import base64
import logging

logger = logging.getLogger(__name__)

_IV_LENGTH = 12  # 96 bits
_AUTH_TAG_LENGTH = 16  # 128 bits


def _get_key() -> bytes | None:
    """Get the 32-byte encryption key from ENCRYPTION_KEY env var."""
    hex_key = os.environ.get("ENCRYPTION_KEY")
    if not hex_key or len(hex_key) != 64:
        return None
    return bytes.fromhex(hex_key)


def is_encrypted(value: str) -> bool:
    """Check if a value looks like an AES-GCM encrypted string (iv:authTag:ciphertext)."""
    parts = value.split(":")
    return len(parts) == 3


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a value encrypted by the Next.js encrypt() function.

    Format: iv:authTag:ciphertext (all base64-encoded).
    Falls back to returning the raw value if not encrypted or key not available.
    """
    if not is_encrypted(ciphertext):
        return ciphertext

    key = _get_key()
    if not key:
        return ciphertext

    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        parts = ciphertext.split(":")
        iv = base64.b64decode(parts[0])
        auth_tag = base64.b64decode(parts[1])
        encrypted_data = base64.b64decode(parts[2])

        # AES-GCM expects ciphertext + auth_tag concatenated
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(iv, encrypted_data + auth_tag, None)
        return plaintext.decode("utf-8")
    except Exception as e:
        logger.debug("AES-GCM decrypt failed, returning raw value: %s", e)
        return ciphertext
