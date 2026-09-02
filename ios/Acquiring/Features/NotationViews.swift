import AcquiringCore
import SwiftUI

private enum RomanGlyphStyle {
    case base
    case superscript
    case subscriptPart
    case figured
    case suffix
    case diminished
    case borrowed

    var scale: CGFloat {
        switch self {
        case .base: 1
        case .superscript: 0.68
        case .subscriptPart, .figured: 0.58
        case .suffix: 0.72
        case .diminished: 0.46
        case .borrowed: 0.55
        }
    }

    var weight: Font.Weight {
        switch self {
        case .suffix, .borrowed: .regular
        default: .bold
        }
    }
}

private struct RomanGlyph {
    let text: String
    let x: CGFloat
    let centerYOffset: CGFloat
    let style: RomanGlyphStyle
    let measuredSize: CGSize
}

private struct RomanLayout {
    let glyphs: [RomanGlyph]
    let width: CGFloat
    let top: CGFloat
    let bottom: CGFloat

    var height: CGFloat { bottom - top }
}

private struct RomanDisplayLayout {
    let display: RomanNumeralDisplay
    let roman: RomanLayout
    let fontSize: CGFloat
    let width: CGFloat
    let top: CGFloat
    let bottom: CGFloat
    let romanCenterYOffset: CGFloat
    let borrowedCenterYOffset: CGFloat
    let borrowedSize: CGSize

    var height: CGFloat { bottom - top }
}

struct FittedRomanNumeral: View {
    let display: RomanNumeralDisplay
    let color: Color
    @ScaledMetric(relativeTo: .largeTitle) private var maximumFontSize: CGFloat = 64
    @ScaledMetric(relativeTo: .body) private var minimumFontSize: CGFloat = 12

    init(
        display: RomanNumeralDisplay,
        maximumFontSize: CGFloat = 64,
        minimumFontSize: CGFloat = 12,
        color: Color = .primary
    ) {
        self.display = display
        self.color = color
        _maximumFontSize = ScaledMetric(wrappedValue: maximumFontSize, relativeTo: .largeTitle)
        _minimumFontSize = ScaledMetric(wrappedValue: minimumFontSize, relativeTo: .body)
    }

