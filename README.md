# Australian Longevity Calculator

Life expectancy at ages 60 to 90 for Australians with different socio-economic characteristics.
A static website in plain JavaScript, hosted free on GitHub Pages at https://auslongevity.org.
It loads in about a second because there is no server and no R engine to download.

The R (Shiny) version is hosted separately at https://auslongevity.shinyapps.io/explorer/.

## What is in this repository

- `docs/` is the website that GitHub Pages serves.
  - `index.html`, `style.css` and `app.js` are the page and its interface.
  - `core.js` holds the calculations: cohort and period survival, life expectancy, the ages by
    which 1 in 5 and half have died, the summary wording, postcode lookup and chart axis ticks.
  - `data.json` is the only data file (about 375 KB, 154 KB compressed).
  - `CNAME` sets the custom domain.
  - `shinylive-sw.js` retires the service worker of an earlier version of the site for returning
    visitors. It can be removed once that is no longer needed.

There is no build step. Edit the files in `docs/`, commit and push.

## Licence

This work is licensed under the
[Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International licence (CC BY-NC-ND 4.0)](https://creativecommons.org/licenses/by-nc-nd/4.0/).
The full text is in the `LICENSE` file. You may share it with attribution for non-commercial purposes
without changing it. For other uses, please contact the project lead, Fei Huang
(feihuang@unsw.edu.au).
