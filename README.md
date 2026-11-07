# Travel Map

Light up the places you've been on a rotatable 3D globe and a flat world map. Add trips (year and month), notes and photos to each place. Click a place to get a close-up of its outline, with a flag for every trip; click a flag to swipe through that trip's photos.

- China is split into its provinces and the US into its states; everywhere else counts as a country or territory.
- You edit in your browser, on your own computer. One command publishes a read-only version as a static website (GitHub Pages, your own domain, or any static host).
- Your travel data and photos never go into this code repository.

## Quick start

Requires [Node.js](https://nodejs.org/) 20.19 or newer.

```bash
git clone <this repository's URL> travel-map
cd travel-map
npm install
npm run dev        # opens http://localhost:5173
```

## Using the editor

- **Light up a place**: click it on the map → **Light it up**. You can also search by name.
- **Light up many at once**: the **All regions** tab in the sidebar, or turn on **Quick light** (bottom left of the map) and click around the map.
- **Trips**: open a place → **+ Add trip**, pick a year and month, add a note. A place can have any number of trips.
  - A trip with a year shows as a **flag** labelled with its date.
  - A trip set to **Year unknown** shows as a **pin**: you went, but don't remember when.
  - A lit place with no trips shows a single pin.
- **Photos**: **Add photos**, or drag photos onto a trip card.
- **Close-up**: click any lit place to see its outline with flags and pins; click a flag to open that trip's photos, then swipe, drag or use ← →.
- **Visitor view** (top right) previews exactly what visitors to your website will see.

Everything saves automatically about a second after each change.

## Where your data lives

```
data/                  ← ignored by git, stays on your computer
  travel.json          places, trips, notes, list of photos
  travel.json.bak      the previous save (to undo a mistake)
  site.json            your website settings: title, site repository, domain
  photos/
    <id>.jpg           original photo
    <id>_thumb.jpg     720px thumbnail
    <id>_disp.jpg      2048px display copy (what the website shows)
```

- **Back up the `data/` folder yourself.** Originals exist only there.
- Photo files are named by ID and listed in `travel.json`, so don't rename or delete them by hand.
- Set `TRAVEL_DATA_DIR=/some/other/folder` to keep your data somewhere else.

## Publishing your map

You use two repositories:

| | This code | Your site repository |
|---|---|---|
| Contains | source code only | only the built website |
| Who edits it | you, with git, like any code | `npm run deploy` (replaced on every deploy) |

### First time

1. **Create the site repository**: on GitHub, create a new, empty **public** repository, for example `my-travels`. (GitHub Pages on a free account needs a public repository.)
   Name it `<you>.github.io` if you want the site at `https://<you>.github.io/`; otherwise it will be at `https://<you>.github.io/my-travels/`.

2. **Publish**:

   ```bash
   npm run deploy -- --repo git@github.com:<you>/my-travels.git --title "My Travels"
   ```

   Add `--domain travel.example.com` if you have a domain. The settings are saved to `data/site.json`, so you only type them once.

3. **Turn on GitHub Pages**: in the site repository, open Settings → Pages → Build and deployment. Set Source to **Deploy from a branch**, Branch to **main**, folder **/ (root)**, then Save.

4. **Your own domain** (optional), for example `travel.example.com`:
   - At your DNS provider, add a **CNAME** record with host `travel` and value `<you>.github.io`.
   - For a root domain like `example.com`, add four **A** records instead:
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`.
   - The domain is set automatically by the deploy (through a `CNAME` file). Once DNS works, tick **Enforce HTTPS** under Settings → Pages.

### Every time after that

```bash
npm run deploy
```

The command checks your photos, builds the site, and pushes it to your site repository. GitHub updates the website about a minute later.

To look at the website before publishing, run `npm run preview:site` and open http://localhost:4173.

| Option | |
|---|---|
| `--repo <git url>` | site repository (saved) |
| `--domain <name>` | custom domain, or `none` to remove it (saved) |
| `--title "<text>"` | site title, shown in the top bar and the browser tab (saved) |
| `--branch <name>` | branch to publish to, default `main` (saved) |
| `--dry-run` | build and prepare everything, but don't push |
| `--force` | publish even if the branch already holds other files |

For safety, `npm run deploy` refuses to publish to this code's own repository or to a branch that already holds other files.

### What is published

- **Published:** the places you lit up, trip dates and notes, thumbnails and display copies. Photos are re-encoded when you add them, so the published copies carry no EXIF data such as GPS location or camera details.
- **Never published:** original photos, original file names, upload times, `data/site.json`, and the backup file.
- Each deploy replaces the site branch with a single new commit, so photos you remove don't linger in its history. GitHub may still keep old commits for a while, so only publish what you're happy to make public.
- Deploy commits are made by a neutral author (`travel-map`), not your git name or email.

### Other hosts

`npm run build:site` writes the finished site to `site/`. It's plain static files, so you can upload it to Netlify, Cloudflare Pages, or any web server.

## Notes

- Chrome can't read iPhone HEIC photos; export them as JPG first. Safari can upload HEIC directly.
- Turning a place off (**Turn off**) deletes its trips and photos, after asking you to confirm.
- Colors live in `src/lib/theme.js`.
- `npm start` runs the editor from a production build on port 3000 (`PORT` changes it).

## Map data

From [Natural Earth](https://www.naturalearthdata.com/) 1:10m (public domain), pre-processed into `public/geo/` by `scripts/build-geo.mjs`:

- China: 31 provinces, autonomous regions and municipalities (the Paracel Islands are merged into Hainan), plus Taiwan, Hong Kong and Macau.
- United States: 50 states plus Washington, D.C. Puerto Rico, Guam and other territories are separate regions.
- French Guiana, Réunion, the Caribbean Netherlands, Svalbard and other overseas territories are separate regions from their mainland countries.
- Small uninhabited disputed areas (such as Bir Tawil) appear on the map but can't be selected.

To rebuild, download `ne_10m_admin_0_countries.geojson` and `ne_10m_admin_1_states_provinces.geojson`, then run:

```bash
npm run build-geo -- path/to/ne_10m_admin_0_countries.geojson path/to/ne_10m_admin_1_states_provinces.geojson
```

## Project structure

```
src/config.js                 editor / static-site switch, site title
src/App.jsx                   app state and data operations
src/components/
  GlobeView.jsx               3D globe (globe.gl)
  FlatMapView.jsx             flat map (d3)
  Spotlight.jsx               close-up of a place with flags and pins
  Lightbox.jsx                swipeable photo viewer
  Sidebar.jsx, PlacePanel.jsx sidebar, place details (edit / read-only)
  Gallery.jsx                 photo gallery
server/api.js                 local data API (travel.json and photos)
scripts/site-data.js          copies a snapshot of data/ into the static site
scripts/site-config.js        reads and writes data/site.json
scripts/deploy.mjs            npm run deploy
```

## License

[MIT](LICENSE). Map data: Natural Earth, public domain.
