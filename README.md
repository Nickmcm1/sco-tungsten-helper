# SCO Tungsten Helper

**Unofficial** Chrome extension for VA **School Certifying Officials (SCOs)**.

> Not affiliated with, endorsed by, or connected to Tungsten Network / Kofax or
> the U.S. Department of Veterans Affairs.

On the Tungsten "Active purchase orders" page you normally have to open each
purchase order one at a time just to see which student it belongs to. This
extension reads that for you — using your own logged-in session — and shows the
student (participant) name right under each PO number. Optionally it also shows
the approved program and the VA buyer contact email.

Nothing is sent anywhere. Names are read only from PO pages you already have
access to, and cached locally on your own device (`chrome.storage.local`). You
can clear the cache any time from the popup.

## Install (from source)

1. Download/clone this repo.
2. Go to `chrome://extensions`, enable **Developer mode**.
3. **Load unpacked** → select the `extension/` folder.
4. Open the Tungsten legacy portal and click **Load student names**.

## Privacy

See [PRIVACY.md](PRIVACY.md) — also published at the GitHub Pages site for this
repo.

## License

Personal/educational use. No warranty.
