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
        .library(name: "AcquiringAudio", targets: ["AcquiringAudio"])
    ],
    dependencies: [
        .package(url: "https://github.com/groue/GRDB.swift.git", exact: "7.11.1"),
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
        )
    ]
)
