# nightpond

A calm pixel-art landscape for a side monitor, driven by the real weather and time of day.

## Use it

Download `nightpond.html` and open it in a browser. That one file is the whole thing.

## It keeps itself up to date

Each time it is opened, the page asks this repository which build is here (`version.json`). If that
is newer than itself, it fetches `nightpond.html`, checks it, and becomes it in place. The newer copy
is kept in the browser, so the next opening starts from it at once, with or without a network. A page
cannot write to the file it was opened from, so the file on disk stays as it was downloaded.

## Publish a new version

    npm install
    npm run build

Then put the new `nightpond.html` and `version.json` in the root of this repository, both together.
Pages that are opened after that pick it up (GitHub can take up to five minutes to serve the new files).
