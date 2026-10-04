# Australian Longevity Explorer (GitHub Pages / shinylive version)

A static, serverless build of the Australian Longevity Explorer's main **Explorer** tab
(life expectancy by socio-economic profile), compiled with
[shinylive](https://posit-dev.github.io/r-shinylive/) so it runs entirely in the visitor's
browser via WebAssembly — no R server required, hosted free on GitHub Pages.

- **Live site:** served from the `docs/` folder via GitHub Pages.
- **Full-featured version** (includes the Medical Explorer tab, which is intentionally
  excluded here for scope): https://auslongevity.shinyapps.io/explorer/

## Repo layout

- `app/` — the Shiny app source (`app.R` + data files). Edit this, not `docs/`.
- `data-raw/` — the raw source spreadsheets (ABS SEIFA 2016 and the ALT life tables) and
  `build_data.R`, which turns them into the small `.rds` lookup files in `app/`. These raw files
  are not part of the app, so visitors never download them.
- `docs/` — the exported static site that GitHub Pages actually serves. Generated from
  `app/` via `shinylive::export()`; do not hand-edit.

## Rebuilding the site after an `app/app.R` change

```sh
./build-site.sh
```

This needs R with the `shinylive` package. The script exports the site, sets the custom domain
and page title, and removes shinylive files this app never uses. Then commit and push the
updated `docs/` folder.

## Static JavaScript version (preview)

`web/` holds a version of the explorer written in plain JavaScript, with no R engine to download,
so it loads in about a second. `build-site.sh` publishes it at `/beta/`.

- `web/core.js` holds the calculations (the same steps as `app/app.R`), `web/app.js` the interface,
  and `web/data.json` the data (built by `Rscript data-raw/build_web_data.R`).
- `tests/` checks the JavaScript against the R app. `make_reference.R` writes reference results from
  the R functions, then `node tests/check.mjs <reference.json>` compares them (all 29,760 combinations
  of profile, age and basis, the axis ticks and the postcode handling). `tests/check_text.mjs`
  compares the summary wording with the text the R app renders.

## Notes

- Uses only `shiny` and `dplyr` at run time, with base R graphics and string functions (no
  `tidyverse`, `ggplot2`, `stringr`, `readxl` or `shinyjs`), to keep the WebAssembly package bundle small.
- To refresh the lookup files after changing a raw spreadsheet, run `Rscript data-raw/build_data.R`
  (needs `dplyr` and `readxl`), then re-export the site.
- First visit downloads the shared R/WebAssembly runtime (~70MB, cached by the browser
  afterwards via a Service Worker), so first load is slower than a normal web page.
- The life expectancy methodology follows Huang, Hui & Villegas,
  *Australian Retirement Mortality* (JRI submission).
