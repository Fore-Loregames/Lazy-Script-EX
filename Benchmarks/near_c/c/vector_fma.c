#include <stdint.h>
static volatile float sink;
int main(void) {
    float output[16] = {1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16};
    const float left[16] = {1.01f,1.02f,1.03f,1.04f,1.05f,1.06f,1.07f,1.08f,1.09f,1.10f,1.11f,1.12f,1.13f,1.14f,1.15f,1.16f};
    const float right[16] = {0.01f,0.02f,0.03f,0.04f,0.05f,0.06f,0.07f,0.08f,0.09f,0.10f,0.11f,0.12f,0.13f,0.14f,0.15f,0.16f};
    for (int64_t repeat = 0; repeat < INT64_C(12000000); ++repeat) {
        for (int64_t index = 0; index < 16; ++index) output[index] = left[index] * right[index] + output[index];
        if (output[15] > 100000.0f) for (int64_t index = 0; index < 16; ++index) output[index] *= 0.00001f;
    }
    sink = output[0];
    return output[0] < 2200.0f || output[0] > 2400.0f || output[15] < 42000.0f || output[15] > 42200.0f;
}
