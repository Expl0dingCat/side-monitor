# nightpond

A calm pixel-art landscape for a side monitor, driven by the real weather and time of day.

## Use it

Download `nightpond.html` from the latest release and open it in a browser. That one file is the whole thing.

## It keeps itself up to date

Versions are kept as Releases. Each time the page is opened it asks GitHub which release is the
latest. If that is a newer version than itself, it fetches that release's `nightpond.html`, checks
it, and becomes it in place. The newer copy is kept in the browser, so the next opening starts from
it at once, with or without a network.

A page cannot write to the file it was opened from, so the file on disk stays as it was downloaded.
When that file is older than the newest version, the page says so under the time and offers the new
file, to save over the old one.

## Publish a new version

1. Set `"version"` in `package.json` (say `0.1.1`), then:

       npm install
       npm run build

2. Put the new `nightpond.html` in the root of this repository (with any changed source).
3. Only then, make a release whose tag is the version with a `v` before it (`v0.1.1`), and attach
   `nightpond.html` to it for people who download by hand.

Leave `version.json` as it is. It is for copies made before versions were kept as releases: it brings
them over to this kind by themselves the first time they are opened.

The order matters. The page fetches `nightpond.html` from the repository as it stood at the
release's tag (GitHub does not let a page read a release's attachments), so the new file has to be
in the repository before the release is made. A release whose file does not say the same version
is ignored.
