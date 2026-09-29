import AcquiringAural
import AcquiringCore
import Foundation
import Observation

struct AuralBrowserSnapshot: Codable, Equatable {
    private enum CodingKeys: String, CodingKey {
        case progression, minimumPopularityPercent, analysis, modeFilter, groupingPriority
        case sortOrder, rankingVersion, context, activePrimary, activeBucket, lastGroupedBucket
        case pageCount, scrollID
    }
    var progression: AuralProgressionQuery? = nil
    var minimumPopularityPercent: Int? = nil
    var analysis = "relativeMajor"
    var modeFilter = "major"
    var groupingPriority = "none"
    var sortOrder = "mostSongs"
    var rankingVersion = 2
    var context = ""
    var activePrimary = ""
    var activeBucket = ""
    var lastGroupedBucket = ""
    var pageCount = 1
    var scrollID: String?

    init() {}

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        progression = try values.decodeIfPresent(AuralProgressionQuery.self, forKey: .progression)
        minimumPopularityPercent = try values.decodeIfPresent(Int.self, forKey: .minimumPopularityPercent)
        analysis = try values.decodeIfPresent(String.self, forKey: .analysis) ?? "relativeMajor"
        modeFilter = try values.decodeIfPresent(String.self, forKey: .modeFilter) ?? "major"
        groupingPriority = try values.decodeIfPresent(String.self, forKey: .groupingPriority) ?? "length"
        sortOrder = try values.decodeIfPresent(String.self, forKey: .sortOrder) ?? "mostSongs"
        rankingVersion = try values.decodeIfPresent(Int.self, forKey: .rankingVersion) ?? 1
        context = try values.decodeIfPresent(String.self, forKey: .context) ?? ""
        activePrimary = try values.decodeIfPresent(String.self, forKey: .activePrimary) ?? ""
        activeBucket = try values.decodeIfPresent(String.self, forKey: .activeBucket) ?? ""
        lastGroupedBucket = try values.decodeIfPresent(String.self, forKey: .lastGroupedBucket) ?? ""
        pageCount = try values.decodeIfPresent(Int.self, forKey: .pageCount) ?? 1
        scrollID = try values.decodeIfPresent(String.self, forKey: .scrollID)
    }
}

struct AuralNavigationSnapshot: Codable, Equatable {
    var version = 1
    var isAuralOpen = false
    var selectedPattern: AuralPattern?
    var selectedTab = AuralDetailTab.recognize
    var playbackPassage: AuralPassage?
    var playbackFromSongs = false
    var search = ""
    var minimumLength = 2
    var maximumLength: Int?
    var preferPopular = true
    var keepVaried = true
    var favorFavorites = false
    var distinguishInversions = false
    var flatList = false
    var expandedPatternPaths: [String: AuralPattern] = [:]
    var treeScrollPath: String?
    var flatScrollPath: String?
    var songsScrollId: String?
    var browser: AuralBrowserSnapshot?
}

@MainActor
@Observable
final class AuralRestorationStore {
    private(set) var snapshot: AuralNavigationSnapshot
    private(set) var warning: String?
    @ObservationIgnored private let fileURL: URL

    init(fileURL: URL) {
        self.fileURL = fileURL
        do {
            let data = try Data(contentsOf: fileURL)
            let decoded = try JSONDecoder().decode(AuralNavigationSnapshot.self, from: data)
            guard decoded.version == 1,
                  decoded.minimumLength >= 2,
                  decoded.maximumLength.map({ $0 >= decoded.minimumLength }) ?? true,
                  decoded.playbackPassage.map({
                      $0.startBeat.isFinite && $0.endBeat.isFinite
                          && $0.endBeat > $0.startBeat
                  }) ?? true
            else { throw CocoaError(.fileReadCorruptFile) }
            snapshot = decoded
        } catch CocoaError.fileReadNoSuchFile {
            snapshot = AuralNavigationSnapshot()
        } catch {
            snapshot = AuralNavigationSnapshot()
            warning = "Aural Quiz navigation state could not be restored. Learning progress was kept."
        }
    }

    func record(path: [AppRoute]) {
        let auralRoutes = path.filter {
            switch $0 {
            case .auralQuiz, .auralPattern, .auralPlayback: true
            case .artist, .allSongs, .playlist, .songDetail, .quiz: false
            }
        }
        snapshot.isAuralOpen = !auralRoutes.isEmpty
        snapshot.playbackPassage = nil
        for route in auralRoutes {
            switch route {
            case let .auralPattern(pattern):
                snapshot.selectedPattern = pattern
            case let .auralPlayback(request):
                snapshot.playbackPassage = request.passage
                snapshot.playbackFromSongs = request.fromSongs
            case .auralQuiz, .artist, .allSongs, .playlist, .songDetail, .quiz:
                break
            }
        }
        if !snapshot.isAuralOpen {
            snapshot.selectedPattern = nil
            snapshot.playbackPassage = nil
        }
        save()
    }

    func restoredRoutes() -> [AppRoute] {
        guard snapshot.isAuralOpen else { return [] }
        var routes: [AppRoute] = [.auralQuiz]
        if let pattern = snapshot.selectedPattern {
            routes.append(.auralPattern(pattern))
        }
        if let passage = snapshot.playbackPassage {
            routes.append(.auralPlayback(AuralPlaybackRequest(
                passage: passage,
                fromSongs: snapshot.playbackFromSongs
            )))
        }
        return routes
    }

    func updateCatalog(
        search: String,
        minimumLength: Int,
        maximumLength: Int?,
        preferPopular: Bool,
        keepVaried: Bool,
        favorFavorites: Bool,
        distinguishInversions: Bool,
        flatList: Bool,
        expanded: [String: AuralPattern],
        treeScrollPath: String?,
        flatScrollPath: String?
    ) {
        snapshot.search = String(search.prefix(200))
        snapshot.minimumLength = max(2, minimumLength)
        snapshot.maximumLength = maximumLength.map { max(snapshot.minimumLength, $0) }
        snapshot.preferPopular = preferPopular
        snapshot.keepVaried = keepVaried
        snapshot.favorFavorites = favorFavorites
        snapshot.distinguishInversions = distinguishInversions
        snapshot.flatList = flatList
        snapshot.expandedPatternPaths = Dictionary(
            uniqueKeysWithValues: expanded.prefix(200).map { ($0.key, $0.value) }
        )
        snapshot.treeScrollPath = treeScrollPath
        snapshot.flatScrollPath = flatScrollPath
        save()
    }

    func select(pattern: AuralPattern, tab: AuralDetailTab) {
        snapshot.selectedPattern = pattern
        snapshot.selectedTab = tab
        snapshot.isAuralOpen = true
        save()
    }

    func select(tab: AuralDetailTab) {
        snapshot.selectedTab = tab
        save()
    }

    func rememberSongsScroll(_ id: String?) {
        snapshot.songsScrollId = id
        save()
    }

    func updateBrowser(_ browser: AuralBrowserSnapshot) {
        snapshot.browser = browser
        save()
    }

    private func save() {
        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try JSONEncoder().encode(snapshot).write(to: fileURL, options: .atomic)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var file = fileURL
            try? file.setResourceValues(values)
            warning = nil
        } catch {
            warning = "Aural Quiz navigation changes could not be saved."
        }
    }
}
