#!/usr/bin/env python3
"""Eczam için App Store imzalama kurulumunu insansız yapar.

TestFlight çalıştırıcısında App Store Connect API anahtarıyla çalışır:
bundle ID yoksa oluşturur, P12'deki dağıtım sertifikasıyla imzalanmış taze bir
App Store provizyon profili üretir ve kurar. Apple Developer sitesini elle
açmaya gerek kalmaz.

Ortam değişkenleri:
  ASC_API_KEY_ID, ASC_API_ISSUER_ID, ASC_API_PRIVATE_KEY_PATH
  IOS_BUNDLE_ID   uygulamanın bundle ID'si (com.bluetwinklez.eczam)
  CERT_SERIAL     dağıtım sertifikasının seri numarası (hex)
  PROFILE_DIR     profillerin kurulacağı klasör(ler), ':' ile ayrılır
  DRY_RUN=1       yalnızca durumu bildirir, hiçbir şeyi değiştirmez

Çıktı (GITHUB_ENV varsa): SIGNING_MODE=api|legacy, APP_PROFILE_NAME
"""

import base64
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_api import Api, Forbidden  # noqa: E402

PROFILE_NAME = "Eczam CI App"
APP_NAME = "Eczam"


def targets(main_id):
    """Her hedef için bundle ID, görünen ad ve profil adı (yetenek yok)."""
    return [{"identifier": main_id, "name": APP_NAME,
             "profile": PROFILE_NAME, "capabilities": []}]


def find_bundle(api, identifier):
    res = api.call("GET", "/bundleIds",
                   query={"filter[identifier]": identifier, "limit": "200"})
    for item in res.get("data", []):
        if item["attributes"]["identifier"] == identifier:
            return item
    return None


def ensure_bundle(api, target, dry):
    item = find_bundle(api, target["identifier"])
    if item:
        print(f"Bundle ID {target['identifier']} var")
        return item["id"]
    if dry:
        print(f"Bundle ID {target['identifier']} oluşturulacak")
        return None
    res = api.call("POST", "/bundleIds", {"data": {
        "type": "bundleIds",
        "attributes": {"identifier": target["identifier"],
                       "name": target["name"], "platform": "IOS"}}})
    print(f"Bundle ID oluşturuldu: {target['identifier']}")
    return res["data"]["id"]


def find_certificate(api, serial):
    want = serial.upper().lstrip("0")
    res = api.call("GET", "/certificates", query={"limit": "200"})
    for item in res.get("data", []):
        attrs = item["attributes"]
        if attrs.get("certificateType") not in (
                "DISTRIBUTION", "IOS_DISTRIBUTION"):
            continue
        if (attrs.get("serialNumber") or "").upper().lstrip("0") == want:
            return item["id"]
    raise SystemExit(
        "::error::P12 içindeki dağıtım sertifikası Apple Developer "
        "hesabında bulunamadı")


def recreate_profile(api, bundle_id, cert_id, target, dirs):
    res = api.call("GET", "/profiles",
                   query={"filter[name]": target["profile"], "limit": "200"})
    for item in res.get("data", []):
        if item["attributes"]["name"] == target["profile"]:
            api.call("DELETE", f"/profiles/{item['id']}")
            print(f"  eski profil silindi: {target['profile']}")
    res = api.call("POST", "/profiles", {"data": {
        "type": "profiles",
        "attributes": {"name": target["profile"],
                       "profileType": "IOS_APP_STORE"},
        "relationships": {
            "bundleId": {"data": {"type": "bundleIds", "id": bundle_id}},
            "certificates": {"data": [
                {"type": "certificates", "id": cert_id}]}}}})
    content = base64.b64decode(res["data"]["attributes"]["profileContent"])
    uuid = res["data"]["attributes"]["uuid"]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, uuid + ".mobileprovision"), "wb") as f:
            f.write(content)
    print(f"  profil kuruldu: {target['profile']} ({uuid})")
    return content


def write_env(**values):
    path = os.environ.get("GITHUB_ENV")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as f:
        for k, v in values.items():
            f.write(f"{k}={v}\n")


def provision(api=None):
    env = os.environ
    dry = env.get("DRY_RUN") == "1"
    api = api or Api(env["ASC_API_KEY_ID"], env["ASC_API_ISSUER_ID"],
                     env["ASC_API_PRIVATE_KEY_PATH"])
    dirs = [d for d in env.get("PROFILE_DIR", "").split(":") if d]
    cert_id = None if dry else find_certificate(api, env["CERT_SERIAL"])
    for target in targets(env["IOS_BUNDLE_ID"]):
        bundle_id = ensure_bundle(api, target, dry)
        if dry:
            continue
        recreate_profile(api, bundle_id, cert_id, target, dirs)
        write_env(APP_PROFILE_NAME=target["profile"])
    print("İmzalama kurulumu tamam")


def main():
    try:
        provision()
        print("İmzalama modu: api")
        write_env(SIGNING_MODE="api")
    except Forbidden:
        # Yalnızca CI'ın kendi "Eczam CI" profili silinir; geliştiricinin
        # profillerine dokunulmaz. Admin anahtarı yoksa saklı profile dönülür.
        print("İmzalama modu: legacy (Admin anahtarı yok, saklı profil kullanılacak)")
        write_env(SIGNING_MODE="legacy")


if __name__ == "__main__":
    sys.exit(main())
