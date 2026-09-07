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
                Section("Synths") {
                    ForEach(synths, id: \.self) { waveform in
                        Text(waveform.displayName).tag(waveform)
                    }
                }
                Section("Waveforms") {
                    ForEach(waveforms, id: \.self) { waveform in
                        Text(waveform.displayName).tag(waveform)
                    }
                }
            }
            .pickerStyle(.menu)
            .accessibilityIdentifier("settings.defaultInstrument")
            .accessibilityValue(environment.quizInstrument.savedDefault.displayName)
            .accessibilityHint("Changes the sound used when a new quiz starts and updates the current quiz.")
        }
    }

    private var waveforms: [SynthWaveform] {
        [.sawtooth, .sine, .square, .triangle]
    }

    private var synths: [SynthWaveform] {
        SynthWaveform.allCases.filter { !waveforms.contains($0) }
    }
}
