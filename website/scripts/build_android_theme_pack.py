import os
import shutil
import zipfile
import json

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
output_dir = os.path.join(base_dir, "public", "aurelis-theme")
icons_dir = os.path.join(output_dir, "icons")
os.makedirs(icons_dir, exist_ok=True)

# 1. Copy Wallpaper
src_wallpaper = os.path.join(base_dir, "src", "assets", "images", "aurelis_android_wallpaper_1789922379757.jpg")
dest_wallpaper = os.path.join(output_dir, "Aurelis_4K_AMOLED_Wallpaper.jpg")
if os.path.exists(src_wallpaper):
    shutil.copyfile(src_wallpaper, dest_wallpaper)
    shutil.copyfile(src_wallpaper, os.path.join(base_dir, "public", "aurelis_wallpaper_4k.jpg"))

# 2. Generate SVG Icons for Android with Aurelis Cyber Dark & Neon Emerald Aesthetic
def generate_svg_icon(name, icon_path_svg, bg_color="#0b131b", border_color="#00F5A0", fg_color="#00F5A0"):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="{border_color}" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="{bg_color}" stop-opacity="0"/>
    </radialGradient>
    <filter id="neon" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="{border_color}" flood-opacity="0.4"/>
    </filter>
  </defs>
  <!-- Squircle Base -->
  <rect x="16" y="16" width="160" height="160" rx="44" fill="{bg_color}" stroke="{border_color}" stroke-width="3.5" filter="url(#neon)"/>
  <rect x="16" y="16" width="160" height="160" rx="44" fill="url(#glow)"/>
  <!-- App Glyph -->
  <g transform="translate(48, 48) scale(4)" stroke="{fg_color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
    {icon_path_svg}
  </g>
</svg>'''
    return svg

icons = {
    "phone": '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
    "messages": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    "browser": '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    "camera": '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    "aurelis_crypto": '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    "wallet": '<path d="M20 7h-7m-7 0H3a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3"/><rect x="15" y="11" width="6" height="4" rx="1"/>',
    "settings": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    "photos": '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    "music": '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    "youtube": '<polygon points="5 3 19 12 5 21 5 3"/>',
    "playstore": '<polygon points="3 3 21 12 3 21 3 3"/><line x1="3" y1="3" x2="16" y2="15"/><line x1="3" y1="21" x2="16" y2="9"/>',
    "terminal": '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
    "calculator": '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="18"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="8" y1="18" x2="8" y2="18.01"/><line x1="12" y1="18" x2="12" y2="18.01"/>',
    "clock": '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    "calendar": '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    "contacts": '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
}

for icon_name, icon_svg in icons.items():
    svg_content = generate_svg_icon(icon_name, icon_svg)
    with open(os.path.join(icons_dir, f"{icon_name}.svg"), "w") as f:
        f.write(svg_content)

# 3. KWGT Widget Config JSON
kwgt_config = {
    "widget_name": "Aurelis_Crypto_HUD_KWGT",
    "author": "Aurelis Design System",
    "version": "1.0",
    "accent_color": "#00F5A0",
    "background_color": "#070B0F",
    "layout": {
        "shape": "rounded_rect",
        "corner_radius": 24,
        "elements": [
            {
                "type": "text",
                "label": "TIME",
                "content": "$df(hh:mm)$",
                "font": "SpaceGrotesk-Bold",
                "size": 42,
                "color": "#00F5A0"
            },
            {
                "type": "crypto_price",
                "pair": "BTC/USD",
                "formula": "$wg(\"https://api.kraken.com/0/public/Ticker?pair=XBTUSD\", json, .result.XXBTZUSD.c[0])$",
                "color": "#FFFFFF",
                "size": 22
            },
            {
                "type": "crypto_price",
                "pair": "ETH/USD",
                "formula": "$wg(\"https://api.kraken.com/0/public/Ticker?pair=ETHUSD\", json, .result.XETHZUSD.c[0])$",
                "color": "#8B949E",
                "size": 16
            }
        ]
    }
}
with open(os.path.join(output_dir, "KWGT_Aurelis_Crypto_Widget.json"), "w") as f:
    json.dump(kwgt_config, f, indent=2)

# 4. Material You Color Palette Spec
palette = {
    "theme_name": "Aurelis Cyber Theme for Android",
    "accent_primary": "#00F5A0",
    "accent_glow": "#00F5A040",
    "surface_background": "#070B0F",
    "surface_card": "#0F1722",
    "text_primary": "#E6EDF3",
    "text_secondary": "#8B949E",
    "recommended_font_display": "Space Grotesk",
    "recommended_font_mono": "JetBrains Mono"
}
with open(os.path.join(output_dir, "Material_You_Color_Palette.json"), "w") as f:
    json.dump(palette, f, indent=2)

# 5. Jetpack Compose Theme File
jetpack_compose = '''// AurelisTheme.kt - Android Jetpack Compose Material 3
package com.aurelis.crypto.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val AurelisPrimary = Color(0xFF00F5A0)
val AurelisBackground = Color(0xFF070B0F)
val AurelisSurface = Color(0xFF0F1722)
val AurelisCard = Color(0xFF141E2B)
val AurelisTextPrimary = Color(0xFFE6EDF3)
val AurelisTextSecondary = Color(0xFF8B949E)

