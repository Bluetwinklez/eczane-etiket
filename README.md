# Eczane Etiket & Eczam

Desktop label printing, a local pharmacy-management web server, and a mobile companion in one repository. Designed around Turkish pharmacy workflows.

[![Tests](https://github.com/Bluetwinklez/eczane-etiket/actions/workflows/test.yml/badge.svg)](https://github.com/Bluetwinklez/eczane-etiket/actions/workflows/test.yml)
[![MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Choose an application

| Application | Location | Purpose |
|---|---|---|
| Eczane Etiket | `eczane_etiket/` | Python/Tkinter desktop label printing, prescription import and patient schedules |
| Eczam Web | `web/` | Express/SQLite POS, stock/expiry batches, customers, accounting and reports |
| Eczam Mobile | `web/public/mobil/`, `mobil-uygulama/` | Mobile web/PWA interface and Capacitor iOS shell connected to an Eczam server |

The applications have separate startup and packaging paths. Installing the Python package does not install or start the Node web server. Existing pharmacy interface translations remain available.

## Desktop quick start

Use Python 3.10 or newer with Tk support (Linux distributions may require `python3-tk`):

```bash
git clone https://github.com/Bluetwinklez/eczane-etiket.git
cd eczane-etiket
python -m venv .venv
source .venv/bin/activate
# Windows: .venv\Scripts\activate
python -m pip install .
eczane-etiket
```

Alternatively, install `requirements.txt` and run `python run_app.py`. Windows users can use `baslat.bat`. Portable executable builds, when available, are listed under [Releases](https://github.com/Bluetwinklez/eczane-etiket/releases). Build one with the development requirements and `pyinstaller --clean -y eczane_etiket.spec`.

### Desktop features

- Prescription parsing and optional Medula import workflow.
- GS1 DataMatrix parsing for product identifiers, expiry dates, batch and serial information.
- Thermal labels, A4 patient medication schedules, receipts and reports.
- Patient history, stock tracking, themes, staff administration and local backups.
- Rule-based duplicate-ingredient and interaction alerts. These alerts assist review and do not replace professional judgment or a complete clinical database.

Desktop data lives in `~/.eczane_etiket`. Back it up before migration, upgrades or machine replacement. Printing depends on the installed printer driver, label dimensions and a real device test.

## Web and mobile quick start

```bash
cd web
npm ci
npm start
```

Open http://localhost:3000. Follow [the web application guide](web/README.md) for first-run credentials, password changes, roles, configuration and backups. The Windows installer is `kurulum/eczam-kur.ps1`; review it before running it because it installs dependencies and configures startup shortcuts.

For mobile access, connect to the same trusted network and use the server's LAN address with `/mobil`. Configure the same server address in the Capacitor shell. Do not expose an unconfigured local server directly to the public internet. Mobile installation and iOS signing instructions are in [mobil-uygulama/README.md](mobil-uygulama/README.md).

## Packaging and validation

Python packaging explicitly includes only `eczane_etiket` and the `run_app` entry module, with bundled fonts/icons and desktop assets. Unrelated web, installer and tooling folders are excluded from Python package discovery.

```bash
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m pip wheel --no-deps . -w dist
python -m pytest
# Linux GUI tests: xvfb-run -a python -m pytest
cd web
npm test
```

Python CI covers Windows/Ubuntu and Python 3.10–3.12. The web suite is independent. Automated tests do not certify printer hardware, Medula access, official service integration, regulatory compliance or real patient-data deployment.

## Privacy and support

Core records are stored locally. Optional import, translation, drug-data, update and external integration features can make network requests; review their configuration. Local storage alone is not a guarantee of regulatory compliance. Restrict access, use backups and avoid sharing patient data in issue reports.

See [security guidance](SECURITY.md), [the changelog](CHANGELOG.md), [the MIT license](LICENSE), and [the detailed previous desktop guide (Turkish)](README.tr.md).
