#version 460 core
in vec2 pixelPosition;
flat in vec4 boxRect;
flat in vec4 backgroundA;
flat in vec4 backgroundB;
flat in vec4 borderTopRight;
flat in vec4 borderBottomLeft;
flat in vec4 shadowColor;
flat in vec4 cornerRadii;
flat in vec4 borderWidths;
flat in vec4 shadowParams;
flat in vec4 clipRect;
flat in vec4 clipRadii;
flat in vec4 misc;
flat in vec4 extra;
flat in vec4 extra2;
flat in vec4 geometry;
out vec4 outputColor;

float selectedRadius(vec2 p, vec4 radii) {
    if (p.x < 0.0) return p.y < 0.0 ? radii.x : radii.w;
    return p.y < 0.0 ? radii.y : radii.z;
}

float roundedBoxDistance(vec2 point, vec2 halfSize, vec4 radii) {
    float radius = max(0.0, selectedRadius(point, radii));
    vec2 q = abs(point) - halfSize + vec2(radius);
    return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - radius;
}

float segmentDistance(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa,ba) / max(dot(ba,ba),0.00001),0.0,1.0);
    return length(pa - ba*h);
}

float ellipseDistance(vec2 point, vec2 radii) {
    vec2 safeRadii = max(radii, vec2(0.001));
    return (length(point / safeRadii) - 1.0) * min(safeRadii.x,safeRadii.y);
}

vec4 over(vec4 back, vec4 front) {
    float alpha = front.a + back.a * (1.0 - front.a);
    if (alpha <= 0.00001) return vec4(0.0);
    return vec4((front.rgb * front.a + back.rgb * back.a * (1.0 - front.a)) / alpha, alpha);
}

vec4 unpackColorPairs(vec2 pairValue) {
    float rg = floor(pairValue.x + 0.5);
    float ba = floor(pairValue.y + 0.5);
    return vec4(
        mod(rg, 256.0),
        floor(rg / 256.0),
        mod(ba, 256.0),
        floor(ba / 256.0)
    ) / 255.0;
}

vec4 selectedBorderColor(vec2 point) {
    vec4 edges = vec4(
        point.y - boxRect.y,
        boxRect.x + boxRect.z - point.x,
        boxRect.y + boxRect.w - point.y,
        point.x - boxRect.x
    );
    vec2 packedPairs = borderTopRight.xy;
    float nearest = edges.x;
    if (edges.y < nearest) { nearest = edges.y; packedPairs = borderTopRight.zw; }
    if (edges.z < nearest) { nearest = edges.z; packedPairs = borderBottomLeft.xy; }
    if (edges.w < nearest) { packedPairs = borderBottomLeft.zw; }
    return unpackColorPairs(packedPairs);
}