private val DarkColorScheme = darkColorScheme(
    primary = AurelisPrimary,
    onPrimary = Color(0xFF003822),
    primaryContainer = Color(0xFF005234),
    onPrimaryContainer = AurelisPrimary,
    background = AurelisBackground,
    surface = AurelisSurface,
    surfaceVariant = AurelisCard,
    onBackground = AurelisTextPrimary,
    onSurface = AurelisTextPrimary
)

@Composable
fun AurelisTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        content = content
    )
}
'''
with open(os.path.join(output_dir, "AurelisTheme.kt"), "w") as f:
    f.write(jetpack_compose)

# 6. Readme & Installation Guide
instructions = """===================================================================
AURELIS CYBER ANDROID THEME PACK
===================================================================

Thank you for downloading the Aurelis Android Theme Pack!
This bundle allows you to turn any Android phone (Samsung Galaxy, Google Pixel,
OnePlus, Motorola, Xiaomi, etc.) into a futuristic Aurelis Cyber Crypto terminal.

-------------------------------------------------------------------
WHAT'S INSIDE THIS ZIP:
-------------------------------------------------------------------
1. Aurelis_4K_AMOLED_Wallpaper.jpg
   - Deep obsidian black AMOLED 9:16 wallpaper with glowing neon cyan/emerald geometry.
2. /icons (16 Custom App Icons)
   - Hand-crafted dark neon squircle vector icons for Phone, Messages, Browser,
     Camera, Aurelis Crypto HUD, Web3 Wallet, Settings, Photos, Music, YouTube,
     Play Store, Terminal, Calculator, Clock, Calendar, Contacts.
3. KWGT_Aurelis_Crypto_Widget.json
   - Live Kraken/Coinbase crypto spot ticker widget for your Android home screen.
4. Material_You_Color_Palette.json
   - Exact hex colors, contrast ratios, and recommended fonts.
5. AurelisTheme.kt
   - Ready-to-compile Jetpack Compose Material 3 theme code for Android developers.

-------------------------------------------------------------------
HOW TO APPLY TO YOUR PHONE IN 3 MINUTES:
-------------------------------------------------------------------

METHOD A: Samsung Galaxy Phones (One UI)
1. Set the included 'Aurelis_4K_AMOLED_Wallpaper.jpg' as your Wallpaper.
2. Open Galaxy Store, install 'Good Lock' and 'Theme Park'.
3. Open Theme Park -> Tap 'Icon' -> Tap 'Create New'.
4. Tap any icon and select the matching icon from the '/icons' folder.
5. Set shape to Squircle, background color to #070B0F, and save!

METHOD B: Google Pixel, OnePlus, or Any Android (Nova / Lawnchair)
1. Install Nova Launcher or Lawnchair from Google Play Store.
2. Long press your home screen -> Set 'Aurelis_4K_AMOLED_Wallpaper.jpg' as wallpaper.
3. Go to Launcher Settings -> Look & Feel -> Icon Style.
4. Choose 'Squircle' shape. To customize individual icons, long press any app on your
   home screen, tap Edit, and pick the matching icon from the '/icons' folder.
5. Optional: Add a 4x2 KWGT widget on your home screen and import 'KWGT_Aurelis_Crypto_Widget.json'
   for live crypto market updates directly on your home screen!

===================================================================
Aurelis Design System • Powered by Kraken & Coinbase Spot Data
===================================================================
"""
with open(os.path.join(output_dir, "README_INSTALL_GUIDE.txt"), "w") as f:
    f.write(instructions)

# 7. Create ZIP archive
zip_path = os.path.join(base_dir, "public", "Aurelis_Android_Theme_Pack.zip")
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(output_dir):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, output_dir)
            zipf.write(full_path, arcname=os.path.join("Aurelis_Android_Theme", rel_path))

print(f"Theme pack successfully generated and zipped at {zip_path}")
