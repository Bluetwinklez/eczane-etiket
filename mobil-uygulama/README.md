# Eczam Mobile — Capacitor iOS Shell

A thin native shell around the Eczam mobile web application served at `/mobil/`. It needs a running Eczam server; installing the shell does not install a pharmacy database or server.

## Development

Use Node 22 or newer. iOS compilation, signing and local Xcode use require macOS and an appropriate Apple development environment.

```bash
npm ci
npm test
npm run senkron
npm run ios:ac
```

`senkron` prepares `www/` and synchronizes the iOS project. `ios:ac` opens Xcode. The project uses Swift Package Manager. `www/` contains the connection screen; `scripts/hazirla.js` copies shared assets from `web/public/`.

## Connecting

On first launch the shell looks for an Eczam server on common private network ranges at port 3000 using `/api/health`. It saves a discovered server address and loads its `/mobil/` page. You can enter an address manually, including when discovery cannot find the server. An unreachable saved local address triggers rediscovery.

Internet addresses require HTTPS. HTTP is allowed only for supported private/local addresses. Keep phones and the pharmacy server on a trusted network. The broad Capacitor navigation setting supports different pharmacies' server addresses; only connect to a server you trust.

The user agent includes `EczamApp/1.0`, enabling the mobile interface's server-switch control.

## Release and verification

The shell, synchronization and unsigned compilation are covered by separate workflows. Signed TestFlight/App Store submission needs configured Apple credentials and provisioning. Automated compilation does not certify real-device networking, camera behavior, signing or store approval.

[Release and secret configuration](../docs/APP_STORE_RELEASE.md) · [Previous detailed guide (Turkish)](README.tr.md) · [Repository overview](../README.md).
