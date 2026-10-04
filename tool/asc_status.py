#!/usr/bin/env python3
"""Eczam'ın App Store Connect durumunu özetler (salt okunur).

TestFlight derlemesi işlendi mi, hangi sürüm incelemede, durum ne? Hiçbir şeyi
değiştirmez. GitHub Actions'ta `App Store durumu` iş akışıyla çalışır.

Ortam değişkenleri:
  ASC_API_KEY_ID, ASC_API_ISSUER_ID, ASC_API_PRIVATE_KEY_PATH
  IOS_BUNDLE_ID   (varsayılan com.bluetwinklez.eczam)
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from asc_api import Api  # noqa: E402

BUILD_STATES = {
    "PROCESSING": "işleniyor",
    "FAILED": "işlenemedi",
    "INVALID": "geçersiz",
    "VALID": "hazır (TestFlight'ta)",
}
VERSION_STATES = {
    "PREPARE_FOR_SUBMISSION": "hazırlanıyor (henüz gönderilmedi)",
    "READY_FOR_REVIEW": "inceleme için hazır",
    "WAITING_FOR_REVIEW": "incelemede sırada",
    "IN_REVIEW": "inceleniyor",
    "PENDING_DEVELOPER_RELEASE": "onaylandı, yayın bekliyor",
    "PENDING_APPLE_RELEASE": "onaylandı, Apple yayınlayacak",
    "READY_FOR_SALE": "yayında",
    "REJECTED": "REDDEDİLDİ (Resolution Center'a bakın)",
    "METADATA_REJECTED": "REDDEDİLDİ: metadata (Resolution Center'a bakın)",
    "DEVELOPER_REJECTED": "geri çekildi",
    "REMOVED_FROM_SALE": "satıştan kaldırıldı",
}


def find_app(api, bundle_id):
    res = api.call("GET", "/apps",
                   query={"filter[bundleId]": bundle_id, "limit": "5"})
    for item in res.get("data", []):
        if item["attributes"].get("bundleId") == bundle_id:
            return item
    return None


def summarize(api, bundle_id):
    """Okunabilir satırlar döndürür."""
    lines = []
    app = find_app(api, bundle_id)
    if not app:
        return [f"Uygulama bulunamadı: {bundle_id}",
                "App Store Connect → Uygulamalar → + Yeni Uygulama ile "
                "önce uygulamayı oluşturun."]
    attrs = app["attributes"]
    lines.append(f"Uygulama: {attrs.get('name')} ({bundle_id})")

    builds = api.call("GET", f"/apps/{app['id']}/builds",
                      query={"limit": "5", "sort": "-uploadedDate"})
    lines.append("Son derlemeler:")
    items = builds.get("data", [])
    if not items:
        lines.append("  (henüz derleme yok)")
    for b in items:
        a = b["attributes"]
        state = BUILD_STATES.get(a.get("processingState"),
                                 a.get("processingState"))
        expired = ", süresi doldu" if a.get("expired") else ""
        lines.append(f"  build {a.get('version')} · {state}{expired} · "
                     f"{(a.get('uploadedDate') or '')[:16]}")

    versions = api.call("GET", f"/apps/{app['id']}/appStoreVersions",
                        query={"limit": "5"})
    lines.append("App Store sürümleri:")
    items = versions.get("data", [])
    if not items:
        lines.append("  (henüz sürüm yok)")
    for v in items:
        a = v["attributes"]
        state = VERSION_STATES.get(a.get("appStoreState"),
                                   a.get("appStoreState"))
        lines.append(f"  {a.get('versionString')} · {state}")
    return lines


def main():
    env = os.environ
    api = Api(env["ASC_API_KEY_ID"], env["ASC_API_ISSUER_ID"],
              env["ASC_API_PRIVATE_KEY_PATH"])
    lines = summarize(api, env.get("IOS_BUNDLE_ID", "com.bluetwinklez.eczam"))
    print("\n".join(lines))
    summary = env.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("### App Store durumu\n```\n" + "\n".join(lines) + "\n```\n")


if __name__ == "__main__":
    sys.exit(main())
