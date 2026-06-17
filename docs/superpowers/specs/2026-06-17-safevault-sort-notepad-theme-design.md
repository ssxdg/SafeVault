# SafeVault Sorting, Notepad Reorder, and Theme Design

Date: 2026-06-17

## Context

SafeVault is an Electron + React password vault with local JSON storage. It manages password/account records, URL/token records, and global rich-text notepads. The current app already records `useCount` for account and URL interactions, but ordering is not reliably restored after closing and reopening the app. Notepad tabs render in array order and can only be appended. The visual style should be improved while keeping the existing desktop-tool layout.

## Goals

- Restore account and URL ordering after app restart.
- Keep higher-use account and URL items before lower-use items.
- Preserve existing order when items have the same usage count.
- Add drag-and-drop ordering for notepad tabs.
- Add three switchable UI themes based on the approved A/B/C visual directions.
- Persist the selected theme in app data so import/export carries it between devices.
- Improve visual polish without changing the app's main information architecture.

## Non-Goals

- No encryption changes.
- No new settings page.
- No change to the current account, URL, or notepad editing workflows.
- No automatic live resort that makes cards jump immediately after a click.

## Data Model

The data remains `schemaVersion: 2`.

Add one optional top-level field:

```json
{
  "theme": "secure"
}
```

Allowed values:

- `secure`: clean security theme, corresponding to visual direction A.
- `compact`: dense utility theme, corresponding to visual direction B.
- `warm`: warm personal-notes theme, corresponding to visual direction C.

If `theme` is missing or invalid, normalize it to `secure`.

The theme field is part of the app data and must be included in reads, writes, imports, and exports.

## Account And URL Sorting

Sorting rules:

- Sort accounts within each tab by `useCount` descending.
- Sort URLs within each tab by `useCount` descending.
- If two records have the same `useCount`, keep their previous relative order.
- Missing or invalid `useCount` is treated as `0`.

Sorting should be applied during data normalization so it is consistent after:

- Opening the app.
- Importing data.
- Writing or exporting normalized data.

The current UI behavior should remain stable while the user is using a list:

- Copying account/password/email/login URL increments account use count.
- Copying or opening a URL/token increments URL use count.
- Current visible card order does not jump immediately after the click.
- Sorting refreshes on existing refresh points such as tab switch, search change, and app restart.

## Notepad Reordering

The `notepads` array order is the source of truth for the tab order.

Add drag-and-drop behavior to the notepad tab strip:

- Dragging a notepad tab over another tab shows a visible drop indicator.
- Dropping reorders the `notepads` array.
- The active notepad remains active after reorder.
- Pending rich-text content is flushed before reorder to prevent content loss.
- Reordered data is automatically saved through the existing app save timer.

New notepads continue to append to the end of the tab strip.

## Theme Switching

Add a global theme selector in the title bar, immediately before the window control buttons.

Interaction:

- The selector displays the current theme name.
- Clicking it opens a small menu with three choices:
  - Secure
  - Compact
  - Warm
- Selecting a theme updates app state immediately.
- The selected theme is saved in `data.theme`.

Implementation:

- Apply `data-theme="<theme>"` to the root app container.
- Use CSS variables for theme tokens.
- Convert major global colors, sidebars, headers, cards, borders, shadows, focus rings, and active states to use those variables.
- Keep layout dimensions and workflows mostly unchanged.

Theme directions:

- `secure`: white content area, deep teal sidebar, teal primary action color, light and professional.
- `compact`: restrained blue-gray utility styling, lower shadow, denser scanning feel.
- `warm`: warm neutral background and amber accents, softer personal-tool feeling.

## UI Polish

Improve the existing look while preserving the desktop productivity shape:

- Reduce heavy shadows and oversized rounded corners where they make the interface feel less precise.
- Strengthen active, hover, focus, and drag-over states.
- Avoid emoji-style UI icons where practical; use text or existing image/SVG icon affordances until a full icon library is introduced.
- Keep button text readable and prevent layout shifts during hover or drag.

## Components To Change

- `electron/fileManager.js`
  - Normalize theme.
  - Normalize and stable-sort accounts and URLs.
  - Preserve theme through import/export.

- `src/App.jsx`
  - Initialize default `theme`.
  - Add `setTheme` handler.
  - Pass theme state to the app root and title bar.
  - Add `reorderNotepads` handler.

- `src/components/TitleBar.jsx`
  - Add theme selector UI.

- `src/components/NotesPad.jsx`
  - Add drag-and-drop ordering for notepad tabs.
  - Flush pending save before reorder.

- `src/styles/global.css`
  - Add CSS variables for the three themes.
  - Update major layout and component styles to use variables.
  - Add notepad drag-over styling and theme selector styling.

## Testing And Verification

Preferred verification:

- Add or use a small Node-level test/script for data normalization:
  - Missing theme normalizes to `secure`.
  - Invalid theme normalizes to `secure`.
  - Accounts sort by descending `useCount`.
  - URLs sort by descending `useCount`.
  - Equal `useCount` preserves source order.
- Run `npm run build`.
- Start the app in development mode if feasible and inspect:
  - Account/URL order after reload.
  - Notepad drag reorder.
  - Theme selection and persistence.
  - Import/export includes `theme`.

## Risks

- Existing files contain mojibake text. Edits should avoid broad text rewrites and focus on behavior and styling.
- The current worktree already has modified files. Implementation must preserve unrelated user changes and stage only intentional files.
- Drag-and-drop plus rich-text autosave can lose recent edits if pending content is not flushed before reorder.
