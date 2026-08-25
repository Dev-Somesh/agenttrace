# Social assets

Rendered from `cards.html` — the same palette and type as the console, so the
cards look like the product rather than like artwork about it. Every figure on
them is measured, not invented.

| File | Size | Where it goes |
|---|---|---|
| `social-linkedin-1200x627.png` | 1200×627 | LinkedIn posts, Open Graph, Facebook |
| `social-x-1600x900.png` | 1600×900 | X/Twitter, YouTube thumbnail |
| `social-github-1280x640.png` | 1280×640 | GitHub social preview — Settings → General → Social preview |
| `social-square-1080x1080.png` | 1080×1080 | Instagram, Mastodon, square crops |

## Re-rendering

```bash
node docs/social/shoot.mjs      # needs playwright available
```

Or open `cards.html` in a browser and screenshot each `.card` element at 2x.

Keep the numbers real. If a figure changes, take it from `--json` rather than
rounding something plausible — the whole argument of this tool is that its
numbers survive being checked.
