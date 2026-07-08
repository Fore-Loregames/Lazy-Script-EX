#define GLM_ENABLE_EXPERIMENTAL
#define GLM_FORCE_RADIANS
#include <glm/glm.hpp>
#include <glm/gtc/constants.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/matrix_inverse.hpp>
#include <glm/gtc/quaternion.hpp>
#include <glm/gtx/quaternion.hpp>
#include <glm/gtx/matrix_decompose.hpp>
#include <glm/gtx/matrix_interpolation.hpp>
#include <glm/gtx/dual_quaternion.hpp>
#include <glm/gtx/rotate_vector.hpp>
#include <glm/gtx/euler_angles.hpp>
#include <glm/gtx/vector_angle.hpp>
#include <glm/gtx/projection.hpp>
#include <glm/ext/matrix_clip_space.hpp>
#include <glm/ext/matrix_projection.hpp>

#if defined(_WIN32)
#define LSX_EXPORT extern "C" __declspec(dllexport)
#else
#define LSX_EXPORT extern "C"
#endif

using glm::vec2;
using glm::vec3;
using glm::vec4;
using glm::mat2;
using glm::mat3;
using glm::mat4;
using glm::quat;
using glm::dualquat;

static vec2 v2(const float* p) { return p ? vec2(p[0], p[1]) : vec2(0.0f); }
static vec3 v3(const float* p) { return p ? vec3(p[0], p[1], p[2]) : vec3(0.0f); }
static vec4 v4(const float* p) { return p ? vec4(p[0], p[1], p[2], p[3]) : vec4(0.0f); }
static quat q4(const float* p) { return p ? quat(p[3], p[0], p[1], p[2]) : quat(1.0f, 0.0f, 0.0f, 0.0f); }
static dualquat dq8(const float* p) {
    if (!p) return dualquat(quat(1.0f,0.0f,0.0f,0.0f), quat(0.0f,0.0f,0.0f,0.0f));
    return dualquat(quat(p[3],p[0],p[1],p[2]), quat(p[7],p[4],p[5],p[6]));
}

static mat2 m2(const float* p) {
    mat2 m(1.0f);
    if (p) for (int c=0;c<2;++c) for (int r=0;r<2;++r) m[c][r]=p[c*2+r];
    return m;
}
static mat3 m3(const float* p) {
    mat3 m(1.0f);
    if (p) for (int c=0;c<3;++c) for (int r=0;r<3;++r) m[c][r]=p[c*3+r];
    return m;
}
static mat4 m4(const float* p) {
    mat4 m(1.0f);
    if (p) for (int c=0;c<4;++c) for (int r=0;r<4;++r) m[c][r]=p[c*4+r];
    return m;
}

static void s2(float* p, vec2 const& v) { if (p) { p[0]=v.x; p[1]=v.y; } }
static void s3(float* p, vec3 const& v) { if (p) { p[0]=v.x; p[1]=v.y; p[2]=v.z; } }
static void s4(float* p, vec4 const& v) { if (p) { p[0]=v.x; p[1]=v.y; p[2]=v.z; p[3]=v.w; } }
static void sq(float* p, quat const& q) { if (p) { p[0]=q.x; p[1]=q.y; p[2]=q.z; p[3]=q.w; } }
static void sdq(float* p, dualquat const& q) { if (p) { sq(p,q.real); sq(p+4,q.dual); } }
static void sm2(float* p, mat2 const& m) { if (p) for (int c=0;c<2;++c) for(int r=0;r<2;++r) p[c*2+r]=m[c][r]; }
static void sm3(float* p, mat3 const& m) { if (p) for (int c=0;c<3;++c) for(int r=0;r<3;++r) p[c*3+r]=m[c][r]; }
static void sm4(float* p, mat4 const& m) { if (p) for (int c=0;c<4;++c) for(int r=0;r<4;++r) p[c*4+r]=m[c][r]; }

LSX_EXPORT int _lsxGLMVersionMajor() { return GLM_VERSION_MAJOR; }
LSX_EXPORT int _lsxGLMVersionMinor() { return GLM_VERSION_MINOR; }
LSX_EXPORT int _lsxGLMVersionPatch() { return GLM_VERSION_PATCH; }
LSX_EXPORT int _lsxGLMReady() { return 1; }

