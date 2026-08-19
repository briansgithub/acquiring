export class MidiAnalysisError extends Error {
  constructor(message, { code = "MIDI_ANALYSIS_ERROR", statusCode = 400, details = null, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "MidiAnalysisError";
    this.code = code;
    this.statusCode = statusCode;
    if (details !== null) this.details = details;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      statusCode: this.statusCode,
      message: this.message,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

export function invalidMidi(message, details, cause) {
  return new MidiAnalysisError(message, {
    code: "INVALID_MIDI",
    statusCode: 400,
    details,
    cause,
  });
}
