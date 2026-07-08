#version 460 core
in vec2 uv;
flat in vec4 textColor;
flat in vec4 clipRect;
in vec2 pixelPosition;
out vec4 color;
uniform sampler2D fontAtlas;
void main() {
    if (clipRect.z > 0.0 && clipRect.w > 0.0) {
        if (pixelPosition.x < clipRect.x || pixelPosition.y < clipRect.y || pixelPosition.x > clipRect.x + clipRect.z || pixelPosition.y > clipRect.y + clipRect.w) discard;
    }
    float distanceValue = texture(fontAtlas,uv).r;
    float edge = max(fwidth(distanceValue),0.002);
    float alpha = smoothstep(0.5-edge,0.5+edge,distanceValue);
    color = vec4(textColor.rgb,textColor.a*alpha);
    if (color.a <= 0.001) discard;
}