LSX_EXPORT float _lsxGLMPi() { return glm::pi<float>(); }
LSX_EXPORT float _lsxGLMTwoPi() { return glm::two_pi<float>(); }
LSX_EXPORT float _lsxGLMHalfPi() { return glm::half_pi<float>(); }
LSX_EXPORT float _lsxGLMEpsilon() { return glm::epsilon<float>(); }
LSX_EXPORT float _lsxGLMRadians(float degrees) { return glm::radians(degrees); }
LSX_EXPORT float _lsxGLMDegrees(float radians) { return glm::degrees(radians); }
LSX_EXPORT float _lsxGLMClamp(float x,float lo,float hi) { return glm::clamp(x,lo,hi); }
LSX_EXPORT float _lsxGLMMix(float a,float b,float t) { return glm::mix(a,b,t); }
LSX_EXPORT float _lsxGLMStep(float edge,float x) { return glm::step(edge,x); }
LSX_EXPORT float _lsxGLMSmoothstep(float a,float b,float x) { return glm::smoothstep(a,b,x); }
LSX_EXPORT float _lsxGLMFract(float x) { return glm::fract(x); }
LSX_EXPORT float _lsxGLMMod(float x,float y) { return glm::mod(x,y); }
LSX_EXPORT float _lsxGLMSign(float x) { return glm::sign(x); }
LSX_EXPORT float _lsxGLMInverseSqrt(float x) { return glm::inversesqrt(x); }

LSX_EXPORT float _lsxGLMVec2Dot(const float* a,const float* b) { return glm::dot(v2(a),v2(b)); }
LSX_EXPORT float _lsxGLMVec2Length(const float* a) { return glm::length(v2(a)); }
LSX_EXPORT float _lsxGLMVec2Distance(const float* a,const float* b) { return glm::distance(v2(a),v2(b)); }
LSX_EXPORT void _lsxGLMVec2Normalize(const float* a,float* out) { s2(out,glm::normalize(v2(a))); }
LSX_EXPORT void _lsxGLMVec2Reflect(const float* i,const float* n,float* out) { s2(out,glm::reflect(v2(i),v2(n))); }
LSX_EXPORT void _lsxGLMVec2Refract(const float* i,const float* n,float eta,float* out) { s2(out,glm::refract(v2(i),v2(n),eta)); }
LSX_EXPORT void _lsxGLMVec2Faceforward(const float* n,const float* i,const float* nr,float* out) { s2(out,glm::faceforward(v2(n),v2(i),v2(nr))); }
LSX_EXPORT float _lsxGLMVec2Angle(const float* a,const float* b) { return glm::angle(glm::normalize(v2(a)),glm::normalize(v2(b))); }
LSX_EXPORT void _lsxGLMVec2Rotate(const float* a,float angle,float* out) { s2(out,glm::rotate(v2(a),angle)); }

LSX_EXPORT float _lsxGLMVec3Dot(const float* a,const float* b) { return glm::dot(v3(a),v3(b)); }
LSX_EXPORT float _lsxGLMVec3Length(const float* a) { return glm::length(v3(a)); }
LSX_EXPORT float _lsxGLMVec3Distance(const float* a,const float* b) { return glm::distance(v3(a),v3(b)); }
LSX_EXPORT void _lsxGLMVec3Cross(const float* a,const float* b,float* out) { s3(out,glm::cross(v3(a),v3(b))); }
LSX_EXPORT void _lsxGLMVec3Normalize(const float* a,float* out) { s3(out,glm::normalize(v3(a))); }
LSX_EXPORT void _lsxGLMVec3Reflect(const float* i,const float* n,float* out) { s3(out,glm::reflect(v3(i),v3(n))); }
LSX_EXPORT void _lsxGLMVec3Refract(const float* i,const float* n,float eta,float* out) { s3(out,glm::refract(v3(i),v3(n),eta)); }
LSX_EXPORT void _lsxGLMVec3Faceforward(const float* n,const float* i,const float* nr,float* out) { s3(out,glm::faceforward(v3(n),v3(i),v3(nr))); }
LSX_EXPORT float _lsxGLMVec3Angle(const float* a,const float* b) { return glm::angle(glm::normalize(v3(a)),glm::normalize(v3(b))); }
LSX_EXPORT void _lsxGLMVec3Rotate(const float* a,float angle,const float* axis,float* out) { s3(out,glm::rotate(v3(a),angle,v3(axis))); }
LSX_EXPORT void _lsxGLMVec3Orthonormalize(const float* x,const float* y,float* out) { s3(out,glm::normalize(v3(x)-glm::proj(v3(x),v3(y)))); }

