# Public website fonts

Self-hosted Latin WOFF2 assets, retrieved from the official Google Fonts CSS API
on October 25, 2026. No font package or runtime third-party request is required.

- Allura regular, weight 400, version 23:
  https://fonts.gstatic.com/s/allura/v23/9oRPNYsQpS4zjuA_iwgW.woff2
- Raleway upright variable, CSS weight range 400–600, version 37:
  https://fonts.gstatic.com/s/raleway/v37/1Ptug8zYS_SKggPNyC0ITw.woff2

The unmodified Google Fonts Latin assets cover the site's English content and
common punctuation. Other characters use the declared system fallbacks. Only
400, 500, and 600 are used; no italic font or synthetic weight is requested.

Allura and Raleway are distributed under the SIL Open Font License 1.1. The
original copyright and license notices are in `Allura-OFL.txt` and
`Raleway-OFL.txt`, copied from the corresponding `ofl` directories in
https://github.com/google/fonts.

`components/PublicSite.module.css` declares uniquely named font faces with
`font-display: swap`. Its variables are applied only by the public branch of
`SiteChrome`; the root font variables, authentication, protected application,
and document-generation styles remain unchanged. Browser font loading is
on demand, so standalone application screens do not request these assets.
