# Eczam Web

A local pharmacy-management server using Express and Node's built-in SQLite module. It provides inventory, POS, expiry/batch tracking, customers, accounting, reporting and a mobile interface without a frontend build step.

## Run

Requires Node.js **22.5.0 or newer** (Node 24 is recommended).

```bash
npm ci
npm start
```

Open http://localhost:3000. The initial login is `admin` / `admin123`; complete the required password change before use. `PORT` changes the listening port. `npm run dev` enables the Node watcher. Local records live under `data/`; keep this directory outside version control and back it up independently.

## Daily operation

The interface covers products, branch stock, GS1 codes, FEFO batch deductions, sales/returns, customer accounts, supplier receipts/orders, stock counts, transfers, expenses, cash closing and reports. Features target Turkish pharmacy workflows. The drug-interaction dataset is limited and requires professional review. Official service connectivity must be configured and verified separately.

The mobile PWA is served at `/mobil`. Connect phones on the same trusted LAN using the host computer's IP address. For a native iOS shell, see [the mobile application](../mobil-uygulama/README.md).

## Security and backups

Use individual accounts and appropriate roles. Change bootstrap credentials, restrict network access and verify backup restoration before production use. Public internet deployments require deployment-specific TLS, session configuration and access controls. SMTP must be configured for real email; SMS and unconfigured notification paths can be simulated. Do not mistake a simulated notification for a delivered message.

## Tests

```bash
npm test
```

The suite uses isolated test databases. Printer hardware, live official APIs and a production network are outside automated coverage.

[Detailed module and configuration reference (Turkish)](README.tr.md) · [Repository overview](../README.md).
