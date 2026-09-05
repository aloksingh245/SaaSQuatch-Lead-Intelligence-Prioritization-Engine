# Frontend

React 19 + Vite frontend for the SaaSQuatch Lead Intelligence demo.

## Commands

```bash
npm ci
npm run dev
npm run build
npm run lint
```

The Vite dev server runs on port 5173 and proxies `/api` requests to the backend on port 3000.

## Screens

- **Pipeline**: searchable, filterable ranked lead queue with ICP-fit/readiness scores and an accessible lead detail dialog.
- **Import**: CSV/XLSX/XLS upload with active ICP summary and live processing counts.
- **ICP Settings**: edit the active scoring profile; saving does not trigger web scraping.
