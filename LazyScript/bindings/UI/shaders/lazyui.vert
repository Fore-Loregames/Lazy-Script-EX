#version 460 core

struct SurfaceData {
    vec4 rect;
    vec4 backgroundA;
    vec4 backgroundB;
    vec4 borderTopRight;
    vec4 borderBottomLeft;
    vec4 shadowColor;
    vec4 cornerRadii;
    vec4 borderWidths;
    vec4 shadowParams;
    vec4 clipRect;
    vec4 misc;
    vec4 extra;
    vec4 extra2;
    vec4 geometry;
};

layout(std430,binding=0) readonly buffer LazyUISurfaceBuffer {
    SurfaceData surfaces[];
};

uniform vec2 viewport;
out vec2 pixelPosition;
flat out vec4 boxRect;
flat out vec4 backgroundA;
flat out vec4 backgroundB;
flat out vec4 borderTopRight;
flat out vec4 borderBottomLeft;
flat out vec4 shadowColor;
flat out vec4 cornerRadii;
flat out vec4 borderWidths;
flat out vec4 shadowParams;
flat out vec4 clipRect;
flat out vec4 misc;
flat out vec4 extra;
flat out vec4 extra2;
flat out vec4 geometry;

const vec2 corners[4] = vec2[4](
    vec2(0.0,0.0), vec2(1.0,0.0),
    vec2(0.0,1.0), vec2(1.0,1.0)
);

void main() {
    int cornerIndex = gl_VertexID;
    SurfaceData surface = surfaces[gl_BaseInstance + gl_InstanceID];
    float expansion = max(surface.shadowParams.z * 2.0 + abs(surface.shadowParams.w), surface.misc.w + surface.extra2.x) + 2.0;
    vec2 shadowOffset = surface.shadowParams.xy;
    vec2 minimum = surface.rect.xy - vec2(expansion) + min(shadowOffset, vec2(0.0));
    vec2 maximum = surface.rect.xy + surface.rect.zw + vec2(expansion) + max(shadowOffset, vec2(0.0));
    pixelPosition = mix(minimum, maximum, corners[cornerIndex]);
    vec2 ndc = (pixelPosition / viewport) * vec2(2.0, -2.0) + vec2(-1.0, 1.0);
    gl_Position = vec4(ndc, 0.0, 1.0);
    boxRect = surface.rect;
    backgroundA = surface.backgroundA;
    backgroundB = surface.backgroundB;
    borderTopRight = surface.borderTopRight;
    borderBottomLeft = surface.borderBottomLeft;
    shadowColor = surface.shadowColor;
    cornerRadii = surface.cornerRadii;
    borderWidths = surface.borderWidths;
    shadowParams = surface.shadowParams;
    clipRect = surface.clipRect;
    misc = surface.misc;
    extra = surface.extra;
    extra2 = surface.extra2;
    geometry = surface.geometry;
}