LSX_EXPORT float _lsxGLMVec4Dot(const float* a,const float* b) { return glm::dot(v4(a),v4(b)); }
LSX_EXPORT float _lsxGLMVec4Length(const float* a) { return glm::length(v4(a)); }
LSX_EXPORT float _lsxGLMVec4Distance(const float* a,const float* b) { return glm::distance(v4(a),v4(b)); }
LSX_EXPORT void _lsxGLMVec4Normalize(const float* a,float* out) { s4(out,glm::normalize(v4(a))); }
LSX_EXPORT void _lsxGLMVec4Reflect(const float* i,const float* n,float* out) { s4(out,glm::reflect(v4(i),v4(n))); }
LSX_EXPORT void _lsxGLMVec4Refract(const float* i,const float* n,float eta,float* out) { s4(out,glm::refract(v4(i),v4(n),eta)); }
LSX_EXPORT void _lsxGLMVec4Faceforward(const float* n,const float* i,const float* nr,float* out) { s4(out,glm::faceforward(v4(n),v4(i),v4(nr))); }

LSX_EXPORT void _lsxGLMMat2Identity(float* out) { sm2(out,mat2(1.0f)); }
LSX_EXPORT void _lsxGLMMat2Zero(float* out) { sm2(out,mat2(0.0f)); }
LSX_EXPORT void _lsxGLMMat2Add(const float* a,const float* b,float* out) { sm2(out,m2(a)+m2(b)); }
LSX_EXPORT void _lsxGLMMat2Sub(const float* a,const float* b,float* out) { sm2(out,m2(a)-m2(b)); }
LSX_EXPORT void _lsxGLMMat2Mul(const float* a,const float* b,float* out) { sm2(out,m2(a)*m2(b)); }
LSX_EXPORT void _lsxGLMMat2MulScalar(const float* a,float s,float* out) { sm2(out,m2(a)*s); }
LSX_EXPORT void _lsxGLMMat2Transpose(const float* a,float* out) { sm2(out,glm::transpose(m2(a))); }
LSX_EXPORT void _lsxGLMMat2Inverse(const float* a,float* out) { sm2(out,glm::inverse(m2(a))); }
LSX_EXPORT float _lsxGLMMat2Determinant(const float* a) { return glm::determinant(m2(a)); }
LSX_EXPORT void _lsxGLMMat2Transform(const float* a,const float* v,float* out) { s2(out,m2(a)*v2(v)); }

LSX_EXPORT void _lsxGLMMat3Identity(float* out) { sm3(out,mat3(1.0f)); }
LSX_EXPORT void _lsxGLMMat3Zero(float* out) { sm3(out,mat3(0.0f)); }
LSX_EXPORT void _lsxGLMMat3Add(const float* a,const float* b,float* out) { sm3(out,m3(a)+m3(b)); }
LSX_EXPORT void _lsxGLMMat3Sub(const float* a,const float* b,float* out) { sm3(out,m3(a)-m3(b)); }
LSX_EXPORT void _lsxGLMMat3Mul(const float* a,const float* b,float* out) { sm3(out,m3(a)*m3(b)); }
LSX_EXPORT void _lsxGLMMat3MulScalar(const float* a,float s,float* out) { sm3(out,m3(a)*s); }
LSX_EXPORT void _lsxGLMMat3Transpose(const float* a,float* out) { sm3(out,glm::transpose(m3(a))); }
LSX_EXPORT void _lsxGLMMat3Inverse(const float* a,float* out) { sm3(out,glm::inverse(m3(a))); }
LSX_EXPORT float _lsxGLMMat3Determinant(const float* a) { return glm::determinant(m3(a)); }
LSX_EXPORT void _lsxGLMMat3Transform(const float* a,const float* v,float* out) { s3(out,m3(a)*v3(v)); }
LSX_EXPORT void _lsxGLMMat3FromMat4(const float* a,float* out) { sm3(out,mat3(m4(a))); }
LSX_EXPORT void _lsxGLMMat3NormalFromMat4(const float* a,float* out) { sm3(out,glm::inverseTranspose(mat3(m4(a)))); }

