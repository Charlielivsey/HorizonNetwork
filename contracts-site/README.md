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
  (each a profile of a sign-in account; any profile of that account can sign), choose what each signs as from a list (`ROLES` in lib/store.js: Employee, On behalf of HN Group Limited or
  another group company, Witness), choose **any
  order** or **one after another**, an optional date to sign by and a message, then send. Drafts can be deleted.
  The same person can be added more than once to sign as different things (for example as the Employee and On behalf
  of HN Group Limited); one signature covers every place that is theirs to sign at that moment (all of them in any
  order; each as it comes round when signed in order). Each place on the list has its own `key`.
- **Signature boxes** (2.1.0): on a draft the sender can place boxes on the PDF (Signature, Full name, Date signed,
  Job title) for each person: choose whose box and what it's for, click on the page, then drag it or its corner
  (arrow keys nudge, Delete removes). Positions are fractions of the page (`fields` on the contract). Signers see their
  boxes; once they sign, their typed signature, name, date and job title are written into them. Anyone without boxes
  still uses the template's signing block or the Electronic signatures page.
- **Reading**: the PDF is drawn on the page by PDF.js 4.10.38 (`public/assets/pdfjs/`, Apache-2.0, LICENSE.txt
  beside it), with zoom and a page counter, the same in every browser and in light and dark; if it can't open a PDF
  the browser's own viewer is used.
- **Signed copy**: each signature is written onto the PDF as soon as that person signs, without waiting for the
  others (`lib/stamp.js`: PDF.js finds the template's signing table, a heading such as "On behalf of HN Group
  Limited" or "The Employee" with Name:, Signature: and Date: under it, and pdf-lib fills the block matching what the
  signer signs as; anyone without a block goes on an "Electronic signatures" page at the end). The viewer and
  Download show the signed copy; `?original` gives the file exactly as uploaded, whose SHA-256 every signature is
  tied to. pdf-lib 1.17.1 (MIT) and the PDF.js legacy build are kept in `lib/vendor/`.
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

## Signing links and PINs (2.2.0)

When a contract is sent, everyone signing it gets their own link (`https://contract.hngroup.org.uk/s/<link>`) and a
six-digit PIN. The sender sees them straight after sending (copy the link, the PIN, or a ready-made message) and can make
a new link and PIN for anyone still to sign from the contract page ("New link & PIN"; the old ones stop working). With
the link and PIN, the person can read, download and sign or decline that one contract without signing in, so it works
for people who aren't staff or can't get into their account. Only hashes of links and PINs are stored; five wrong PINs
lock a link for 15 minutes; an unlocked link lasts two hours in that browser; cancelled contracts can't be opened.

People outside HN Group can be added as signers ("+ Someone outside HN Group": name, optional email and organisation);
they sign with their link and PIN.

Staff contracts sent from Docs carry an automatic signature layout. Choosing each signer and their role places full name, signature, job title and date boxes in the matching employee/employer column. Boxes can still be moved, resized, deleted or placed manually; removing all boxes does not immediately recreate them. New Docs staff contract templates have an employee column on the left and employer column on the right, with a taller signature row.
