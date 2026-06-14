# Chrome Web Store submission notes — SCO Tungsten Helper

Copy/paste answers for the developer dashboard. **Recommended visibility:
Unlisted** (shareable link, lighter review, not searchable) since the audience
is a small group of fellow SCOs.

---

## Store listing — Description

> **Unofficial. Not affiliated with Tungsten Network / Kofax or the U.S.
> Department of Veterans Affairs.**
>
> SCO Tungsten Helper saves VA School Certifying Officials time on the Tungsten
> "Active purchase orders" page. Normally you have to open each purchase order
> one at a time just to see which student it belongs to. This extension reads
> that information for you — using your own logged-in session — and shows the
> student (participant) name right under each PO number in the list. You can
> optionally show the approved program and the VA buyer contact email too.
>
> Nothing is sent anywhere. Names are read only from PO pages you already have
> access to, and cached locally on your own device. You can clear the cache at
> any time from the popup.

## Single purpose (required field)

> Display the student/participant name for each purchase order on the Tungsten
> "Active purchase orders" list without the user having to open each PO
> individually.

## Permission justifications (required)

- **storage** — Caches the extracted names locally on the user's device so the
  list does not have to be re-read on every visit.
- **Host permission `https://portal-legacy.tungsten-network.com/*`** — The
  extension only operates on the Tungsten legacy portal. It reads PO pages
  within the user's existing authenticated session to extract the participant
  name. No other hosts are accessed.
- **Remote code** — None. No remote scripts are loaded or executed.

## Data Use disclosures (required checkboxes)

The extension handles **Personally identifiable information** (student names)
and **Personal communications** (a VA buyer contact email shown on the PO).
Declare:

- [x] Collects: "Personally identifiable information" (names) — stored locally only.
- [ ] Does NOT sell or transfer data to third parties.
- [ ] Does NOT use or transfer data for purposes unrelated to the single purpose.
- [ ] Does NOT use or transfer data to determine creditworthiness / lending.
- Certify: data is **not transmitted off the device**; it stays in
  `chrome.storage.local`.

## Privacy policy URL (required because PII is handled)

Paste this published URL into the dashboard's Privacy policy field:

```
https://nickmcm1.github.io/sco-tungsten-helper/
```

(The extension also bundles `privacy.html`, linked from the popup, but the Web
Store requires this publicly reachable URL.)

## Pre-submission checklist

- [x] Manifest V3
- [x] Icons 16/48/128 present
- [x] Description < 132 chars, leads with "Unofficial"
- [x] No remote code / eval
- [x] Minimal permissions (storage + single host)
- [x] In-product + hosted privacy policy
- [ ] Privacy policy hosted at a public URL and pasted into the dashboard
- [ ] Confirm Tungsten Network's own Terms of Service permit this use
- [ ] Consider Unlisted visibility