LSX_EXPORT void _lsxGLMMat4Identity(float* out) { sm4(out,mat4(1.0f)); }
LSX_EXPORT void _lsxGLMMat4Zero(float* out) { sm4(out,mat4(0.0f)); }
LSX_EXPORT void _lsxGLMMat4Add(const float* a,const float* b,float* out) { sm4(out,m4(a)+m4(b)); }
LSX_EXPORT void _lsxGLMMat4Sub(const float* a,const float* b,float* out) { sm4(out,m4(a)-m4(b)); }
LSX_EXPORT void _lsxGLMMat4Mul(const float* a,const float* b,float* out) { sm4(out,m4(a)*m4(b)); }
LSX_EXPORT void _lsxGLMMat4MulScalar(const float* a,float s,float* out) { sm4(out,m4(a)*s); }
LSX_EXPORT void _lsxGLMMat4Transpose(const float* a,float* out) { sm4(out,glm::transpose(m4(a))); }
LSX_EXPORT void _lsxGLMMat4Inverse(const float* a,float* out) { sm4(out,glm::inverse(m4(a))); }
LSX_EXPORT void _lsxGLMMat4AffineInverse(const float* a,float* out) { sm4(out,glm::affineInverse(m4(a))); }
LSX_EXPORT float _lsxGLMMat4Determinant(const float* a) { return glm::determinant(m4(a)); }
LSX_EXPORT void _lsxGLMMat4TransformVec4(const float* a,const float* v,float* out) { s4(out,m4(a)*v4(v)); }
LSX_EXPORT void _lsxGLMMat4TransformPoint(const float* a,const float* v,float* out) { vec4 r=m4(a)*vec4(v3(v),1.0f); s3(out,vec3(r)/r.w); }
LSX_EXPORT void _lsxGLMMat4TransformDirection(const float* a,const float* v,float* out) { s3(out,vec3(m4(a)*vec4(v3(v),0.0f))); }
LSX_EXPORT void _lsxGLMMat4FromMat3(const float* a,float* out) { sm4(out,mat4(m3(a))); }
LSX_EXPORT void _lsxGLMMat4Translate(const float* a,const float* v,float* out) { sm4(out,glm::translate(m4(a),v3(v))); }
LSX_EXPORT void _lsxGLMMat4Rotate(const float* a,float angle,const float* axis,float* out) { sm4(out,glm::rotate(m4(a),angle,v3(axis))); }
LSX_EXPORT void _lsxGLMMat4Scale(const float* a,const float* v,float* out) { sm4(out,glm::scale(m4(a),v3(v))); }
LSX_EXPORT void _lsxGLMMat4TRS(const float* translation,const float* rotation,const float* scale,float* out) {
    mat4 m=glm::translate(mat4(1.0f),v3(translation))*glm::mat4_cast(q4(rotation))*glm::scale(mat4(1.0f),v3(scale)); sm4(out,m);
}
LSX_EXPORT void _lsxGLMMat4TRSInverse(const float* translation,const float* rotation,const float* scale,float* out) {
    mat4 m=glm::translate(mat4(1.0f),v3(translation))*glm::mat4_cast(q4(rotation))*glm::scale(mat4(1.0f),v3(scale)); sm4(out,glm::inverse(m));
}
LSX_EXPORT void _lsxGLMMat4OrthoRHNO(float l,float r,float b,float t,float n,float f,float* out) { sm4(out,glm::orthoRH_NO(l,r,b,t,n,f)); }
LSX_EXPORT void _lsxGLMMat4OrthoRHZO(float l,float r,float b,float t,float n,float f,float* out) { sm4(out,glm::orthoRH_ZO(l,r,b,t,n,f)); }
LSX_EXPORT void _lsxGLMMat4OrthoLHNO(float l,float r,float b,float t,float n,float f,float* out) { sm4(out,glm::orthoLH_NO(l,r,b,t,n,f)); }
LSX_EXPORT void _lsxGLMMat4OrthoLHZO(float l,float r,float b,float t,float n,float f,float* out) { sm4(out,glm::orthoLH_ZO(l,r,b,t,n,f)); }
LSX_EXPORT void _lsxGLMMat4PerspectiveRHNO(float fovy,float aspect,float n,float f,float* out) { sm4(out,glm::perspectiveRH_NO(fovy,aspect,n,f)); }
LSX_EXPORT void _lsxGLMMat4PerspectiveRHZO(float fovy,float aspect,float n,float f,float* out) { sm4(out,glm::perspectiveRH_ZO(fovy,aspect,n,f)); }
LSX_EXPORT void _lsxGLMMat4PerspectiveLHNO(float fovy,float aspect,float n,float f,float* out) { sm4(out,glm::perspectiveLH_NO(fovy,aspect,n,f)); }
LSX_EXPORT void _lsxGLMMat4PerspectiveLHZO(float fovy,float aspect,float n,float f,float* out) { sm4(out,glm::perspectiveLH_ZO(fovy,aspect,n,f)); }
LSX_EXPORT void _lsxGLMMat4InfinitePerspectiveRH(float fovy,float aspect,float n,float* out) { sm4(out,glm::infinitePerspectiveRH(fovy,aspect,n)); }
LSX_EXPORT void _lsxGLMMat4InfinitePerspectiveLH(float fovy,float aspect,float n,float* out) { sm4(out,glm::infinitePerspectiveLH(fovy,aspect,n)); }
LSX_EXPORT void _lsxGLMMat4LookAtRH(const float* eye,const float* center,const float* up,float* out) { sm4(out,glm::lookAtRH(v3(eye),v3(center),v3(up))); }
LSX_EXPORT void _lsxGLMMat4LookAtLH(const float* eye,const float* center,const float* up,float* out) { sm4(out,glm::lookAtLH(v3(eye),v3(center),v3(up))); }
LSX_EXPORT void _lsxGLMMat4ProjectNO(const float* obj,const float* model,const float* proj,const float* viewport,float* out) { s3(out,glm::projectNO(v3(obj),m4(model),m4(proj),v4(viewport))); }
LSX_EXPORT void _lsxGLMMat4ProjectZO(const float* obj,const float* model,const float* proj,const float* viewport,float* out) { s3(out,glm::projectZO(v3(obj),m4(model),m4(proj),v4(viewport))); }
LSX_EXPORT void _lsxGLMMat4UnProjectNO(const float* win,const float* model,const float* proj,const float* viewport,float* out) { s3(out,glm::unProjectNO(v3(win),m4(model),m4(proj),v4(viewport))); }
LSX_EXPORT void _lsxGLMMat4UnProjectZO(const float* win,const float* model,const float* proj,const float* viewport,float* out) { s3(out,glm::unProjectZO(v3(win),m4(model),m4(proj),v4(viewport))); }
LSX_EXPORT void _lsxGLMMat4PickMatrix(const float* center,const float* delta,const float* viewport,float* out) { sm4(out,glm::pickMatrix(v2(center),v2(delta),v4(viewport))); }
LSX_EXPORT void _lsxGLMMat4Interpolate(const float* a,const float* b,float t,float* out) { sm4(out,glm::interpolate(m4(a),m4(b),t)); }
LSX_EXPORT int _lsxGLMMat4Decompose(const float* input,float* scale,float* rotation,float* translation,float* skew,float* perspective) {
    vec3 s(1.0f),tr(0.0f),sk(0.0f); vec4 p(0.0f); quat r(1.0f,0.0f,0.0f,0.0f);
    bool ok=glm::decompose(m4(input),s,r,tr,sk,p); if(ok){s3(scale,s);sq(rotation,r);s3(translation,tr);s3(skew,sk);s4(perspective,p);} return ok?1:0;
}

