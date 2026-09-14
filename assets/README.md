# Brand assets

Source of truth for the mark, wordmark, facet bands, badges, social backgrounds and app icons. Colours: `#3B6D11 · #639922 · #97C459 · #EAF3DE` greens, `#E24B4A / #A32D2D` cedar red, ink `#000 / #444441 / #7A7975`, line `#DDDBD3`, sand `#F4F3EE`. System font stack only (the app never loads a web font).

| Folder | Files | Use |
| --- | --- | --- |
| `brand/` | `mark.svg`, `wordmark.svg`, `wordmark-ar.svg` | app header, documents, partner decks |
| `bands/` | `facet-120/80/72/56.svg` | the header band at each height the app uses |
| `badges/` | featured, members-free, sold-out, founding-venue, verified, live | cards and member cards |
| `social/` | `story-1080x1920`, `post-1080x1350`, `post-1080x1080` (+ `-dark`) | Story and feed backgrounds for @whatsuplebanon and the in-app story card |
| `icons/` | `icon-192/512`, `maskable-192/512`, `splash-1170x2532` | PWA manifest (copied to `app/public/`) |

The app renders the mark and bands inline (`components/Logo.tsx`, `components/Band.tsx`); these files are the exported equivalents for use outside the app.
