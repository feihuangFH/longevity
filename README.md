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
- `docs/` — the exported static site that GitHub Pages actually serves. Generated from
  `app/` via `shinylive::export()`; do not hand-edit.

## Rebuilding the site after an `app/app.R` change

```r
install.packages("shinylive")
shinylive::export("app", "docs")
```

Then commit and push the updated `docs/` folder.

## Notes

- Uses only `dplyr`, `shinyjs`, and `readxl`, with base R graphics and string functions (no
  `tidyverse`, `ggplot2`, or `stringr`), to keep the WebAssembly package bundle small.
- First visit downloads the shared R/WebAssembly runtime (~70MB, cached by the browser
  afterwards via a Service Worker), so first load is slower than a normal web page.
- The life expectancy methodology follows Huang, Hui & Villegas,
  *Australian Retirement Mortality* (JRI submission).
