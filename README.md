# Meiou Cloud Loan Website Prototype

React/Vite prototype for the "美鸥跨境 × 建行平台云贷" product website.

## Run locally

Frontend preview:

```bash
pnpm install
pnpm dev
```

Backend API for customer lead collection:

```bash
ADMIN_TOKEN=meiou2026 pnpm dev:api
```

Local frontend preview:

```text
http://127.0.0.1:5173/
```

Local backend:

```text
http://127.0.0.1:8787/
```

## Customer Data

- Customers submit the financing intent form on the website.
- Submissions are saved locally to `server/data/leads.json`.
- The admin panel is at `/#admin`.
- Default admin token: `meiou2026`
- Click “导出 Excel” in the admin panel to download the customer summary.

For production after running `pnpm build`, start the combined static site and API server:

```bash
ADMIN_TOKEN=your-secure-token pnpm start
```
