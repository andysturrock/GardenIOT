# App icon source

`app_icon.png` (full square, opaque green bg + white drop) and
`app_icon_foreground.png` (transparent bg, drop scaled to ~65% for
Android's adaptive-icon safe zone) are generated from the `.svg`
sources in this directory.

To regenerate:

```bash
convert -background none -density 384 app_icon.svg            -resize 1024x1024 app_icon.png
convert -background none -density 384 app_icon_foreground.svg -resize 1024x1024 app_icon_foreground.png
```

Then propagate to the platform-specific icon sets:

```bash
cd ..   # back to UI/garden_iot/
dart run flutter_launcher_icons
```

Background colour is `#2E7D32` to match `AppTheme.seedColor`.
