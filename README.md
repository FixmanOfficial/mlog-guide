# mlog.guide

An interactive course and sandbox for Mindustry logic (mlog), in English and Russian.

Every example runs right on the page: an interpreter and a world simulation ported from the game,
the game's own logic editor, displays, units and buildings. Behaviour is checked against the
**Mindustry v160.4** sources, not against wikis or other implementations.

Интерактивный учебник и песочница по логике Mindustry на английском и русском.

**Status: beta.** The course covers every instruction; known gaps are listed in
[docs/parity.md](docs/parity.md). Unofficial fan project, not affiliated with Anuke.

## Layout

npm workspaces, dependencies go one way:

| Package | What |
| --- | --- |
| `core/` | VM, world model, content tables. No dependencies, tested in Node |
| `render/` | World and display rendering on `<canvas>` |
| `editor/` | The game's block editor on Preact |
| `web/` | The site: Astro + Starlight |
| `tools/` | Generators that extract data from the game's sources and jar |

## Running

Node 22.12 or newer.

```bash
npm install
npm test
npm run dev --workspace @mlog/web
npm run build --workspace @mlog/web
```

Everything in `core/data` and the atlases are generated and committed; the site builds without
the game. Regenerating them needs the Mindustry sources and jar, see [CLAUDE.md](CLAUDE.md).

## Deploying

Cloudflare Pages, project root = repository root:

| Setting | Value |
| --- | --- |
| Build command | `npm run build --workspace @mlog/web` |
| Output directory | `web/dist` |
| Node | from `.node-version` |

The canonical address comes from `SITE` (default `https://mlog-guide.pages.dev`).

## Project notes

Working documents are in Russian:

- [PLAN.md](PLAN.md) — instruction inventory and sandbox model
- [docs/decisions.md](docs/decisions.md) — decision log
- [docs/findings.md](docs/findings.md) — mlog semantics with links to the Java sources
- [docs/parity.md](docs/parity.md) — what is ported from each game class and what differs
- [docs/todo.md](docs/todo.md) — what is left
- [docs/course.md](docs/course.md) — course inventory

## License

[GPL-3.0](LICENSE), like Mindustry. Sprites, fonts and translations are Mindustry assets © Anuke
under GPL-3.0; Fira Code is under the SIL Open Font License 1.1.
