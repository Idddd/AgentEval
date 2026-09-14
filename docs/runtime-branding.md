# Docker runtime icon configuration

The sidebar brand mark and browser favicon are configurable independently.
Navigation/action icons are unchanged. This does not change the product name
or color theme.

## Standalone Marketplace

Place your images in `branding/`:

```text
branding/
  logo.svg
  favicon.svg
```

Build the image with this support once, then start it:

```sh
docker compose -f docker-compose.marketplace.yml up -d --build
```

Open http://127.0.0.1:18082. The standalone compose file skips the legacy
database migration command and uses the lightweight `/api/health` check.
It does not need PostgreSQL or the evaluation API. The port is bound to loopback
by default; put it behind your internal reverse proxy when sharing it.

To use another directory or filenames, set these Compose variables in `.env`:

```dotenv
BRANDING_DIR=./company-branding
BRAND_LOGO_FILE=company-logo.png
BRAND_FAVICON_FILE=company-icon.ico
```

Recreate the container when changing environment variables or mounts:

```sh
docker compose -f docker-compose.marketplace.yml up -d --force-recreate
```

Replacing image contents inside the already-mounted **directory** needs no
image rebuild or restart. Refresh the page. Browsers may require a hard reload
or reopening the tab to refresh the favicon. Directory mounts also support
replacement by atomic file rename; avoid single-file mounts for that workflow.

## Existing image / docker run

Use an image built from the code containing runtime branding support:

```sh
docker run -d --name ai-marketplace -p 127.0.0.1:18082:8080 \
  --mount type=bind,source=/absolute/path/to/branding,target=/app/branding,readonly \
  -e BRAND_LOGO_PATH=/app/branding/company-logo.png \
  -e BRAND_FAVICON_PATH=/app/branding/company-icon.ico \
  ai-marketplace:local node apps/control/.output/server/index.mjs
```

Both environment variables are **server runtime** filesystem paths, not
`VITE_*` build variables or browser URLs. For an existing Compose deployment,
add the same directory mount and variables to its `web` service. No Dockerfile
change is required: the current image already copies the compiled server.

## Supported files and fallback

- SVG, PNG, WebP, JPG/JPEG, ICO; maximum 2 MiB per file.
- Container user `node` needs directory traversal and file read permissions.
- No configuration, missing files, empty files, unsupported extensions,
  oversized files or read errors fall back to the original icon.
- Invalid image contents are not repaired; use valid images. The sidebar also
  falls back to its inline mark if the browser cannot decode an image.
- Responses are not cached. Inspect `/api/branding/logo` and
  `/api/branding/favicon`: `X-Branding-Source` is `custom` or `default`.
- Only administrator-configured paths are read; request parameters cannot
  select files. SVG responses are sandboxed and cannot load external resources.
- Only mount branding assets. They are public, not confidential data.

For local development set `BRAND_LOGO_PATH` / `BRAND_FAVICON_PATH` before starting
the Vite process. Use absolute paths; relative paths depend on process cwd.
