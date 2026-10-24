# Initializer

Windows desktop app (Tauri 2 + React/TS) to build presets of programs, Store apps, URLs and folders/files, and generate a `.lnk` that runs a preset headlessly (`Initializer.exe --run <uuid>`).

## Commands

- `pnpm install --frozen-lockfile`
- `pnpm tauri dev` — full app
- `pnpm dev` — UI only in a browser with mocked IPC (`src/dev/mockIpc.ts`, dev builds only)
- `pnpm tauri build` — NSIS per-user installer in `src-tauri/target/release/bundle/nsis`
- `pnpm lint && pnpm typecheck && pnpm test`
- `cd src-tauri && cargo fmt && cargo clippy --all-targets -- -D warnings && cargo test`
- `pnpm bindings` — regenerate TS types from Rust (`src/lib/bindings`, never edit by hand)
- `pnpm audit` / `cd src-tauri && cargo audit`

## Conventions

- English identifiers, no code comments, small functions, strict types.
- Rust types in `src-tauri/src/model.rs` are the source of truth; TS uses generated bindings.
- UI strings only via i18n keys in `src/i18n/{en,es}.json` (keep both in sync).
- Theme colors only via tokens in `src/styles.css` (`bg-surface`, `text-muted`, `bg-accent`…).
- pnpm only. Supply-chain settings live in `pnpm-workspace.yaml`; never relax them globally.

## Map

- `src-tauri/src`: `main.rs` (dispatch `--run` vs GUI), `commands.rs` (Tauri commands), `launcher.rs`, `browsers.rs`, `apps.rs`, `shortcut.rs`, `icons.rs`, `store.rs`, `validate.rs`, `win.rs` (COM/ShellExecute), `notify.rs`, `headless.rs`.
- `src`: `App.tsx`, `features/{presets,editor,apps,settings}`, `components`, `lib/{ipc,actions,schema,factory,args,rasterize}`, `store/appStore.ts`.

## Security rules (do not weaken)

- All input validated in Rust (`validate.rs`) before saving or launching; zod in UI is UX only.
- URLs: http/https only. Exe items: absolute `.exe` only. Path items: never executable/script extensions.
- Never launch through `cmd.exe`/PowerShell; use `win::shell_execute` with quoted args.
- Frontend has no fs/shell plugin; capabilities stay minimal (`core:default`, dialog open/save).
- Strict CSP, no remote content, no network, no telemetry.

Details: `docs/architecture.md`.
