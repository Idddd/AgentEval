# Runtime branding assets

Put your `logo.svg` and `favicon.svg` here, or set `BRAND_LOGO_FILE` and
`BRAND_FAVICON_FILE` to different filenames. SVG, PNG, WebP, JPG/JPEG and ICO
are supported, up to 2 MiB per image. Use a square logo with a transparent
background. Assets must be readable by the container's `node` user.

Do not put credentials or private documents here. This directory is mounted
read-only, and only the two configured images are served publicly.

Missing files use the original built-in icons. See `docs/runtime-branding.md`.
