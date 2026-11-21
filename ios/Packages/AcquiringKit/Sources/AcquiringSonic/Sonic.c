/* Mono PCM16 subset of Bill Cox Sonic, Apache-2.0.
 * Android Sonic.java at 3c887223, upstream b93885dcb70aae50c6f76b0fe4e0868f029a077e.
 * Port follows the retained Java speed/pitch path; no audio device or callback work.
 * Java wrapping arithmetic is explicit. Float operations must not be contracted.
 */
#include "AcquiringSonic.h"
#pragma STDC FP_CONTRACT OFF
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <limits.h>
static const int16_t sinc_table[601] = {
  0, 0, 0, 0, 0, 0, 0, -1, -1, -2, -2, -3, -4, -6, -7, -9, -10, -12, -14,
  -17, -19, -21, -24, -26, -29, -32, -34, -37, -40, -42, -44, -47, -48, -50,
  -51, -52, -53, -53, -53, -52, -50, -48, -46, -43, -39, -34, -29, -22, -16,
  -8, 0, 9, 19, 29, 41, 53, 65, 79, 92, 107, 121, 137, 152, 168, 184, 200,
  215, 231, 247, 262, 276, 291, 304, 317, 328, 339, 348, 357, 363, 369, 372,
  374, 375, 373, 369, 363, 355, 345, 332, 318, 300, 281, 259, 234, 208, 178,
  147, 113, 77, 39, 0, -41, -85, -130, -177, -225, -274, -324, -375, -426,
  -478, -530, -581, -632, -682, -731, -779, -825, -870, -912, -951, -989,
  -1023, -1053, -1080, -1104, -1123, -1138, -1149, -1154, -1155, -1151,
  -1141, -1125, -1105, -1078, -1046, -1007, -963, -913, -857, -796, -728,
  -655, -576, -492, -403, -309, -210, -107, 0, 111, 225, 342, 462, 584, 708,
  833, 958, 1084, 1209, 1333, 1455, 1575, 1693, 1807, 1916, 2022, 2122, 2216,
  2304, 2384, 2457, 2522, 2579, 2625, 2663, 2689, 2706, 2711, 2705, 2687,
  2657, 2614, 2559, 2491, 2411, 2317, 2211, 2092, 1960, 1815, 1658, 1489,
  1308, 1115, 912, 698, 474, 241, 0, -249, -506, -769, -1037, -1310, -1586,
  -1864, -2144, -2424, -2703, -2980, -3254, -3523, -3787, -4043, -4291,
  -4529, -4757, -4972, -5174, -5360, -5531, -5685, -5819, -5935, -6029,
  -6101, -6150, -6175, -6175, -6149, -6096, -6015, -5905, -5767, -5599,
  -5401, -5172, -4912, -4621, -4298, -3944, -3558, -3141, -2693, -2214,
  -1705, -1166, -597, 0, 625, 1277, 1955, 2658, 3386, 4135, 4906, 5697, 6506,
  7332, 8173, 9027, 9893, 10769, 11654, 12544, 13439, 14335, 15232, 16128,
  17019, 17904, 18782, 19649, 20504, 21345, 22170, 22977, 23763, 24527,
  25268, 25982, 26669, 27327, 27953, 28547, 29107, 29632, 30119, 30569,
  30979, 31349, 31678, 31964, 32208, 32408, 32565, 32677, 32744, 32767,
  32744, 32677, 32565, 32408, 32208, 31964, 31678, 31349, 30979, 30569,
  30119, 29632, 29107, 28547, 27953, 27327, 26669, 25982, 25268, 24527,
  23763, 22977, 22170, 21345, 20504, 19649, 18782, 17904, 17019, 16128,
  15232, 14335, 13439, 12544, 11654, 10769, 9893, 9027, 8173, 7332, 6506,
  5697, 4906, 4135, 3386, 2658, 1955, 1277, 625, 0, -597, -1166, -1705,
  -2214, -2693, -3141, -3558, -3944, -4298, -4621, -4912, -5172, -5401,
  -5599, -5767, -5905, -6015, -6096, -6149, -6175, -6175, -6150, -6101,
  -6029, -5935, -5819, -5685, -5531, -5360, -5174, -4972, -4757, -4529,
  -4291, -4043, -3787, -3523, -3254, -2980, -2703, -2424, -2144, -1864,
  -1586, -1310, -1037, -769, -506, -249, 0, 241, 474, 698, 912, 1115, 1308,
  1489, 1658, 1815, 1960, 2092, 2211, 2317, 2411, 2491, 2559, 2614, 2657,
  2687, 2705, 2711, 2706, 2689, 2663, 2625, 2579, 2522, 2457, 2384, 2304,
  2216, 2122, 2022, 1916, 1807, 1693, 1575, 1455, 1333, 1209, 1084, 958, 833,
  708, 584, 462, 342, 225, 111, 0, -107, -210, -309, -403, -492, -576, -655,
  -728, -796, -857, -913, -963, -1007, -1046, -1078, -1105, -1125, -1141,
  -1151, -1155, -1154, -1149, -1138, -1123, -1104, -1080, -1053, -1023, -989,
  -951, -912, -870, -825, -779, -731, -682, -632, -581, -530, -478, -426,
  -375, -324, -274, -225, -177, -130, -85, -41, 0, 39, 77, 113, 147, 178,
  208, 234, 259, 281, 300, 318, 332, 345, 355, 363, 369, 373, 375, 374, 372,
  369, 363, 357, 348, 339, 328, 317, 304, 291, 276, 262, 247, 231, 215, 200,
  184, 168, 152, 137, 121, 107, 92, 79, 65, 53, 41, 29, 19, 9, 0, -8, -16,
  -22, -29, -34, -39, -43, -46, -48, -50, -52, -53, -53, -53, -52, -51, -50,
  -48, -47, -44, -42, -40, -37, -34, -32, -29, -26, -24, -21, -19, -17, -14,
  -12, -10, -9, -7, -6, -4, -3, -2, -2, -1, -1, 0, 0, 0, 0, 0, 0, 0,
};
typedef struct { int16_t *data; int count, capacity; } Buffer;
typedef struct {
    Buffer input, output, pitch;
    int rate, min_period, max_period, required, remaining;
    int previous_period, previous_diff, min_diff, max_diff;
    int old_position, new_position, failed;
    float speed, pitch_ratio;
} State;
static int32_t mul(int32_t a, int32_t b) { return (int32_t)((uint32_t)a * (uint32_t)b); }
static int32_t add(int32_t a, int32_t b) { return (int32_t)((uint32_t)a + (uint32_t)b); }
static int reserve(State *s, Buffer *b, int extra) {
    if (extra < 0 || b->count > INT_MAX - extra) { s->failed = 1; return 0; }
    int need = b->count + extra;
    if (need <= b->capacity) return 1;
    int16_t *p = realloc(b->data, (size_t)need * sizeof(int16_t));
    if (!p) { s->failed = 1; return 0; }
    b->data = p; b->capacity = need; return 1;
}
static void append(State *s, Buffer *b, const int16_t *p, int count) {
    if (!reserve(s, b, count)) return;
    if (count) memcpy(b->data + b->count, p, (size_t)count * 2);
    b->count += count;
}
static void remove_front(Buffer *b, int count) {
    memmove(b->data, b->data + count, (size_t)(b->count - count) * 2);
    b->count -= count;
}
static int period_range(State *s, const int16_t *p, int low, int high) {
    int best = 0, worst = 255, minimum = 1, maximum = 0;
    for (int period = low; period <= high; ++period) {
        int diff = 0;
        for (int i = 0; i < period; ++i) diff = add(diff, abs((int)p[i] - p[i + period]));
        if (mul(diff, best) < mul(minimum, period)) { minimum = diff; best = period; }
        if (mul(diff, worst) > mul(maximum, period)) { maximum = diff; worst = period; }
    }
    s->min_diff = minimum / best; s->max_diff = maximum / worst;
    return best;
}
static int find_period(State *s, const int16_t *p) {
    int skip = s->rate > 4000 ? s->rate / 4000 : 1;
    int period;
    if (skip == 1) period = period_range(s, p, s->min_period, s->max_period);
    else {
        int16_t down[2 * 4000 / 65 + 2];
        int count = s->required / skip;
        // Supported speech sample rates ensure this fixed scratch capacity.
        if (count > (int)(sizeof(down) / sizeof(*down))) { s->failed = 1; return 1; }
        for (int i = 0; i < count; ++i) {
            int sum = 0;
            for (int j = 0; j < skip; ++j) sum += p[i * skip + j];
            down[i] = (int16_t)(sum / skip);
        }
        period = period_range(s, down, s->min_period / skip, s->max_period / skip) * skip;
        int low = period - skip * 4, high = period + skip * 4;
        if (low < s->min_period) low = s->min_period;
        if (high > s->max_period) high = s->max_period;
        period = period_range(s, p, low, high);
    }
    int previous_better = s->min_diff != 0 && s->previous_period != 0 &&
        s->max_diff <= mul(s->min_diff, 3) && mul(s->min_diff, 2) > mul(s->previous_diff, 3);
    int result = previous_better ? s->previous_period : period;
    s->previous_diff = s->min_diff; s->previous_period = period;
    return result;
}
static void overlap(int16_t *out, const int16_t *down, const int16_t *up, int count) {
    for (int i = 0; i < count; ++i)
        out[i] = (int16_t)(add(mul(down[i], count - i), mul(up[i], i)) / count);
}
static void change_speed(State *s, float speed) {
    int position = 0;
    if (s->input.count < s->required) return;
    do {
        const int16_t *p = s->input.data + position;
        if (s->remaining > 0) {
            int count = s->remaining < s->required ? s->remaining : s->required;
            append(s, &s->output, p, count); s->remaining -= count; position += count;
        } else {
            int period = find_period(s, p), count;
            if (speed > 1) {
                if (speed >= 2) count = (int)(period / (speed - 1));
                else { count = period; s->remaining = (int)((period * (2 - speed)) / (speed - 1)); }
                if (!reserve(s, &s->output, count)) return;
                overlap(s->output.data + s->output.count, p, p + period, count);
                s->output.count += count; position += period + count;
            } else {
                if (speed < 0.5f) count = (int)((period * speed) / (1 - speed));
                else { count = period; s->remaining = (int)((period * (2 * speed - 1)) / (1 - speed)); }
                if (!reserve(s, &s->output, period + count)) return;
                memcpy(s->output.data + s->output.count, p, (size_t)period * 2);
                overlap(s->output.data + s->output.count + period, p + period, p, count);
                s->output.count += period + count; position += count;
            }
        }
        if (s->failed) return;
    } while (position + s->required <= s->input.count);
    remove_front(&s->input, position);
}
static int coefficient(int i, int ratio, int width) {
    int left = i * 50 + mul(ratio, 50) / width;
    int position = add(add(mul(i * 50, width), mul(ratio, 50)), -mul(left, width));
    int sum = add(mul(sinc_table[left], width - position), mul(sinc_table[left + 1], position));
    return (int32_t)((uint32_t)sum << 1) / width;
}
static int16_t interpolate(State *s, const int16_t *p, int old_rate, int new_rate) {
    int position = mul(s->new_position, old_rate);
    int left = mul(s->old_position, new_rate), right = mul(s->old_position + 1, new_rate);
    int total = 0, overflow = 0;
    for (int i = 0; i < 12; ++i) {
        int value = mul(p[i], coefficient(i, right - position - 1, right - left));
        int sign = total >= 0 ? 1 : -1;
        total = add(total, value);
        if (sign != (total >= 0 ? 1 : -1) && (value >= 0 ? 1 : -1) == sign) overflow += sign;
    }
    return overflow > 0 ? 32767 : overflow < 0 ? -32768 : (int16_t)(total >> 16);
}
static void adjust_rate(State *s, int original) {
    int new_rate = (int)(s->rate / s->pitch_ratio), old_rate = s->rate;
    while (new_rate > 16384 || old_rate > 16384) { new_rate >>= 1; old_rate >>= 1; }
    if (s->output.count == original) return;
    append(s, &s->pitch, s->output.data + original, s->output.count - original);
    if (s->failed) return;
    s->output.count = original;
    int position = 0;
    for (; position < s->pitch.count - 12; ++position) {
        while (mul(s->old_position + 1, new_rate) > mul(s->new_position, old_rate)) {
            if (!reserve(s, &s->output, 1)) return;
            s->output.data[s->output.count++] = interpolate(s, s->pitch.data + position, old_rate, new_rate);
            s->new_position++;
        }
        s->old_position++;
        if (s->old_position == old_rate) s->old_position = s->new_position = 0;
    }
    remove_front(&s->pitch, position);
}
static void process(State *s) {
    int original = s->output.count;
    float speed = s->speed / s->pitch_ratio;
    if (speed > 1.00001 || speed < 0.99999) change_speed(s, speed);
    else { append(s, &s->output, s->input.data, s->input.count); s->input.count = 0; }
    if (!s->failed && s->pitch_ratio != 1) adjust_rate(s, original);
}
int16_t *acquiring_sonic(const int16_t *input, int count, int sample_rate,
                         float speed, float pitch, int *output_count) {
    if (!output_count) return NULL;
    *output_count = 0;
    if (!input || count <= 0 || count > 24000 * 48 || sample_rate != 24000 ||
        !isfinite(speed) || !isfinite(pitch) || speed < 0.05f || speed > 100 || pitch < 0.125f || pitch > 8) return NULL;
    State s = {0}; s.rate = sample_rate; s.speed = speed; s.pitch_ratio = pitch;
    s.min_period = sample_rate / 400; s.max_period = sample_rate / 65; s.required = s.max_period * 2;
    append(&s, &s.input, input, count);
    if (!s.failed) process(&s);
    float relative_speed = speed / pitch;
    int expected = s.output.count + (int)(((s.input.count / relative_speed + s.pitch.count) / pitch) + 0.5f);
    if (!s.failed && reserve(&s, &s.input, 2 * s.required)) {
        memset(s.input.data + s.input.count, 0, (size_t)(2 * s.required) * 2);
        s.input.count += 2 * s.required;
        process(&s);
    }
    free(s.input.data); free(s.pitch.data);
    if (s.failed) { free(s.output.data); return NULL; }
    *output_count = s.output.count < expected ? s.output.count : expected;
    return s.output.data;
}
void acquiring_sonic_free(int16_t *samples) { free(samples); }