void main() {
    float clipCoverage = 1.0;
    if (clipRect.z > 0.0 && clipRect.w > 0.0) {
        vec2 clipCenter = clipRect.xy + clipRect.zw * 0.5;
        vec2 clipHalf = max(clipRect.zw * 0.5, vec2(0.0));
        float clipDistance = roundedBoxDistance(pixelPosition - clipCenter, clipHalf, clipRadii);
        float clipAA = max(fwidth(clipDistance), 0.75);
        clipCoverage = 1.0 - smoothstep(-clipAA, clipAA, clipDistance);
        if (clipCoverage <= 0.001) discard;
    }

    vec2 center = boxRect.xy + boxRect.zw * 0.5;
    vec2 halfSize = max(boxRect.zw * 0.5, vec2(0.0));
    float shapeMode = extra2.y;
    float distanceValue = roundedBoxDistance(pixelPosition - center, halfSize, cornerRadii);
    if (shapeMode > 0.5 && shapeMode < 1.5) distanceValue = length(pixelPosition - center) - min(halfSize.x,halfSize.y);
    else if (shapeMode > 1.5 && shapeMode < 2.5) distanceValue = segmentDistance(pixelPosition,geometry.xy,geometry.zw) - max(extra2.z*0.5,0.5);
    else if (shapeMode > 2.5 && shapeMode < 3.5) distanceValue = ellipseDistance(pixelPosition-center,halfSize);
    float aa = max(fwidth(distanceValue), 0.75);
    float bodyAlpha = 1.0 - smoothstep(-aa, aa, distanceValue);

    vec2 shadowCenter = center + shadowParams.xy;
    float spread = shadowParams.w;
    float shadowDistance = roundedBoxDistance(pixelPosition - shadowCenter, halfSize + vec2(spread), cornerRadii + vec4(spread));
    if (shapeMode > 0.5 && shapeMode < 1.5) shadowDistance = length(pixelPosition - shadowCenter) - min(halfSize.x,halfSize.y) - spread;
    else if (shapeMode > 1.5 && shapeMode < 2.5) shadowDistance = segmentDistance(pixelPosition-shadowParams.xy,geometry.xy,geometry.zw) - max(extra2.z*0.5+spread,0.5);
    else if (shapeMode > 2.5 && shapeMode < 3.5) shadowDistance = ellipseDistance(pixelPosition-shadowCenter,halfSize+vec2(spread));
    float blur = max(shadowParams.z, 0.001);
    float shadowAlpha = (1.0 - smoothstep(-aa, blur, shadowDistance)) * shadowColor.a;
    vec4 result = vec4(shadowColor.rgb, shadowAlpha);

    float angle = radians(misc.z);
    vec2 direction = vec2(cos(angle), sin(angle));
    vec2 normalized = (pixelPosition - boxRect.xy) / max(boxRect.zw, vec2(1.0));
    float gradient = normalized.y;
    if (misc.y > 0.5 && misc.y < 1.5) gradient = clamp(dot(normalized - vec2(0.5), direction) + 0.5, 0.0, 1.0);
    else if (misc.y > 1.5) gradient = clamp(length((normalized - vec2(0.5)) * 2.0),0.0,1.0);
    vec4 fillColor = mix(backgroundA, backgroundB, gradient);

    float borderWidth = max(max(borderWidths.x, borderWidths.y), max(borderWidths.z, borderWidths.w));
    vec2 innerMinimum = boxRect.xy + vec2(borderWidths.w, borderWidths.x);
    vec2 innerMaximum = boxRect.xy + boxRect.zw - vec2(borderWidths.y, borderWidths.z);
    vec2 innerHalfSize = max((innerMaximum - innerMinimum) * 0.5, vec2(0.0));
    vec2 innerCenter = (innerMinimum + innerMaximum) * 0.5;
    vec4 innerRadii = max(cornerRadii - vec4(
        max(borderWidths.w,borderWidths.x),
        max(borderWidths.y,borderWidths.x),
        max(borderWidths.y,borderWidths.z),
        max(borderWidths.w,borderWidths.z)
    ), vec4(0.0));
    float innerDistance = roundedBoxDistance(pixelPosition - innerCenter, innerHalfSize, innerRadii);
    if (shapeMode > 0.5 && shapeMode < 1.5) innerDistance = length(pixelPosition-center) - max(min(halfSize.x,halfSize.y)-borderWidth,0.0);
    else if (shapeMode > 1.5 && shapeMode < 2.5) innerDistance = distanceValue;
    else if (shapeMode > 2.5 && shapeMode < 3.5) innerDistance = ellipseDistance(pixelPosition-center,max(halfSize-vec2(borderWidth),vec2(0.001)));
    float hasBorder = step(0.0001, borderWidth);
    float innerAlpha = mix(bodyAlpha, 1.0 - smoothstep(-aa, aa, innerDistance), hasBorder);
    float borderAlpha = max(0.0, bodyAlpha - innerAlpha);

    vec4 body = vec4(fillColor.rgb, fillColor.a * innerAlpha);
    vec4 borderColor = selectedBorderColor(pixelPosition);
    vec4 border = vec4(borderColor.rgb, borderColor.a * borderAlpha);
    result = over(result, body);
    result = over(result, border);

    float outlineWidth = max(misc.w, 0.0);
    if (outlineWidth > 0.0) {
        float outlineDistance = roundedBoxDistance(pixelPosition - center, halfSize + vec2(outlineWidth + extra2.x), cornerRadii + vec4(outlineWidth + extra2.x));
        float outlineOuter = 1.0 - smoothstep(-aa, aa, outlineDistance);
        float outlineAlpha = max(0.0, outlineOuter - bodyAlpha) * extra.a;
        result = over(result, vec4(extra.rgb, outlineAlpha));
    }

    result.a *= misc.x * clipCoverage;
    if (result.a <= 0.001) discard;
    outputColor = result;
}
