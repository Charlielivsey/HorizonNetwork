# HN Group Contracts — contracts.hngroup.org.uk

Contracts are sent here to be signed (the user's request, 29 October 2026). PM2 `hn-contracts`, loopback port 5560,
data in `/var/lib/hn-contracts` (`contracts.json` and the PDFs in `files/`), HN Group Auth client `contracts`.

- **Sending** needs the staff portal permission **Send contracts for signing** (`contracts.send`); **Manage all
  contracts** (`contracts.manage`, guarded) also shows every contract. Super Admin and Leadership & HR get both once;
  owner-level accounts have every permission. HN Group Auth passes each account's permissions to every website.
- **Upload a PDF** (or press **Send for signing** in HN Group Docs, which renders the document and hands it over
  loopback to `/api/service/import` with the shared service secret; refused through nginx), then choose who signs
  from the staff list. Each signer is a profile of an HN Group Auth sign-in account; they can sign from any profile of
  that account. Nobody can sign a draft.
- **Signing**: sign in, open the contract (recorded; signing is refused until then), type your full name and confirm.
  The signature is recorded against the PDF's SHA-256 fingerprint with the time, account, email and IP address. A
  signer can decline with a reason. Nobody can sign while logged in as someone else.
- **When everyone has signed** the contract is complete and a signing certificate (PDF, HN Group letterhead, drawn by
  `lib/pdf.js`, a copy of docs-site's) lists every signature and the contract's history. The contract PDF itself is
  never changed.
- The sender (or someone who manages contracts) can cancel a contract before it's complete; a draft is deleted.
- No emails: people see what's waiting for them on the site.

Install or update: `sudo bash contracts-site/install.sh` (the root `install.sh` runs it when this folder changes).
Tests: `node --test contracts-site/test.cjs`.
