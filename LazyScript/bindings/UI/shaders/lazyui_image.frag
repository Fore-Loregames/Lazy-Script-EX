#version 460 core
in vec2 uv;
flat in vec4 tint;
flat in vec4 clipRect;
in vec2 pixelPosition;
out vec4 color;
uniform sampler2D sourceTexture;
void main(){if(clipRect.z>0.0&&clipRect.w>0.0){if(pixelPosition.x<clipRect.x||pixelPosition.y<clipRect.y||pixelPosition.x>clipRect.x+clipRect.z||pixelPosition.y>clipRect.y+clipRect.w)discard;}color=texture(sourceTexture,uv)*tint;if(color.a<=0.001)discard;}
