package com.acquiring.android

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Decorative quiz-card chrome for Introduction/Help. Same tint and 14.dp corners — no gestures. */
@Composable
internal fun QuizExampleCard(
    modifier: Modifier = Modifier,
    fixedHeight: Dp = 44.dp,
    content: @Composable BoxScope.() -> Unit
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(fixedHeight)
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.primary)
            .clearAndSetSemantics { }
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 8.dp, vertical = 5.dp),
            contentAlignment = Alignment.Center,
            content = content
        )
    }
}

/** Holds row/slot geometry with no card chrome and no touch target. */
@Composable
internal fun QuizEmptyCardSlot(
    modifier: Modifier = Modifier,
    fixedHeight: Dp = 44.dp
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(fixedHeight)
            .clearAndSetSemantics { }
    )
}
