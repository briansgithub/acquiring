#ifndef ACQUIRING_SONIC_H
#define ACQUIRING_SONIC_H
#include <stdint.h>
// Mono PCM16 preparation only. Caller frees the returned buffer with acquiring_sonic_free.
// Returns NULL on invalid input/allocation failure. Output count is actual flushed frames.
int16_t *acquiring_sonic(const int16_t *input, int count, int sample_rate,
                         float speed, float pitch, int *output_count);
void acquiring_sonic_free(int16_t *samples);
#endif
