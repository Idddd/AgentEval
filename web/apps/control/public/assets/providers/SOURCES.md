# Provider icon sources

All third-party artwork is checked into the repository so the Provider catalog
does not depend on remote images at runtime. Product names and marks remain the
property of their respective owners; inclusion does not imply endorsement.

## Brand assets

- All `.webp` files in this directory are the matching Provider avatars from
  [Lobe Icons](https://lobehub.com/icons), downloaded from the
  [`lobehub/lobe-icons`](https://github.com/lobehub/lobe-icons/tree/master/packages/static-avatar/avatars)
  static-avatar package on 2026-07-18. The local filenames map TaskLattice's
  Provider names to LobeHub slugs as follows: `kimi` → `moonshot`, `zai` →
  `zhipu`, `baidu` → `baiducloud`, `volcengine` → `doubao`, `aws` → `bedrock`,
  and `vertex` → `vertexai`. All other filenames use the same slug.
- These checked-in avatars deliberately use one visual family and one file
  format. The control UI never fetches Provider artwork at runtime.

## Neutral assets

- `custom.svg` and `custom-anthropic.svg`: TaskLattice-owned neutral interface
  icons for custom compatible endpoints; they are not third-party trademarks.
