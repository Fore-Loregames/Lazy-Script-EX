#version 460 core

struct ImageData {
    vec4 rect;
    vec4 color;
    vec4 clipRect;
    vec4 clipRadii;
};

layout(std430,binding=0) readonly buffer LazyUIImageBuffer {
    ImageData images[];
};

uniform vec2 viewport;
out vec2 uv;
flat out vec4 tint;
flat out vec4 clipRect;
flat out vec4 clipRadii;
out vec2 pixelPosition;

const vec2 corners[4] = vec2[4](
    vec2(0.0,0.0), vec2(1.0,0.0),
    vec2(0.0,1.0), vec2(1.0,1.0)
);

void main() {
    ImageData image = images[gl_BaseInstance + gl_InstanceID];
    vec2 corner = corners[gl_VertexID];
    pixelPosition = image.rect.xy + corner * image.rect.zw;
    uv = corner;
    tint = image.color;
    clipRect = image.clipRect;
    clipRadii = image.clipRadii;
    vec2 ndc = (pixelPosition / viewport) * vec2(2.0,-2.0) + vec2(-1.0,1.0);
    gl_Position = vec4(ndc,0.0,1.0);
}
