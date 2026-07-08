#include <stdint.h>
static volatile uint64_t sink;
int main(void) {
    uint64_t state = UINT64_C(88172645463325252), checksum = 0;
    for (int64_t i = 0; i < INT64_C(120000000); ++i) {
        state = state * UINT64_C(2862933555777941757) + UINT64_C(3037000493);
        checksum += state;
    }
    sink = checksum;
    return checksum == 0;
}