    var body: some View {
        Canvas { context, size in
            guard size.width > 0, size.height > 0 else { return }
            let layout = fit(
                display: display,
                minimumFontSize: min(minimumFontSize, maximumFontSize),
                maximumFontSize: max(minimumFontSize, maximumFontSize),
                bounds: size,
                context: context
            )
            draw(layout, in: &context, canvasSize: size)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(display.accessibilityLabel)
    }

    private func fit(
        display: RomanNumeralDisplay,
        minimumFontSize: CGFloat,
        maximumFontSize: CGFloat,
        bounds: CGSize,
        context: GraphicsContext
    ) -> RomanDisplayLayout {
        func fits(_ layout: RomanDisplayLayout) -> Bool {
            let horizontalSafety = max(1.5, layout.fontSize * 0.06)
            let verticalSafety = max(2, layout.fontSize * 0.06)
            return layout.width + horizontalSafety <= bounds.width &&
                layout.height + verticalSafety <= bounds.height
        }

        let minimum = measure(display, fontSize: minimumFontSize, context: context)
        guard fits(minimum) else { return minimum }

        var low = minimumFontSize
        var high = maximumFontSize
        var best = minimum
        for _ in 0..<12 {
            let middle = (low + high) / 2
            let candidate = measure(display, fontSize: middle, context: context)
            if fits(candidate) {
                best = candidate
                low = middle
            } else {
                high = middle
            }
        }
        return best
    }

    private func measure(
        _ display: RomanNumeralDisplay,
        fontSize: CGFloat,
        context: GraphicsContext
    ) -> RomanDisplayLayout {
        let roman = measureRoman(display.symbol, fontSize: fontSize, context: context)
        guard let borrowedLabel = display.borrowedLabel else {
            return RomanDisplayLayout(
                display: display,
                roman: roman,
                fontSize: fontSize,
                width: roman.width,
                top: roman.top,
                bottom: roman.bottom,
                romanCenterYOffset: 0,
                borrowedCenterYOffset: 0,
                borrowedSize: .zero
            )
        }

        let offset = fontSize * 0.30
        let borrowedSize = textSize(borrowedLabel, style: .borrowed, fontSize: fontSize, context: context)
        let borrowedTop = offset - borrowedSize.height / 2
        let borrowedBottom = offset + borrowedSize.height / 2
        return RomanDisplayLayout(
            display: display,
            roman: roman,
            fontSize: fontSize,
            width: max(roman.width, borrowedSize.width),
            top: min(roman.top - offset, borrowedTop),
            bottom: max(roman.bottom - offset, borrowedBottom),
            romanCenterYOffset: -offset,
            borrowedCenterYOffset: offset,
            borrowedSize: borrowedSize
        )
    }

    private func measureRoman(
        _ symbol: String,
        fontSize: CGFloat,
        context: GraphicsContext
    ) -> RomanLayout {
        let parts = RomanNumeralTokenizer.tokenize(symbol)
        var glyphs: [RomanGlyph] = []
        var cursor: CGFloat = 0
        var index = 0

        while index < parts.count {
            switch RomanNumeralTokenizer.stackSpan(in: parts, at: index) {
            case 2:
                cursor += appendTwoRowStack(
                    into: &glyphs,
                    cursor: cursor,
                    top: parts[index].text,
                    bottom: parts[index + 1].text,
                    fontSize: fontSize,
                    context: context
                )
                index += 2
            case 3:
                cursor += appendThreePartStack(
                    into: &glyphs,
                    cursor: cursor,
                    top: parts[index].text,
                    suffix: parts[index + 1].text,
                    bottom: parts[index + 2].text,
                    fontSize: fontSize,
                    context: context
                )
                index += 3
            default:
                cursor += appendPart(
                    into: &glyphs,
                    cursor: cursor,
                    part: parts[index],
                    fontSize: fontSize,
                    context: context
                )
                index += 1
            }
        }

        let top = glyphs.map { $0.centerYOffset - $0.measuredSize.height / 2 }.min() ?? -fontSize / 2
        let bottom = glyphs.map { $0.centerYOffset + $0.measuredSize.height / 2 }.max() ?? fontSize / 2
        return RomanLayout(glyphs: glyphs, width: cursor, top: top, bottom: bottom)
    }

    private func appendPart(
        into glyphs: inout [RomanGlyph],
        cursor: CGFloat,
        part: RomanNumeralPart,
        fontSize: CGFloat,
        context: GraphicsContext
    ) -> CGFloat {
        if part.kind == .superscript, let quality = qualityParts(part.text) {
            let qualityStyle: RomanGlyphStyle = quality.glyph == "°" ? .diminished : .superscript
            let qualityText = quality.glyph == "°" ? "○" : quality.glyph
            let qualitySize = textSize(qualityText, style: qualityStyle, fontSize: fontSize, context: context)
            glyphs.append(.init(
                text: qualityText,
                x: cursor,
                centerYOffset: -fontSize * 0.28,
                style: qualityStyle,
                measuredSize: qualitySize
            ))
            guard !quality.digits.isEmpty else { return qualitySize.width }
            let digitSize = textSize(quality.digits, style: .figured, fontSize: fontSize, context: context)
            glyphs.append(.init(
                text: quality.digits,
                x: cursor + qualitySize.width,
                centerYOffset: -fontSize * 0.28,
                style: .figured,
                measuredSize: digitSize
            ))
            return qualitySize.width + digitSize.width
        }

        let style: RomanGlyphStyle
        let offset: CGFloat
        switch part.kind {
        case .base:
            style = .base
            offset = 0
        case .superscript:
            style = .superscript
            offset = -fontSize * 0.28
        case .subscriptPart:
            style = .subscriptPart
            offset = fontSize * 0.16
        case .suffix:
            style = .suffix
            offset = 0
        }
        let size = textSize(part.text, style: style, fontSize: fontSize, context: context)
        glyphs.append(.init(text: part.text, x: cursor, centerYOffset: offset, style: style, measuredSize: size))
        return size.width
    }

    private func appendTwoRowStack(
        into glyphs: inout [RomanGlyph],
        cursor: CGFloat,
        top: String,
        bottom: String,
        fontSize: CGFloat,
        context: GraphicsContext
    ) -> CGFloat {
        let topOffset = -fontSize * 0.28
        let bottomOffset = fontSize * 0.16
        if let quality = qualityParts(top) {
            let qualityStyle: RomanGlyphStyle = quality.glyph == "°" ? .diminished : .superscript
            let qualityText = quality.glyph == "°" ? "○" : quality.glyph
            let qualitySize = textSize(qualityText, style: qualityStyle, fontSize: fontSize, context: context)
            let topSize = textSize(quality.digits, style: .figured, fontSize: fontSize, context: context)
            let bottomSize = textSize(bottom, style: .figured, fontSize: fontSize, context: context)
            glyphs.append(.init(text: qualityText, x: cursor, centerYOffset: topOffset, style: qualityStyle, measuredSize: qualitySize))
            if !quality.digits.isEmpty {
                glyphs.append(.init(text: quality.digits, x: cursor + qualitySize.width, centerYOffset: topOffset, style: .figured, measuredSize: topSize))
            }
            glyphs.append(.init(text: bottom, x: cursor + qualitySize.width, centerYOffset: bottomOffset, style: .figured, measuredSize: bottomSize))
            return qualitySize.width + max(topSize.width, bottomSize.width)
        }

        let topSize = textSize(top, style: .figured, fontSize: fontSize, context: context)
        let bottomSize = textSize(bottom, style: .figured, fontSize: fontSize, context: context)
        glyphs.append(.init(text: top, x: cursor, centerYOffset: topOffset, style: .figured, measuredSize: topSize))
        glyphs.append(.init(text: bottom, x: cursor, centerYOffset: bottomOffset, style: .figured, measuredSize: bottomSize))
        return max(topSize.width, bottomSize.width)
    }

    private func appendThreePartStack(
        into glyphs: inout [RomanGlyph],
        cursor: CGFloat,
        top: String,
        suffix: String,
        bottom: String,
        fontSize: CGFloat,
        context: GraphicsContext
    ) -> CGFloat {
        let topSize = textSize(top, style: .figured, fontSize: fontSize, context: context)
        let suffixSize = textSize(suffix, style: .suffix, fontSize: fontSize, context: context)
        let bottomSize = textSize(bottom, style: .figured, fontSize: fontSize, context: context)
        glyphs.append(.init(text: top, x: cursor, centerYOffset: -fontSize * 0.28, style: .figured, measuredSize: topSize))
        glyphs.append(.init(text: suffix, x: cursor + topSize.width, centerYOffset: -fontSize * 0.28, style: .suffix, measuredSize: suffixSize))
        glyphs.append(.init(text: bottom, x: cursor, centerYOffset: fontSize * 0.16, style: .figured, measuredSize: bottomSize))
        return max(topSize.width + suffixSize.width, bottomSize.width)
    }

    private func draw(_ layout: RomanDisplayLayout, in context: inout GraphicsContext, canvasSize: CGSize) {
        let centerX = canvasSize.width / 2
        let centerY = (canvasSize.height - layout.height) / 2 - layout.top
        let romanLeft = centerX - layout.roman.width / 2
        for glyph in layout.roman.glyphs {
            let resolved = context.resolve(styledText(glyph.text, style: glyph.style, fontSize: layout.fontSize))
            context.draw(
                resolved,
                at: CGPoint(
                    x: romanLeft + glyph.x + glyph.measuredSize.width / 2,
                    y: centerY + layout.romanCenterYOffset + glyph.centerYOffset
                ),
                anchor: .center
            )
        }

        if let borrowedLabel = layout.display.borrowedLabel {
            let resolved = context.resolve(styledText(borrowedLabel, style: .borrowed, fontSize: layout.fontSize))
            context.draw(
                resolved,
                at: CGPoint(x: centerX, y: centerY + layout.borrowedCenterYOffset),
                anchor: .center
            )
        }
    }

    private func qualityParts(_ text: String) -> (glyph: String, digits: String)? {
        guard let first = text.first, first == "°" || first == "ø" else { return nil }
        return (String(first), String(text.dropFirst()))
    }

    private func textSize(
        _ text: String,
        style: RomanGlyphStyle,
        fontSize: CGFloat,
        context: GraphicsContext
    ) -> CGSize {
        guard !text.isEmpty else { return .zero }
        return context.resolve(styledText(text, style: style, fontSize: fontSize))
            .measure(in: CGSize(width: 10_000, height: 10_000))
    }

    private func styledText(_ text: String, style: RomanGlyphStyle, fontSize: CGFloat) -> Text {
        Text(text)
            .font(.system(size: fontSize * style.scale, weight: style.weight, design: .serif))
            .foregroundColor(color)
    }
}

private struct ScaleDegreeLayout {
    let label: ScaleDegreeLabel
    let fontSize: CGFloat
    let width: CGFloat
    let top: CGFloat
    let bottom: CGFloat
    let prefixX: CGFloat
    let prefixSize: CGSize
    let degreeCenterX: CGFloat
    let degreeCenterY: CGFloat
    let degreeSize: CGSize
    let suffixX: CGFloat
    let suffixSize: CGSize
    let hatLeftX: CGFloat
    let hatTipX: CGFloat
    let hatRightX: CGFloat
    let hatTipY: CGFloat
    let hatBaseY: CGFloat

