# Social assets

Rendered from `cards.html` — the same palette and type as the console, so the
cards look like the product rather than like artwork about it. Every figure on
them is measured, not invented.

| File | Rendered | Where it goes |
|---|---|---|
| `social-linkedin-1200x627.png` | 2400×1254 (2x) | LinkedIn posts, Open Graph, Facebook |
| `social-x-1600x900.png` | 3200×1800 (2x) | X/Twitter, YouTube thumbnail |
| `social-github-1280x640.png` | 1280×640 (1x) | GitHub social preview — Settings → General → Social preview |
| `social-square-1080x1080.png` | 2160×2160 (2x) | Instagram, Mastodon, square crops |

The filename states the design size; the social cards are rendered at 2x on top
of it so they stay sharp on retina timelines. GitHub is the exception and is
rendered at 1x: its social preview wants the stated 1280×640 under 1MB, and
declines to preview an image much larger than that — a 2x render there costs
the preview and buys nothing.

## Re-rendering

```bash
node docs/social/shoot.mjs      # needs playwright available
```

Or open `cards.html` in a browser and screenshot each `.card` element — at 2x
for the social cards, at 1x for `#gh`.

Keep the numbers real. If a figure changes, take it from `--json` rather than
rounding something plausible — the whole argument of this tool is that its
numbers survive being checked.
