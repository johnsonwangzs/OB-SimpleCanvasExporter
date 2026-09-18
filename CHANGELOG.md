# Changelog

## 1.1.0

- Export Canvas groups as static frames and labels, preserving their positions, dimensions, border styles, corner radii, and background tints from the current theme. Reconstruct native group elements when their live DOM is unavailable.
- Preserve nested group layering beneath connections and cards, include labels in scene bounds, and retain panning through empty group interiors. Omit collapse/expand controls and keep groups separate from text search, Badge filtering, and reader controls.
- Count groups separately in the toolbar. Add native Obsidian measurements and offline browser checks using the three Develop sample groups, with color, nesting, escaping, fallback rendering, print, and group-only cases.

## 1.0.0

- Add an editable page title to the export dialog, defaulting to the Canvas name. Use the chosen title in the HTML header, browser tab, and accessible Canvas name while keeping the output path independent.
- Add independent, optional author and export-time controls. Display selected metadata to the right of the title on one line, with responsive ellipsis for long text and wrapped viewer controls on narrow screens.
- Capture export-start local time once, including an ISO timestamp and a detailed UTC-offset tooltip. Reopening or sharing the HTML preserves the original displayed time.
- Freeze export options while running, restore controls after failures, omit disabled or blank author data, and safely escape user-entered metadata. Add unit and browser coverage for the dialog-to-export flow, retries, time zones, responsive headers, and existing viewer interactions.

## 0.5.0

- Add a Background popup to exported HTML with six solid presets, a native color picker, validated 3-/6-digit HEX input, live preview, and restoration of the exact export color.
- Remember colors in the current browser per export and document address, with isolated handling of unavailable storage, invalid records, and failed saves or resets. Preferences do not modify the HTML file.
- Keep card and interface colors, connections, search/Badge conditions, zoom, pan, and reading positions intact. Coordinate popup focus and Escape with Badge and reader controls; retain original colors when printing.
- Add standalone browser coverage for the production export assembler, unique export IDs, persistence and storage failures, responsive/touch controls, no-script fallback, and captured default/Prism content.

## 0.4.0

- Add Badge filters below search in exported HTML, with original colors, distinct-card counts, multi-select Any/All matching, and a searchable full catalog. Limit the inline catalog to two rows and retain a visible selection count.
- Combine keyword and Badge conditions, highlight only final results, and navigate badge-only results including badges inside folded details. Keep keyword clearing and Badge resetting independent.
- Preserve the open reader and its position when filters change; indicate excluded reading cards without counting the reader copy. Result navigation also reveals the matching Badge in the reader.
- Keep SimpleBadge optional: no badges means no additional controls; existing standard spans still export and filter without the plugin. Preserve validated theme/custom color identities during static export, including normalized HEX values and same-name badges in different colors.
- Cover standalone export fallback, hidden/code exclusions, stable counts, folded navigation, responsive/touch catalogs, keyboard controls, print, offline viewing, and search/reader regressions with browser tests.

## 0.3.0

- Add a reader panel to exported HTML, opened from nonempty text cards. Keep the Canvas available alongside it on desktop and use a full-width reading area below the toolbar on narrow screens.
- Reflow complete card contents with independent scrolling and adjustable 14–22px text. Adapt frozen theme typography while retaining heading, badge, and code proportions; keep wide code and tables within local scroll containers.
- Highlight search terms in the panel without counting the duplicate text. Existing search-result navigation switches an open panel; editing the query preserves the current reading card and position.
- Preserve source card content and scrolling during reader operations, keep Canvas zoom and center when the panel opens or closes, and distinguish the reading source from the current search result.
- Support keyboard focus, Escape, touch controls, independent folded content, and printing without duplicated text. Keep one reader copy in memory and remap its element references.
- Add standalone browser regression coverage for reader/search interaction, actual frozen Obsidian/Prism content, responsive layouts, accessibility controls, and offline/static fallbacks.

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