LSX_EXPORT void _lsxGLMQuatIdentity(float* out) { sq(out,quat(1.0f,0.0f,0.0f,0.0f)); }
LSX_EXPORT void _lsxGLMQuatFromComponents(float x,float y,float z,float w,float* out) { sq(out,quat(w,x,y,z)); }
LSX_EXPORT void _lsxGLMQuatAngleAxis(float angle,const float* axis,float* out) { sq(out,glm::angleAxis(angle,glm::normalize(v3(axis)))); }
LSX_EXPORT void _lsxGLMQuatFromEuler(const float* euler,float* out) { sq(out,quat(v3(euler))); }
LSX_EXPORT void _lsxGLMQuatFromTwoVectors(const float* from,const float* to,float* out) { sq(out,glm::rotation(v3(from),v3(to))); }
LSX_EXPORT void _lsxGLMQuatLookAtRH(const float* direction,const float* up,float* out) { sq(out,glm::quatLookAtRH(glm::normalize(v3(direction)),glm::normalize(v3(up)))); }
LSX_EXPORT void _lsxGLMQuatLookAtLH(const float* direction,const float* up,float* out) { sq(out,glm::quatLookAtLH(glm::normalize(v3(direction)),glm::normalize(v3(up)))); }
LSX_EXPORT void _lsxGLMQuatConjugate(const float* q,float* out) { sq(out,glm::conjugate(q4(q))); }
LSX_EXPORT void _lsxGLMQuatInverse(const float* q,float* out) { sq(out,glm::inverse(q4(q))); }
LSX_EXPORT void _lsxGLMQuatNormalize(const float* q,float* out) { sq(out,glm::normalize(q4(q))); }
LSX_EXPORT void _lsxGLMQuatAdd(const float* a,const float* b,float* out) { sq(out,q4(a)+q4(b)); }
LSX_EXPORT void _lsxGLMQuatSub(const float* a,const float* b,float* out) { sq(out,q4(a)-q4(b)); }
LSX_EXPORT void _lsxGLMQuatMul(const float* a,const float* b,float* out) { sq(out,q4(a)*q4(b)); }
LSX_EXPORT void _lsxGLMQuatMulScalar(const float* a,float s,float* out) { sq(out,q4(a)*s); }
LSX_EXPORT float _lsxGLMQuatDot(const float* a,const float* b) { return glm::dot(q4(a),q4(b)); }
LSX_EXPORT float _lsxGLMQuatLength(const float* a) { return glm::length(q4(a)); }
LSX_EXPORT void _lsxGLMQuatLerp(const float* a,const float* b,float t,float* out) { sq(out,glm::lerp(q4(a),q4(b),t)); }
LSX_EXPORT void _lsxGLMQuatMix(const float* a,const float* b,float t,float* out) { sq(out,glm::mix(q4(a),q4(b),t)); }
LSX_EXPORT void _lsxGLMQuatSlerp(const float* a,const float* b,float t,float* out) { sq(out,glm::slerp(q4(a),q4(b),t)); }
LSX_EXPORT void _lsxGLMQuatRotateVec3(const float* q,const float* v,float* out) { s3(out,q4(q)*v3(v)); }
LSX_EXPORT void _lsxGLMQuatRotateVec4(const float* q,const float* v,float* out) { s4(out,q4(q)*v4(v)); }
LSX_EXPORT void _lsxGLMQuatToMat3(const float* q,float* out) { sm3(out,glm::mat3_cast(q4(q))); }
LSX_EXPORT void _lsxGLMQuatToMat4(const float* q,float* out) { sm4(out,glm::mat4_cast(q4(q))); }
LSX_EXPORT void _lsxGLMQuatFromMat3(const float* m,float* out) { sq(out,glm::quat_cast(m3(m))); }
LSX_EXPORT void _lsxGLMQuatFromMat4(const float* m,float* out) { sq(out,glm::quat_cast(m4(m))); }
LSX_EXPORT void _lsxGLMQuatEulerAngles(const float* q,float* out) { s3(out,glm::eulerAngles(q4(q))); }
LSX_EXPORT float _lsxGLMQuatPitch(const float* q) { return glm::pitch(q4(q)); }
LSX_EXPORT float _lsxGLMQuatYaw(const float* q) { return glm::yaw(q4(q)); }
LSX_EXPORT float _lsxGLMQuatRoll(const float* q) { return glm::roll(q4(q)); }
LSX_EXPORT float _lsxGLMQuatAngle(const float* q) { return glm::angle(q4(q)); }
LSX_EXPORT void _lsxGLMQuatAxis(const float* q,float* out) { s3(out,glm::axis(q4(q))); }

