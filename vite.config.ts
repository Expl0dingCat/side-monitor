import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// UPDATE. Every build is stamped with the moment it was made, and the page keeps itself up to date
// from its repository on GitHub (see src/update.ts): it asks there for version.json, which says which
// build nightpond.html is, and fetches that if it is newer than itself. So both files go in the root of
// the repository, and a new version is published by putting the two new ones there.
const BUILD = Date.now();
const REPOSITORY = 'Expl0dingCat/side-monitor';
// (HEAD is whichever branch the repository calls its own. Another address can be given for testing.)
const UPDATE_BASE = process.env.NIGHTPOND_UPDATE_BASE ?? `https://raw.githubusercontent.com/${REPOSITORY}/HEAD/`;

// The build is one self-contained HTML file: the script, the styles and the
// font are all folded into it, so it can be opened straight from disk.
export default defineConfig(({ command }) => ({
  plugins: [
    viteSingleFile(),
    {
      name: 'nightpond-build',
      // The page says which build it is, where a page that has fetched it can check.
      transformIndexHtml: (html) => html.replace('</title>', `</title>\n    <meta name="nightpond-build" content="${BUILD}" />`),
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: `${JSON.stringify({ build: BUILD })}\n` });
      },
    },
  ],
  // (While the page is being worked on it is left as it is: it has no address to update from.)
  define: { __BUILD__: String(BUILD), __UPDATE_BASE__: JSON.stringify(command === 'build' ? UPDATE_BASE : '') },
  build: { assetsInlineLimit: 100_000_000, target: 'es2022' },
}));
