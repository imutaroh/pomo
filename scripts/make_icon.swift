// アプリアイコン生成: 琥珀グラデーションの角丸スクエア＋白いタイマーダイヤル（270°アーク＋中心ドット）
// 使い方: swift scripts/make_icon.swift → assets/icon_1024.png を出力（build_icns.sh が .icns に変換）
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

let kohakuLight = NSColor(red: 1.0, green: 0.78, blue: 0.40, alpha: 1)   // #FFC766
let kohakuDeep = NSColor(red: 0.93, green: 0.58, blue: 0.10, alpha: 1)   // #EE941A
NSGradient(colors: [kohakuLight, kohakuDeep])!.draw(in: square, angle: -75)

let washi = NSColor(red: 0.98, green: 0.976, blue: 0.969, alpha: 1)
let center = CGPoint(x: size / 2, y: size / 2)

// タイマーダイヤル: 12時から時計回りに 270°（残り 90° の隙間が「進行中」を示す）
let ring = NSBezierPath()
ring.appendArc(withCenter: center, radius: 235, startAngle: 90, endAngle: 180, clockwise: true)
ring.lineWidth = 78
ring.lineCapStyle = .round
washi.setStroke()
ring.stroke()

// 中心ドット
let dotR: CGFloat = 58
washi.setFill()
NSBezierPath(ovalIn: CGRect(x: center.x - dotR, y: center.y - dotR, width: dotR * 2, height: dotR * 2)).fill()

// 針: 中心から 12時方向へ
let hand = NSBezierPath()
hand.move(to: center)
hand.line(to: CGPoint(x: center.x, y: center.y + 150))
hand.lineWidth = 44
hand.lineCapStyle = .round
washi.setStroke()
hand.stroke()

NSGraphicsContext.restoreGraphicsState()

let png = rep.representation(using: .png, properties: [:])!
let out = URL(fileURLWithPath: "assets/icon_1024.png")
try! FileManager.default.createDirectory(atPath: "assets", withIntermediateDirectories: true)
try! png.write(to: out)
print("wrote \(out.path)")
