---
title: "ADR-004: A room is a text map for collision plus an optional painting"
date: 2026-09-09
status: accepted
kind: decision
supersedes: "Tiled JSON level data"
modules: [content, trace-tool]
---

# ADR-004: A room is a text map for collision plus an optional painting

## Decision

- A **room** is a text map, one character per tile, held in one TypeScript module under `game/content/rooms/` that exports a single string. The legend will be one table in the level design document. The rooms index is a glob over that directory; nothing registers a room by hand.
- A room may also have **one continuous painting** at 32 px per tile, drawn 1:1 in place of the tiles. Paintings are generated as up to three 3:1 panels, joined by the asset kit and fitted to 22 tiles tall.
- Collision is **traced** over the painting in a browser tool with brushes for the whole legend, an auto-trace from opacity for a first pass, undo, and a save that writes the room module through the dev server. The painting is the source of truth for the look; the text map is the source of truth for collision.
- Tiles remain for rooms without a painting and as the debug view (F1 draws the tiles over a painting).
- A half-height one-way platform (`=`) exists for ledges the painting draws mid-tile.

## Why

Tiles cannot give the composed look of a painted ruin. Generators produce a good composed panel but cannot be trusted for collision, so collision is authored. Tiled JSON was dropped: a text map is readable in a PR diff and needs no external editor.

## Rules for generated panels

Every panel prompt asks for a flat magenta background, the floor at 85 % height on both edges, flat standing surfaces, vertical walls, steps at most two blocks up and three wide, and structures below the middle of the image except named landmarks. Hand edits to a raw are declared in the kit (for example, a magenta rectangle that cuts a bridge open), never made in an image editor.
