#include <stdint.h>
static volatile float sink;
int main(void) {
    float values[16] = {1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16};
    float total = 0.0f;
    for (int64_t repeat = 0; repeat < INT64_C(8000000); ++repeat) {
        for (int64_t index = 0; index < 16; ++index) total += values[index];
        if (total > 1000000.0f) total *= 0.000001f;
    }
    sink = total;
    return total < 0.0f;
}
