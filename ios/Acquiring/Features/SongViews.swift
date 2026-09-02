import SwiftUI

struct SongDetailView: View {
    let songID: String

    var body: some View {
        Text(songID)
            .navigationTitle("Song")
            .navigationBarTitleDisplayMode(.inline)
    }
}

struct QuizView: View {
    let songID: String

    var body: some View {
        Text("Quiz")
            .navigationTitle("Quiz")
            .navigationBarTitleDisplayMode(.inline)
    }
}
