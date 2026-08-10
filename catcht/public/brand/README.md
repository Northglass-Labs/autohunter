# AutoHunter identity assets

AutoHunter's own mark is an `A` crossed by a road and completed by a destination point. It is not
the Northglass ensō. The primary interface lockup remains live text in
`src/components/autohunter-brand.tsx`; these SVGs are the editable export set for product metadata,
documentation, and approved Northglass surfaces.

| Asset | Use |
| --- | --- |
| `autohunter-symbol.svg` | Standalone adaptive symbol; near-black on light and off-white on dark |
| `autohunter-wordmark.svg` | Product wordmark in the Space Grotesk-led application stack |
| `autohunter-lockup.svg` | Horizontal symbol-and-wordmark lockup |
| `autohunter-app-icon.svg` | Square app and social icon on the house-dark plate |
| `autohunter-favicon-16.svg` / `autohunter-favicon-32.svg` | Explicit small-size variants |

The symbol uses one filled silhouette with no gradient, so it retains light, dark, and single-color
behavior. The app icon uses Northglass house dark (`#0A0A0A`) and AutoHunter signal lavender
(`#C7B7FF`). Do not replace the product mark with the parent ensō, stretch it, separate its road and
destination point, or infer vehicle-manufacturer affiliation.

The endorsement is separate supporting copy and must appear exactly as `a Northglass Product` on
product provenance surfaces. It is intentionally not baked into the primary wordmark or horizontal
lockup.
