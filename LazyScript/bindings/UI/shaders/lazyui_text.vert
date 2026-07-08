#version 460 core

struct GlyphData {
    vec4 rect;
    vec4 uvRect;
    vec4 color;
    vec4 clipRect;
};

layout(std430,binding=0) readonly buffer LazyUITextBuffer {
    GlyphData glyphs[];
};

uniform vec2 viewport;
out vec2 uv;
flat out vec4 textColor;
flat out vec4 clipRect;
out vec2 pixelPosition;

const vec2 corners[4] = vec2[4](
    vec2(0.0,0.0), vec2(1.0,0.0),
    vec2(0.0,1.0), vec2(1.0,1.0)
);

void main() {
    GlyphData glyph = glyphs[gl_BaseInstance + gl_InstanceID];
    vec2 corner = corners[gl_VertexID];
    pixelPosition = glyph.rect.xy + corner * glyph.rect.zw;
    uv = mix(glyph.uvRect.xy,glyph.uvRect.zw,corner);
    textColor = glyph.color;
    clipRect = glyph.clipRect;
    vec2 ndc = (pixelPosition / viewport) * vec2(2.0,-2.0) + vec2(-1.0,1.0);
    gl_Position = vec4(ndc,0.0,1.0);
}
