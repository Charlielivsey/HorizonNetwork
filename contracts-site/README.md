# HN Group Contracts — contract.hngroup.org.uk

Contracts are sent here to be signed (the user's requests, 29 October 2026; rebuilt the same day in the HN Group
website theme). PM2 `hn-contracts`, loopback port 5560, data in `/var/lib/hn-contracts` (`contracts.json` and the PDFs
in `files/`), HN Group Auth client `contracts`. Pages use the HN Group website stylesheet (`public/assets/site.css`, a
copy of hngroup-site's) plus `contracts.css` for the app's own parts.

- **Who can do what** comes from the staff portal's roles through HN Group Auth, like every HN Group website:
  **Send contracts for signing** (`contracts.send`) uploads and sends; **Manage all contracts** (`contracts.manage`)
  also sees and can chase or cancel every contract; owner-level accounts have both. Anyone with a sign-in account can
  sign what they're sent. Nobody can send, sign or decline while an administrator is logged in as them.
- **Sending**: upload a PDF (or press **Send for signing** in HN Group Docs, which hands the PDF over loopback to
  `/api/service/import` with the shared service secret; refused through nginx), choose who signs from the staff list
  (each a profile of a sign-in account; any profile of that account can sign), say what each signs as, choose **any
  order** or **one after another**, an optional date to sign by and a message, then send. Drafts can be deleted.
- **Signing**: open the contract (recorded; signing is refused until then), type your full name and confirm. Each
  signature is tied to the PDF's SHA-256 fingerprint, with the time, account, email and IP address. Signers can
  decline with a reason. The sender can **remind** the people still to sign (shown on their list; nothing is emailed)
  and cancel before it's complete.
- **Finished**: once everyone has signed, a signing certificate (PDF on HN Group letterhead, `lib/certificate.js` with
  `lib/pdf.js`, a copy of docs-site's) lists every signature and the history. The contract PDF is never changed.
- **Dashboard**: To sign, In progress, Finished, Drafts (senders) and All contracts (managers), with search.
- **`GET /healthz`** reports `{ok, service, version, checks: {data, auth, pages}}` and nothing private.

Install or update: `sudo bash contracts-site/install.sh`. The root `install.sh` runs it when this folder changes **or
whenever the site isn't running or has no web address**. It stops the retired `hn-documents` service, names any other
program holding port 5560, shows the service's log if it won't start, and finishes by checking the site through nginx
the way visitors reach it ("HN Group Contracts is working" or "CONTRACTS NOT REACHABLE …").
Tests: `node --test contracts-site/test.cjs`.
