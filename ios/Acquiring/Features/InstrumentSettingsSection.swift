import AcquiringAudio
import SwiftUI

struct InstrumentSettingsSection: View {
    @Environment(AppEnvironment.self) private var environment

    var body: some View {
        Section("Playback") {
            Picker(
                "Default Instrument",
                selection: Binding(
                    get: { environment.quizInstrument.savedDefault },
                    set: { environment.saveDefaultQuizInstrument($0) }
                )
            ) {
                ForEach(SynthWaveform.allCases, id: \.self) { waveform in
                    Text(waveform.displayName).tag(waveform)
                }
            }
            .pickerStyle(.menu)
            .accessibilityIdentifier("settings.defaultInstrument")
            .accessibilityValue(environment.quizInstrument.savedDefault.displayName)
            .accessibilityHint("Changes the sound used when a new quiz starts and updates the current quiz.")
        }
    }
}
