#version 460 core
layout(location=0) in vec2 position;
layout(location=1) in vec2 unusedUV;
layout(location=2) in vec4 inputColor;
layout(location=3) in vec4 inputClip;
layout(location=4) in vec4 inputClipRadii;
uniform vec2 viewport;
out vec4 vertexColor;
out vec4 clipRect;
out vec4 clipRadii;
out vec2 pixelPosition;
void main(){pixelPosition=position;vertexColor=inputColor;clipRect=inputClip;clipRadii=inputClipRadii;vec2 ndc=(position/viewport)*vec2(2.0,-2.0)+vec2(-1.0,1.0);gl_Position=vec4(ndc,0.0,1.0);}