    var height: CGFloat { bottom - top }
}

struct FittedScaleDegree: View {
    let source: String
    let color: Color
    @ScaledMetric(relativeTo: .largeTitle) private var maximumFontSize: CGFloat = 84
    @ScaledMetric(relativeTo: .body) private var minimumFontSize: CGFloat = 16

    init(
        _ source: String,
        maximumFontSize: CGFloat = 84,
        minimumFontSize: CGFloat = 16,
        color: Color = .primary
    ) {
        self.source = source
        self.color = color
        _maximumFontSize = ScaledMetric(wrappedValue: maximumFontSize, relativeTo: .largeTitle)
        _minimumFontSize = ScaledMetric(wrappedValue: minimumFontSize, relativeTo: .body)
    }

    var body: some View {
        let label = ScaleDegreeLabel.parse(source)
        Canvas { context, size in
            guard size.width > 0, size.height > 0 else { return }
            let layout = fit(
                label: label,
                minimumFontSize: min(minimumFontSize, maximumFontSize),
                maximumFontSize: max(minimumFontSize, maximumFontSize),
                bounds: size,
                context: context
            )
            draw(layout, in: &context, canvasSize: size)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Scale degree \(label.spokenText)")
    }

    private func fit(
        label: ScaleDegreeLabel,
        minimumFontSize: CGFloat,
        maximumFontSize: CGFloat,
        bounds: CGSize,
        context: GraphicsContext
    ) -> ScaleDegreeLayout {
        func fits(_ layout: ScaleDegreeLayout) -> Bool {
            let safety = max(2, layout.fontSize * 0.04)
            return layout.width + safety <= bounds.width && layout.height + safety <= bounds.height
        }

        let minimum = measure(label, fontSize: minimumFontSize, context: context)
        guard fits(minimum) else { return minimum }
        var low = minimumFontSize
        var high = maximumFontSize
        var best = minimum
        for _ in 0..<12 {
            let middle = (low + high) / 2
            let candidate = measure(label, fontSize: middle, context: context)
            if fits(candidate) {
                best = candidate
                low = middle
            } else {
                high = middle
            }
        }
        return best
    }

    private func measure(
        _ label: ScaleDegreeLabel,
        fontSize: CGFloat,
        context: GraphicsContext
    ) -> ScaleDegreeLayout {
        let degreeSize = context.resolve(degreeText(label.degree, fontSize: fontSize))
            .measure(in: CGSize(width: 10_000, height: 10_000))
        let prefixSize = context.resolve(accidentalText(label.prefix, fontSize: fontSize))
            .measure(in: CGSize(width: 10_000, height: 10_000))
        let suffixSize = context.resolve(accidentalText(label.suffix, fontSize: fontSize))
            .measure(in: CGSize(width: 10_000, height: 10_000))

        let hatWidth = fontSize * 0.52
        let hatHeight = fontSize * 0.20
        let gap = fontSize * 0.10
        let degreeColumnWidth = max(degreeSize.width, hatWidth)
        let prefixGap = label.prefix.isEmpty ? 0 : fontSize * 0.04
        let suffixGap = label.suffix.isEmpty ? 0 : fontSize * 0.04
        let width = prefixSize.width + prefixGap + degreeColumnWidth + suffixGap + suffixSize.width
        let degreeCenterX = prefixSize.width + prefixGap + degreeColumnWidth / 2
        let blockHeight = hatHeight + gap + max(degreeSize.height, fontSize)
        let blockTop = -blockHeight / 2
        let hatTipY = blockTop
        let hatBaseY = blockTop + hatHeight
        let degreeCenterY = blockTop + hatHeight + gap + max(degreeSize.height, fontSize) / 2
        let textTop = degreeCenterY - max(degreeSize.height, prefixSize.height, suffixSize.height) / 2
        let textBottom = degreeCenterY + max(degreeSize.height, prefixSize.height, suffixSize.height) / 2

        return ScaleDegreeLayout(
            label: label,
            fontSize: fontSize,
            width: width,
            top: min(hatTipY, textTop),
            bottom: max(hatBaseY, textBottom),
            prefixX: 0,
            prefixSize: prefixSize,
            degreeCenterX: degreeCenterX,
            degreeCenterY: degreeCenterY,
            degreeSize: degreeSize,
            suffixX: prefixSize.width + prefixGap + degreeColumnWidth + suffixGap,
            suffixSize: suffixSize,
            hatLeftX: degreeCenterX - hatWidth / 2,
            hatTipX: degreeCenterX,
            hatRightX: degreeCenterX + hatWidth / 2,
            hatTipY: hatTipY,
            hatBaseY: hatBaseY
        )
    }

    private func draw(_ layout: ScaleDegreeLayout, in context: inout GraphicsContext, canvasSize: CGSize) {
        let left = (canvasSize.width - layout.width) / 2
        let centerY = (canvasSize.height - layout.height) / 2 - layout.top
        if !layout.label.prefix.isEmpty {
            context.draw(
                context.resolve(accidentalText(layout.label.prefix, fontSize: layout.fontSize)),
                at: CGPoint(x: left + layout.prefixX + layout.prefixSize.width / 2, y: centerY + layout.degreeCenterY),
                anchor: .center
            )
        }
        context.draw(
            context.resolve(degreeText(layout.label.degree, fontSize: layout.fontSize)),
            at: CGPoint(x: left + layout.degreeCenterX, y: centerY + layout.degreeCenterY),
            anchor: .center
        )
        if !layout.label.suffix.isEmpty {
            context.draw(
                context.resolve(accidentalText(layout.label.suffix, fontSize: layout.fontSize)),
                at: CGPoint(x: left + layout.suffixX + layout.suffixSize.width / 2, y: centerY + layout.degreeCenterY),
                anchor: .center
            )
        }

        var hat = Path()
        hat.move(to: CGPoint(x: left + layout.hatLeftX, y: centerY + layout.hatBaseY))
        hat.addLine(to: CGPoint(x: left + layout.hatTipX, y: centerY + layout.hatTipY))
        hat.addLine(to: CGPoint(x: left + layout.hatRightX, y: centerY + layout.hatBaseY))
        context.stroke(
            hat,
            with: .color(color),
            style: StrokeStyle(
                lineWidth: max(1.5, layout.fontSize * 0.07),
                lineCap: .round,
                lineJoin: .round
            )
        )
    }

    private func degreeText(_ text: String, fontSize: CGFloat) -> Text {
        Text(text)
            .font(.system(size: fontSize, weight: .bold, design: .serif))
            .foregroundColor(color)
    }

    private func accidentalText(_ text: String, fontSize: CGFloat) -> Text {
        Text(text)
            .font(.system(size: fontSize * 0.66, weight: .regular, design: .serif))
            .foregroundColor(color)
    }
}
