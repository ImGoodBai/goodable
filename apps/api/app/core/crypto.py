import base64
import os
from typing import Optional
from cryptography.fernet import Fernet


class SecretBox:
    def __init__(self, key: Optional[str] = None) -> None:
        # Expect a base64 urlsafe key. If none provided, derive from env or generate (dev only)
        key = key or os.getenv("ENCRYPTION_KEY")
        if key is None:
            # Dev fallback: generate ephemeral key
            key = base64.urlsafe_b64encode(os.urandom(32)).decode()
        self._fernet = Fernet(key)

    def encrypt(self, plaintext: str) -> str:
        token = self._fernet.encrypt(plaintext.encode("utf-8"))
        return token.decode("utf-8")

    def decrypt(self, ciphertext: str) -> str:
        return self._fernet.decrypt(ciphertext.encode("utf-8")).decode("utf-8")


secret_box = SecretBox()
