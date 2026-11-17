import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// UPDATE. The page keeps itself up to date from its repository on GitHub (see src/update.ts), where
// versions are kept as Releases. Every build carries its version, taken from package.json; the page
// asks GitHub which release is the latest, and if that is a newer version than itself, fetches that
// release's nightpond.html from the repository as it stood at the release's tag.
// So, to publish a version: set "version" in package.json, build, put the new nightpond.html in the
// repository, and then make a release there whose tag is that version with a v before it (v1.2.3).
const REPOSITORY = 'Expl0dingCat/side-monitor';
const VERSION = process.env.NIGHTPOND_VERSION ?? JSON.parse(readFileSync('package.json', 'utf8')).version;
// Copies made before versions were kept as releases went by build numbers: they look in the repository
// for version.json, and take the repository's nightpond.html if it carries the build number that gives.
// So version.json stays in the repository, saying this number, and every build carries it: those copies
// then come over to this kind by themselves, the first time they are opened. (It is above every build
// of that kind there was, and never changes.)
const OLD_KIND = 1800000000000;
// (Other addresses can be given for testing.)
const RELEASES = process.env.NIGHTPOND_RELEASES ?? `https://api.github.com/repos/${REPOSITORY}/`;
const FILES = process.env.NIGHTPOND_FILES ?? `https://raw.githubusercontent.com/${REPOSITORY}/`;

// The build is one self-contained HTML file: the script, the styles and the
// font are all folded into it, so it can be opened straight from disk.
export default defineConfig(({ command }) => ({
  plugins: [
    viteSingleFile(),
    {
      name: 'nightpond-version',
      // The page says which version it is, where a page that has fetched it can check.
      transformIndexHtml: (html) => html.replace('</title>', `</title>\n    <meta name="nightpond-version" content="${VERSION}" />\n    <meta name="nightpond-build" content="${OLD_KIND}" />`),
    },
  ],
  // (While the page is being worked on it is left as it is: it has no address to update from.)
  define: { __VERSION__: JSON.stringify(VERSION), __RELEASES__: JSON.stringify(command === 'build' ? RELEASES : ''), __FILES__: JSON.stringify(FILES) },
  build: { assetsInlineLimit: 100_000_000, target: 'es2022' },
}));
