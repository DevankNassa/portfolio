Third-party files, kept local so the game works offline and without a CDN.

- `d3-array.min.js`, `d3-geo.min.js`: d3 (ISC license), https://d3js.org
- `topojson-client.min.js`: topojson-client (ISC license), https://github.com/topojson/topojson-client
- `countries-110m.js`: world-atlas 2.0.2 (ISC), built from Natural Earth 1:110m data (public domain),
  wrapped as `window.WORLD_TOPO` so it loads from `file://` too.
