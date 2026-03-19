# Figma String Variable Selector

A Figma plugin for quickly finding and connecting string variables to text layers. Built for teams that sync localisation strings from Lokalise (or similar tools) into Figma as variables.

## The problem

When you have hundreds of string variables spread across multiple collections, Figma's built-in variable picker is painful to use. This plugin gives you a searchable, filterable list with inline value previews so you can find the right variable in seconds.

## Features

- Search by variable name or actual string value
- Filter by collection
- Values load progressively inline — no clicking to preview
- Works with plain text layers and component Text Properties
- Supports team library variables

## Setup

**Requirements:** Node.js (via nvm or any install)

```bash
npm install
npm run build
```

Then in Figma desktop:

**Plugins → Development → Import plugin from manifest** → select `manifest.json`

## Development

```bash
npm run dev
```

Watches `src/` and rebuilds on every change. Reload the plugin in Figma to pick up changes.

## How it works

- `src/code.ts` — runs in Figma's sandboxed environment, handles all Figma API calls
- `src/ui/index.ts` — the plugin UI, compiled and injected into `dist/ui.html` at build time
- `src/types.ts` — shared message types between the two

When binding a variable, the plugin detects whether the selected text layer is driven by a component Text Property and routes the binding correctly:
- Plain text layer → `textNode.setBoundVariable('characters', variable)`
- Component Text Property → `instance.setProperties({ [propKey]: { type: 'VARIABLE_ALIAS', id: variable.id } })`
