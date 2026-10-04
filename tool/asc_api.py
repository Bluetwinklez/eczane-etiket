#!/usr/bin/env python3
"""App Store Connect API için küçük, bağımlılığı az istemci (PyJWT gerekir).

Ortak kullanım: tool/asc_provision.py ve tool/asc_status.py.
Anahtar dosyasının içeriği asla yazdırılmaz.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.appstoreconnect.apple.com/v1"


class Forbidden(Exception):
    """API anahtarı bu işlem için yetkili değil (Admin rolü gerekir)."""


class Api:
    def __init__(self, key_id, issuer, key_path):
        self.key_id = key_id
        self.issuer = issuer
        with open(key_path, "r", encoding="utf-8") as f:
            self.key = f.read()

    def _token(self):
        import jwt  # PyJWT; yalnızca gerçek istek atarken gerekir

        now = int(time.time())
        return jwt.encode(
            {"iss": self.issuer, "iat": now, "exp": now + 900,
             "aud": "appstoreconnect-v1"},
            self.key, algorithm="ES256",
            headers={"kid": self.key_id, "typ": "JWT"})

    def call(self, method, path, body=None, query=None, allow_forbidden=False):
        url = API + path
        if query:
            url += "?" + urllib.parse.urlencode(query)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", "Bearer " + self._token())
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
                return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            detail = e.read().decode(errors="replace")
            if e.code == 403:
                print(f"::warning::{method} {path} bu API anahtarına kapalı")
                if allow_forbidden:
                    return None
                raise Forbidden(path)
            raise SystemExit(
                f"::error::App Store Connect {method} {path} başarısız "
                f"({e.code}): {detail}")
