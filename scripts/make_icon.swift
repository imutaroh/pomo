// アプリアイコン生成: フィールドノート調の明るい角丸スクエア＋ティールのタイマーリング
// 使い方: swift scripts/make_icon.swift → assets/icon_1024.png を出力
import AppKit

let px = 1024
let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
)!
rep.size = NSSize(width: px, height: px)

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

let size = CGFloat(px)
// Apple のアイコングリッド: 1024px 中、角丸スクエアは約 824px（マージン 100px）
let squareRect = CGRect(x: 100, y: 100, width: 824, height: 824)
let square = NSBezierPath(roundedRect: squareRect, xRadius: 185, yRadius: 185)

let fieldNoteBackground = NSColor(
    deviceRed: 0xFA / 255.0,
    green: 0xFB / 255.0,
    blue: 0xFC / 255.0,
    alpha: 1
)
fieldNoteBackground.setFill()
square.fill()

let ruleColor = NSColor(
    deviceRed: 0xE3 / 255.0,
    green: 0xE8 / 255.0,
    blue: 0xED / 255.0,
    alpha: 1
)
let teal = NSColor(
    deviceRed: 0x00 / 255.0,
    green: 0x87 / 255.0,
    blue: 0xA8 / 255.0,
    alpha: 1
)
let ink = NSColor(
    deviceRed: 0x1A / 255.0,
    green: 0x23 / 255.0,
    blue: 0x30 / 255.0,
    alpha: 1
)
let center = CGPoint(x: size / 2, y: size / 2)
let ringRadius: CGFloat = 235

// 罫線色のトラックリング
let track = NSBezierPath(ovalIn: CGRect(
    x: center.x - ringRadius,
    y: center.y - ringRadius,
    width: ringRadius * 2,
    height: ringRadius * 2
))
track.lineWidth = 26
ruleColor.setStroke()
track.stroke()

// 進捗アーク: 12時から時計回りに 270°
let ring = NSBezierPath()
ring.appendArc(withCenter: center, radius: ringRadius, startAngle: 90, endAngle: 180, clockwise: true)
ring.lineWidth = 78
ring.lineCapStyle = .round
teal.setStroke()
ring.stroke()

// アーク先端のドット（9時方向）
let endpoint = CGPoint(x: center.x - ringRadius, y: center.y)
let endpointDotRadius: CGFloat = 30
teal.setFill()
NSBezierPath(ovalIn: CGRect(
    x: endpoint.x - endpointDotRadius,
    y: endpoint.y - endpointDotRadius,
    width: endpointDotRadius * 2,
    height: endpointDotRadius * 2
)).fill()

// 中心点
let centerDotRadius: CGFloat = 58
ink.setFill()
NSBezierPath(ovalIn: CGRect(
    x: center.x - centerDotRadius,
    y: center.y - centerDotRadius,
    width: centerDotRadius * 2,
    height: centerDotRadius * 2
)).fill()

NSGraphicsContext.restoreGraphicsState()

let png = rep.representation(using: .png, properties: [:])!
let out = URL(fileURLWithPath: "assets/icon_1024.png")
try! FileManager.default.createDirectory(atPath: "assets", withIntermediateDirectories: true)
try! png.write(to: out)
print("wrote \(out.path)")
