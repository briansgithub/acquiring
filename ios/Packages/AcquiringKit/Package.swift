// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "AcquiringKit",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(name: "AcquiringCore", targets: ["AcquiringCore"]),
        .library(name: "AcquiringCatalog", targets: ["AcquiringCatalog"]),
        .library(name: "AcquiringAudio", targets: ["AcquiringAudio"]),
        .library(name: "AcquiringAural", targets: ["AcquiringAural"])
    ],
    dependencies: [
        .package(url: "https://github.com/groue/GRDB.swift.git", exact: "7.8.0"),
        .package(url: "https://github.com/scinfu/SwiftSoup.git", exact: "2.9.6")
    ],
    targets: [
        .target(name: "AcquiringCore"),
        .target(
            name: "AcquiringCatalog",
            dependencies: [
                "AcquiringCore",
                .product(name: "GRDB", package: "GRDB.swift"),
                .product(name: "SwiftSoup", package: "SwiftSoup")
            ],
            linkerSettings: [.linkedLibrary("z")]
        ),
        .target(
            name: "AcquiringAudio",
            dependencies: ["AcquiringCore"]
        ),
        .target(
            name: "AcquiringAural",
            dependencies: [
                "AcquiringCore",
                "AcquiringAudio",
                .product(name: "GRDB", package: "GRDB.swift")
            ],
            linkerSettings: [.linkedLibrary("z")]
        ),
        .testTarget(
            name: "AcquiringCoreTests",
            dependencies: ["AcquiringCore"]
        ),
        .testTarget(
            name: "AcquiringCatalogTests",
            dependencies: [
                "AcquiringCatalog",
                .product(name: "GRDB", package: "GRDB.swift")
            ]
        ),
        .testTarget(
            name: "AcquiringAudioTests",
            dependencies: ["AcquiringAudio"]
        ),
        .testTarget(
            name: "AcquiringAuralTests",
            dependencies: [
                "AcquiringAural",
                .product(name: "GRDB", package: "GRDB.swift")
            ]
        )
    ]
)
