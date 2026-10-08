"""App Store Connect araçları (tool/asc_*.py): ağ ve JWT olmadan, sahte API ile."""

import base64
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tool"))

import asc_api  # noqa: E402
import asc_provision  # noqa: E402
import asc_status  # noqa: E402


class FakeApi:
    """Önceden hazırlanmış yanıtları sırayla/yola göre döndürür, çağrıları kaydeder."""

    def __init__(self, routes):
        self.routes = routes
        self.calls = []

    def call(self, method, path, body=None, query=None, allow_forbidden=False):
        self.calls.append((method, path, body, query))
        value = self.routes.get((method, path), {})
        if isinstance(value, Exception):
            raise value
        return value


def test_provision_hedefi_tek_ve_dogru_kimlik():
    hedefler = asc_provision.targets("com.bluetwinklez.eczam")
    assert [h["identifier"] for h in hedefler] == ["com.bluetwinklez.eczam"]
    assert hedefler[0]["profile"] == "Eczam CI App"


def test_provision_bundle_varsa_olusturmaz():
    api = FakeApi({("GET", "/bundleIds"): {"data": [
        {"id": "B1", "attributes": {"identifier": "com.bluetwinklez.eczam"}}]}})
    hedef = asc_provision.targets("com.bluetwinklez.eczam")[0]
    assert asc_provision.ensure_bundle(api, hedef, dry=False) == "B1"
    assert not [c for c in api.calls if c[0] == "POST"]


def test_provision_bundle_yoksa_olusturur_ve_dry_run_dokunmaz():
    hedef = asc_provision.targets("com.bluetwinklez.eczam")[0]
    api = FakeApi({("GET", "/bundleIds"): {"data": []},
                   ("POST", "/bundleIds"): {"data": {"id": "NEW"}}})
    assert asc_provision.ensure_bundle(api, hedef, dry=False) == "NEW"
    post = [c for c in api.calls if c[0] == "POST"][0]
    assert post[2]["data"]["attributes"]["identifier"] == "com.bluetwinklez.eczam"
    assert post[2]["data"]["attributes"]["platform"] == "IOS"

    kuru = FakeApi({("GET", "/bundleIds"): {"data": []}})
    assert asc_provision.ensure_bundle(kuru, hedef, dry=True) is None
    assert not [c for c in kuru.calls if c[0] != "GET"]


def test_sertifika_seri_numarasi_bas_sifirlari_yok_sayar():
    api = FakeApi({("GET", "/certificates"): {"data": [
        {"id": "X", "attributes": {"certificateType": "DEVELOPMENT", "serialNumber": "ABC"}},
        {"id": "C1", "attributes": {"certificateType": "DISTRIBUTION", "serialNumber": "00ABC123"}}]}})
    assert asc_provision.find_certificate(api, "abc123") == "C1"
    with pytest.raises(SystemExit):
        asc_provision.find_certificate(api, "FFFF")


def test_profil_eskisini_siler_yenisini_kurar(tmp_path):
    icerik = base64.b64encode(b"profil-verisi").decode()
    api = FakeApi({
        ("GET", "/profiles"): {"data": [{"id": "OLD", "attributes": {"name": "Eczam CI App"}},
                                         {"id": "BASKA", "attributes": {"name": "Benim Profilim"}}]},
        ("POST", "/profiles"): {"data": {"attributes": {"profileContent": icerik, "uuid": "UUID-1"}}},
    })
    hedef = asc_provision.targets("com.bluetwinklez.eczam")[0]
    asc_provision.recreate_profile(api, "B1", "C1", hedef, [str(tmp_path)])
    silinen = [c[1] for c in api.calls if c[0] == "DELETE"]
    assert silinen == ["/profiles/OLD"]  # geliştiricinin kendi profiline dokunulmaz
    assert (tmp_path / "UUID-1.mobileprovision").read_bytes() == b"profil-verisi"


def test_main_admin_anahtari_yoksa_legacy_moduna_duser(tmp_path, monkeypatch):
    env = tmp_path / "env"
    monkeypatch.setenv("GITHUB_ENV", str(env))

    def yasak(*a, **k):
        raise asc_api.Forbidden("/bundleIds")

    monkeypatch.setattr(asc_provision, "provision", yasak)
    asc_provision.main()
    assert "SIGNING_MODE=legacy" in env.read_text()


def test_main_basariliysa_api_modu(tmp_path, monkeypatch):
    env = tmp_path / "env"
    monkeypatch.setenv("GITHUB_ENV", str(env))
    monkeypatch.setattr(asc_provision, "provision", lambda: None)
    asc_provision.main()
    assert "SIGNING_MODE=api" in env.read_text()


def test_durum_ozeti_uygulama_yoksa_yonlendirir():
    api = FakeApi({("GET", "/apps"): {"data": []}})
    satirlar = asc_status.summarize(api, "com.bluetwinklez.eczam")
    assert "bulunamadı" in satirlar[0]
    assert "Yeni Uygulama" in satirlar[1]


def test_durum_ozeti_derleme_ve_surum_durumlari():
    api = FakeApi({
        ("GET", "/apps"): {"data": [{"id": "A1", "attributes": {"bundleId": "com.bluetwinklez.eczam", "name": "Eczam"}}]},
        ("GET", "/builds"): {"data": [
            {"attributes": {"version": "7", "processingState": "VALID", "uploadedDate": "2026-10-04T10:00:00+03:00"}},
            {"attributes": {"version": "6", "processingState": "PROCESSING", "expired": True, "uploadedDate": "2026-10-03T09:00:00+03:00"}}]},
        ("GET", "/apps/A1/appStoreVersions"): {"data": [
            {"attributes": {"versionString": "1.0.0", "appStoreState": "WAITING_FOR_REVIEW"}}]},
    })
    metin = "\n".join(asc_status.summarize(api, "com.bluetwinklez.eczam"))
    assert "build 7 · hazır (TestFlight'ta)" in metin
    assert "build 6 · işleniyor, süresi doldu" in metin
    assert "1.0.0 · incelemede sırada" in metin
    # Salt okunur: yazma isteği yok
    assert all(c[0] == "GET" for c in api.calls)


def test_arac_dosyalarinda_gizli_anahtar_yok():
    kok = os.path.join(os.path.dirname(__file__), "..", "tool")
    for ad in os.listdir(kok):
        if not ad.endswith((".py", ".rb")):
            continue
        metin = open(os.path.join(kok, ad), encoding="utf-8").read()
        assert "BEGIN PRIVATE KEY" not in metin
