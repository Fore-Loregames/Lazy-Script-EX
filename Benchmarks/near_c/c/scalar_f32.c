#include <stdint.h>
static volatile float sink;
int main(void) {
    float value = 0.125f;
    for (int64_t i = 0; i < INT64_C(90000000); ++i) {
        value = value * 1.0000001192092896f + 0.0000001192092896f;
        if (value > 8192.0f) value *= 0.0001220703125f;
    }
    sink = value;
    return value <= 0.0f;
}
