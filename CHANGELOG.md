# Changelog

## 0.2.0

- Add offline search to exported HTML: highlight every matching text card and matching text, with an optional dimming mode for other cards and their connections.
- Search complete card contents, including scrolled-off text, badges, code, and displayed wikilink aliases. Match literal phrases without case sensitivity or regular-expression syntax.
- Add matching-card and occurrence counts, previous/next card navigation, and a view that fits all matching cards. Navigation reveals the first occurrence inside long cards and horizontally scrolling code blocks.
- Preserve the current view while typing or clearing a query. Support Chinese input composition, English/Chinese controls, narrow toolbars, browser find, and printing without search decoration.
- Keep card-level highlighting and navigation available when CSS Custom Highlight is unavailable. Search requires no network access and does not modify Canvas files.
- Add standalone browser regression tests, including captured Obsidian/Prism content and a 500-card, one-million-character performance fixture.

## 0.1.1

- Fix connection lines disappearing in HTML exports when using the Prism theme with Style Settings.
- Preserve native connection colors, arrow styles, and zoom-dependent line widths, including connections outside the visible Canvas area.
- Add regression checks for themed connections, preset and custom colors, and arrow directions.

## 0.1.0

- Initial release: export Canvas to standalone HTML with original card layouts, native connections, styled content, SimpleBadge support, and independently scrollable cards.
