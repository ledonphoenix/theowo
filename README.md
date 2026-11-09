# theowo

Private preview of the theowo.com redesign and the DXB100 launch page.

- `public/` — the site (single page; `#dxb100` opens the campaign page).
- `src/index.js` — preview gate. Every request runs through it first; visitors without a valid session see the sign-in page. Only a salted SHA-256 hash of the access code is stored (`PREVIEW_SALT` / `PREVIEW_HASH` in `wrangler.jsonc`). Each unlock lasts 15 minutes.
- Live at https://owo.sourcing360.fashion and https://theowo.sourcing360.fashion (Cloudflare custom domains). Pushing to `main` redeploys automatically.
