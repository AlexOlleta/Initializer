# Initializer

Crea presets con los programas, apps y pestañas que abres cada día y genera un acceso directo: doble clic y se abre todo.

## Uso

1. Instala `Initializer_x.y.z_x64-setup.exe` (por usuario, sin permisos de administrador).
2. **Nuevo preset** → añade apps instaladas, programas `.exe`, webs (con navegador y perfil), carpetas o archivos.
3. Ajusta el orden (arrastrar), retardos, ventana minimizada/maximizada y "no abrir si ya está abierto".
4. **Probar** para comprobarlo, **Guardar**, y en la tarjeta: **⋯ → Crear acceso directo en el escritorio**.
5. Para que se ejecute al arrancar Windows: `Win + R` → `shell:startup` y copia ahí el acceso directo.

## Desarrollo

Requisitos: Rust ≥ 1.90, Node ≥ 22, pnpm 11.

```bash
pnpm install --frozen-lockfile
pnpm tauri dev
```

Más detalles en [CLAUDE.md](CLAUDE.md) y [docs/architecture.md](docs/architecture.md).