LSX_EXPORT void _lsxGLMDualQuatIdentity(float* out) { sdq(out,dualquat(quat(1.0f,0.0f,0.0f,0.0f),quat(0.0f,0.0f,0.0f,0.0f))); }
LSX_EXPORT void _lsxGLMDualQuatFromRotationTranslation(const float* rotation,const float* translation,float* out) { sdq(out,dualquat(q4(rotation),v3(translation))); }
LSX_EXPORT void _lsxGLMDualQuatNormalize(const float* a,float* out) { sdq(out,glm::normalize(dq8(a))); }
LSX_EXPORT void _lsxGLMDualQuatInverse(const float* a,float* out) { sdq(out,glm::inverse(dq8(a))); }
LSX_EXPORT void _lsxGLMDualQuatMul(const float* a,const float* b,float* out) { sdq(out,dq8(a)*dq8(b)); }
LSX_EXPORT void _lsxGLMDualQuatLerp(const float* a,const float* b,float t,float* out) { sdq(out,glm::lerp(dq8(a),dq8(b),t)); }
LSX_EXPORT void _lsxGLMDualQuatTransformPoint(const float* q,const float* p,float* out) { s3(out,dq8(q)*v3(p)); }
LSX_EXPORT void _lsxGLMDualQuatToMat4(const float* q,float* out) {
    dualquat d=glm::normalize(dq8(q));
    quat tq=d.dual*glm::conjugate(d.real);
    vec3 translation=2.0f*vec3(tq.x,tq.y,tq.z);
    sm4(out,glm::translate(mat4(1.0f),translation)*glm::mat4_cast(d.real));
}
