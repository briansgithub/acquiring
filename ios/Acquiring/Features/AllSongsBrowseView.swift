import AcquiringCatalog
import AcquiringCore
import SwiftUI

struct AllSongsBrowseView: View {
    let store: LibraryStore

    var body: some View {
        @Bindable var browse = store.browse
        ScrollViewReader { proxy in
            VStack(spacing: 0) {
                controls(browse: $browse)
                index(groups: browse.groups, proxy: proxy)
                browseList(browse: $browse)
            }
            .task(id: store.catalogRevision) {
                await browse.refresh(catalogRevision: store.catalogRevision)
            }
        }
    }

    private func controls(browse: Bindable<AllSongsBrowseStore>) -> some View {
        VStack(spacing: 10) {
            Picker("Browse by", selection: Binding(
                get: { browse.wrappedValue.browseMode },
                set: { browse.wrappedValue.selectMode($0) }
            )) {
                Text("Alphabetical").tag(BrowseMode.alphabetical)
                Text("Complexity").tag(BrowseMode.complexity)
                Text("Mode").tag(BrowseMode.mode)
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("allSongs.browseMode")

            HStack(spacing: 8) {
                TextField("Filter songs", text: browse.filterText, prompt: Text("Title or artist"))
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("allSongs.filter")
                if !browse.filterText.wrappedValue.isEmpty {
                    Button {
                        browse.filterText.wrappedValue = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                    }
                    .accessibilityLabel("Clear song filter")
                }
            }
            if let warning = browse.wrappedValue.legacyMetadataWarning {
                Label(warning, systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("allSongs.legacyMetadataWarning")
            }

            if browse.wrappedValue.isShowingNoMatches {
                ContentUnavailableView(
                    "No matches",
                    systemImage: "magnifyingglass",
                    description: Text("Try another title or artist."))
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("allSongs.noMatches")
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
    }

    private func index(groups: [BrowseGroupDescriptor], proxy: ScrollViewProxy) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(groups) { group in
                    Button(group.label) {
                        withAnimation { proxy.scrollTo(headingID(for: group), anchor: .top) }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .accessibilityLabel("Jump to \(group.label)")
                }
            }
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
        .accessibilityIdentifier("allSongs.index")
    }

    private func browseList(browse: Bindable<AllSongsBrowseStore>) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: [.sectionHeaders]) {
                statusRows(browse: browse)

                if browse.wrappedValue.shouldShowGroups {
                    ForEach(browse.wrappedValue.groups) { group in
                        Section {
                            if browse.wrappedValue.expandedGroupKey == group.key {
                                groupRows(group: group, browse: browse)
                            }
                        } header: {
                            groupHeader(group: group, browse: browse)
                                .id(headingID(for: group))
                        }
                    }
                }
            }
            .scrollTargetLayout()
            .padding(.bottom)
        }
        .scrollPosition(id: Binding(
            get: { browse.wrappedValue.scrollAnchorID },
            set: { id in
                if let id { browse.wrappedValue.recordScrollAnchor(id: id) }
            }
        ))
        .scrollDismissesKeyboard(.interactively)
        .accessibilityIdentifier("allSongs.list")
    }

    @ViewBuilder
    private func statusRows(browse: Bindable<AllSongsBrowseStore>) -> some View {
        switch browse.wrappedValue.metadataState {
        case .failure(let message):
            errorRow(message: message) { browse.wrappedValue.retry() }
        default:
            EmptyView()
        }

        switch browse.wrappedValue.countsState {
        case .idle, .loading:
            HStack { Spacer(); ProgressView("Loading groups"); Spacer() }
                .padding()
        case .failure(let message):
            errorRow(message: message) { browse.wrappedValue.retry() }
        case .empty:
            ContentUnavailableView("No songs available", systemImage: "music.note.list")
                .frame(maxWidth: .infinity)
                .padding()
        case .content(let counts) where counts.isEmpty && browse.wrappedValue.appliedFilter.isEmpty:
            ContentUnavailableView("No songs available", systemImage: "music.note.list")
                .frame(maxWidth: .infinity)
                .padding()
        case .content:
            EmptyView()
        }
    }

    @ViewBuilder
    private func groupRows(group: BrowseGroupDescriptor, browse: Bindable<AllSongsBrowseStore>) -> some View {
        switch browse.wrappedValue.songsState {
        case .idle, .loading:
            HStack { Spacer(); ProgressView("Loading songs"); Spacer() }
                .accessibilityIdentifier("allSongs.groupLoading")
        case .empty:
            Text(browse.wrappedValue.appliedFilter.isEmpty ? "No songs in this group" : "No songs match this filter")
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("allSongs.groupEmpty")
        case .failure(let message):
            errorRow(message: message) { browse.wrappedValue.retry() }
        case .content(let songs):
            ForEach(songs) { song in
                SongRow(song: song) { store.openSong(song) }
                    .id(songID(for: song))
                    .padding(.horizontal)
                    .padding(.vertical, 4)
            }
        }
    }

    private func groupHeader(group: BrowseGroupDescriptor, browse: Bindable<AllSongsBrowseStore>) -> some View {
        let isExpanded = browse.wrappedValue.expandedGroupKey == group.key
        let countDescription: String?
        if case let .content(counts) = browse.wrappedValue.countsState {
            countDescription = "\(counts[group.key, default: 0].formatted()) songs"
        } else {
            countDescription = nil
        }
        return Button {
            browse.wrappedValue.toggleGroup(group.key)
        } label: {
            HStack {
                Text(group.label)
                    .font(.headline)
                Spacer()
                switch browse.wrappedValue.countsState {
                case .content(let counts):
                    Text(counts[group.key, default: 0].formatted())
                        .foregroundStyle(.secondary)
                        .font(.subheadline)
                case .loading:
                    ProgressView().controlSize(.small)
                default:
                    EmptyView()
                }
                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .foregroundStyle(.secondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal)
        .padding(.vertical, 12)
        .background(.background)
        .accessibilityLabel("\(isExpanded ? "Collapse" : "Expand") \(group.label)")
        .accessibilityValue(
            [countDescription, isExpanded ? "Expanded" : "Collapsed"]
                .compactMap { $0 }
                .joined(separator: ", ")
        )
        .accessibilityIdentifier("allSongs.group.\(group.key)")
    }

    private func errorRow(message: String, retry: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(message).foregroundStyle(.red)
            Button("Retry", action: retry)
        }
        .padding()
        .accessibilityIdentifier("allSongs.error")
    }

    private func headingID(for group: BrowseGroupDescriptor) -> String {
        "allSongs.heading.\(group.key)"
    }

    private func songID(for song: CatalogSong) -> String {
        "allSongs.song.\(song.id)"
    }
}
