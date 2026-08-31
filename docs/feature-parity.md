# Feature parity

Status values: **Complete**, **Partial**, **Shell**, and **Planned**.

| Capability | Web | Android | iOS | Shared verification / notes |
| --- | --- | --- | --- | --- |
| Song catalog browsing and search | Complete | Complete | Shell | Catalog schema contract; iOS repository boundary only |
| Catalog download and atomic replacement | N/A | Complete | Planned | `contracts/catalog/` validation rules |
| Chord interpretation and pitch classes | Complete | Complete | Planned | Shared parity corpus executes on web and Android |
| Roman numeral and letter rendering | Complete | Complete | Planned | Shared parity corpus plus platform rendering tests |
| Section playback and synthesis | Complete | Complete | Planned | Platform-native audio engines |
| Ear-training quiz modes | Complete | Complete | Planned | Platform-specific UI tests |
| Microphone pitch tracking | Complete | Complete | Planned | Platform-native microphone and DSP paths |
| Playlists / user-owned data | Partial | Complete | Shell | iOS SwiftData model exists; product UI is planned |
| UI launch smoke test | Complete | Complete | Shell | Per-platform CI |

The iOS shell does not claim musical behavior parity. Change a status to **Complete** only when the corresponding Swift implementation and parity tests pass.
