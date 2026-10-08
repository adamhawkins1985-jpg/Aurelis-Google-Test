// AurelisTheme.kt - Android Jetpack Compose Material 3
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
