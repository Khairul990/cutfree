# Fix GitHub Pages workflow (required for built React app)

Your PAT `ghp_LVF52o…` is missing the `workflow` scope, so it cannot update `.github/workflows/pages.yml` via git push (GitHub blocks PATs without `workflow`).

The code push succeeded (`310901d` → `main`), but the Pages workflow on the remote is still the old one that uploads `path: .` (raw repo) instead of building. You MUST update the workflow once via the GitHub web editor (which does not need PAT scope):

## Manual fix (30 seconds, via web UI)

1. Go to https://github.com/Khairul990/cutfree/blob/main/.github/workflows/pages.yml
2. Click ✎ Edit (pencil), replace ENTIRE file with:

```yaml
name: Deploy CutFree to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build site
        run: npm run build

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Upload static site
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

3. Commit directly to `main` (green Commit changes).

After that, every `git push` will auto-build (`npm ci` → `npm run build` → upload `dist/`) and Pages will serve the compiled React Studio.

## Alternative: new PAT with `workflow`

If you prefer pushing from this workspace, create a new Classic PAT with scopes `repo` + `workflow`, paste it, and I’ll push the workflow file immediately.

---
Build verified: `npm run build` → `dist/` with `index.html` 15.3 kB, `studio.html` 104 kB, `main-Do617C3W.js` 334 kB, etc.
Commit pushed: `310901d` (6 files, 3038 insertions).
