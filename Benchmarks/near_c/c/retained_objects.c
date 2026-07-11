#include <stdint.h>
#include <stdlib.h>
typedef struct Pair { int64_t x, y; } Pair;
static volatile int64_t sink;
int main(void) {
    Pair *items[128];
    int64_t checksum = 0;
    for (int64_t round = 0; round < INT64_C(250000); ++round) {
        for (int64_t index = 0; index < 128; ++index) {
            Pair *item = (Pair *)malloc(sizeof(Pair));
            if (!item) return 2;
            item->x = round + index;
            item->y = item->x * 3 + 7;
            items[index] = item;
        }
        for (int64_t index = 0; index < 128; ++index) {
            checksum += items[index]->x + items[index]->y;
            free(items[index]);
        }
    }
    sink = checksum;
    return checksum != INT64_C(16008288000000);
}
