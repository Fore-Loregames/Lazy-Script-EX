#version 460 core
in vec2 uv;
flat in vec4 textColor;
flat in vec4 clipRect;
flat in vec4 clipRadii;
in vec2 pixelPosition;
out vec4 color;
uniform sampler2D fontAtlas;
float selectedClipRadius(vec2 p, vec4 radii) {
    if (p.x < 0.0) return p.y < 0.0 ? radii.x : radii.w;
    return p.y < 0.0 ? radii.y : radii.z;
}
float roundedClipCoverage(vec2 pixelPosition, vec4 clipRect, vec4 clipRadii) {
    if (clipRect.z <= 0.0 || clipRect.w <= 0.0) return 1.0;
    vec2 center = clipRect.xy + clipRect.zw * 0.5;
    vec2 halfSize = max(clipRect.zw * 0.5, vec2(0.0));
    vec2 point = pixelPosition - center;
    float radius = max(0.0, selectedClipRadius(point, clipRadii));
    vec2 q = abs(point) - halfSize + vec2(radius);
    float distanceValue = min(max(q.x,q.y),0.0) + length(max(q,vec2(0.0))) - radius;
    float aa = max(fwidth(distanceValue),0.75);
    return 1.0 - smoothstep(-aa,aa,distanceValue);
}
void main() {
    float clipCoverage = roundedClipCoverage(pixelPosition,clipRect,clipRadii);
    if (clipCoverage <= 0.001) discard;
    float distanceValue = texture(fontAtlas,uv).r;
    float edge = max(fwidth(distanceValue),0.002);
    float alpha = smoothstep(0.5-edge,0.5+edge,distanceValue);
    color = vec4(textColor.rgb,textColor.a*alpha*clipCoverage);
    if (color.a <= 0.001) discard;
}
