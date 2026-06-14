# SCO Tungsten Helper — Privacy Policy

_Last updated: June 14, 2026_

**SCO Tungsten Helper** ("the extension") is an unofficial browser tool for VA
School Certifying Officials. It is **not affiliated with, endorsed by, or
connected to** Tungsten Network / Kofax or the U.S. Department of Veterans
Affairs. This policy explains exactly what the extension does and does not do
with data.

## What data the extension accesses

When you click "Load student names" on the Tungsten "Active purchase orders"
page, the extension reads purchase-order pages **using your own
already-logged-in Tungsten session**. From those pages it extracts, for each PO:
the participant (student) name, and optionally the approved program and the VA
buyer contact email shown on the PO. It performs these reads only on
`portal-legacy.tungsten-network.com`.

## How that data is stored

The extracted names (and optional program / buyer-contact values) are cached
locally on your own device using the browser's `chrome.storage.local` so the
list does not have to be re-read every visit. **This data never leaves your
device.**

## What the extension does NOT do

- It does **not** send any data to the developer or to any third-party server.
  There is no analytics, tracking, or telemetry.
- It does **not** collect your Tungsten credentials, cookies, or login
  information.
- It does **not** sell or share any data with anyone.

## Clearing your data

You can delete all cached names at any time from the extension popup using
"Clear cached names." Removing/uninstalling the extension also deletes its local
storage.

## Permissions

- `storage` — caches names locally on your device.
- Host access to `portal-legacy.tungsten-network.com` — reads PO pages within
  your existing logged-in session. No other sites are accessed.

## Contact

Questions: nmcmillen27@gmail.com
