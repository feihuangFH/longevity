# Australian Longevity Explorer

Life expectancy at ages 60 to 90 for Australians with different socio-economic characteristics.
A static website in plain JavaScript, hosted free on GitHub Pages at https://auslongevity.org.
It loads in about a second because there is no server and no R engine to download.

The R (Shiny) version is hosted separately at https://auslongevity.shinyapps.io/explorer/. The
JavaScript version repeats its calculations and is checked against it (see below).

## What is in this repository

- `docs/` is the website that GitHub Pages serves.
  - `index.html`, `style.css` and `app.js` are the page and its interface.
  - `core.js` holds the calculations: cohort and period survival, life expectancy, the ages by
    which 1 in 5 and half have died, the summary wording, postcode lookup and chart axis ticks.
  - `data.json` is the only data file (about 375 KB, 154 KB compressed).
  - `CNAME` sets the custom domain.
  - `shinylive-sw.js` retires the service worker of an earlier version of the site for returning
    visitors. It can be removed once that is no longer needed.
- `tools/` rebuilds the data and checks the calculations against the R app.

There is no build step for the site. Edit the files in `docs/`, commit and push.

## Rebuilding the data

`docs/data.json` is built from the source files of the main R app, which is expected in a folder
next to this repository (`../AuLifeExpectancy`, or set the `MAIN_APP` environment variable).

```sh
Rscript tools/build_data.R
```

It needs R with the `dplyr`, `readxl` and `jsonlite` packages.

## Checking the JavaScript against the R app

```sh
Rscript tools/make_reference.R /tmp/ref.json
node tools/check.mjs /tmp/ref.json

Rscript tools/make_text_reference.R /tmp/text_ref.json
node tools/check_text.mjs /tmp/text_ref.json
```

The first pair compares every combination of profile, start age and basis (29,760 cases), the chart
axis ticks and the postcode handling with the R functions. The second pair compares the full
summary wording with the text the R app renders, including the "beyond age 100" cases. Run these
after any change to `core.js` or `data.json`. Node 18 or later is needed.

## Methodology

Cohort mortality follows the construction in Huang, Hui and Villegas, using the Australian
Government Actuary's 125-year improvement factors. Life expectancy is the complete expectation of
life, the sum of the survival probabilities plus one half. Socio-economic status is the SEIFA 2016
IRSAD decile, from the postcode or chosen directly.

## Licence

This work is licensed under the
[Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International licence (CC BY-NC-ND 4.0)](https://creativecommons.org/licenses/by-nc-nd/4.0/).
The full text is in the `LICENSE` file. You may share it with attribution for non-commercial purposes
without changing it. For other uses, please contact the project lead, Fei Huang
(feihuang@unsw.edu.au).
