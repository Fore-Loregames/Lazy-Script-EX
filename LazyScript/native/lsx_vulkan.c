#include <stdint.h>
#include "vulkan/vulkan_min.h"

#define LSVK_DRAW_UNIFORM_LIMIT 4096
#define LSVK_RESOURCE_SET_LIMIT 512
#define LSVK_RESOURCE_CACHE_SOFT_LIMIT 128
#define LSVK_RESOURCE_HASH_TABLE_SIZE 1024
#define VK_MAKE_VERSION(major, minor, patch) ((((uint32_t)(major)) << 22) | (((uint32_t)(minor)) << 12) | ((uint32_t)(patch)))
#define VK_API_VERSION_1_1 VK_MAKE_VERSION(1,1,0)
#define VK_SUBPASS_EXTERNAL (~0U)
int _fltused = 0;

#if defined(_WIN32)
#define LSX_EXPORT __declspec(dllexport)
#define LSX_CALL __cdecl
#define WINCALL __stdcall
#else
#define LSX_EXPORT
#define LSX_CALL
#define WINCALL
#endif

typedef void* HMODULE_LSX;
typedef void* HANDLE_LSX;
typedef unsigned long DWORD_LSX;
typedef size_t SIZE_T_LSX;
#define HEAP_ZERO_MEMORY 0x00000008UL
__declspec(dllimport) HMODULE_LSX WINCALL LoadLibraryA(const char* name);
__declspec(dllimport) void* WINCALL GetProcAddress(HMODULE_LSX module, const char* name);
__declspec(dllimport) int WINCALL FreeLibrary(HMODULE_LSX module);
__declspec(dllimport) HANDLE_LSX WINCALL GetProcessHeap(void);
__declspec(dllimport) void* WINCALL HeapAlloc(HANDLE_LSX heap, DWORD_LSX flags, SIZE_T_LSX bytes);
__declspec(dllimport) int WINCALL HeapFree(HANDLE_LSX heap, DWORD_LSX flags, void* memory);
__declspec(dllimport) HANDLE_LSX WINCALL CreateFileA(const char* name, DWORD_LSX access, DWORD_LSX share, void* security, DWORD_LSX creation, DWORD_LSX flags, HANDLE_LSX template_file);
__declspec(dllimport) int WINCALL WriteFile(HANDLE_LSX file, const void* buffer, DWORD_LSX bytes, DWORD_LSX* written, void* overlapped);
__declspec(dllimport) int WINCALL FlushFileBuffers(HANDLE_LSX file);
__declspec(dllimport) int WINCALL CloseHandle(HANDLE_LSX handle);
#define GENERIC_WRITE_LSX 0x40000000UL
#define FILE_SHARE_READ_LSX 0x00000001UL
#define CREATE_ALWAYS_LSX 2UL
#define FILE_ATTRIBUTE_NORMAL_LSX 0x00000080UL
#define INVALID_HANDLE_VALUE_LSX ((HANDLE_LSX)(intptr_t)-1)

static void* ls_alloc(size_t size) { return HeapAlloc(GetProcessHeap(), HEAP_ZERO_MEMORY, size); }
static void ls_free(void* value) { if (value) HeapFree(GetProcessHeap(), 0, value); }
static void ls_zero(void* value, size_t size) { unsigned char* p=(unsigned char*)value; while(size--) *p++=0; }
static void ls_copy_bytes(void* destination,const void* source,size_t size){unsigned char* d=(unsigned char*)destination;const unsigned char* s=(const unsigned char*)source;while(size--)*d++=*s++;}
static int ls_bytes_equal(const void* left,const void* right,size_t size){const unsigned char* a=(const unsigned char*)left;const unsigned char* b=(const unsigned char*)right;while(size--){if(*a++!=*b++)return 0;}return 1;}
static uint64_t ls_hash_bytes(const void* value,size_t size){const unsigned char* p=(const unsigned char*)value;uint64_t hash=1469598103934665603ULL;while(size--){hash^=(uint64_t)(*p++);hash*=1099511628211ULL;}return hash?hash:1ULL;}
static int ls_equal(const char* a,const char* b){ if(!a||!b)return 0; while(*a&&*b&&*a==*b){a++;b++;} return *a==*b; }
static void ls_copy(char* out,size_t cap,const char* text){ size_t i=0;if(!out||cap==0)return;if(!text)text="";while(text[i]&&i+1<cap){out[i]=text[i];i++;}out[i]=0; }
static void ls_copy_result(char* out,size_t cap,const char* prefix,int value){
    char digits[24]; size_t count=0, len=0; unsigned int n;
    while(prefix[len]&&len+1<cap){out[len]=prefix[len];len++;}
    if(value<0){if(len+1<cap)out[len++]='-';n=(unsigned int)(-value);}else n=(unsigned int)value;
    while(n&&count<sizeof(digits)){digits[count++]=(char)('0'+n%10);n/=10;}
    if(count==0)digits[count++]='0';
    while(count&&len+1<cap)out[len++]=digits[--count];
    out[len]=0;
}

typedef struct GLFWwindow GLFWwindow;
typedef int (*PFN_glfwVulkanSupported)(void);
typedef const char** (*PFN_glfwGetRequiredInstanceExtensions)(uint32_t* count);
typedef int (*PFN_glfwCreateWindowSurface)(VkInstance instance, GLFWwindow* window, const VkAllocationCallbacks* allocator, VkSurfaceKHR* surface);

typedef struct LSVKMesh {
    struct LSVKMesh* next;
    VkBuffer vertex_buffer;
    VkDeviceMemory vertex_memory;
    void* vertex_mapped;
    VkBuffer index_buffer;
    VkDeviceMemory index_memory;
    void* cpu_vertices;
    uint32_t* cpu_indices;
    uint32_t vertex_count;
    uint32_t index_count;
    uint32_t count;
    uint32_t stride;
    uint32_t vertex_bytes;
    uint32_t position_offset;
    int indexed;
    int ray_compatible;
    int ray_visible;
    float ray_transform[16];
    float ray_albedo[4];
    float ray_roughness;
    float ray_metallic;
    float ray_emissive;
    char error[512];
} LSVKMesh;

typedef struct LSVKTexture {
    VkImage image;
    VkDeviceMemory memory;
    VkImageView view;
    VkSampler sampler;
    uint32_t width;
    uint32_t height;
    char error[512];
} LSVKTexture;

typedef struct LSVKStorage {
    VkBuffer buffers[2];
    VkDeviceMemory memories[2];
    void* mapped[2];
    uint32_t bytes;
    uint32_t binding;
    char error[512];
} LSVKStorage;

typedef struct LSVKFramebuffer {
    VkImage color_image;
    VkDeviceMemory color_memory;
    VkImageView color_view;
    VkImage depth_image;
    VkDeviceMemory depth_memory;
    VkImageView depth_view;
    VkRenderPass render_pass;
    VkFramebuffer framebuffer;
    uint32_t width;
    uint32_t height;
    char error[512];
} LSVKFramebuffer;

typedef struct LSVKShader {
    struct LSVKShader* next;
    VkPipeline pipeline;
    VkPipelineLayout compute_layout;
    VkDescriptorSetLayout compute_descriptor_layout;
    VkDescriptorPool compute_descriptor_pool;
    VkDescriptorSet compute_descriptor_set;
    uint32_t* vertex_words;
    uint32_t vertex_count;
    uint32_t* fragment_words;
    uint32_t fragment_count;
    uint32_t* compute_words;
    uint32_t compute_count;
    uint64_t vertex_layout;
    uint32_t pipeline_flags;
    uint32_t ray_flags;
    int32_t model_offset;
    int is_compute;
    char error[1024];
} LSVKShader;

typedef struct LSVKContext {
    HMODULE_LSX vulkan_module;
    HMODULE_LSX glfw_module;
    GLFWwindow* window;
    VkInstance instance;
    VkSurfaceKHR surface;
    VkPhysicalDevice physical_device;
    VkDevice device;
    VkQueue graphics_queue;
    VkQueue present_queue;
    uint32_t graphics_family;
    uint32_t present_family;
    VkSwapchainKHR swapchain;
    VkFormat swapchain_format;
    VkExtent2D extent;
    VkImage* images;
    VkImageView* image_views;
    VkFramebuffer* framebuffers;
    VkImage* depth_images;
    VkDeviceMemory* depth_memories;
    VkImageView* depth_views;
    VkFence* images_in_flight;
    uint32_t image_count;
    VkRenderPass render_pass;
    VkDescriptorSetLayout descriptor_layout;
    VkDescriptorPool descriptor_pool;
    VkDescriptorSet resource_descriptor_sets[2][LSVK_RESOURCE_SET_LIMIT];
    uint32_t resource_descriptor_count[2];
    LSVKTexture* resource_texture_keys[2][LSVK_RESOURCE_SET_LIMIT][8];
    LSVKStorage* resource_storage_keys[2][LSVK_RESOURCE_SET_LIMIT][8];
    uint64_t resource_hashes[2][LSVK_RESOURCE_SET_LIMIT];
    uint16_t resource_hash_slots[2][LSVK_RESOURCE_HASH_TABLE_SIZE];
    VkDescriptorSetLayout uniform_descriptor_layout;
    VkDescriptorPool uniform_descriptor_pool;
    /* One dynamic-uniform descriptor per frame replaces 8192 static descriptor
       sets. Per-draw state is selected with a dynamic offset into the persistently
       mapped frame ring, eliminating startup descriptor churn and O(n) uniform
       cache scans from every draw. */
    VkDescriptorSet uniform_descriptor_sets[2];
    uint32_t uniform_cursor[2];
    int32_t uniform_last_slot[2];
    uint64_t uniform_last_version[2];
    uint64_t uniform_version;
    uint32_t uniform_copy_bytes;
    VkBuffer uniform_buffers[2];
    VkDeviceMemory uniform_memories[2];
    void* uniform_mapped[2];
    VkDeviceSize uniform_stride;
    unsigned char uniform_shadow[1024];
    LSVKTexture* bound_textures[8];
    LSVKStorage* bound_storage[8];
    uint64_t resource_binding_version;
    uint64_t resource_cached_version[2];
    VkDescriptorSet resource_cached_set[2];
    /* Vulkan descriptors may not contain garbage handles. These tiny fallback
       resources keep every declared texture/storage binding valid even when a
       beginner shader only uses one of the sixteen shared slots. */
    LSVKTexture* fallback_texture;
    LSVKStorage* fallback_storage;
    VkPipelineLayout pipeline_layout;
    VkCommandPool command_pool;
    VkCommandBuffer command_buffers[2];
    VkCommandBuffer upload_command;
    VkPipeline recording_pipeline;
    VkDescriptorSet recording_resource_set;
    VkDescriptorSet recording_uniform_set;
    uint32_t recording_uniform_offset;
    VkSemaphore image_available[2];
    VkSemaphore render_finished[2];
    VkFence in_flight[2];
    uint32_t frame;
    uint32_t image_index;
    int frame_open;
    int frame_render_pass_open;
    int needs_resize;
    int vsync_enabled;
    VkPresentModeKHR present_mode;
    int ray_query;
    int ray_pipeline;
    char device_name[256];
    char error[2048];
    LSVKShader* bound_shader;
    LSVKShader* shaders;
    LSVKMesh* meshes;
    LSVKStorage* ray_scene_storage;
    void* ray_scene_cpu;
    uint32_t ray_scene_bytes;
    uint32_t ray_scene_capacity;
    uint32_t ray_triangle_count;
    uint64_t ray_scene_version;
    uint64_t ray_scene_uploaded[2];
    int ray_scene_dirty;
    /* Dynamic ray scenes keep their transformed triangles and BVH topology in
       persistent scratch memory. Transform/material edits refit the existing
       tree instead of allocating and sorting the entire scene every frame. */
    void* ray_triangle_scratch;
    void* ray_bvh_scratch;
    uint32_t* ray_index_scratch;
    uint32_t* ray_order_scratch;
    uint32_t ray_scratch_capacity;
    uint32_t ray_bvh_node_count;
    int ray_topology_dirty;
    float ray_sun_direction[3];
    float ray_sun_color[3];
    float ray_sun_intensity;
    float ray_ambient;
    float ray_point_position[8][3];
    float ray_point_color[8][3];
    float ray_point_intensity[8];
    float ray_point_range[8];
    uint32_t ray_point_count;
    HANDLE_LSX trace_file;
    uint32_t trace_sequence;
    uint32_t trace_present_count;
    uint32_t trace_draw_count;
    int trace_enabled;

    PFN_vkGetInstanceProcAddr vkGetInstanceProcAddr;
    PFN_vkCreateInstance vkCreateInstance;
    PFN_vkGetDeviceProcAddr vkGetDeviceProcAddr;
    PFN_vkDestroyInstance vkDestroyInstance;
    PFN_vkEnumeratePhysicalDevices vkEnumeratePhysicalDevices;
    PFN_vkGetPhysicalDeviceProperties vkGetPhysicalDeviceProperties;
    PFN_vkGetPhysicalDeviceQueueFamilyProperties vkGetPhysicalDeviceQueueFamilyProperties;
    PFN_vkGetPhysicalDeviceMemoryProperties vkGetPhysicalDeviceMemoryProperties;
    PFN_vkEnumerateDeviceExtensionProperties vkEnumerateDeviceExtensionProperties;
    PFN_vkGetPhysicalDeviceSurfaceSupportKHR vkGetPhysicalDeviceSurfaceSupportKHR;
    PFN_vkGetPhysicalDeviceSurfaceCapabilitiesKHR vkGetPhysicalDeviceSurfaceCapabilitiesKHR;
    PFN_vkGetPhysicalDeviceSurfaceFormatsKHR vkGetPhysicalDeviceSurfaceFormatsKHR;
    PFN_vkGetPhysicalDeviceSurfacePresentModesKHR vkGetPhysicalDeviceSurfacePresentModesKHR;
    PFN_vkCreateDevice vkCreateDevice;
    PFN_vkDestroySurfaceKHR vkDestroySurfaceKHR;
    PFN_vkDestroyDevice vkDestroyDevice;
    PFN_vkGetDeviceQueue vkGetDeviceQueue;
    PFN_vkCreateBuffer vkCreateBuffer;
    PFN_vkDestroyBuffer vkDestroyBuffer;
    PFN_vkGetBufferMemoryRequirements vkGetBufferMemoryRequirements;
    PFN_vkCreateImage vkCreateImage;
    PFN_vkDestroyImage vkDestroyImage;
    PFN_vkGetImageMemoryRequirements vkGetImageMemoryRequirements;
    PFN_vkBindImageMemory vkBindImageMemory;
    PFN_vkCreateSampler vkCreateSampler;
    PFN_vkDestroySampler vkDestroySampler;
    PFN_vkCreateDescriptorSetLayout vkCreateDescriptorSetLayout;
    PFN_vkDestroyDescriptorSetLayout vkDestroyDescriptorSetLayout;
    PFN_vkCreateDescriptorPool vkCreateDescriptorPool;
    PFN_vkDestroyDescriptorPool vkDestroyDescriptorPool;
    PFN_vkAllocateDescriptorSets vkAllocateDescriptorSets;
    PFN_vkUpdateDescriptorSets vkUpdateDescriptorSets;
    PFN_vkAllocateMemory vkAllocateMemory;
    PFN_vkFreeMemory vkFreeMemory;
    PFN_vkBindBufferMemory vkBindBufferMemory;
    PFN_vkMapMemory vkMapMemory;
    PFN_vkUnmapMemory vkUnmapMemory;
    PFN_vkCreateSwapchainKHR vkCreateSwapchainKHR;
    PFN_vkDestroySwapchainKHR vkDestroySwapchainKHR;
    PFN_vkGetSwapchainImagesKHR vkGetSwapchainImagesKHR;
    PFN_vkCreateImageView vkCreateImageView;
    PFN_vkDestroyImageView vkDestroyImageView;
    PFN_vkCreateRenderPass vkCreateRenderPass;
    PFN_vkDestroyRenderPass vkDestroyRenderPass;
    PFN_vkCreateFramebuffer vkCreateFramebuffer;
    PFN_vkDestroyFramebuffer vkDestroyFramebuffer;
    PFN_vkCreatePipelineLayout vkCreatePipelineLayout;
    PFN_vkDestroyPipelineLayout vkDestroyPipelineLayout;
    PFN_vkCreateShaderModule vkCreateShaderModule;
    PFN_vkDestroyShaderModule vkDestroyShaderModule;
    PFN_vkCreateGraphicsPipelines vkCreateGraphicsPipelines;
    PFN_vkCreateComputePipelines vkCreateComputePipelines;
    PFN_vkDestroyPipeline vkDestroyPipeline;
    PFN_vkCreateCommandPool vkCreateCommandPool;
    PFN_vkDestroyCommandPool vkDestroyCommandPool;
    PFN_vkAllocateCommandBuffers vkAllocateCommandBuffers;
    PFN_vkResetCommandBuffer vkResetCommandBuffer;
    PFN_vkBeginCommandBuffer vkBeginCommandBuffer;
    PFN_vkEndCommandBuffer vkEndCommandBuffer;
    PFN_vkCmdBeginRenderPass vkCmdBeginRenderPass;
    PFN_vkCmdEndRenderPass vkCmdEndRenderPass;
    PFN_vkCmdSetViewport vkCmdSetViewport;
    PFN_vkCmdSetScissor vkCmdSetScissor;
    PFN_vkCmdBindPipeline vkCmdBindPipeline;
    PFN_vkCmdBindVertexBuffers vkCmdBindVertexBuffers;
    PFN_vkCmdBindIndexBuffer vkCmdBindIndexBuffer;
    PFN_vkCmdDraw vkCmdDraw;
    PFN_vkCmdDrawIndexed vkCmdDrawIndexed;
    PFN_vkCmdDispatch vkCmdDispatch;
    PFN_vkCmdPipelineBarrier vkCmdPipelineBarrier;
    PFN_vkCmdCopyBufferToImage vkCmdCopyBufferToImage;
    PFN_vkCmdBlitImage vkCmdBlitImage;
    PFN_vkCmdBindDescriptorSets vkCmdBindDescriptorSets;
    PFN_vkCreateSemaphore vkCreateSemaphore;
    PFN_vkDestroySemaphore vkDestroySemaphore;
    PFN_vkCreateFence vkCreateFence;
    PFN_vkDestroyFence vkDestroyFence;
    PFN_vkWaitForFences vkWaitForFences;
    PFN_vkResetFences vkResetFences;
    PFN_vkAcquireNextImageKHR vkAcquireNextImageKHR;
    PFN_vkQueueSubmit vkQueueSubmit;
    PFN_vkQueuePresentKHR vkQueuePresentKHR;
    PFN_vkQueueWaitIdle vkQueueWaitIdle;
    PFN_vkDeviceWaitIdle vkDeviceWaitIdle;
} LSVKContext;

static void lsx_set_bound_texture(LSVKContext* c,uint32_t unit,LSVKTexture* texture){if(!c||unit>=8)return;if(c->bound_textures[unit]==texture)return;c->bound_textures[unit]=texture;c->resource_binding_version++;}
static void lsx_set_bound_storage(LSVKContext* c,uint32_t binding,LSVKStorage* storage){if(!c||binding>=8)return;if(c->bound_storage[binding]==storage)return;c->bound_storage[binding]=storage;c->resource_binding_version++;}
static void lsx_reset_resource_cache_frame(LSVKContext* c,uint32_t frame){if(!c||frame>=2)return;c->resource_descriptor_count[frame]=0;c->resource_cached_version[frame]=0;c->resource_cached_set[frame]=0;ls_zero(c->resource_texture_keys[frame],sizeof(c->resource_texture_keys[frame]));ls_zero(c->resource_storage_keys[frame],sizeof(c->resource_storage_keys[frame]));ls_zero(c->resource_hashes[frame],sizeof(c->resource_hashes[frame]));ls_zero(c->resource_hash_slots[frame],sizeof(c->resource_hash_slots[frame]));}
static void lsx_reset_resource_cache(LSVKContext* c){if(!c)return;lsx_reset_resource_cache_frame(c,0);lsx_reset_resource_cache_frame(c,1);c->recording_resource_set=0;}

static void lsx_identity_matrix(float* out){
    if(!out)return;for(int i=0;i<16;++i)out[i]=0.0f;out[0]=1.0f;out[5]=1.0f;out[10]=1.0f;out[15]=1.0f;
}
static int lsx_float_bytes_equal(const float* a,const float* b,uint32_t count){
    if(!a||!b)return 0;for(uint32_t i=0;i<count;++i)if(a[i]!=b[i])return 0;return 1;
}
static void lsx_transform_point(const float* matrix,const float* point,float* out){
    float x=point[0],y=point[1],z=point[2];
    out[0]=matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12];
    out[1]=matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13];
    out[2]=matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14];
}
static uint32_t lsx_ray_mesh_triangle_count(const LSVKMesh* mesh){
    if(!mesh||!mesh->ray_visible||!mesh->ray_compatible)return 0;
    return mesh->indexed?mesh->index_count/3U:mesh->vertex_count/3U;
}
static int lsx_ray_ensure_scene(LSVKContext* c);


static size_t lsx_append_text(char* out,size_t cap,size_t at,const char* text){
    if(!out||cap==0)return at;if(!text)text="";while(*text&&at+1<cap)out[at++]=*text++;out[at]=0;return at;
}
static size_t lsx_append_u32(char* out,size_t cap,size_t at,uint32_t value){
    char digits[16];size_t count=0;if(value==0)digits[count++]='0';else while(value&&count<sizeof(digits)){digits[count++]=(char)('0'+(value%10));value/=10;}while(count&&at+1<cap)out[at++]=digits[--count];if(cap)out[at<cap?at:cap-1]=0;return at;
}
static void lsx_trace_close(LSVKContext* c){
    if(!c)return;if(c->trace_file&&c->trace_file!=INVALID_HANDLE_VALUE_LSX){FlushFileBuffers(c->trace_file);CloseHandle(c->trace_file);}c->trace_file=0;c->trace_enabled=0;
}
static void lsx_trace_line(LSVKContext* c,const char* marker){
    if(!c||!c->trace_enabled||!c->trace_file||c->trace_file==INVALID_HANDLE_VALUE_LSX)return;
    /* Three complete retained-mode frames are enough to catch the common
       display-then-crash transition without generating an enormous log for
       the 500-row stress example. Explicit error markers are still recorded. */
    if(c->trace_present_count>=3 && (!marker || marker[0]!='E'))return;
    char line[512];size_t at=0;line[0]=0;
    at=lsx_append_text(line,sizeof(line),at,"seq=");at=lsx_append_u32(line,sizeof(line),at,++c->trace_sequence);
    at=lsx_append_text(line,sizeof(line),at," frame=");at=lsx_append_u32(line,sizeof(line),at,c->trace_present_count);
    at=lsx_append_text(line,sizeof(line),at," slot=");at=lsx_append_u32(line,sizeof(line),at,c->frame);
    at=lsx_append_text(line,sizeof(line),at," image=");at=lsx_append_u32(line,sizeof(line),at,c->image_index);
    at=lsx_append_text(line,sizeof(line),at," draw=");at=lsx_append_u32(line,sizeof(line),at,c->trace_draw_count);
    at=lsx_append_text(line,sizeof(line),at," stage=");at=lsx_append_text(line,sizeof(line),at,marker?marker:"(null)");
    at=lsx_append_text(line,sizeof(line),at,"\r\n");
    DWORD_LSX written=0;WriteFile(c->trace_file,line,(DWORD_LSX)at,&written,0);
    /* Preserve the last dangerous GPU boundary without forcing a physical disk
       flush for every retained UI draw. Per-draw FlushFileBuffers calls reduced
       complex Vulkan pages to only a few frames per second. */
    if(marker&&(ls_equal(marker,"present.queue_submit")||ls_equal(marker,"present.returned")||ls_equal(marker,"ERROR.native")))FlushFileBuffers(c->trace_file);
}

static void lsx_bind_pipeline_if_needed(LSVKContext* c,VkPipeline pipeline);
static int lsx_bind_draw_resources(LSVKContext* c);
LSX_EXPORT void* LSX_CALL _lsxVKCreateTexture(void* context,int width,int height,const void* pixels,int bytes,int linear);
LSX_EXPORT void LSX_CALL _lsxVKDestroyTexture(void* context,void* value);
LSX_EXPORT void* LSX_CALL _lsxVKCreateStorage(void* context,const void* data,int bytes,int binding);
LSX_EXPORT void LSX_CALL _lsxVKDestroyStorage(void* context,void* value);

static void set_error(LSVKContext* c, const char* text) {
    if (!c) return;
    ls_copy(c->error, sizeof(c->error), text ? text : "Unknown Vulkan error");
    lsx_trace_line(c, "ERROR.native");
}

static int extension_present(VkExtensionProperties* props, uint32_t count, const char* name) {
    uint32_t i;
    for (i = 0; i < count; ++i) if (ls_equal(props[i].extensionName, name)) return 1;
    return 0;
}

#define LOAD_GLOBAL(ctx, name) do { \
    (ctx)->name = (PFN_##name)(ctx)->vkGetInstanceProcAddr(0, #name); \
    if (!(ctx)->name) { set_error((ctx), "Vulkan loader is missing " #name "."); return 0; } \
} while (0)
#define LOAD_INSTANCE(ctx, name) do { \
    (ctx)->name = (PFN_##name)(ctx)->vkGetInstanceProcAddr((ctx)->instance, #name); \
    if (!(ctx)->name) { set_error((ctx), "Vulkan instance is missing " #name "."); return 0; } \
} while (0)
#define LOAD_DEVICE(ctx, name) do { \
    (ctx)->name = (PFN_##name)(ctx)->vkGetDeviceProcAddr((ctx)->device, #name); \
    if (!(ctx)->name) { set_error((ctx), "Vulkan device is missing " #name "."); return 0; } \
} while (0)

static int load_loader(LSVKContext* c) {
    c->vulkan_module = LoadLibraryA("vulkan-1.dll");
    c->glfw_module = LoadLibraryA("glfw3.dll");
    if (!c->vulkan_module) { set_error(c, "vulkan-1.dll was not found. Install a Vulkan-capable graphics driver."); return 0; }
    if (!c->glfw_module) { set_error(c, "glfw3.dll was not found beside the executable."); return 0; }
    c->vkGetInstanceProcAddr = (PFN_vkGetInstanceProcAddr)GetProcAddress(c->vulkan_module, "vkGetInstanceProcAddr");
    if (!c->vkGetInstanceProcAddr) { set_error(c, "Vulkan loader has no vkGetInstanceProcAddr."); return 0; }
    LOAD_GLOBAL(c, vkCreateInstance);
    return 1;
}

static int create_instance(LSVKContext* c) {
    PFN_glfwVulkanSupported glfwVulkanSupported = (PFN_glfwVulkanSupported)GetProcAddress(c->glfw_module, "glfwVulkanSupported");
    PFN_glfwGetRequiredInstanceExtensions glfwGetRequiredInstanceExtensions = (PFN_glfwGetRequiredInstanceExtensions)GetProcAddress(c->glfw_module, "glfwGetRequiredInstanceExtensions");
    PFN_glfwCreateWindowSurface glfwCreateWindowSurface = (PFN_glfwCreateWindowSurface)GetProcAddress(c->glfw_module, "glfwCreateWindowSurface");
    if (!glfwVulkanSupported || !glfwGetRequiredInstanceExtensions || !glfwCreateWindowSurface) { set_error(c, "The bundled GLFW does not expose Vulkan support."); return 0; }
    if (!glfwVulkanSupported()) { set_error(c, "GLFW reports that Vulkan is unavailable on this computer."); return 0; }
    uint32_t extension_count = 0;
    const char** extensions = glfwGetRequiredInstanceExtensions(&extension_count);
    if (!extensions || extension_count == 0) { set_error(c, "GLFW could not provide the Vulkan window extensions."); return 0; }

    VkApplicationInfo app;
    ls_zero(&app, sizeof(app));
    app.sType = VK_STRUCTURE_TYPE_APPLICATION_INFO;
    app.pApplicationName = "LazyScript Graphics";
    app.applicationVersion = VK_MAKE_VERSION(0,21,1);
    app.pEngineName = "LSG";
    app.engineVersion = VK_MAKE_VERSION(0,21,1);
    app.apiVersion = VK_API_VERSION_1_1;

    VkInstanceCreateInfo info;
    ls_zero(&info, sizeof(info));
    info.sType = VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO;
    info.pApplicationInfo = &app;
    info.enabledExtensionCount = extension_count;
    info.ppEnabledExtensionNames = extensions;
    if (c->vkCreateInstance(&info, 0, &c->instance) != VK_SUCCESS) { set_error(c, "Vulkan could not create an instance."); return 0; }

    LOAD_INSTANCE(c, vkDestroyInstance);
    LOAD_INSTANCE(c, vkEnumeratePhysicalDevices);
    LOAD_INSTANCE(c, vkGetPhysicalDeviceProperties);
    LOAD_INSTANCE(c, vkGetPhysicalDeviceQueueFamilyProperties);
    LOAD_INSTANCE(c, vkGetPhysicalDeviceMemoryProperties);
    LOAD_INSTANCE(c, vkEnumerateDeviceExtensionProperties);
    LOAD_INSTANCE(c, vkGetPhysicalDeviceSurfaceSupportKHR);
    LOAD_INSTANCE(c, vkGetPhysicalDeviceSurfaceCapabilitiesKHR);
    LOAD_INSTANCE(c, vkGetPhysicalDeviceSurfaceFormatsKHR);
    LOAD_INSTANCE(c, vkGetPhysicalDeviceSurfacePresentModesKHR);
    LOAD_INSTANCE(c, vkCreateDevice);
    LOAD_INSTANCE(c, vkDestroySurfaceKHR);
    c->vkGetDeviceProcAddr = (PFN_vkGetDeviceProcAddr)c->vkGetInstanceProcAddr(c->instance, "vkGetDeviceProcAddr");
    if (!c->vkGetDeviceProcAddr) { set_error(c, "Vulkan instance has no vkGetDeviceProcAddr."); return 0; }
    if (glfwCreateWindowSurface(c->instance, c->window, 0, &c->surface) != VK_SUCCESS) { set_error(c, "Vulkan could not create a surface for the GLFW window."); return 0; }
    return 1;
}

static int select_device(LSVKContext* c) {
    /* Do not accept the first adapter Vulkan enumerates. On hybrid systems that
       is frequently the low-power integrated GPU even when OpenGL is running on
       the discrete card. Score every usable adapter and prefer a single queue
       family that can both render and present. Both choices remove a very real
       source of the Vulkan/OpenGL performance gap. */
    typedef struct LSVKPhysicalDevicePropertiesLite {
        uint32_t api_version;
        uint32_t driver_version;
        uint32_t vendor_id;
        uint32_t device_id;
        uint32_t device_type;
        char device_name[256];
        unsigned char pipeline_cache_uuid[16];
        unsigned char remaining_properties[2048];
    } LSVKPhysicalDevicePropertiesLite;

    uint32_t device_count = 0;
    if (c->vkEnumeratePhysicalDevices(c->instance, &device_count, 0) != VK_SUCCESS || device_count == 0) {
        set_error(c, "No Vulkan graphics device was found.");
        return 0;
    }
    VkPhysicalDevice* devices = (VkPhysicalDevice*)ls_alloc((size_t)device_count * sizeof(VkPhysicalDevice));
    if (!devices) { set_error(c, "Vulkan could not allocate the adapter list."); return 0; }
    if (c->vkEnumeratePhysicalDevices(c->instance, &device_count, devices) != VK_SUCCESS) {
        ls_free(devices); set_error(c, "Vulkan could not enumerate graphics devices."); return 0;
    }

    VkPhysicalDevice best_device = 0;
    uint32_t best_graphics = UINT32_MAX;
    uint32_t best_present = UINT32_MAX;
    int best_ray_query = 0;
    int best_ray_pipeline = 0;
    int best_score = -1;
    char best_name[256]; best_name[0] = 0;

    for (uint32_t d = 0; d < device_count; ++d) {
        uint32_t qcount = 0;
        c->vkGetPhysicalDeviceQueueFamilyProperties(devices[d], &qcount, 0);
        if (!qcount) continue;
        VkQueueFamilyProperties* queues = (VkQueueFamilyProperties*)ls_alloc((size_t)qcount * sizeof(VkQueueFamilyProperties));
        if (!queues) continue;
        c->vkGetPhysicalDeviceQueueFamilyProperties(devices[d], &qcount, queues);

        uint32_t unified = UINT32_MAX;
        uint32_t graphics = UINT32_MAX;
        uint32_t present = UINT32_MAX;
        for (uint32_t q = 0; q < qcount; ++q) {
            VkBool32 supported = 0;
            c->vkGetPhysicalDeviceSurfaceSupportKHR(devices[d], q, c->surface, &supported);
            int graphics_capable = (queues[q].queueFlags & VK_QUEUE_GRAPHICS_BIT) != 0;
            if (graphics_capable && supported && unified == UINT32_MAX) unified = q;
            if (graphics_capable && graphics == UINT32_MAX) graphics = q;
            if (supported && present == UINT32_MAX) present = q;
        }
        ls_free(queues);
        if (unified != UINT32_MAX) { graphics = unified; present = unified; }
        if (graphics == UINT32_MAX || present == UINT32_MAX) continue;

        uint32_t ext_count = 0;
        c->vkEnumerateDeviceExtensionProperties(devices[d], 0, &ext_count, 0);
        VkExtensionProperties* ext = ext_count ? (VkExtensionProperties*)ls_alloc((size_t)ext_count * sizeof(VkExtensionProperties)) : 0;
        if (ext_count && !ext) continue;
        if (ext_count) c->vkEnumerateDeviceExtensionProperties(devices[d], 0, &ext_count, ext);
        int swapchain = extension_present(ext, ext_count, "VK_KHR_swapchain");
        int ray_query = extension_present(ext, ext_count, "VK_KHR_ray_query") && extension_present(ext, ext_count, "VK_KHR_acceleration_structure");
        int ray_pipeline = extension_present(ext, ext_count, "VK_KHR_ray_tracing_pipeline") && extension_present(ext, ext_count, "VK_KHR_acceleration_structure");
        ls_free(ext);
        if (!swapchain) continue;

        LSVKPhysicalDevicePropertiesLite properties;
        ls_zero(&properties, sizeof(properties));
        c->vkGetPhysicalDeviceProperties(devices[d], &properties);
        int score = 0;
        /* Vulkan device types: 1 integrated, 2 discrete, 3 virtual, 4 CPU. */
        if (properties.device_type == VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU) score += 100000;
        else if (properties.device_type == VK_PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU) score += 50000;
        else if (properties.device_type == VK_PHYSICAL_DEVICE_TYPE_VIRTUAL_GPU) score += 20000;
        else if (properties.device_type == VK_PHYSICAL_DEVICE_TYPE_CPU) score += 1000;
        else score += 5000;
        if (graphics == present) score += 5000;
        if (ray_pipeline) score += 500;
        else if (ray_query) score += 250;
        /* Prefer newer API support when otherwise equivalent. */
        score += (int)((properties.api_version >> 22) & 0x3ffU) * 100;
        score += (int)((properties.api_version >> 12) & 0x3ffU) * 10;

        if (score > best_score) {
            best_score = score;
            best_device = devices[d];
            best_graphics = graphics;
            best_present = present;
            best_ray_query = ray_query;
            best_ray_pipeline = ray_pipeline;
            ls_copy(best_name, sizeof(best_name), properties.device_name[0] ? properties.device_name : "Vulkan graphics device");
        }
    }
    ls_free(devices);

    if (!best_device) {
        set_error(c, "No Vulkan device can draw to this window.");
        return 0;
    }
    c->physical_device = best_device;
    c->graphics_family = best_graphics;
    c->present_family = best_present;
    c->ray_query = best_ray_query;
    c->ray_pipeline = best_ray_pipeline;
    ls_copy(c->device_name, sizeof(c->device_name), best_name);
    return 1;
}

static int create_device(LSVKContext* c) {
    float priority = 1.0f;
    VkDeviceQueueCreateInfo queues[2];
    ls_zero(queues, sizeof(queues));
    uint32_t queue_count = 1;
    queues[0].sType = VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO;
    queues[0].queueFamilyIndex = c->graphics_family;
    queues[0].queueCount = 1;
    queues[0].pQueuePriorities = &priority;
    if (c->present_family != c->graphics_family) {
        queue_count = 2;
        queues[1].sType = VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO;
        queues[1].queueFamilyIndex = c->present_family;
        queues[1].queueCount = 1;
        queues[1].pQueuePriorities = &priority;
    }
    const char* extensions[] = { "VK_KHR_swapchain" };
    VkDeviceCreateInfo info;
    ls_zero(&info, sizeof(info));
    info.sType = VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO;
    info.queueCreateInfoCount = queue_count;
    info.pQueueCreateInfos = queues;
    info.enabledExtensionCount = 1;
    info.ppEnabledExtensionNames = extensions;
    info.pEnabledFeatures = 0;
    if (c->vkCreateDevice(c->physical_device, &info, 0, &c->device) != VK_SUCCESS) { set_error(c, "Vulkan could not create a logical device."); return 0; }

    LOAD_DEVICE(c, vkDestroyDevice); LOAD_DEVICE(c, vkGetDeviceQueue);
    LOAD_DEVICE(c, vkCreateBuffer); LOAD_DEVICE(c, vkDestroyBuffer); LOAD_DEVICE(c, vkGetBufferMemoryRequirements);
    LOAD_DEVICE(c, vkCreateImage); LOAD_DEVICE(c, vkDestroyImage); LOAD_DEVICE(c, vkGetImageMemoryRequirements); LOAD_DEVICE(c, vkBindImageMemory); LOAD_DEVICE(c, vkCreateSampler); LOAD_DEVICE(c, vkDestroySampler);
    LOAD_DEVICE(c, vkCreateDescriptorSetLayout); LOAD_DEVICE(c, vkDestroyDescriptorSetLayout); LOAD_DEVICE(c, vkCreateDescriptorPool); LOAD_DEVICE(c, vkDestroyDescriptorPool); LOAD_DEVICE(c, vkAllocateDescriptorSets); LOAD_DEVICE(c, vkUpdateDescriptorSets);
    LOAD_DEVICE(c, vkAllocateMemory); LOAD_DEVICE(c, vkFreeMemory); LOAD_DEVICE(c, vkBindBufferMemory); LOAD_DEVICE(c, vkMapMemory); LOAD_DEVICE(c, vkUnmapMemory);
    LOAD_DEVICE(c, vkCreateSwapchainKHR); LOAD_DEVICE(c, vkDestroySwapchainKHR); LOAD_DEVICE(c, vkGetSwapchainImagesKHR);
    LOAD_DEVICE(c, vkCreateImageView); LOAD_DEVICE(c, vkDestroyImageView);
    LOAD_DEVICE(c, vkCreateRenderPass); LOAD_DEVICE(c, vkDestroyRenderPass);
    LOAD_DEVICE(c, vkCreateFramebuffer); LOAD_DEVICE(c, vkDestroyFramebuffer);
    LOAD_DEVICE(c, vkCreatePipelineLayout); LOAD_DEVICE(c, vkDestroyPipelineLayout);
    LOAD_DEVICE(c, vkCreateShaderModule); LOAD_DEVICE(c, vkDestroyShaderModule);
    LOAD_DEVICE(c, vkCreateGraphicsPipelines); LOAD_DEVICE(c, vkCreateComputePipelines); LOAD_DEVICE(c, vkDestroyPipeline);
    LOAD_DEVICE(c, vkCreateCommandPool); LOAD_DEVICE(c, vkDestroyCommandPool); LOAD_DEVICE(c, vkAllocateCommandBuffers);
    LOAD_DEVICE(c, vkResetCommandBuffer); LOAD_DEVICE(c, vkBeginCommandBuffer); LOAD_DEVICE(c, vkEndCommandBuffer);
    LOAD_DEVICE(c, vkCmdBeginRenderPass); LOAD_DEVICE(c, vkCmdEndRenderPass); LOAD_DEVICE(c, vkCmdSetViewport); LOAD_DEVICE(c, vkCmdSetScissor); LOAD_DEVICE(c, vkCmdBindPipeline); LOAD_DEVICE(c, vkCmdBindVertexBuffers); LOAD_DEVICE(c, vkCmdBindIndexBuffer); LOAD_DEVICE(c, vkCmdDraw); LOAD_DEVICE(c, vkCmdDrawIndexed); LOAD_DEVICE(c, vkCmdDispatch); LOAD_DEVICE(c, vkCmdPipelineBarrier); LOAD_DEVICE(c, vkCmdCopyBufferToImage); LOAD_DEVICE(c, vkCmdBlitImage); LOAD_DEVICE(c, vkCmdBindDescriptorSets);
    LOAD_DEVICE(c, vkCreateSemaphore); LOAD_DEVICE(c, vkDestroySemaphore); LOAD_DEVICE(c, vkCreateFence); LOAD_DEVICE(c, vkDestroyFence);
    LOAD_DEVICE(c, vkWaitForFences); LOAD_DEVICE(c, vkResetFences); LOAD_DEVICE(c, vkAcquireNextImageKHR); LOAD_DEVICE(c, vkQueueSubmit); LOAD_DEVICE(c, vkQueuePresentKHR); LOAD_DEVICE(c, vkQueueWaitIdle); LOAD_DEVICE(c, vkDeviceWaitIdle);
    c->vkGetDeviceQueue(c->device, c->graphics_family, 0, &c->graphics_queue);
    c->vkGetDeviceQueue(c->device, c->present_family, 0, &c->present_queue);
    return 1;
}

static uint32_t find_memory_type(LSVKContext* c,uint32_t allowed,VkMemoryPropertyFlags wanted);
static int lsx_create_buffer(LSVKContext* c,VkDeviceSize size,VkBufferUsageFlags usage,VkMemoryPropertyFlags memory_flags,VkBuffer* buffer,VkDeviceMemory* memory);

static void destroy_swapchain(LSVKContext* c) {
    uint32_t i;
    if (!c || !c->device) return;
    if (c->vkDeviceWaitIdle) c->vkDeviceWaitIdle(c->device);
    if (c->framebuffers) { for (i=0;i<c->image_count;++i) if (c->framebuffers[i]) c->vkDestroyFramebuffer(c->device,c->framebuffers[i],0); ls_free(c->framebuffers); c->framebuffers=0; }
    if (c->depth_views) { for(i=0;i<c->image_count;++i) if(c->depth_views[i]) c->vkDestroyImageView(c->device,c->depth_views[i],0); ls_free(c->depth_views); c->depth_views=0; }
    if (c->depth_images) { for(i=0;i<c->image_count;++i) if(c->depth_images[i]) c->vkDestroyImage(c->device,c->depth_images[i],0); ls_free(c->depth_images); c->depth_images=0; }
    if (c->depth_memories) { for(i=0;i<c->image_count;++i) if(c->depth_memories[i]) c->vkFreeMemory(c->device,c->depth_memories[i],0); ls_free(c->depth_memories); c->depth_memories=0; }
    if (c->images_in_flight) { ls_free(c->images_in_flight); c->images_in_flight=0; }
    if (c->render_pass) { c->vkDestroyRenderPass(c->device,c->render_pass,0); c->render_pass=0; }
    if (c->image_views) { for (i=0;i<c->image_count;++i) if (c->image_views[i]) c->vkDestroyImageView(c->device,c->image_views[i],0); ls_free(c->image_views); c->image_views=0; }
    if (c->images) { ls_free(c->images); c->images=0; }
    if (c->swapchain) { c->vkDestroySwapchainKHR(c->device,c->swapchain,0); c->swapchain=0; }
    c->image_count=0;
}

static VkPresentModeKHR choose_present_mode(LSVKContext* c) {
    VkPresentModeKHR fallback=VK_PRESENT_MODE_FIFO_KHR;
    uint32_t mode_count=0;
    if(!c||!c->vkGetPhysicalDeviceSurfacePresentModesKHR||
       c->vkGetPhysicalDeviceSurfacePresentModesKHR(c->physical_device,c->surface,&mode_count,0)!=VK_SUCCESS||
       mode_count==0)return fallback;
    VkPresentModeKHR* modes=(VkPresentModeKHR*)ls_alloc((size_t)mode_count*sizeof(VkPresentModeKHR));
    if(!modes)return fallback;
    if(c->vkGetPhysicalDeviceSurfacePresentModesKHR(c->physical_device,c->surface,&mode_count,modes)!=VK_SUCCESS){ls_free(modes);return fallback;}
    int has_immediate=0,has_mailbox=0,has_fifo_relaxed=0;
    for(uint32_t i=0;i<mode_count;++i){
        if(modes[i]==VK_PRESENT_MODE_IMMEDIATE_KHR)has_immediate=1;
        else if(modes[i]==VK_PRESENT_MODE_MAILBOX_KHR)has_mailbox=1;
        else if(modes[i]==VK_PRESENT_MODE_FIFO_RELAXED_KHR)has_fifo_relaxed=1;
    }
    ls_free(modes);
    if(c->vsync_enabled)return VK_PRESENT_MODE_FIFO_KHR;
    if(has_immediate)return VK_PRESENT_MODE_IMMEDIATE_KHR;
    if(has_mailbox)return VK_PRESENT_MODE_MAILBOX_KHR;
    if(has_fifo_relaxed)return VK_PRESENT_MODE_FIFO_RELAXED_KHR;
    return fallback;
}

static void trace_present_mode(LSVKContext* c,VkPresentModeKHR mode){
    if(mode==VK_PRESENT_MODE_IMMEDIATE_KHR)lsx_trace_line(c,"swapchain.present_mode.immediate");
    else if(mode==VK_PRESENT_MODE_MAILBOX_KHR)lsx_trace_line(c,"swapchain.present_mode.mailbox");
    else if(mode==VK_PRESENT_MODE_FIFO_RELAXED_KHR)lsx_trace_line(c,"swapchain.present_mode.fifo_relaxed");
    else lsx_trace_line(c,"swapchain.present_mode.fifo");
}

static int create_swapchain(LSVKContext* c, uint32_t requested_width, uint32_t requested_height) {
    VkSurfaceCapabilitiesKHR caps;
    if (c->vkGetPhysicalDeviceSurfaceCapabilitiesKHR(c->physical_device,c->surface,&caps)!=VK_SUCCESS) { set_error(c,"Could not read Vulkan surface capabilities."); return 0; }
    uint32_t format_count=0;
    c->vkGetPhysicalDeviceSurfaceFormatsKHR(c->physical_device,c->surface,&format_count,0);
    if (!format_count) { set_error(c,"The Vulkan surface has no color format."); return 0; }
    VkSurfaceFormatKHR* formats=(VkSurfaceFormatKHR*)ls_alloc((format_count) * sizeof(VkSurfaceFormatKHR));
    c->vkGetPhysicalDeviceSurfaceFormatsKHR(c->physical_device,c->surface,&format_count,formats);
    VkSurfaceFormatKHR chosen=formats[0];
    uint32_t i;
    int format_selected=0;
    if(format_count==1&&formats[0].format==VK_FORMAT_UNDEFINED){chosen.format=VK_FORMAT_B8G8R8A8_UNORM;chosen.colorSpace=VK_COLOR_SPACE_SRGB_NONLINEAR_KHR;format_selected=1;}
    /* LSX/LSG colors and the ray finish stage are already display encoded, the
       same way the OpenGL backend presents them. Prefer an UNORM swapchain so
       Vulkan does not apply a second sRGB conversion and brighten every UI,
       texture, and post-tonemapped ray result. */
    for(i=0;i<format_count;++i) if(formats[i].format==VK_FORMAT_B8G8R8A8_UNORM && formats[i].colorSpace==VK_COLOR_SPACE_SRGB_NONLINEAR_KHR){chosen=formats[i];format_selected=1;break;}
    if(!format_selected) for(i=0;i<format_count;++i) if(formats[i].format==VK_FORMAT_R8G8B8A8_UNORM && formats[i].colorSpace==VK_COLOR_SPACE_SRGB_NONLINEAR_KHR){chosen=formats[i];format_selected=1;break;}
    if(!format_selected) for(i=0;i<format_count;++i) if(formats[i].format==VK_FORMAT_B8G8R8A8_SRGB && formats[i].colorSpace==VK_COLOR_SPACE_SRGB_NONLINEAR_KHR){chosen=formats[i];format_selected=1;break;}
    ls_free(formats);
    VkExtent2D extent;
    if(caps.currentExtent.width!=UINT32_MAX) extent=caps.currentExtent;
    else {
        extent.width=requested_width; extent.height=requested_height;
        if(extent.width<caps.minImageExtent.width) extent.width=caps.minImageExtent.width;
        if(extent.width>caps.maxImageExtent.width) extent.width=caps.maxImageExtent.width;
        if(extent.height<caps.minImageExtent.height) extent.height=caps.minImageExtent.height;
        if(extent.height>caps.maxImageExtent.height) extent.height=caps.maxImageExtent.height;
    }
    uint32_t count=caps.minImageCount+1;
    if(caps.maxImageCount>0 && count>caps.maxImageCount) count=caps.maxImageCount;
    uint32_t families[]={c->graphics_family,c->present_family};
    VkSwapchainCreateInfoKHR info; ls_zero(&info, sizeof(info));
    info.sType=VK_STRUCTURE_TYPE_SWAPCHAIN_CREATE_INFO_KHR; info.surface=c->surface; info.minImageCount=count; info.imageFormat=chosen.format; info.imageColorSpace=chosen.colorSpace; info.imageExtent=extent; info.imageArrayLayers=1; info.imageUsage=VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT|VK_IMAGE_USAGE_TRANSFER_DST_BIT;
    if(c->graphics_family!=c->present_family){info.imageSharingMode=VK_SHARING_MODE_CONCURRENT;info.queueFamilyIndexCount=2;info.pQueueFamilyIndices=families;}else info.imageSharingMode=VK_SHARING_MODE_EXCLUSIVE;
    VkPresentModeKHR present_mode=choose_present_mode(c);
    info.preTransform=caps.currentTransform; info.compositeAlpha=VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR; info.presentMode=present_mode; info.clipped=1; info.oldSwapchain=0;
    if(c->vkCreateSwapchainKHR(c->device,&info,0,&c->swapchain)!=VK_SUCCESS){set_error(c,"Vulkan could not create the swapchain.");return 0;}
    c->swapchain_format=chosen.format;c->extent=extent;c->present_mode=present_mode;trace_present_mode(c,present_mode);
    if(chosen.format==VK_FORMAT_B8G8R8A8_UNORM)lsx_trace_line(c,"swapchain.format.bgra8_unorm");
    else if(chosen.format==VK_FORMAT_R8G8B8A8_UNORM)lsx_trace_line(c,"swapchain.format.rgba8_unorm");
    else if(chosen.format==VK_FORMAT_B8G8R8A8_SRGB)lsx_trace_line(c,"swapchain.format.bgra8_srgb_fallback");
    else lsx_trace_line(c,"swapchain.format.surface_default");
    c->vkGetSwapchainImagesKHR(c->device,c->swapchain,&c->image_count,0);
    c->images=(VkImage*)ls_alloc((c->image_count) * sizeof(VkImage));c->vkGetSwapchainImagesKHR(c->device,c->swapchain,&c->image_count,c->images);
    c->image_views=(VkImageView*)ls_alloc((c->image_count) * sizeof(VkImageView));
    for(i=0;i<c->image_count;++i){VkImageViewCreateInfo vi;ls_zero(&vi, sizeof(vi));vi.sType=VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO;vi.image=c->images[i];vi.viewType=VK_IMAGE_VIEW_TYPE_2D;vi.format=c->swapchain_format;vi.components.r=VK_COMPONENT_SWIZZLE_IDENTITY;vi.components.g=VK_COMPONENT_SWIZZLE_IDENTITY;vi.components.b=VK_COMPONENT_SWIZZLE_IDENTITY;vi.components.a=VK_COMPONENT_SWIZZLE_IDENTITY;vi.subresourceRange.aspectMask=VK_IMAGE_ASPECT_COLOR_BIT;vi.subresourceRange.levelCount=1;vi.subresourceRange.layerCount=1;if(c->vkCreateImageView(c->device,&vi,0,&c->image_views[i])!=VK_SUCCESS){set_error(c,"Vulkan could not create a swapchain image view.");return 0;}}
    VkImageCreateInfo di;ls_zero(&di,sizeof(di));di.sType=VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO;di.imageType=VK_IMAGE_TYPE_2D;di.format=VK_FORMAT_D32_SFLOAT;di.extent.width=c->extent.width;di.extent.height=c->extent.height;di.extent.depth=1;di.mipLevels=1;di.arrayLayers=1;di.samples=VK_SAMPLE_COUNT_1_BIT;di.tiling=VK_IMAGE_TILING_OPTIMAL;di.usage=VK_IMAGE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT;di.sharingMode=VK_SHARING_MODE_EXCLUSIVE;di.initialLayout=VK_IMAGE_LAYOUT_UNDEFINED;
    c->depth_images=(VkImage*)ls_alloc((size_t)c->image_count*sizeof(VkImage));
    c->depth_memories=(VkDeviceMemory*)ls_alloc((size_t)c->image_count*sizeof(VkDeviceMemory));
    c->depth_views=(VkImageView*)ls_alloc((size_t)c->image_count*sizeof(VkImageView));
    c->images_in_flight=(VkFence*)ls_alloc((size_t)c->image_count*sizeof(VkFence));
    if(!c->depth_images||!c->depth_memories||!c->depth_views||!c->images_in_flight){set_error(c,"Vulkan could not allocate per-image frame resources.");return 0;}
    for(i=0;i<c->image_count;++i){
        if(c->vkCreateImage(c->device,&di,0,&c->depth_images[i])!=VK_SUCCESS){set_error(c,"Vulkan could not create a per-image depth target.");return 0;}
        VkMemoryRequirements dm;ls_zero(&dm,sizeof(dm));c->vkGetImageMemoryRequirements(c->device,c->depth_images[i],&dm);uint32_t dt=find_memory_type(c,dm.memoryTypeBits,VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT);if(dt==UINT32_MAX){set_error(c,"Vulkan could not find per-image depth memory.");return 0;}
        VkMemoryAllocateInfo dai;ls_zero(&dai,sizeof(dai));dai.sType=VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;dai.allocationSize=dm.size;dai.memoryTypeIndex=dt;
        if(c->vkAllocateMemory(c->device,&dai,0,&c->depth_memories[i])!=VK_SUCCESS||c->vkBindImageMemory(c->device,c->depth_images[i],c->depth_memories[i],0)!=VK_SUCCESS){set_error(c,"Vulkan could not allocate a per-image depth target.");return 0;}
        VkImageViewCreateInfo dvi;ls_zero(&dvi,sizeof(dvi));dvi.sType=VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO;dvi.image=c->depth_images[i];dvi.viewType=VK_IMAGE_VIEW_TYPE_2D;dvi.format=VK_FORMAT_D32_SFLOAT;dvi.subresourceRange.aspectMask=VK_IMAGE_ASPECT_DEPTH_BIT;dvi.subresourceRange.levelCount=1;dvi.subresourceRange.layerCount=1;
        if(c->vkCreateImageView(c->device,&dvi,0,&c->depth_views[i])!=VK_SUCCESS){set_error(c,"Vulkan could not create a per-image depth view.");return 0;}
    }
    VkAttachmentDescription color;ls_zero(&color, sizeof(color));color.format=c->swapchain_format;color.samples=VK_SAMPLE_COUNT_1_BIT;color.loadOp=VK_ATTACHMENT_LOAD_OP_CLEAR;color.storeOp=VK_ATTACHMENT_STORE_OP_STORE;color.stencilLoadOp=VK_ATTACHMENT_LOAD_OP_DONT_CARE;color.stencilStoreOp=VK_ATTACHMENT_STORE_OP_DONT_CARE;color.initialLayout=VK_IMAGE_LAYOUT_UNDEFINED;color.finalLayout=VK_IMAGE_LAYOUT_PRESENT_SRC_KHR;
    VkAttachmentDescription attachments[2];attachments[0]=color;ls_zero(&attachments[1],sizeof(attachments[1]));attachments[1].format=VK_FORMAT_D32_SFLOAT;attachments[1].samples=VK_SAMPLE_COUNT_1_BIT;attachments[1].loadOp=VK_ATTACHMENT_LOAD_OP_CLEAR;attachments[1].storeOp=VK_ATTACHMENT_STORE_OP_DONT_CARE;attachments[1].stencilLoadOp=VK_ATTACHMENT_LOAD_OP_DONT_CARE;attachments[1].stencilStoreOp=VK_ATTACHMENT_STORE_OP_DONT_CARE;attachments[1].initialLayout=VK_IMAGE_LAYOUT_UNDEFINED;attachments[1].finalLayout=VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL;
    VkAttachmentReference ref;ref.attachment=0;ref.layout=VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;VkAttachmentReference depth_ref;depth_ref.attachment=1;depth_ref.layout=VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL;
    VkSubpassDescription sub;ls_zero(&sub, sizeof(sub));sub.pipelineBindPoint=VK_PIPELINE_BIND_POINT_GRAPHICS;sub.colorAttachmentCount=1;sub.pColorAttachments=&ref;sub.pDepthStencilAttachment=&depth_ref;
    VkSubpassDependency dep;ls_zero(&dep, sizeof(dep));dep.srcSubpass=VK_SUBPASS_EXTERNAL;dep.dstSubpass=0;dep.srcStageMask=VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT|VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT;dep.dstStageMask=VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT|VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT;dep.dstAccessMask=VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT|VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT;
    VkRenderPassCreateInfo rp;ls_zero(&rp, sizeof(rp));rp.sType=VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO;rp.attachmentCount=2;rp.pAttachments=attachments;rp.subpassCount=1;rp.pSubpasses=&sub;rp.dependencyCount=1;rp.pDependencies=&dep;
    if(c->vkCreateRenderPass(c->device,&rp,0,&c->render_pass)!=VK_SUCCESS){set_error(c,"Vulkan could not create the render pass.");return 0;}
    c->framebuffers=(VkFramebuffer*)ls_alloc((c->image_count) * sizeof(VkFramebuffer));
    for(i=0;i<c->image_count;++i){VkImageView views[2]={c->image_views[i],c->depth_views[i]};VkFramebufferCreateInfo fi;ls_zero(&fi, sizeof(fi));fi.sType=VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO;fi.renderPass=c->render_pass;fi.attachmentCount=2;fi.pAttachments=views;fi.width=c->extent.width;fi.height=c->extent.height;fi.layers=1;if(c->vkCreateFramebuffer(c->device,&fi,0,&c->framebuffers[i])!=VK_SUCCESS){set_error(c,"Vulkan could not create a framebuffer.");return 0;}}
    return 1;
}

static int create_commands(LSVKContext* c) {
    /* Set 0 contains textures and storage buffers. Unlike the 0.20.2 path,
       resource descriptor sets are cached by their actual bound resources.
       A retained UI can issue thousands of draws while usually needing only
       four resource sets: boxes, text, images, and solid canvas geometry. */
    VkDescriptorSetLayoutBinding bindings[16];ls_zero(bindings,sizeof(bindings));
    for(uint32_t i=0;i<8;++i){bindings[i].binding=i;bindings[i].descriptorType=VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;bindings[i].descriptorCount=1;bindings[i].stageFlags=VK_SHADER_STAGE_FRAGMENT_BIT;}
    for(uint32_t i=0;i<8;++i){bindings[8+i].binding=8+i;bindings[8+i].descriptorType=VK_DESCRIPTOR_TYPE_STORAGE_BUFFER;bindings[8+i].descriptorCount=1;bindings[8+i].stageFlags=VK_SHADER_STAGE_VERTEX_BIT|VK_SHADER_STAGE_FRAGMENT_BIT;}
    VkDescriptorSetLayoutCreateInfo dli;ls_zero(&dli,sizeof(dli));dli.sType=VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO;dli.bindingCount=16;dli.pBindings=bindings;
    if(c->vkCreateDescriptorSetLayout(c->device,&dli,0,&c->descriptor_layout)!=VK_SUCCESS){set_error(c,"Vulkan could not create the graphics resource binding layout.");return 0;}

    VkDescriptorPoolSize ps[2];ls_zero(ps,sizeof(ps));
    ps[0].type=VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;ps[0].descriptorCount=8U*LSVK_RESOURCE_SET_LIMIT*2U;
    ps[1].type=VK_DESCRIPTOR_TYPE_STORAGE_BUFFER;ps[1].descriptorCount=8U*LSVK_RESOURCE_SET_LIMIT*2U;
    VkDescriptorPoolCreateInfo dpi;ls_zero(&dpi,sizeof(dpi));dpi.sType=VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO;dpi.maxSets=LSVK_RESOURCE_SET_LIMIT*2U;dpi.poolSizeCount=2;dpi.pPoolSizes=ps;
    if(c->vkCreateDescriptorPool(c->device,&dpi,0,&c->descriptor_pool)!=VK_SUCCESS){set_error(c,"Vulkan could not create the graphics resource descriptor pool.");return 0;}
    VkDescriptorSetLayout* resource_layouts=(VkDescriptorSetLayout*)ls_alloc((size_t)(LSVK_RESOURCE_SET_LIMIT*2U)*sizeof(VkDescriptorSetLayout));
    if(!resource_layouts){set_error(c,"Vulkan could not allocate the cached resource layout list.");return 0;}
    for(uint32_t i=0;i<LSVK_RESOURCE_SET_LIMIT*2U;++i)resource_layouts[i]=c->descriptor_layout;
    VkDescriptorSetAllocateInfo dai;ls_zero(&dai,sizeof(dai));dai.sType=VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO;dai.descriptorPool=c->descriptor_pool;dai.descriptorSetCount=LSVK_RESOURCE_SET_LIMIT*2U;dai.pSetLayouts=resource_layouts;
    VkResult resource_allocate_result=c->vkAllocateDescriptorSets(c->device,&dai,&c->resource_descriptor_sets[0][0]);ls_free(resource_layouts);
    if(resource_allocate_result!=VK_SUCCESS){set_error(c,"Vulkan could not allocate cached graphics resource bindings.");return 0;}

    VkDescriptorSetLayoutBinding uniform_binding;ls_zero(&uniform_binding,sizeof(uniform_binding));uniform_binding.binding=0;uniform_binding.descriptorType=VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER_DYNAMIC;uniform_binding.descriptorCount=1;uniform_binding.stageFlags=VK_SHADER_STAGE_VERTEX_BIT|VK_SHADER_STAGE_FRAGMENT_BIT;
    VkDescriptorSetLayoutCreateInfo uniform_layout_info;ls_zero(&uniform_layout_info,sizeof(uniform_layout_info));uniform_layout_info.sType=VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO;uniform_layout_info.bindingCount=1;uniform_layout_info.pBindings=&uniform_binding;
    if(c->vkCreateDescriptorSetLayout(c->device,&uniform_layout_info,0,&c->uniform_descriptor_layout)!=VK_SUCCESS){set_error(c,"Vulkan could not create the dynamic automatic uniform layout.");return 0;}
    c->uniform_stride=1024;ls_zero(c->uniform_shadow,sizeof(c->uniform_shadow));
    VkDescriptorPoolSize uniform_pool_size;uniform_pool_size.type=VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER_DYNAMIC;uniform_pool_size.descriptorCount=2;
    VkDescriptorPoolCreateInfo uniform_pool_info;ls_zero(&uniform_pool_info,sizeof(uniform_pool_info));uniform_pool_info.sType=VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO;uniform_pool_info.maxSets=2;uniform_pool_info.poolSizeCount=1;uniform_pool_info.pPoolSizes=&uniform_pool_size;
    if(c->vkCreateDescriptorPool(c->device,&uniform_pool_info,0,&c->uniform_descriptor_pool)!=VK_SUCCESS){set_error(c,"Vulkan could not create dynamic automatic uniform storage.");return 0;}
    VkDescriptorSetLayout uniform_layouts[2]={c->uniform_descriptor_layout,c->uniform_descriptor_layout};
    VkDescriptorSetAllocateInfo uniform_allocate;ls_zero(&uniform_allocate,sizeof(uniform_allocate));uniform_allocate.sType=VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO;uniform_allocate.descriptorPool=c->uniform_descriptor_pool;uniform_allocate.descriptorSetCount=2;uniform_allocate.pSetLayouts=uniform_layouts;
    if(c->vkAllocateDescriptorSets(c->device,&uniform_allocate,&c->uniform_descriptor_sets[0])!=VK_SUCCESS){set_error(c,"Vulkan could not allocate dynamic automatic uniform bindings.");return 0;}

    VkDeviceSize uniform_frame_bytes=c->uniform_stride*LSVK_DRAW_UNIFORM_LIMIT;
    for(uint32_t uniform_frame=0;uniform_frame<2;++uniform_frame){
        if(!lsx_create_buffer(c,uniform_frame_bytes,VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT,VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT|VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,&c->uniform_buffers[uniform_frame],&c->uniform_memories[uniform_frame])){set_error(c,"Vulkan could not create per-draw automatic uniform memory.");return 0;}
        c->uniform_mapped[uniform_frame]=0;
        if(c->vkMapMemory(c->device,c->uniform_memories[uniform_frame],0,uniform_frame_bytes,0,&c->uniform_mapped[uniform_frame])!=VK_SUCCESS||!c->uniform_mapped[uniform_frame]){set_error(c,"Vulkan could not persistently map per-draw automatic uniform memory.");return 0;}
        ls_zero(c->uniform_mapped[uniform_frame],(size_t)uniform_frame_bytes);
        VkDescriptorBufferInfo uniform_info;uniform_info.buffer=c->uniform_buffers[uniform_frame];uniform_info.offset=0;uniform_info.range=1024;
        VkWriteDescriptorSet uniform_write;ls_zero(&uniform_write,sizeof(uniform_write));uniform_write.sType=VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;uniform_write.dstSet=c->uniform_descriptor_sets[uniform_frame];uniform_write.dstBinding=0;uniform_write.descriptorCount=1;uniform_write.descriptorType=VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER_DYNAMIC;uniform_write.pBufferInfo=&uniform_info;
        c->vkUpdateDescriptorSets(c->device,1,&uniform_write,0,0);
    }

    VkDescriptorSetLayout pipeline_layouts[2]={c->descriptor_layout,c->uniform_descriptor_layout};VkPipelineLayoutCreateInfo li;ls_zero(&li,sizeof(li));li.sType=VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO;li.setLayoutCount=2;li.pSetLayouts=pipeline_layouts;
    if(c->vkCreatePipelineLayout(c->device,&li,0,&c->pipeline_layout)!=VK_SUCCESS){set_error(c,"Vulkan could not create the pipeline layout.");return 0;}
    VkCommandPoolCreateInfo pi;ls_zero(&pi,sizeof(pi));pi.sType=VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO;pi.flags=VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT;pi.queueFamilyIndex=c->graphics_family;
    if(c->vkCreateCommandPool(c->device,&pi,0,&c->command_pool)!=VK_SUCCESS){set_error(c,"Vulkan could not create the command pool.");return 0;}
    VkCommandBufferAllocateInfo ai;ls_zero(&ai,sizeof(ai));ai.sType=VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO;ai.commandPool=c->command_pool;ai.level=VK_COMMAND_BUFFER_LEVEL_PRIMARY;ai.commandBufferCount=2;
    if(c->vkAllocateCommandBuffers(c->device,&ai,c->command_buffers)!=VK_SUCCESS){set_error(c,"Vulkan could not allocate command buffers.");return 0;}
    ai.commandBufferCount=1;if(c->vkAllocateCommandBuffers(c->device,&ai,&c->upload_command)!=VK_SUCCESS){set_error(c,"Vulkan could not allocate the upload command buffer.");return 0;}
    for(uint32_t i=0;i<2;++i){VkSemaphoreCreateInfo si;ls_zero(&si,sizeof(si));si.sType=VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO;VkFenceCreateInfo fi;ls_zero(&fi,sizeof(fi));fi.sType=VK_STRUCTURE_TYPE_FENCE_CREATE_INFO;fi.flags=VK_FENCE_CREATE_SIGNALED_BIT;if(c->vkCreateSemaphore(c->device,&si,0,&c->image_available[i])!=VK_SUCCESS||c->vkCreateSemaphore(c->device,&si,0,&c->render_finished[i])!=VK_SUCCESS||c->vkCreateFence(c->device,&fi,0,&c->in_flight[i])!=VK_SUCCESS){set_error(c,"Vulkan could not create frame synchronization objects.");return 0;}}

    /* Fill unused descriptor slots with real resources. Some Windows Vulkan
       drivers are not tolerant of descriptor sets whose unused entries were
       never initialized, especially when several UI pipelines share one broad
       layout. A white pixel and a 16-byte zero storage buffer are enough. */
    uint32_t white_pixel=0xffffffffU;
    c->fallback_texture=(LSVKTexture*)_lsxVKCreateTexture(c,1,1,&white_pixel,4,0);
    c->fallback_storage=(LSVKStorage*)_lsxVKCreateStorage(c,0,16,0);
    lsx_set_bound_storage(c,0,0);
    if(!c->fallback_texture||!c->fallback_texture->view||!c->fallback_texture->sampler||!c->fallback_storage||!c->fallback_storage->buffers[0]||!c->fallback_storage->buffers[1]){set_error(c,"Vulkan could not create safe fallback graphics resources.");return 0;}
    return 1;
}

static uint32_t find_memory_type(LSVKContext* c,uint32_t allowed,VkMemoryPropertyFlags wanted){
    VkPhysicalDeviceMemoryProperties properties;ls_zero(&properties,sizeof(properties));
    c->vkGetPhysicalDeviceMemoryProperties(c->physical_device,&properties);
    for(uint32_t i=0;i<properties.memoryTypeCount;++i){
        if((allowed&(1U<<i))&&(properties.memoryTypes[i].propertyFlags&wanted)==wanted)return i;
    }
    return UINT32_MAX;
}

static VkFormat component_format(uint32_t size){
    if(size==1)return VK_FORMAT_R32_SFLOAT;
    if(size==2)return VK_FORMAT_R32G32_SFLOAT;
    if(size==3)return VK_FORMAT_R32G32B32_SFLOAT;
    if(size==4)return VK_FORMAT_R32G32B32A32_SFLOAT;
    return 0;
}

static VkShaderModule make_module(LSVKContext* c,const uint32_t* words,uint32_t count){VkShaderModule module=0;VkShaderModuleCreateInfo info;ls_zero(&info, sizeof(info));info.sType=VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO;info.codeSize=(size_t)count*4;info.pCode=words;if(c->vkCreateShaderModule(c->device,&info,0,&module)!=VK_SUCCESS)return 0;return module;}

static int build_pipeline(LSVKContext* c, LSVKShader* s) {
    if(s->pipeline){c->vkDestroyPipeline(c->device,s->pipeline,0);s->pipeline=0;}
    VkShaderModule vs=make_module(c,s->vertex_words,s->vertex_count),fs=make_module(c,s->fragment_words,s->fragment_count);
    if(!vs||!fs){if(vs)c->vkDestroyShaderModule(c->device,vs,0);if(fs)c->vkDestroyShaderModule(c->device,fs,0);ls_copy(s->error,sizeof(s->error),"Vulkan could not create the embedded shader modules.");return 0;}
    VkPipelineShaderStageCreateInfo stages[2];ls_zero(stages, sizeof(stages));stages[0].sType=VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;stages[0].stage=VK_SHADER_STAGE_VERTEX_BIT;stages[0].module=vs;stages[0].pName="main";stages[1].sType=VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;stages[1].stage=VK_SHADER_STAGE_FRAGMENT_BIT;stages[1].module=fs;stages[1].pName="main";
    VkVertexInputBindingDescription binding;ls_zero(&binding,sizeof(binding));
    VkVertexInputAttributeDescription attributes[15];ls_zero(attributes,sizeof(attributes));
    uint32_t attribute_count=0,component_count=0,offset=0;uint64_t layout=s->vertex_layout;
    while(layout&&attribute_count<15){uint32_t size=(uint32_t)(layout&15U);VkFormat format=component_format(size);if(!format){ls_copy(s->error,sizeof(s->error),"Vulkan shader has an invalid vertex layout.");c->vkDestroyShaderModule(c->device,vs,0);c->vkDestroyShaderModule(c->device,fs,0);return 0;}attributes[attribute_count].location=attribute_count;attributes[attribute_count].binding=0;attributes[attribute_count].format=format;attributes[attribute_count].offset=offset;offset+=size*4;component_count+=size;attribute_count++;layout>>=4;}
    binding.binding=0;binding.stride=component_count*4;binding.inputRate=VK_VERTEX_INPUT_RATE_VERTEX;
    VkPipelineVertexInputStateCreateInfo vi;ls_zero(&vi, sizeof(vi));vi.sType=VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO;vi.vertexBindingDescriptionCount=attribute_count?1:0;vi.pVertexBindingDescriptions=attribute_count?&binding:0;vi.vertexAttributeDescriptionCount=attribute_count;vi.pVertexAttributeDescriptions=attribute_count?attributes:0;
    VkPipelineInputAssemblyStateCreateInfo ia;ls_zero(&ia, sizeof(ia));ia.sType=VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO;ia.topology=(s->pipeline_flags&2U)?VK_PRIMITIVE_TOPOLOGY_TRIANGLE_STRIP:VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST;
    VkPipelineViewportStateCreateInfo vp;ls_zero(&vp, sizeof(vp));vp.sType=VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO;vp.viewportCount=1;vp.scissorCount=1;
    VkPipelineRasterizationStateCreateInfo rs;ls_zero(&rs, sizeof(rs));rs.sType=VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO;rs.polygonMode=VK_POLYGON_MODE_FILL;rs.cullMode=VK_CULL_MODE_NONE;rs.frontFace=VK_FRONT_FACE_CLOCKWISE;rs.lineWidth=1.0f;
    VkPipelineMultisampleStateCreateInfo ms;ls_zero(&ms, sizeof(ms));ms.sType=VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO;ms.rasterizationSamples=VK_SAMPLE_COUNT_1_BIT;
    VkPipelineDepthStencilStateCreateInfo ds;ls_zero(&ds,sizeof(ds));ds.sType=VK_STRUCTURE_TYPE_PIPELINE_DEPTH_STENCIL_STATE_CREATE_INFO;ds.depthTestEnable=(s->pipeline_flags&1U)?0:1;ds.depthWriteEnable=(s->pipeline_flags&1U)?0:1;ds.depthCompareOp=VK_COMPARE_OP_LESS;ds.minDepthBounds=0.0f;ds.maxDepthBounds=1.0f;
    VkPipelineColorBlendAttachmentState att;ls_zero(&att, sizeof(att));att.blendEnable=1;att.srcColorBlendFactor=VK_BLEND_FACTOR_SRC_ALPHA;att.dstColorBlendFactor=VK_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA;att.colorBlendOp=VK_BLEND_OP_ADD;att.srcAlphaBlendFactor=VK_BLEND_FACTOR_ONE;att.dstAlphaBlendFactor=VK_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA;att.alphaBlendOp=VK_BLEND_OP_ADD;att.colorWriteMask=VK_COLOR_COMPONENT_R_BIT|VK_COLOR_COMPONENT_G_BIT|VK_COLOR_COMPONENT_B_BIT|VK_COLOR_COMPONENT_A_BIT;
    VkPipelineColorBlendStateCreateInfo cb;ls_zero(&cb, sizeof(cb));cb.sType=VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO;cb.attachmentCount=1;cb.pAttachments=&att;
    VkDynamicState states[]={VK_DYNAMIC_STATE_VIEWPORT,VK_DYNAMIC_STATE_SCISSOR};VkPipelineDynamicStateCreateInfo dyn;ls_zero(&dyn, sizeof(dyn));dyn.sType=VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO;dyn.dynamicStateCount=2;dyn.pDynamicStates=states;
    VkGraphicsPipelineCreateInfo info;ls_zero(&info, sizeof(info));info.sType=VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO;info.stageCount=2;info.pStages=stages;info.pVertexInputState=&vi;info.pInputAssemblyState=&ia;info.pViewportState=&vp;info.pRasterizationState=&rs;info.pMultisampleState=&ms;info.pDepthStencilState=&ds;info.pColorBlendState=&cb;info.pDynamicState=&dyn;info.layout=c->pipeline_layout;info.renderPass=c->render_pass;info.subpass=0;
    VkResult r=c->vkCreateGraphicsPipelines(c->device,0,1,&info,0,&s->pipeline);c->vkDestroyShaderModule(c->device,vs,0);c->vkDestroyShaderModule(c->device,fs,0);if(r!=VK_SUCCESS){ls_copy_result(s->error,sizeof(s->error),"Vulkan could not create the graphics pipeline: ",(int)r);return 0;}return 1;
}

static int recreate_swapchain(LSVKContext* c,uint32_t width,uint32_t height){
    if(!c||!c->device||width<1||height<1)return 0;
    c->vkDeviceWaitIdle(c->device);destroy_swapchain(c);
    if(!create_swapchain(c,width,height))return 0;
    for(LSVKShader* shader=c->shaders;shader;shader=shader->next){
        if(!shader->is_compute&&!build_pipeline(c,shader)){set_error(c,shader->error);return 0;}
    }
    c->needs_resize=0;return 1;
}

LSX_EXPORT void* LSX_CALL _lsxVKCreate(void* glfw_window,int width,int height){
    LSVKContext* c=(LSVKContext*)ls_alloc((1) * sizeof(LSVKContext));if(!c)return 0;c->window=(GLFWwindow*)glfw_window;c->vsync_enabled=1;c->present_mode=VK_PRESENT_MODE_FIFO_KHR;c->uniform_version=1;c->uniform_copy_bytes=16;c->uniform_last_slot[0]=-1;c->uniform_last_slot[1]=-1;c->resource_binding_version=1;
    c->ray_sun_direction[0]=-0.45f;c->ray_sun_direction[1]=-1.0f;c->ray_sun_direction[2]=-0.35f;
    c->ray_sun_color[0]=1.0f;c->ray_sun_color[1]=0.96f;c->ray_sun_color[2]=0.88f;c->ray_sun_intensity=1.0f;c->ray_ambient=0.08f;c->ray_scene_dirty=1;c->ray_topology_dirty=1;
    if(!load_loader(c)||!create_instance(c)||!select_device(c)||!create_device(c)||!create_swapchain(c,(uint32_t)width,(uint32_t)height)||!create_commands(c))return c;return c;
}
LSX_EXPORT int LSX_CALL _lsxVKReady(void* context){LSVKContext* c=(LSVKContext*)context;return c&&c->device&&c->swapchain&&c->render_pass?1:0;}
LSX_EXPORT const char* LSX_CALL _lsxVKError(void* context){LSVKContext* c=(LSVKContext*)context;return c&&c->error[0]?c->error:"Vulkan backend did not provide an error.";}
LSX_EXPORT const char* LSX_CALL _lsxVKDeviceName(void* context){LSVKContext* c=(LSVKContext*)context;return c&&c->device_name[0]?c->device_name:"Unknown Vulkan device";}
LSX_EXPORT int LSX_CALL _lsxVKSetVsync(void* context,int enabled){
    LSVKContext* c=(LSVKContext*)context;if(!c)return 0;
    int requested=enabled?1:0;if(c->vsync_enabled==requested)return 1;
    c->vsync_enabled=requested;
    if(c->device&&c->swapchain)c->needs_resize=1;
    lsx_trace_line(c,requested?"vsync.request.on":"vsync.request.off");
    return 1;
}
LSX_EXPORT int LSX_CALL _lsxVKVsyncEnabled(void* context){LSVKContext* c=(LSVKContext*)context;return c?c->vsync_enabled:0;}
LSX_EXPORT int LSX_CALL _lsxVKPresentMode(void* context){LSVKContext* c=(LSVKContext*)context;return c?(int)c->present_mode:-1;}
LSX_EXPORT int LSX_CALL _lsxVKRayQuerySupported(void* context){LSVKContext* c=(LSVKContext*)context;return c?c->ray_query:0;}
LSX_EXPORT int LSX_CALL _lsxVKRayPipelineSupported(void* context){LSVKContext* c=(LSVKContext*)context;return c?c->ray_pipeline:0;}
LSX_EXPORT int LSX_CALL _lsxVKEnableTrace(void* context,int enabled){
    LSVKContext* c=(LSVKContext*)context;if(!c)return 0;lsx_trace_close(c);c->trace_sequence=0;c->trace_present_count=0;c->trace_draw_count=0;if(!enabled)return 1;
    c->trace_file=CreateFileA("LazyScriptEX-Vulkan.log",GENERIC_WRITE_LSX,FILE_SHARE_READ_LSX,0,CREATE_ALWAYS_LSX,FILE_ATTRIBUTE_NORMAL_LSX,0);
    if(!c->trace_file||c->trace_file==INVALID_HANDLE_VALUE_LSX){c->trace_file=0;return 0;}c->trace_enabled=1;lsx_trace_line(c,"trace.enabled");return 1;
}
LSX_EXPORT void LSX_CALL _lsxVKTraceMarker(void* context,const char* marker){lsx_trace_line((LSVKContext*)context,marker);}

static void* lsx_vk_create_mesh_impl(void* context,const void* data,int byte_count,int stride,int vertex_count,int position_components){
    LSVKContext* c=(LSVKContext*)context;if(!c||!c->device||!data||byte_count<=0||stride<=0||vertex_count<=0)return 0;
    LSVKMesh* mesh=(LSVKMesh*)ls_alloc(sizeof(LSVKMesh));if(!mesh)return 0;
    mesh->count=(uint32_t)vertex_count;mesh->vertex_count=(uint32_t)vertex_count;mesh->stride=(uint32_t)stride;mesh->vertex_bytes=(uint32_t)byte_count;
    mesh->ray_compatible=(position_components==3&&stride>=12)?1:0;mesh->ray_visible=mesh->ray_compatible;
    lsx_identity_matrix(mesh->ray_transform);mesh->ray_albedo[0]=0.72f;mesh->ray_albedo[1]=0.74f;mesh->ray_albedo[2]=0.78f;mesh->ray_albedo[3]=1.0f;mesh->ray_roughness=0.55f;
    VkBufferCreateInfo bi;ls_zero(&bi,sizeof(bi));bi.sType=VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO;bi.size=(VkDeviceSize)byte_count;bi.usage=VK_BUFFER_USAGE_VERTEX_BUFFER_BIT;bi.sharingMode=VK_SHARING_MODE_EXCLUSIVE;
    if(c->vkCreateBuffer(c->device,&bi,0,&mesh->vertex_buffer)!=VK_SUCCESS){ls_copy(mesh->error,sizeof(mesh->error),"Vulkan could not create the vertex buffer.");return mesh;}
    VkMemoryRequirements requirements;ls_zero(&requirements,sizeof(requirements));c->vkGetBufferMemoryRequirements(c->device,mesh->vertex_buffer,&requirements);
    uint32_t memory_type=find_memory_type(c,requirements.memoryTypeBits,VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT|VK_MEMORY_PROPERTY_HOST_COHERENT_BIT);
    if(memory_type==UINT32_MAX){ls_copy(mesh->error,sizeof(mesh->error),"Vulkan could not find writable vertex-buffer memory.");return mesh;}
    VkMemoryAllocateInfo ai;ls_zero(&ai,sizeof(ai));ai.sType=VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;ai.allocationSize=requirements.size;ai.memoryTypeIndex=memory_type;
    if(c->vkAllocateMemory(c->device,&ai,0,&mesh->vertex_memory)!=VK_SUCCESS){ls_copy(mesh->error,sizeof(mesh->error),"Vulkan could not allocate vertex-buffer memory.");return mesh;}
    if(c->vkBindBufferMemory(c->device,mesh->vertex_buffer,mesh->vertex_memory,0)!=VK_SUCCESS){ls_copy(mesh->error,sizeof(mesh->error),"Vulkan could not bind the vertex-buffer memory.");return mesh;}
    if(c->vkMapMemory(c->device,mesh->vertex_memory,0,(VkDeviceSize)byte_count,0,&mesh->vertex_mapped)!=VK_SUCCESS||!mesh->vertex_mapped){ls_copy(mesh->error,sizeof(mesh->error),"Vulkan could not persistently map the vertex-buffer memory.");return mesh;}
    ls_copy_bytes(mesh->vertex_mapped,data,(size_t)byte_count);
    if(mesh->ray_compatible){mesh->cpu_vertices=ls_alloc((size_t)byte_count);if(!mesh->cpu_vertices){ls_copy(mesh->error,sizeof(mesh->error),"Vulkan could not keep the mesh geometry for the shared ray scene.");return mesh;}ls_copy_bytes(mesh->cpu_vertices,data,(size_t)byte_count);}
    mesh->next=c->meshes;c->meshes=mesh;c->ray_scene_dirty=1;c->ray_topology_dirty=1;return mesh;
}
/* Keep the original mesh ABI for already-built 0.20.4 executables. New
   compilers call the Ex form to provide the first position attribute shape. */
LSX_EXPORT void* LSX_CALL _lsxVKCreateMesh(void* context,const void* data,int byte_count,int stride,int vertex_count){return lsx_vk_create_mesh_impl(context,data,byte_count,stride,vertex_count,0);}
LSX_EXPORT void* LSX_CALL _lsxVKCreateMeshEx(void* context,const void* data,int byte_count,int stride,int vertex_count,int position_components){return lsx_vk_create_mesh_impl(context,data,byte_count,stride,vertex_count,position_components);}
static void* lsx_vk_create_indexed_mesh_impl(void* context,const void* vertices,int vertex_bytes,int stride,int vertex_count,const void* indices,int index_bytes,int index_count,int position_components){
    LSVKContext* c=(LSVKContext*)context;if(!c||!vertices||!indices||vertex_bytes<=0||index_bytes<=0||index_count<=0)return 0;
    LSVKMesh* mesh=(LSVKMesh*)lsx_vk_create_mesh_impl(context,vertices,vertex_bytes,stride,vertex_count,position_components);if(!mesh||!mesh->vertex_buffer)return mesh;mesh->indexed=1;mesh->count=(uint32_t)index_count;mesh->index_count=(uint32_t)index_count;
    VkBufferCreateInfo bi;ls_zero(&bi,sizeof(bi));bi.sType=VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO;bi.size=(VkDeviceSize)index_bytes;bi.usage=VK_BUFFER_USAGE_INDEX_BUFFER_BIT;bi.sharingMode=VK_SHARING_MODE_EXCLUSIVE;
    if(c->vkCreateBuffer(c->device,&bi,0,&mesh->index_buffer)!=VK_SUCCESS){ls_copy(mesh->error,sizeof(mesh->error),"Vulkan could not create the index buffer.");return mesh;}
    VkMemoryRequirements req;ls_zero(&req,sizeof(req));c->vkGetBufferMemoryRequirements(c->device,mesh->index_buffer,&req);uint32_t mt=find_memory_type(c,req.memoryTypeBits,VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT|VK_MEMORY_PROPERTY_HOST_COHERENT_BIT);if(mt==UINT32_MAX){ls_copy(mesh->error,sizeof(mesh->error),"Vulkan could not find writable index-buffer memory.");return mesh;}
    VkMemoryAllocateInfo ai;ls_zero(&ai,sizeof(ai));ai.sType=VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;ai.allocationSize=req.size;ai.memoryTypeIndex=mt;if(c->vkAllocateMemory(c->device,&ai,0,&mesh->index_memory)!=VK_SUCCESS||c->vkBindBufferMemory(c->device,mesh->index_buffer,mesh->index_memory,0)!=VK_SUCCESS){ls_copy(mesh->error,sizeof(mesh->error),"Vulkan could not allocate the index buffer.");return mesh;}
    void* mapped=0;if(c->vkMapMemory(c->device,mesh->index_memory,0,(VkDeviceSize)index_bytes,0,&mapped)!=VK_SUCCESS||!mapped){ls_copy(mesh->error,sizeof(mesh->error),"Vulkan could not map the index buffer.");return mesh;}ls_copy_bytes(mapped,indices,(size_t)index_bytes);c->vkUnmapMemory(c->device,mesh->index_memory);
    if(mesh->ray_compatible){mesh->cpu_indices=(uint32_t*)ls_alloc((size_t)index_bytes);if(!mesh->cpu_indices){ls_copy(mesh->error,sizeof(mesh->error),"Vulkan could not keep the mesh indices for the shared ray scene.");return mesh;}ls_copy_bytes(mesh->cpu_indices,indices,(size_t)index_bytes);c->ray_scene_dirty=1;c->ray_topology_dirty=1;}return mesh;
}
LSX_EXPORT void* LSX_CALL _lsxVKCreateIndexedMesh(void* context,const void* vertices,int vertex_bytes,int stride,int vertex_count,const void* indices,int index_bytes,int index_count){return lsx_vk_create_indexed_mesh_impl(context,vertices,vertex_bytes,stride,vertex_count,indices,index_bytes,index_count,0);}
LSX_EXPORT void* LSX_CALL _lsxVKCreateIndexedMeshEx(void* context,const void* vertices,int vertex_bytes,int stride,int vertex_count,const void* indices,int index_bytes,int index_count,int position_components){return lsx_vk_create_indexed_mesh_impl(context,vertices,vertex_bytes,stride,vertex_count,indices,index_bytes,index_count,position_components);}
LSX_EXPORT int LSX_CALL _lsxVKMeshReady(void* value){LSVKMesh* mesh=(LSVKMesh*)value;return mesh&&mesh->vertex_buffer&&mesh->vertex_memory&&mesh->count&&(!mesh->indexed||(mesh->index_buffer&&mesh->index_memory))?1:0;}
static int lsx_wait_mesh_write_safe(LSVKContext* c){
    if(!c||!c->device||!c->vkWaitForFences)return 0;
    /* The current frame fence was already waited before command recording. If a
       frame is open, only the opposite slot can still be reading this shared
       dynamic mesh. Outside a frame, wait for both slots without draining every
       unrelated Vulkan queue through vkDeviceWaitIdle. */
    if(c->frame_open){uint32_t other=(c->frame+1U)%2U;return c->vkWaitForFences(c->device,1,&c->in_flight[other],1,UINT64_MAX)==VK_SUCCESS;}
    return c->vkWaitForFences(c->device,2,c->in_flight,1,UINT64_MAX)==VK_SUCCESS;
}
LSX_EXPORT int LSX_CALL _lsxVKUpdateMesh(void* context,void* value,const void* data,int byte_count){
    LSVKContext* c=(LSVKContext*)context;LSVKMesh* mesh=(LSVKMesh*)value;if(!c||!mesh||!data||!mesh->vertex_mapped||byte_count<1||(uint32_t)byte_count>mesh->vertex_bytes)return 0;
    if(!lsx_wait_mesh_write_safe(c))return 0;ls_copy_bytes(mesh->vertex_mapped,data,(size_t)byte_count);
    if(mesh->ray_compatible&&mesh->cpu_vertices){ls_copy_bytes(mesh->cpu_vertices,data,(size_t)byte_count);c->ray_scene_dirty=1;}return 1;
}
LSX_EXPORT const char* LSX_CALL _lsxVKMeshError(void* value){LSVKMesh* mesh=(LSVKMesh*)value;return mesh&&mesh->error[0]?mesh->error:"The Vulkan mesh was not created.";}
LSX_EXPORT int LSX_CALL _lsxVKSetMeshRayVisible(void* context,void* value,int visible){LSVKContext* c=(LSVKContext*)context;LSVKMesh* mesh=(LSVKMesh*)value;if(!c||!mesh)return 0;int next=(visible&&mesh->ray_compatible)?1:0;if(mesh->ray_visible!=next){mesh->ray_visible=next;c->ray_scene_dirty=1;c->ray_topology_dirty=1;}return mesh->ray_visible;}
LSX_EXPORT int LSX_CALL _lsxVKSetMeshRayTransform(void* context,void* value,const float* matrix){LSVKContext* c=(LSVKContext*)context;LSVKMesh* mesh=(LSVKMesh*)value;if(!c||!mesh||!matrix)return 0;if(!lsx_float_bytes_equal(mesh->ray_transform,matrix,16)){ls_copy_bytes(mesh->ray_transform,matrix,64);c->ray_scene_dirty=1;}return 1;}
LSX_EXPORT int LSX_CALL _lsxVKSetMeshRayMaterial(void* context,void* value,float r,float g,float b,float a,float roughness,float metallic,float emissive){LSVKContext* c=(LSVKContext*)context;LSVKMesh* mesh=(LSVKMesh*)value;if(!c||!mesh)return 0;mesh->ray_albedo[0]=r;mesh->ray_albedo[1]=g;mesh->ray_albedo[2]=b;mesh->ray_albedo[3]=a;mesh->ray_roughness=roughness;mesh->ray_metallic=metallic;mesh->ray_emissive=emissive;c->ray_scene_dirty=1;return 1;}
LSX_EXPORT void LSX_CALL _lsxVKDrawMesh(void* context,void* value,int instances){
    LSVKContext* c=(LSVKContext*)context;LSVKMesh* mesh=(LSVKMesh*)value;if(!c||!c->frame_open||!c->bound_shader||!c->bound_shader->pipeline||!mesh||!mesh->vertex_buffer)return;
    /* Model transforms are captured for every graphics shader, not only the
       shader that consumes ray results. This keeps occluders/reflection meshes
       current when an engine uses separate depth, material, or UI passes. */
    if(mesh->ray_compatible&&c->bound_shader->model_offset>=0&&c->bound_shader->model_offset+64<=1024)_lsxVKSetMeshRayTransform(c,mesh,(const float*)(c->uniform_shadow+c->bound_shader->model_offset));
    if(c->bound_shader->ray_flags){if(!lsx_ray_ensure_scene(c))return;lsx_set_bound_storage(c,7,c->ray_scene_storage);}
    if(!lsx_bind_draw_resources(c))return;VkDeviceSize offset=0;c->vkCmdBindVertexBuffers(c->command_buffers[c->frame],0,1,&mesh->vertex_buffer,&offset);if(mesh->indexed){c->vkCmdBindIndexBuffer(c->command_buffers[c->frame],mesh->index_buffer,0,VK_INDEX_TYPE_UINT32);c->vkCmdDrawIndexed(c->command_buffers[c->frame],mesh->count,(uint32_t)(instances>0?instances:1),0,0,0);}else c->vkCmdDraw(c->command_buffers[c->frame],mesh->count,(uint32_t)(instances>0?instances:1),0,0);
}
LSX_EXPORT void LSX_CALL _lsxVKDestroyMesh(void* context,void* value){
    LSVKContext* c=(LSVKContext*)context;LSVKMesh* mesh=(LSVKMesh*)value;if(!mesh)return;
    if(c){LSVKMesh** link=&c->meshes;while(*link&&*link!=mesh)link=&(*link)->next;if(*link==mesh)*link=mesh->next;c->ray_scene_dirty=1;c->ray_topology_dirty=1;}
    if(c&&c->device){if(mesh->index_buffer)c->vkDestroyBuffer(c->device,mesh->index_buffer,0);if(mesh->index_memory)c->vkFreeMemory(c->device,mesh->index_memory,0);if(mesh->vertex_mapped&&mesh->vertex_memory)c->vkUnmapMemory(c->device,mesh->vertex_memory);if(mesh->vertex_buffer)c->vkDestroyBuffer(c->device,mesh->vertex_buffer,0);if(mesh->vertex_memory)c->vkFreeMemory(c->device,mesh->vertex_memory,0);}ls_free(mesh->cpu_vertices);ls_free(mesh->cpu_indices);ls_free(mesh);
}

static int lsx_create_buffer(LSVKContext* c,VkDeviceSize size,VkBufferUsageFlags usage,VkMemoryPropertyFlags properties,VkBuffer* buffer,VkDeviceMemory* memory){VkBufferCreateInfo bi;ls_zero(&bi,sizeof(bi));bi.sType=VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO;bi.size=size;bi.usage=usage;bi.sharingMode=VK_SHARING_MODE_EXCLUSIVE;if(c->vkCreateBuffer(c->device,&bi,0,buffer)!=VK_SUCCESS)return 0;VkMemoryRequirements r;ls_zero(&r,sizeof(r));c->vkGetBufferMemoryRequirements(c->device,*buffer,&r);uint32_t mt=find_memory_type(c,r.memoryTypeBits,properties);if(mt==UINT32_MAX)return 0;VkMemoryAllocateInfo ai;ls_zero(&ai,sizeof(ai));ai.sType=VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;ai.allocationSize=r.size;ai.memoryTypeIndex=mt;if(c->vkAllocateMemory(c->device,&ai,0,memory)!=VK_SUCCESS)return 0;return c->vkBindBufferMemory(c->device,*buffer,*memory,0)==VK_SUCCESS;}
static int lsx_upload_begin(LSVKContext* c){c->vkResetCommandBuffer(c->upload_command,0);VkCommandBufferBeginInfo bi;ls_zero(&bi,sizeof(bi));bi.sType=VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;bi.flags=VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;return c->vkBeginCommandBuffer(c->upload_command,&bi)==VK_SUCCESS;}
static int lsx_upload_end(LSVKContext* c){if(c->vkEndCommandBuffer(c->upload_command)!=VK_SUCCESS)return 0;VkSubmitInfo si;ls_zero(&si,sizeof(si));si.sType=VK_STRUCTURE_TYPE_SUBMIT_INFO;si.commandBufferCount=1;si.pCommandBuffers=&c->upload_command;if(c->vkQueueSubmit(c->graphics_queue,1,&si,0)!=VK_SUCCESS)return 0;return c->vkQueueWaitIdle(c->graphics_queue)==VK_SUCCESS;}
static void lsx_transition_image(LSVKContext* c,VkCommandBuffer cmd,VkImage image,VkImageLayout oldLayout,VkImageLayout newLayout){VkImageMemoryBarrier b;ls_zero(&b,sizeof(b));b.sType=VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER;b.oldLayout=oldLayout;b.newLayout=newLayout;b.srcQueueFamilyIndex=VK_QUEUE_FAMILY_IGNORED;b.dstQueueFamilyIndex=VK_QUEUE_FAMILY_IGNORED;b.image=image;b.subresourceRange.aspectMask=VK_IMAGE_ASPECT_COLOR_BIT;b.subresourceRange.levelCount=1;b.subresourceRange.layerCount=1;VkPipelineStageFlags src=VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT,dst=VK_PIPELINE_STAGE_TRANSFER_BIT;if(oldLayout==VK_IMAGE_LAYOUT_UNDEFINED&&newLayout==VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL){b.srcAccessMask=0;b.dstAccessMask=VK_ACCESS_TRANSFER_WRITE_BIT;}else{b.srcAccessMask=VK_ACCESS_TRANSFER_WRITE_BIT;b.dstAccessMask=VK_ACCESS_SHADER_READ_BIT;src=VK_PIPELINE_STAGE_TRANSFER_BIT;dst=VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT;}c->vkCmdPipelineBarrier(cmd,src,dst,0,0,0,0,0,1,&b);}
LSX_EXPORT void* LSX_CALL _lsxVKCreateTexture(void* context,int width,int height,const void* pixels,int bytes,int linear){LSVKContext* c=(LSVKContext*)context;if(!c||!c->device||width<1||height<1||!pixels||bytes<width*height*4)return 0;LSVKTexture* t=(LSVKTexture*)ls_alloc(sizeof(LSVKTexture));if(!t)return 0;t->width=(uint32_t)width;t->height=(uint32_t)height;VkBuffer staging=0;VkDeviceMemory sm=0;if(!lsx_create_buffer(c,(VkDeviceSize)bytes,VK_BUFFER_USAGE_TRANSFER_SRC_BIT,VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT|VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,&staging,&sm)){ls_copy(t->error,sizeof(t->error),"Vulkan could not create the texture upload buffer.");return t;}void* mapped=0;if(c->vkMapMemory(c->device,sm,0,(VkDeviceSize)bytes,0,&mapped)!=VK_SUCCESS||!mapped){ls_copy(t->error,sizeof(t->error),"Vulkan could not map the texture upload buffer.");return t;}ls_copy_bytes(mapped,pixels,(size_t)bytes);c->vkUnmapMemory(c->device,sm);VkImageCreateInfo ii;ls_zero(&ii,sizeof(ii));ii.sType=VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO;ii.imageType=VK_IMAGE_TYPE_2D;ii.format=VK_FORMAT_R8G8B8A8_UNORM;ii.extent.width=(uint32_t)width;ii.extent.height=(uint32_t)height;ii.extent.depth=1;ii.mipLevels=1;ii.arrayLayers=1;ii.samples=VK_SAMPLE_COUNT_1_BIT;ii.tiling=VK_IMAGE_TILING_OPTIMAL;ii.usage=VK_IMAGE_USAGE_TRANSFER_DST_BIT|VK_IMAGE_USAGE_SAMPLED_BIT;ii.sharingMode=VK_SHARING_MODE_EXCLUSIVE;ii.initialLayout=VK_IMAGE_LAYOUT_UNDEFINED;if(c->vkCreateImage(c->device,&ii,0,&t->image)!=VK_SUCCESS){ls_copy(t->error,sizeof(t->error),"Vulkan could not create the texture image.");return t;}VkMemoryRequirements req;ls_zero(&req,sizeof(req));c->vkGetImageMemoryRequirements(c->device,t->image,&req);uint32_t mt=find_memory_type(c,req.memoryTypeBits,VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT);VkMemoryAllocateInfo ai;ls_zero(&ai,sizeof(ai));ai.sType=VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;ai.allocationSize=req.size;ai.memoryTypeIndex=mt;if(mt==UINT32_MAX||c->vkAllocateMemory(c->device,&ai,0,&t->memory)!=VK_SUCCESS||c->vkBindImageMemory(c->device,t->image,t->memory,0)!=VK_SUCCESS){ls_copy(t->error,sizeof(t->error),"Vulkan could not allocate texture memory.");return t;}if(!lsx_upload_begin(c)){ls_copy(t->error,sizeof(t->error),"Vulkan could not begin the texture upload.");return t;}lsx_transition_image(c,c->upload_command,t->image,VK_IMAGE_LAYOUT_UNDEFINED,VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL);VkBufferImageCopy region;ls_zero(&region,sizeof(region));region.imageSubresource.aspectMask=VK_IMAGE_ASPECT_COLOR_BIT;region.imageSubresource.layerCount=1;region.imageExtent.width=(uint32_t)width;region.imageExtent.height=(uint32_t)height;region.imageExtent.depth=1;c->vkCmdCopyBufferToImage(c->upload_command,staging,t->image,VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,1,&region);lsx_transition_image(c,c->upload_command,t->image,VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL);if(!lsx_upload_end(c)){ls_copy(t->error,sizeof(t->error),"Vulkan could not finish the texture upload.");return t;}c->vkDestroyBuffer(c->device,staging,0);c->vkFreeMemory(c->device,sm,0);VkImageViewCreateInfo vi;ls_zero(&vi,sizeof(vi));vi.sType=VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO;vi.image=t->image;vi.viewType=VK_IMAGE_VIEW_TYPE_2D;vi.format=VK_FORMAT_R8G8B8A8_UNORM;vi.subresourceRange.aspectMask=VK_IMAGE_ASPECT_COLOR_BIT;vi.subresourceRange.levelCount=1;vi.subresourceRange.layerCount=1;if(c->vkCreateImageView(c->device,&vi,0,&t->view)!=VK_SUCCESS){ls_copy(t->error,sizeof(t->error),"Vulkan could not create the texture view.");return t;}VkSamplerCreateInfo si;ls_zero(&si,sizeof(si));si.sType=VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO;si.magFilter=linear?VK_FILTER_LINEAR:VK_FILTER_NEAREST;si.minFilter=linear?VK_FILTER_LINEAR:VK_FILTER_NEAREST;si.mipmapMode=VK_SAMPLER_MIPMAP_MODE_LINEAR;si.addressModeU=VK_SAMPLER_ADDRESS_MODE_REPEAT;si.addressModeV=VK_SAMPLER_ADDRESS_MODE_REPEAT;si.addressModeW=VK_SAMPLER_ADDRESS_MODE_REPEAT;si.maxLod=1.0f;si.borderColor=VK_BORDER_COLOR_INT_OPAQUE_BLACK;if(c->vkCreateSampler(c->device,&si,0,&t->sampler)!=VK_SUCCESS){ls_copy(t->error,sizeof(t->error),"Vulkan could not create the texture sampler.");return t;}return t;}
LSX_EXPORT int LSX_CALL _lsxVKTextureReady(void* value){LSVKTexture* t=(LSVKTexture*)value;return t&&t->image&&t->memory&&t->view&&t->sampler?1:0;}
LSX_EXPORT const char* LSX_CALL _lsxVKTextureError(void* value){LSVKTexture* t=(LSVKTexture*)value;return t&&t->error[0]?t->error:"The Vulkan texture was not created.";}
LSX_EXPORT void LSX_CALL _lsxVKBindTexture(void* context,void* value,int unit){LSVKContext* c=(LSVKContext*)context;LSVKTexture* t=(LSVKTexture*)value;if(!c||!t||unit<0||unit>=8)return;lsx_set_bound_texture(c,(uint32_t)unit,t);}
LSX_EXPORT void LSX_CALL _lsxVKDestroyTexture(void* context,void* value){LSVKContext* c=(LSVKContext*)context;LSVKTexture* t=(LSVKTexture*)value;if(!t)return;if(c&&c->device){c->vkDeviceWaitIdle(c->device);for(int i=0;i<8;++i)if(c->bound_textures[i]==t)lsx_set_bound_texture(c,(uint32_t)i,0);lsx_reset_resource_cache(c);if(t->sampler)c->vkDestroySampler(c->device,t->sampler,0);if(t->view)c->vkDestroyImageView(c->device,t->view,0);if(t->image)c->vkDestroyImage(c->device,t->image,0);if(t->memory)c->vkFreeMemory(c->device,t->memory,0);}ls_free(t);}

LSX_EXPORT void* LSX_CALL _lsxVKCreateFramebuffer(void* context,int width,int height){
    LSVKContext* c=(LSVKContext*)context;if(!c||!c->device||width<1||height<1)return 0;LSVKFramebuffer* f=(LSVKFramebuffer*)ls_alloc(sizeof(LSVKFramebuffer));if(!f)return 0;f->width=(uint32_t)width;f->height=(uint32_t)height;
    VkImageCreateInfo color;ls_zero(&color,sizeof(color));color.sType=VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO;color.imageType=VK_IMAGE_TYPE_2D;color.format=c->swapchain_format;color.extent.width=f->width;color.extent.height=f->height;color.extent.depth=1;color.mipLevels=1;color.arrayLayers=1;color.samples=VK_SAMPLE_COUNT_1_BIT;color.tiling=VK_IMAGE_TILING_OPTIMAL;color.usage=VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT|VK_IMAGE_USAGE_TRANSFER_SRC_BIT;color.sharingMode=VK_SHARING_MODE_EXCLUSIVE;color.initialLayout=VK_IMAGE_LAYOUT_UNDEFINED;
    if(c->vkCreateImage(c->device,&color,0,&f->color_image)!=VK_SUCCESS){ls_copy(f->error,sizeof(f->error),"Vulkan could not create the framebuffer color image.");return f;}
    VkMemoryRequirements req;ls_zero(&req,sizeof(req));c->vkGetImageMemoryRequirements(c->device,f->color_image,&req);uint32_t mt=find_memory_type(c,req.memoryTypeBits,VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT);VkMemoryAllocateInfo ai;ls_zero(&ai,sizeof(ai));ai.sType=VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;ai.allocationSize=req.size;ai.memoryTypeIndex=mt;if(mt==UINT32_MAX||c->vkAllocateMemory(c->device,&ai,0,&f->color_memory)!=VK_SUCCESS||c->vkBindImageMemory(c->device,f->color_image,f->color_memory,0)!=VK_SUCCESS){ls_copy(f->error,sizeof(f->error),"Vulkan could not allocate framebuffer color memory.");return f;}
    VkImageViewCreateInfo vi;ls_zero(&vi,sizeof(vi));vi.sType=VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO;vi.image=f->color_image;vi.viewType=VK_IMAGE_VIEW_TYPE_2D;vi.format=c->swapchain_format;vi.subresourceRange.aspectMask=VK_IMAGE_ASPECT_COLOR_BIT;vi.subresourceRange.levelCount=1;vi.subresourceRange.layerCount=1;if(c->vkCreateImageView(c->device,&vi,0,&f->color_view)!=VK_SUCCESS){ls_copy(f->error,sizeof(f->error),"Vulkan could not create the framebuffer color view.");return f;}
    VkImageCreateInfo depth;ls_zero(&depth,sizeof(depth));depth.sType=VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO;depth.imageType=VK_IMAGE_TYPE_2D;depth.format=VK_FORMAT_D32_SFLOAT;depth.extent.width=f->width;depth.extent.height=f->height;depth.extent.depth=1;depth.mipLevels=1;depth.arrayLayers=1;depth.samples=VK_SAMPLE_COUNT_1_BIT;depth.tiling=VK_IMAGE_TILING_OPTIMAL;depth.usage=VK_IMAGE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT;depth.sharingMode=VK_SHARING_MODE_EXCLUSIVE;depth.initialLayout=VK_IMAGE_LAYOUT_UNDEFINED;
    if(c->vkCreateImage(c->device,&depth,0,&f->depth_image)!=VK_SUCCESS){ls_copy(f->error,sizeof(f->error),"Vulkan could not create the framebuffer depth image.");return f;}
    ls_zero(&req,sizeof(req));c->vkGetImageMemoryRequirements(c->device,f->depth_image,&req);mt=find_memory_type(c,req.memoryTypeBits,VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT);ls_zero(&ai,sizeof(ai));ai.sType=VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO;ai.allocationSize=req.size;ai.memoryTypeIndex=mt;if(mt==UINT32_MAX||c->vkAllocateMemory(c->device,&ai,0,&f->depth_memory)!=VK_SUCCESS||c->vkBindImageMemory(c->device,f->depth_image,f->depth_memory,0)!=VK_SUCCESS){ls_copy(f->error,sizeof(f->error),"Vulkan could not allocate framebuffer depth memory.");return f;}
    ls_zero(&vi,sizeof(vi));vi.sType=VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO;vi.image=f->depth_image;vi.viewType=VK_IMAGE_VIEW_TYPE_2D;vi.format=VK_FORMAT_D32_SFLOAT;vi.subresourceRange.aspectMask=VK_IMAGE_ASPECT_DEPTH_BIT;vi.subresourceRange.levelCount=1;vi.subresourceRange.layerCount=1;if(c->vkCreateImageView(c->device,&vi,0,&f->depth_view)!=VK_SUCCESS){ls_copy(f->error,sizeof(f->error),"Vulkan could not create the framebuffer depth view.");return f;}
    VkAttachmentDescription attachments[2];ls_zero(attachments,sizeof(attachments));attachments[0].format=c->swapchain_format;attachments[0].samples=VK_SAMPLE_COUNT_1_BIT;attachments[0].loadOp=VK_ATTACHMENT_LOAD_OP_CLEAR;attachments[0].storeOp=VK_ATTACHMENT_STORE_OP_STORE;attachments[0].stencilLoadOp=VK_ATTACHMENT_LOAD_OP_DONT_CARE;attachments[0].stencilStoreOp=VK_ATTACHMENT_STORE_OP_DONT_CARE;attachments[0].initialLayout=VK_IMAGE_LAYOUT_UNDEFINED;attachments[0].finalLayout=VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL;attachments[1].format=VK_FORMAT_D32_SFLOAT;attachments[1].samples=VK_SAMPLE_COUNT_1_BIT;attachments[1].loadOp=VK_ATTACHMENT_LOAD_OP_CLEAR;attachments[1].storeOp=VK_ATTACHMENT_STORE_OP_DONT_CARE;attachments[1].stencilLoadOp=VK_ATTACHMENT_LOAD_OP_DONT_CARE;attachments[1].stencilStoreOp=VK_ATTACHMENT_STORE_OP_DONT_CARE;attachments[1].initialLayout=VK_IMAGE_LAYOUT_UNDEFINED;attachments[1].finalLayout=VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL;
    VkAttachmentReference color_ref;color_ref.attachment=0;color_ref.layout=VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL;VkAttachmentReference depth_ref;depth_ref.attachment=1;depth_ref.layout=VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL;VkSubpassDescription sub;ls_zero(&sub,sizeof(sub));sub.pipelineBindPoint=VK_PIPELINE_BIND_POINT_GRAPHICS;sub.colorAttachmentCount=1;sub.pColorAttachments=&color_ref;sub.pDepthStencilAttachment=&depth_ref;VkSubpassDependency dep;ls_zero(&dep,sizeof(dep));dep.srcSubpass=VK_SUBPASS_EXTERNAL;dep.dstSubpass=0;dep.srcStageMask=VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT|VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT;dep.dstStageMask=VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT|VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT;dep.dstAccessMask=VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT|VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT;VkRenderPassCreateInfo rp;ls_zero(&rp,sizeof(rp));rp.sType=VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO;rp.attachmentCount=2;rp.pAttachments=attachments;rp.subpassCount=1;rp.pSubpasses=&sub;rp.dependencyCount=1;rp.pDependencies=&dep;if(c->vkCreateRenderPass(c->device,&rp,0,&f->render_pass)!=VK_SUCCESS){ls_copy(f->error,sizeof(f->error),"Vulkan could not create the framebuffer render pass.");return f;}
    VkImageView views[2]={f->color_view,f->depth_view};VkFramebufferCreateInfo fi;ls_zero(&fi,sizeof(fi));fi.sType=VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO;fi.renderPass=f->render_pass;fi.attachmentCount=2;fi.pAttachments=views;fi.width=f->width;fi.height=f->height;fi.layers=1;if(c->vkCreateFramebuffer(c->device,&fi,0,&f->framebuffer)!=VK_SUCCESS){ls_copy(f->error,sizeof(f->error),"Vulkan could not create the framebuffer.");return f;}return f;
}
LSX_EXPORT int LSX_CALL _lsxVKFramebufferReady(void* value){LSVKFramebuffer* f=(LSVKFramebuffer*)value;return f&&f->color_image&&f->color_memory&&f->color_view&&f->depth_image&&f->depth_memory&&f->depth_view&&f->render_pass&&f->framebuffer?1:0;}
LSX_EXPORT const char* LSX_CALL _lsxVKFramebufferError(void* value){LSVKFramebuffer* f=(LSVKFramebuffer*)value;return f&&f->error[0]?f->error:"The Vulkan framebuffer was not created.";}
LSX_EXPORT void LSX_CALL _lsxVKDestroyFramebuffer(void* context,void* value){LSVKContext* c=(LSVKContext*)context;LSVKFramebuffer* f=(LSVKFramebuffer*)value;if(!f)return;if(c&&c->device){if(c->vkDeviceWaitIdle)c->vkDeviceWaitIdle(c->device);if(f->framebuffer)c->vkDestroyFramebuffer(c->device,f->framebuffer,0);if(f->render_pass)c->vkDestroyRenderPass(c->device,f->render_pass,0);if(f->depth_view)c->vkDestroyImageView(c->device,f->depth_view,0);if(f->depth_image)c->vkDestroyImage(c->device,f->depth_image,0);if(f->depth_memory)c->vkFreeMemory(c->device,f->depth_memory,0);if(f->color_view)c->vkDestroyImageView(c->device,f->color_view,0);if(f->color_image)c->vkDestroyImage(c->device,f->color_image,0);if(f->color_memory)c->vkFreeMemory(c->device,f->color_memory,0);}ls_free(f);}

LSX_EXPORT void* LSX_CALL _lsxVKCreateStorage(void* context,const void* data,int bytes,int binding){
    LSVKContext* c=(LSVKContext*)context;if(!c||!c->device||bytes<1||binding<0||binding>=8)return 0;
    LSVKStorage* storage=(LSVKStorage*)ls_alloc(sizeof(LSVKStorage));if(!storage)return 0;storage->bytes=(uint32_t)bytes;storage->binding=(uint32_t)binding;
    for(uint32_t frame=0;frame<2;++frame){
        if(!lsx_create_buffer(c,(VkDeviceSize)bytes,VK_BUFFER_USAGE_STORAGE_BUFFER_BIT,VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT|VK_MEMORY_PROPERTY_HOST_COHERENT_BIT,&storage->buffers[frame],&storage->memories[frame])){ls_copy(storage->error,sizeof(storage->error),"Vulkan could not create the frame-safe storage buffer.");return storage;}
        if(c->vkMapMemory(c->device,storage->memories[frame],0,(VkDeviceSize)bytes,0,&storage->mapped[frame])!=VK_SUCCESS||!storage->mapped[frame]){ls_copy(storage->error,sizeof(storage->error),"Vulkan could not persistently map the frame-safe storage buffer.");return storage;}
        if(data)ls_copy_bytes(storage->mapped[frame],data,(size_t)bytes);else ls_zero(storage->mapped[frame],(size_t)bytes);
    }
    lsx_set_bound_storage(c,(uint32_t)binding,storage);return storage;
}
LSX_EXPORT int LSX_CALL _lsxVKStorageReady(void* value){LSVKStorage* storage=(LSVKStorage*)value;return storage&&storage->buffers[0]&&storage->memories[0]&&storage->mapped[0]&&storage->buffers[1]&&storage->memories[1]&&storage->mapped[1]&&storage->bytes?1:0;}
LSX_EXPORT const char* LSX_CALL _lsxVKStorageError(void* value){LSVKStorage* storage=(LSVKStorage*)value;return storage&&storage->error[0]?storage->error:"The Vulkan storage buffer was not created.";}
LSX_EXPORT void LSX_CALL _lsxVKBindStorage(void* context,void* value,int binding){LSVKContext* c=(LSVKContext*)context;LSVKStorage* storage=(LSVKStorage*)value;if(!c||!storage||binding<0||binding>=8)return;storage->binding=(uint32_t)binding;lsx_set_bound_storage(c,(uint32_t)binding,storage);}
LSX_EXPORT int LSX_CALL _lsxVKUpdateStorage(void* context,void* value,const void* data,int bytes){
    LSVKContext* c=(LSVKContext*)context;LSVKStorage* storage=(LSVKStorage*)value;if(!c||!storage||!data||bytes<1||(uint32_t)bytes>storage->bytes)return 0;
    uint32_t first=0,last=2;if(c->frame_open){first=c->frame;last=first+1;}
    for(uint32_t frame=first;frame<last;++frame){if(!storage->mapped[frame])return 0;ls_copy_bytes(storage->mapped[frame],data,(size_t)bytes);}
    return 1;
}
LSX_EXPORT int LSX_CALL _lsxVKReadStorage(void* context,void* value,void* output,int bytes){LSVKContext* c=(LSVKContext*)context;LSVKStorage* storage=(LSVKStorage*)value;if(!c||!storage||!output||bytes<1||(uint32_t)bytes>storage->bytes)return 0;uint32_t frame=c->frame;if(c->vkDeviceWaitIdle)c->vkDeviceWaitIdle(c->device);if(!storage->mapped[frame])return 0;ls_copy_bytes(output,storage->mapped[frame],(size_t)bytes);return 1;}
LSX_EXPORT void LSX_CALL _lsxVKDestroyStorage(void* context,void* value){LSVKContext* c=(LSVKContext*)context;LSVKStorage* storage=(LSVKStorage*)value;if(!storage)return;if(c&&c->device){if(c->vkDeviceWaitIdle)c->vkDeviceWaitIdle(c->device);for(int i=0;i<8;++i)if(c->bound_storage[i]==storage)lsx_set_bound_storage(c,(uint32_t)i,0);lsx_reset_resource_cache(c);for(uint32_t frame=0;frame<2;++frame){if(storage->mapped[frame]&&storage->memories[frame]){c->vkUnmapMemory(c->device,storage->memories[frame]);storage->mapped[frame]=0;}if(storage->buffers[frame])c->vkDestroyBuffer(c->device,storage->buffers[frame],0);if(storage->memories[frame])c->vkFreeMemory(c->device,storage->memories[frame],0);}}ls_free(storage);}


static uint32_t lsx_ray_next_capacity(uint32_t bytes){uint32_t capacity=4096;while(capacity<bytes&&capacity<0x40000000U)capacity*=2U;return capacity<bytes?bytes:capacity;}
static void lsx_ray_write_vec4(float* data,uint32_t index,float x,float y,float z,float w){float* out=data+index*4U;out[0]=x;out[1]=y;out[2]=z;out[3]=w;}

typedef struct LSRayTriangleCPU {
    float values[20];
    float minimum[3];
    float maximum[3];
    float centroid[3];
} LSRayTriangleCPU;

typedef struct LSRayBVHNodeCPU {
    float minimum[3];
    float maximum[3];
    int32_t first_or_left;
    int32_t count_or_right;
} LSRayBVHNodeCPU;

static float lsx_ray_centroid_axis(const LSRayTriangleCPU* triangles,uint32_t index,uint32_t axis){return triangles[index].centroid[axis];}
static void lsx_ray_sort_indices(uint32_t* indices,int32_t left,int32_t right,const LSRayTriangleCPU* triangles,uint32_t axis){
    while(left<right){int32_t i=left,j=right;float pivot=lsx_ray_centroid_axis(triangles,indices[(left+right)/2],axis);while(i<=j){while(lsx_ray_centroid_axis(triangles,indices[i],axis)<pivot)i++;while(lsx_ray_centroid_axis(triangles,indices[j],axis)>pivot)j--;if(i<=j){uint32_t swap=indices[i];indices[i]=indices[j];indices[j]=swap;i++;j--;}}if(j-left<right-i){if(left<j)lsx_ray_sort_indices(indices,left,j,triangles,axis);left=i;}else{if(i<right)lsx_ray_sort_indices(indices,i,right,triangles,axis);right=j;}}
}

static uint32_t lsx_ray_build_bvh(const LSRayTriangleCPU* triangles,uint32_t* indices,uint32_t begin,uint32_t end,LSRayBVHNodeCPU* nodes,uint32_t* node_count,uint32_t* ordered,uint32_t* ordered_count){
    uint32_t node_index=(*node_count)++;LSRayBVHNodeCPU* node=&nodes[node_index];uint32_t first_index=indices[begin];
    for(uint32_t axis=0;axis<3;++axis){node->minimum[axis]=triangles[first_index].minimum[axis];node->maximum[axis]=triangles[first_index].maximum[axis];}
    float centroid_min[3]={triangles[first_index].centroid[0],triangles[first_index].centroid[1],triangles[first_index].centroid[2]};
    float centroid_max[3]={centroid_min[0],centroid_min[1],centroid_min[2]};
    for(uint32_t at=begin+1;at<end;++at){const LSRayTriangleCPU* triangle=&triangles[indices[at]];for(uint32_t axis=0;axis<3;++axis){if(triangle->minimum[axis]<node->minimum[axis])node->minimum[axis]=triangle->minimum[axis];if(triangle->maximum[axis]>node->maximum[axis])node->maximum[axis]=triangle->maximum[axis];if(triangle->centroid[axis]<centroid_min[axis])centroid_min[axis]=triangle->centroid[axis];if(triangle->centroid[axis]>centroid_max[axis])centroid_max[axis]=triangle->centroid[axis];}}
    uint32_t count=end-begin;if(count<=4U){node->first_or_left=(int32_t)(*ordered_count);node->count_or_right=-(int32_t)count;for(uint32_t at=begin;at<end;++at)ordered[(*ordered_count)++]=indices[at];return node_index;}
    float extent0=centroid_max[0]-centroid_min[0],extent1=centroid_max[1]-centroid_min[1],extent2=centroid_max[2]-centroid_min[2];uint32_t axis=extent1>extent0?1U:0U;if(extent2>(axis==0U?extent0:extent1))axis=2U;
    lsx_ray_sort_indices(indices,(int32_t)begin,(int32_t)end-1,triangles,axis);uint32_t middle=begin+count/2U;uint32_t left=lsx_ray_build_bvh(triangles,indices,begin,middle,nodes,node_count,ordered,ordered_count);uint32_t right=lsx_ray_build_bvh(triangles,indices,middle,end,nodes,node_count,ordered,ordered_count);node->first_or_left=(int32_t)left;node->count_or_right=(int32_t)right;return node_index;
}

static int lsx_ray_ensure_scratch(LSVKContext* c,uint32_t triangle_count){
    if(!c)return 0;if(triangle_count<=c->ray_scratch_capacity)return 1;
    uint32_t capacity=c->ray_scratch_capacity?c->ray_scratch_capacity:64U;while(capacity<triangle_count&&capacity<0x40000000U)capacity*=2U;if(capacity<triangle_count)capacity=triangle_count;
    LSRayTriangleCPU* triangles=(LSRayTriangleCPU*)ls_alloc((size_t)capacity*sizeof(LSRayTriangleCPU));
    LSRayBVHNodeCPU* nodes=(LSRayBVHNodeCPU*)ls_alloc((size_t)capacity*2U*sizeof(LSRayBVHNodeCPU));
    uint32_t* indices=(uint32_t*)ls_alloc((size_t)capacity*sizeof(uint32_t));uint32_t* ordered=(uint32_t*)ls_alloc((size_t)capacity*sizeof(uint32_t));
    if(!triangles||!nodes||!indices||!ordered){ls_free(triangles);ls_free(nodes);ls_free(indices);ls_free(ordered);set_error(c,"Vulkan could not allocate persistent ray-scene acceleration memory.");return 0;}
    ls_free(c->ray_triangle_scratch);ls_free(c->ray_bvh_scratch);ls_free(c->ray_index_scratch);ls_free(c->ray_order_scratch);
    c->ray_triangle_scratch=triangles;c->ray_bvh_scratch=nodes;c->ray_index_scratch=indices;c->ray_order_scratch=ordered;c->ray_scratch_capacity=capacity;c->ray_topology_dirty=1;return 1;
}

static void lsx_ray_refit_bvh(const LSRayTriangleCPU* triangles,const uint32_t* ordered,LSRayBVHNodeCPU* nodes,uint32_t node_count){
    if(!triangles||!ordered||!nodes)return;
    for(uint32_t cursor=node_count;cursor>0U;--cursor){LSRayBVHNodeCPU* node=&nodes[cursor-1U];
        if(node->count_or_right<0){uint32_t count=(uint32_t)(-node->count_or_right),first=(uint32_t)node->first_or_left;if(!count)continue;const LSRayTriangleCPU* triangle=&triangles[ordered[first]];for(uint32_t axis=0;axis<3U;++axis){node->minimum[axis]=triangle->minimum[axis];node->maximum[axis]=triangle->maximum[axis];}
            for(uint32_t at=1U;at<count;++at){triangle=&triangles[ordered[first+at]];for(uint32_t axis=0;axis<3U;++axis){if(triangle->minimum[axis]<node->minimum[axis])node->minimum[axis]=triangle->minimum[axis];if(triangle->maximum[axis]>node->maximum[axis])node->maximum[axis]=triangle->maximum[axis];}}
        }else{const LSRayBVHNodeCPU* left=&nodes[(uint32_t)node->first_or_left];const LSRayBVHNodeCPU* right=&nodes[(uint32_t)node->count_or_right];for(uint32_t axis=0;axis<3U;++axis){node->minimum[axis]=left->minimum[axis]<right->minimum[axis]?left->minimum[axis]:right->minimum[axis];node->maximum[axis]=left->maximum[axis]>right->maximum[axis]?left->maximum[axis]:right->maximum[axis];}}
    }
}

static int lsx_ray_rebuild_cpu_scene(LSVKContext* c){
    if(!c)return 0;uint32_t expected=0;for(LSVKMesh* mesh=c->meshes;mesh;mesh=mesh->next)expected+=lsx_ray_mesh_triangle_count(mesh);
    if(expected&&!lsx_ray_ensure_scratch(c,expected))return 0;
    LSRayTriangleCPU* triangles=(LSRayTriangleCPU*)c->ray_triangle_scratch;LSRayBVHNodeCPU* nodes=(LSRayBVHNodeCPU*)c->ray_bvh_scratch;uint32_t* indices=c->ray_index_scratch;uint32_t* ordered=c->ray_order_scratch;uint32_t written=0;
    for(LSVKMesh* mesh=c->meshes;mesh;mesh=mesh->next){uint32_t mesh_triangles=lsx_ray_mesh_triangle_count(mesh);if(!mesh_triangles||!mesh->cpu_vertices)continue;
        for(uint32_t triangle=0;triangle<mesh_triangles;++triangle){uint32_t i0=triangle*3U,i1=i0+1U,i2=i0+2U;if(mesh->indexed){i0=mesh->cpu_indices[i0];i1=mesh->cpu_indices[i1];i2=mesh->cpu_indices[i2];}if(i0>=mesh->vertex_count||i1>=mesh->vertex_count||i2>=mesh->vertex_count)continue;
            const float* p0=(const float*)((const unsigned char*)mesh->cpu_vertices+(size_t)i0*mesh->stride+mesh->position_offset);const float* p1=(const float*)((const unsigned char*)mesh->cpu_vertices+(size_t)i1*mesh->stride+mesh->position_offset);const float* p2=(const float*)((const unsigned char*)mesh->cpu_vertices+(size_t)i2*mesh->stride+mesh->position_offset);
            float v0[3],v1[3],v2[3];lsx_transform_point(mesh->ray_transform,p0,v0);lsx_transform_point(mesh->ray_transform,p1,v1);lsx_transform_point(mesh->ray_transform,p2,v2);float e1[3]={v1[0]-v0[0],v1[1]-v0[1],v1[2]-v0[2]};float e2[3]={v2[0]-v0[0],v2[1]-v0[1],v2[2]-v0[2]};float normal[3]={e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]};
            LSRayTriangleCPU* out=&triangles[written++];float packed[20]={v0[0],v0[1],v0[2],mesh->ray_roughness,e1[0],e1[1],e1[2],mesh->ray_metallic,e2[0],e2[1],e2[2],mesh->ray_emissive,normal[0],normal[1],normal[2],0.0f,mesh->ray_albedo[0],mesh->ray_albedo[1],mesh->ray_albedo[2],mesh->ray_albedo[3]};ls_copy_bytes(out->values,packed,sizeof(packed));
            for(uint32_t axis=0;axis<3;++axis){float minimum=v0[axis],maximum=v0[axis];if(v1[axis]<minimum)minimum=v1[axis];if(v2[axis]<minimum)minimum=v2[axis];if(v1[axis]>maximum)maximum=v1[axis];if(v2[axis]>maximum)maximum=v2[axis];out->minimum[axis]=minimum-0.00001f;out->maximum[axis]=maximum+0.00001f;out->centroid[axis]=(v0[axis]+v1[axis]+v2[axis])*(1.0f/3.0f);}
        }
    }
    if(written!=c->ray_triangle_count)c->ray_topology_dirty=1;
    if(written){if(c->ray_topology_dirty){for(uint32_t i=0;i<written;++i)indices[i]=i;uint32_t ordered_count=0;c->ray_bvh_node_count=0;lsx_ray_build_bvh(triangles,indices,0,written,nodes,&c->ray_bvh_node_count,ordered,&ordered_count);}else lsx_ray_refit_bvh(triangles,ordered,nodes,c->ray_bvh_node_count);}else c->ray_bvh_node_count=0;
    uint32_t node_count=c->ray_bvh_node_count;uint64_t vector_count=19ULL+(uint64_t)written*5ULL+(uint64_t)node_count*2ULL;uint64_t byte_count=vector_count*16ULL;if(byte_count>0x7fffffffULL){set_error(c,"The shared ray scene is too large for one Vulkan storage buffer.");return 0;}
    uint32_t bytes=(uint32_t)byte_count;if(bytes<304U)bytes=304U;if(bytes>c->ray_scene_capacity){uint32_t capacity=lsx_ray_next_capacity(bytes);void* next=ls_alloc(capacity);if(!next){set_error(c,"Vulkan could not allocate the shared ray-scene CPU buffer.");return 0;}ls_free(c->ray_scene_cpu);c->ray_scene_cpu=next;c->ray_scene_capacity=capacity;}
    ls_zero(c->ray_scene_cpu,c->ray_scene_capacity);float* data=(float*)c->ray_scene_cpu;lsx_ray_write_vec4(data,1,c->ray_sun_direction[0],c->ray_sun_direction[1],c->ray_sun_direction[2],c->ray_sun_intensity);lsx_ray_write_vec4(data,2,c->ray_sun_color[0],c->ray_sun_color[1],c->ray_sun_color[2],c->ray_ambient);uint32_t point_count=c->ray_point_count>8U?8U:c->ray_point_count;
    for(uint32_t light=0;light<point_count;++light){uint32_t base=3U+light*2U;lsx_ray_write_vec4(data,base,c->ray_point_position[light][0],c->ray_point_position[light][1],c->ray_point_position[light][2],c->ray_point_range[light]);lsx_ray_write_vec4(data,base+1U,c->ray_point_color[light][0],c->ray_point_color[light][1],c->ray_point_color[light][2],c->ray_point_intensity[light]);}
    for(uint32_t out_index=0;out_index<written;++out_index){const LSRayTriangleCPU* triangle=&triangles[ordered[out_index]];uint32_t base=19U+out_index*5U;for(uint32_t vec=0;vec<5U;++vec)lsx_ray_write_vec4(data,base+vec,triangle->values[vec*4U],triangle->values[vec*4U+1U],triangle->values[vec*4U+2U],triangle->values[vec*4U+3U]);}
    uint32_t node_base=19U+written*5U;for(uint32_t node_index=0;node_index<node_count;++node_index){LSRayBVHNodeCPU* node=&nodes[node_index];lsx_ray_write_vec4(data,node_base+node_index*2U,node->minimum[0],node->minimum[1],node->minimum[2],(float)node->first_or_left);lsx_ray_write_vec4(data,node_base+node_index*2U+1U,node->maximum[0],node->maximum[1],node->maximum[2],(float)node->count_or_right);}
    lsx_ray_write_vec4(data,0,(float)written,(float)node_count,(float)point_count,1.0f);c->ray_triangle_count=written;c->ray_scene_bytes=(uint32_t)byte_count;c->ray_scene_version++;c->ray_scene_dirty=0;c->ray_topology_dirty=0;return 1;
}
static int lsx_ray_upload_frame(LSVKContext* c,uint32_t frame){if(!c||!c->ray_scene_storage||frame>1U)return 0;if(c->ray_scene_uploaded[frame]==c->ray_scene_version)return 1;void* mapped=c->ray_scene_storage->mapped[frame];if(!mapped){set_error(c,"Vulkan shared ray-scene storage is not persistently mapped.");return 0;}ls_copy_bytes(mapped,c->ray_scene_cpu,c->ray_scene_bytes);c->ray_scene_uploaded[frame]=c->ray_scene_version;return 1;}
static int lsx_ray_ensure_scene(LSVKContext* c){
    if(!c)return 0;if(c->ray_scene_dirty||!c->ray_scene_cpu){if(!lsx_ray_rebuild_cpu_scene(c))return 0;}
    uint32_t required=c->ray_scene_capacity?c->ray_scene_capacity:304U;
    if(!c->ray_scene_storage||c->ray_scene_storage->bytes<required){if(c->ray_scene_storage){_lsxVKDestroyStorage(c,c->ray_scene_storage);c->ray_scene_storage=0;}c->ray_scene_storage=(LSVKStorage*)_lsxVKCreateStorage(c,c->ray_scene_cpu,(int)required,7);if(!_lsxVKStorageReady(c->ray_scene_storage)){set_error(c,"Vulkan could not create the shared ray-scene storage buffer.");return 0;}c->ray_scene_uploaded[0]=c->ray_scene_version;c->ray_scene_uploaded[1]=c->ray_scene_version;}
    lsx_set_bound_storage(c,7,c->ray_scene_storage);if(c->frame_open)return lsx_ray_upload_frame(c,c->frame);return lsx_ray_upload_frame(c,0)&&lsx_ray_upload_frame(c,1);
}

/* Sun and point-light edits touch only the fixed 19-vec4 header. Rebuilding,
   transforming, and refitting every triangle for a moving light was pure CPU
   waste. Patch the persistent CPU scene in place and let the existing per-frame
   version upload copy the new header on the next ray draw. */
static void lsx_ray_refresh_lighting_header(LSVKContext* c){
    if(!c)return;
    if(!c->ray_scene_cpu||c->ray_scene_dirty){c->ray_scene_dirty=1;return;}
    float* data=(float*)c->ray_scene_cpu;
    lsx_ray_write_vec4(data,1,c->ray_sun_direction[0],c->ray_sun_direction[1],c->ray_sun_direction[2],c->ray_sun_intensity);
    lsx_ray_write_vec4(data,2,c->ray_sun_color[0],c->ray_sun_color[1],c->ray_sun_color[2],c->ray_ambient);
    for(uint32_t vector=3U;vector<19U;++vector)lsx_ray_write_vec4(data,vector,0.0f,0.0f,0.0f,0.0f);
    uint32_t point_count=c->ray_point_count>8U?8U:c->ray_point_count;
    for(uint32_t light=0;light<point_count;++light){uint32_t base=3U+light*2U;lsx_ray_write_vec4(data,base,c->ray_point_position[light][0],c->ray_point_position[light][1],c->ray_point_position[light][2],c->ray_point_range[light]);lsx_ray_write_vec4(data,base+1U,c->ray_point_color[light][0],c->ray_point_color[light][1],c->ray_point_color[light][2],c->ray_point_intensity[light]);}
    lsx_ray_write_vec4(data,0,(float)c->ray_triangle_count,(float)c->ray_bvh_node_count,(float)point_count,1.0f);
    c->ray_scene_version++;if(!c->ray_scene_version)c->ray_scene_version=1;
}
LSX_EXPORT int LSX_CALL _lsxVKSetRaySun(void* context,float dx,float dy,float dz,float r,float g,float b,float intensity,float ambient){LSVKContext* c=(LSVKContext*)context;if(!c)return 0;c->ray_sun_direction[0]=dx;c->ray_sun_direction[1]=dy;c->ray_sun_direction[2]=dz;c->ray_sun_color[0]=r;c->ray_sun_color[1]=g;c->ray_sun_color[2]=b;c->ray_sun_intensity=intensity;c->ray_ambient=ambient;lsx_ray_refresh_lighting_header(c);return 1;}
LSX_EXPORT void LSX_CALL _lsxVKClearRayPointLights(void* context){LSVKContext* c=(LSVKContext*)context;if(!c)return;c->ray_point_count=0;lsx_ray_refresh_lighting_header(c);}
LSX_EXPORT int LSX_CALL _lsxVKAddRayPointLight(void* context,float x,float y,float z,float r,float g,float b,float intensity,float range){LSVKContext* c=(LSVKContext*)context;if(!c||c->ray_point_count>=8U)return 0;uint32_t slot=c->ray_point_count++;c->ray_point_position[slot][0]=x;c->ray_point_position[slot][1]=y;c->ray_point_position[slot][2]=z;c->ray_point_color[slot][0]=r;c->ray_point_color[slot][1]=g;c->ray_point_color[slot][2]=b;c->ray_point_intensity[slot]=intensity;c->ray_point_range[slot]=range;lsx_ray_refresh_lighting_header(c);return 1;}
LSX_EXPORT int LSX_CALL _lsxVKRayTriangleCount(void* context){LSVKContext* c=(LSVKContext*)context;if(!c)return 0;if(c->ray_scene_dirty)lsx_ray_rebuild_cpu_scene(c);return (int)c->ray_triangle_count;}

LSX_EXPORT void* LSX_CALL _lsxVKCreateComputeShader(void* context,const uint32_t* words,int word_count){
    LSVKContext* c=(LSVKContext*)context;if(!c||!c->device||!words||word_count<1)return 0;LSVKShader* s=(LSVKShader*)ls_alloc(sizeof(LSVKShader));if(!s)return 0;s->is_compute=1;s->compute_count=(uint32_t)word_count;s->compute_words=(uint32_t*)ls_alloc((size_t)word_count*4);if(!s->compute_words){ls_copy(s->error,sizeof(s->error),"Vulkan could not allocate embedded compute shader storage.");return s;}for(int i=0;i<word_count;++i)s->compute_words[i]=words[i];
    VkDescriptorSetLayoutBinding bindings[8];ls_zero(bindings,sizeof(bindings));for(uint32_t i=0;i<8;++i){bindings[i].binding=i;bindings[i].descriptorType=VK_DESCRIPTOR_TYPE_STORAGE_BUFFER;bindings[i].descriptorCount=1;bindings[i].stageFlags=VK_SHADER_STAGE_COMPUTE_BIT;}
    VkDescriptorSetLayoutCreateInfo dli;ls_zero(&dli,sizeof(dli));dli.sType=VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO;dli.bindingCount=8;dli.pBindings=bindings;if(c->vkCreateDescriptorSetLayout(c->device,&dli,0,&s->compute_descriptor_layout)!=VK_SUCCESS){ls_copy(s->error,sizeof(s->error),"Vulkan could not create the compute storage layout.");return s;}
    VkDescriptorPoolSize ps;ps.type=VK_DESCRIPTOR_TYPE_STORAGE_BUFFER;ps.descriptorCount=8;VkDescriptorPoolCreateInfo dpi;ls_zero(&dpi,sizeof(dpi));dpi.sType=VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO;dpi.maxSets=1;dpi.poolSizeCount=1;dpi.pPoolSizes=&ps;if(c->vkCreateDescriptorPool(c->device,&dpi,0,&s->compute_descriptor_pool)!=VK_SUCCESS){ls_copy(s->error,sizeof(s->error),"Vulkan could not create the compute descriptor pool.");return s;}
    VkDescriptorSetAllocateInfo dai;ls_zero(&dai,sizeof(dai));dai.sType=VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO;dai.descriptorPool=s->compute_descriptor_pool;dai.descriptorSetCount=1;dai.pSetLayouts=&s->compute_descriptor_layout;if(c->vkAllocateDescriptorSets(c->device,&dai,&s->compute_descriptor_set)!=VK_SUCCESS){ls_copy(s->error,sizeof(s->error),"Vulkan could not allocate compute descriptors.");return s;}
    VkPipelineLayoutCreateInfo li;ls_zero(&li,sizeof(li));li.sType=VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO;li.setLayoutCount=1;li.pSetLayouts=&s->compute_descriptor_layout;if(c->vkCreatePipelineLayout(c->device,&li,0,&s->compute_layout)!=VK_SUCCESS){ls_copy(s->error,sizeof(s->error),"Vulkan could not create the compute pipeline layout.");return s;}
    VkShaderModule module=make_module(c,s->compute_words,s->compute_count);if(!module){ls_copy(s->error,sizeof(s->error),"Vulkan could not create the embedded compute shader module.");return s;}
    VkComputePipelineCreateInfo ci;ls_zero(&ci,sizeof(ci));ci.sType=VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO;ci.stage.sType=VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO;ci.stage.stage=VK_SHADER_STAGE_COMPUTE_BIT;ci.stage.module=module;ci.stage.pName="main";ci.layout=s->compute_layout;VkResult result=c->vkCreateComputePipelines(c->device,0,1,&ci,0,&s->pipeline);c->vkDestroyShaderModule(c->device,module,0);if(result!=VK_SUCCESS){ls_copy_result(s->error,sizeof(s->error),"Vulkan could not create the compute pipeline: ",(int)result);return s;}s->next=c->shaders;c->shaders=s;return s;
}
LSX_EXPORT int LSX_CALL _lsxVKDispatch(void* context,void* shader,int x,int y,int z){
    LSVKContext* c=(LSVKContext*)context;LSVKShader* s=(LSVKShader*)shader;if(!c||!s||!s->is_compute||!s->pipeline||x<1||y<1||z<1)return 0;
    VkDescriptorBufferInfo infos[8];VkWriteDescriptorSet writes[8];uint32_t count=0;ls_zero(infos,sizeof(infos));ls_zero(writes,sizeof(writes));for(uint32_t i=0;i<8;++i){LSVKStorage* storage=c->bound_storage[i];if(!storage)continue;infos[count].buffer=storage->buffers[c->frame];infos[count].offset=0;infos[count].range=storage->bytes;writes[count].sType=VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;writes[count].dstSet=s->compute_descriptor_set;writes[count].dstBinding=i;writes[count].descriptorCount=1;writes[count].descriptorType=VK_DESCRIPTOR_TYPE_STORAGE_BUFFER;writes[count].pBufferInfo=&infos[count];count++;}if(count)c->vkUpdateDescriptorSets(c->device,count,writes,0,0);
    if(!lsx_upload_begin(c))return 0;c->vkCmdBindPipeline(c->upload_command,VK_PIPELINE_BIND_POINT_COMPUTE,s->pipeline);c->vkCmdBindDescriptorSets(c->upload_command,VK_PIPELINE_BIND_POINT_COMPUTE,s->compute_layout,0,1,&s->compute_descriptor_set,0,0);c->vkCmdDispatch(c->upload_command,(uint32_t)x,(uint32_t)y,(uint32_t)z);return lsx_upload_end(c);
}

static int lsx_write_uniform_bytes(LSVKContext* c,uint32_t offset,const void* data,uint32_t bytes){if(!c||!data||bytes<1||offset+bytes>1024)return 0;uint32_t used=(offset+bytes+15U)&~15U;if(used>c->uniform_copy_bytes)c->uniform_copy_bytes=used;if(ls_bytes_equal(c->uniform_shadow+offset,data,bytes))return 1;ls_copy_bytes(c->uniform_shadow+offset,data,bytes);c->uniform_version++;if(!c->uniform_version)c->uniform_version=1;return 1;}
LSX_EXPORT int LSX_CALL _lsxVKUniform1f(void* context,int offset,float x){return lsx_write_uniform_bytes((LSVKContext*)context,(uint32_t)offset,&x,4);}
LSX_EXPORT int LSX_CALL _lsxVKUniform1i(void* context,int offset,int x){return lsx_write_uniform_bytes((LSVKContext*)context,(uint32_t)offset,&x,4);}
LSX_EXPORT int LSX_CALL _lsxVKUniform2f(void* context,int offset,float x,float y){float values[2]={x,y};return lsx_write_uniform_bytes((LSVKContext*)context,(uint32_t)offset,values,8);}
LSX_EXPORT int LSX_CALL _lsxVKUniform3f(void* context,int offset,float x,float y,float z){float values[4]={x,y,z,0.0f};return lsx_write_uniform_bytes((LSVKContext*)context,(uint32_t)offset,values,16);}
LSX_EXPORT int LSX_CALL _lsxVKUniform4f(void* context,int offset,float x,float y,float z,float w){float values[4]={x,y,z,w};return lsx_write_uniform_bytes((LSVKContext*)context,(uint32_t)offset,values,16);}
LSX_EXPORT int LSX_CALL _lsxVKUniformMat4(void* context,int offset,const float* values){return values?lsx_write_uniform_bytes((LSVKContext*)context,(uint32_t)offset,values,64):0;}

static void* lsx_vk_create_shader_impl(void* context,const uint32_t* vertex,int vertex_count,const uint32_t* fragment,int fragment_count,uint64_t vertex_layout,uint32_t pipeline_flags,int ray_flags,int model_offset){LSVKContext* c=(LSVKContext*)context;if(!c||!c->device||vertex_count<=0||fragment_count<=0)return 0;LSVKShader* s=(LSVKShader*)ls_alloc((1) * sizeof(LSVKShader));if(!s)return 0;s->vertex_count=(uint32_t)vertex_count;s->fragment_count=(uint32_t)fragment_count;s->vertex_layout=vertex_layout;s->pipeline_flags=pipeline_flags;s->ray_flags=(uint32_t)(ray_flags>0?ray_flags:0);s->model_offset=(int32_t)model_offset;s->vertex_words=(uint32_t*)ls_alloc((size_t)vertex_count*4);s->fragment_words=(uint32_t*)ls_alloc((size_t)fragment_count*4);if(!s->vertex_words||!s->fragment_words){ls_copy(s->error,sizeof(s->error),"Vulkan could not allocate embedded shader storage.");return s;}for(int i=0;i<vertex_count;++i)s->vertex_words[i]=vertex[i];for(int i=0;i<fragment_count;++i)s->fragment_words[i]=fragment[i];s->next=c->shaders;c->shaders=s;if(!build_pipeline(c,s))return s;return s;}
/* The original shader export remains callable by every already-built example.
   Universal ray metadata is supplied only through the new Ex entry point. */
LSX_EXPORT void* LSX_CALL _lsxVKCreateShader(void* context,const uint32_t* vertex,int vertex_count,const uint32_t* fragment,int fragment_count,uint64_t vertex_layout,uint32_t pipeline_flags){return lsx_vk_create_shader_impl(context,vertex,vertex_count,fragment,fragment_count,vertex_layout,pipeline_flags,0,-1);}
LSX_EXPORT void* LSX_CALL _lsxVKCreateShaderEx(void* context,const uint32_t* vertex,int vertex_count,const uint32_t* fragment,int fragment_count,uint64_t vertex_layout,uint32_t pipeline_flags,int ray_flags,int model_offset){return lsx_vk_create_shader_impl(context,vertex,vertex_count,fragment,fragment_count,vertex_layout,pipeline_flags,ray_flags,model_offset);}
LSX_EXPORT int LSX_CALL _lsxVKShaderReady(void* shader){LSVKShader* s=(LSVKShader*)shader;return s&&s->pipeline?1:0;}
LSX_EXPORT const char* LSX_CALL _lsxVKShaderError(void* shader){LSVKShader* s=(LSVKShader*)shader;return s&&s->error[0]?s->error:"The Vulkan shader pipeline was not created.";}
LSX_EXPORT void LSX_CALL _lsxVKBindShader(void* context,void* shader){LSVKContext* c=(LSVKContext*)context;LSVKShader* s=(LSVKShader*)shader;if(!c||!s||!s->pipeline||s->is_compute)return;c->bound_shader=s;if(s->ray_flags){if(lsx_ray_ensure_scene(c))lsx_set_bound_storage(c,7,c->ray_scene_storage);}if(c->frame_open)lsx_bind_pipeline_if_needed(c,s->pipeline);}
LSX_EXPORT void LSX_CALL _lsxVKDestroyShader(void* context,void* shader){LSVKContext* c=(LSVKContext*)context;LSVKShader* s=(LSVKShader*)shader;if(!s)return;if(c){LSVKShader** link=&c->shaders;while(*link&&*link!=s)link=&(*link)->next;if(*link==s)*link=s->next;if(c->bound_shader==s)c->bound_shader=0;if(c->recording_pipeline==s->pipeline)c->recording_pipeline=0;}if(c&&c->device){if(c->vkDeviceWaitIdle)c->vkDeviceWaitIdle(c->device);if(s->pipeline)c->vkDestroyPipeline(c->device,s->pipeline,0);if(s->compute_layout)c->vkDestroyPipelineLayout(c->device,s->compute_layout,0);if(s->compute_descriptor_pool)c->vkDestroyDescriptorPool(c->device,s->compute_descriptor_pool,0);if(s->compute_descriptor_layout)c->vkDestroyDescriptorSetLayout(c->device,s->compute_descriptor_layout,0);}ls_free(s->vertex_words);ls_free(s->fragment_words);ls_free(s->compute_words);ls_free(s);}

static int lsx_begin_frame_commands(LSVKContext* c,int width,int height){
    if(!c||!c->device||width<1||height<1)return 0;
    lsx_trace_line(c,"begin.enter");
    if(c->frame_open){set_error(c,"A Vulkan frame is already open.");return 0;}
    if(c->needs_resize){lsx_trace_line(c,"begin.resize");if(!recreate_swapchain(c,(uint32_t)width,(uint32_t)height))return 0;}
    uint32_t f=c->frame;c->trace_draw_count=0;
    lsx_trace_line(c,"begin.frame_fence_wait");VkResult frame_wait=c->vkWaitForFences(c->device,1,&c->in_flight[f],1,UINT64_MAX);
    if(frame_wait!=VK_SUCCESS){set_error(c,"Vulkan could not wait for the current frame fence.");return 0;}
    lsx_trace_line(c,"begin.acquire");VkResult acquire=c->vkAcquireNextImageKHR(c->device,c->swapchain,UINT64_MAX,c->image_available[f],0,&c->image_index);
    if(acquire==VK_ERROR_OUT_OF_DATE_KHR){if(!recreate_swapchain(c,(uint32_t)width,(uint32_t)height))return 0;acquire=c->vkAcquireNextImageKHR(c->device,c->swapchain,UINT64_MAX,c->image_available[f],0,&c->image_index);}
    if(acquire!=VK_SUCCESS&&acquire!=VK_SUBOPTIMAL_KHR){set_error(c,"Vulkan could not acquire the next swapchain image.");return 0;}
    lsx_trace_line(c,"begin.acquired");
    if(c->images_in_flight&&c->image_index<c->image_count&&c->images_in_flight[c->image_index]&&c->images_in_flight[c->image_index]!=c->in_flight[f]){
        lsx_trace_line(c,"begin.image_fence_wait");VkResult image_wait=c->vkWaitForFences(c->device,1,&c->images_in_flight[c->image_index],1,UINT64_MAX);
        if(image_wait!=VK_SUCCESS){set_error(c,"Vulkan could not wait for the acquired swapchain image.");return 0;}
    }
    if(c->images_in_flight&&c->image_index<c->image_count)c->images_in_flight[c->image_index]=c->in_flight[f];
    lsx_trace_line(c,"begin.fence_reset");if(c->vkResetFences(c->device,1,&c->in_flight[f])!=VK_SUCCESS){set_error(c,"Vulkan could not reset the current frame fence.");return 0;}
    lsx_trace_line(c,"begin.command_reset");if(c->vkResetCommandBuffer(c->command_buffers[f],0)!=VK_SUCCESS){set_error(c,"Vulkan could not reset the frame command buffer.");return 0;}
    VkCommandBufferBeginInfo bi;ls_zero(&bi,sizeof(bi));bi.sType=VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO;bi.flags=VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT;
    lsx_trace_line(c,"begin.command_begin");if(c->vkBeginCommandBuffer(c->command_buffers[f],&bi)!=VK_SUCCESS){set_error(c,"Vulkan could not begin the frame command buffer.");return 0;}
    if(c->resource_descriptor_count[f]>=LSVK_RESOURCE_CACHE_SOFT_LIMIT)lsx_reset_resource_cache_frame(c,f);
    c->uniform_cursor[f]=0;c->uniform_last_slot[f]=-1;c->uniform_last_version[f]=0;
    c->recording_pipeline=0;c->recording_resource_set=0;c->recording_uniform_set=0;c->recording_uniform_offset=0xffffffffU;c->frame_open=1;c->frame_render_pass_open=0;lsx_trace_line(c,"begin.ready");return 1;
}

static void lsx_set_frame_viewport(LSVKContext* c,uint32_t width,uint32_t height){
    uint32_t f=c->frame;VkViewport viewport;viewport.x=0;viewport.y=(float)height;viewport.width=(float)width;viewport.height=-(float)height;viewport.minDepth=0;viewport.maxDepth=1;c->vkCmdSetViewport(c->command_buffers[f],0,1,&viewport);
    VkRect2D scissor;scissor.offset.x=0;scissor.offset.y=0;scissor.extent.width=width;scissor.extent.height=height;c->vkCmdSetScissor(c->command_buffers[f],0,1,&scissor);
}

static void lsx_bind_pipeline_if_needed(LSVKContext* c,VkPipeline pipeline){
    if(!c||!c->frame_open||!pipeline||c->recording_pipeline==pipeline)return;c->vkCmdBindPipeline(c->command_buffers[c->frame],VK_PIPELINE_BIND_POINT_GRAPHICS,pipeline);c->recording_pipeline=pipeline;
}

static void lsx_bind_current_graphics(LSVKContext* c){
    if(c->bound_shader&&c->bound_shader->pipeline)lsx_bind_pipeline_if_needed(c,c->bound_shader->pipeline);
}

static uint64_t lsx_resource_binding_hash(LSVKContext* c){
    uint64_t hash=1469598103934665603ULL;
    for(uint32_t i=0;i<8;++i){hash^=(uint64_t)(uintptr_t)c->bound_textures[i];hash*=1099511628211ULL;hash^=(uint64_t)(uintptr_t)c->bound_storage[i];hash*=1099511628211ULL;}
    return hash?hash:1ULL;
}

static int lsx_resource_keys_match(LSVKContext* c,uint32_t frame,uint32_t slot){
    for(uint32_t i=0;i<8;++i){if(c->resource_texture_keys[frame][slot][i]!=c->bound_textures[i])return 0;if(c->resource_storage_keys[frame][slot][i]!=c->bound_storage[i])return 0;}return 1;
}

static VkDescriptorSet lsx_resource_set_for_draw(LSVKContext* c,uint32_t frame){
    if(c->resource_cached_set[frame]&&c->resource_cached_version[frame]==c->resource_binding_version)return c->resource_cached_set[frame];
    uint64_t hash=lsx_resource_binding_hash(c);uint32_t count=c->resource_descriptor_count[frame];
    /* Open-addressed lookup keeps resource-set reuse O(1) even when a scene
       cycles through hundreds of material/texture combinations. The previous
       hash-prefilter still walked every cached set and became a CPU-side draw
       bottleneck in large Vulkan scenes. Exact key comparison resolves the
       rare 64-bit hash collision without changing binding semantics. */
    uint32_t bucket=(uint32_t)(hash^(hash>>32))&(LSVK_RESOURCE_HASH_TABLE_SIZE-1U);uint32_t empty_bucket=UINT32_MAX;
    for(uint32_t probe=0;probe<LSVK_RESOURCE_HASH_TABLE_SIZE;++probe){uint16_t token=c->resource_hash_slots[frame][bucket];if(!token){empty_bucket=bucket;break;}uint32_t slot=(uint32_t)token-1U;if(c->resource_hashes[frame][slot]==hash&&lsx_resource_keys_match(c,frame,slot)){VkDescriptorSet found=c->resource_descriptor_sets[frame][slot];c->resource_cached_version[frame]=c->resource_binding_version;c->resource_cached_set[frame]=found;return found;}bucket=(bucket+1U)&(LSVK_RESOURCE_HASH_TABLE_SIZE-1U);}
    if(count>=LSVK_RESOURCE_SET_LIMIT){set_error(c,"Vulkan exceeded the persistent resource binding cache limit.");return 0;}
    if(empty_bucket==UINT32_MAX){set_error(c,"Vulkan resource binding hash table is full.");return 0;}
    uint32_t slot=count;c->resource_descriptor_count[frame]=count+1;c->resource_hashes[frame][slot]=hash;c->resource_hash_slots[frame][empty_bucket]=(uint16_t)(slot+1U);VkDescriptorSet set=c->resource_descriptor_sets[frame][slot];
    VkDescriptorImageInfo images[8];VkDescriptorBufferInfo buffers[8];VkWriteDescriptorSet writes[16];uint32_t write_count=0;ls_zero(images,sizeof(images));ls_zero(buffers,sizeof(buffers));ls_zero(writes,sizeof(writes));
    for(uint32_t i=0;i<8;++i){
        LSVKTexture* texture_key=c->bound_textures[i];c->resource_texture_keys[frame][slot][i]=texture_key;
        LSVKTexture* texture=texture_key?texture_key:c->fallback_texture;
        images[i].sampler=texture->sampler;images[i].imageView=texture->view;images[i].imageLayout=VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;VkWriteDescriptorSet* image_write=&writes[write_count++];image_write->sType=VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;image_write->dstSet=set;image_write->dstBinding=i;image_write->descriptorCount=1;image_write->descriptorType=VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER;image_write->pImageInfo=&images[i];
        LSVKStorage* storage_key=c->bound_storage[i];c->resource_storage_keys[frame][slot][i]=storage_key;
        LSVKStorage* storage=storage_key?storage_key:c->fallback_storage;
        buffers[i].buffer=storage->buffers[frame];buffers[i].offset=0;buffers[i].range=storage->bytes;VkWriteDescriptorSet* storage_write=&writes[write_count++];storage_write->sType=VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET;storage_write->dstSet=set;storage_write->dstBinding=8U+i;storage_write->descriptorCount=1;storage_write->descriptorType=VK_DESCRIPTOR_TYPE_STORAGE_BUFFER;storage_write->pBufferInfo=&buffers[i];
    }
    c->vkUpdateDescriptorSets(c->device,write_count,writes,0,0);c->resource_cached_version[frame]=c->resource_binding_version;c->resource_cached_set[frame]=set;return set;
}

static int lsx_uniform_slot_for_draw(LSVKContext* c,uint32_t frame,uint32_t* out_slot){
    if(!c||!out_slot||!c->uniform_mapped[frame])return 0;
    int32_t last=c->uniform_last_slot[frame];
    if(last>=0&&c->uniform_last_version[frame]==c->uniform_version){*out_slot=(uint32_t)last;return 1;}
    uint32_t slot=c->uniform_cursor[frame];
    if(slot>=LSVK_DRAW_UNIFORM_LIMIT){set_error(c,"Vulkan exceeded the per-frame automatic-uniform ring limit.");return 0;}
    c->uniform_cursor[frame]=slot+1;void* target=(void*)((unsigned char*)c->uniform_mapped[frame]+c->uniform_stride*slot);ls_copy_bytes(target,c->uniform_shadow,c->uniform_copy_bytes);c->uniform_last_slot[frame]=(int32_t)slot;c->uniform_last_version[frame]=c->uniform_version;*out_slot=slot;return 1;
}

static int lsx_bind_draw_resources(LSVKContext* c){
    if(!c||!c->frame_open)return 0;uint32_t frame=c->frame,uniform_slot=0;VkDescriptorSet resource_set=lsx_resource_set_for_draw(c,frame);if(!resource_set)return 0;if(!lsx_uniform_slot_for_draw(c,frame,&uniform_slot)){set_error(c,"Vulkan automatic uniform ring is unavailable.");return 0;}
    VkDescriptorSet uniform_set=c->uniform_descriptor_sets[frame];uint32_t dynamic_offset=(uint32_t)(c->uniform_stride*uniform_slot);int resource_changed=c->recording_resource_set!=resource_set;int uniform_changed=c->recording_uniform_set!=uniform_set||c->recording_uniform_offset!=dynamic_offset;if(!resource_changed&&!uniform_changed)return 1;
    if(resource_changed&&uniform_changed){VkDescriptorSet sets[2]={resource_set,uniform_set};c->vkCmdBindDescriptorSets(c->command_buffers[frame],VK_PIPELINE_BIND_POINT_GRAPHICS,c->pipeline_layout,0,2,sets,1,&dynamic_offset);}
    else if(resource_changed)c->vkCmdBindDescriptorSets(c->command_buffers[frame],VK_PIPELINE_BIND_POINT_GRAPHICS,c->pipeline_layout,0,1,&resource_set,0,0);
    else c->vkCmdBindDescriptorSets(c->command_buffers[frame],VK_PIPELINE_BIND_POINT_GRAPHICS,c->pipeline_layout,1,1,&uniform_set,1,&dynamic_offset);
    c->recording_resource_set=resource_set;c->recording_uniform_set=uniform_set;c->recording_uniform_offset=dynamic_offset;return 1;
}

static void lsx_image_barrier(LSVKContext* c,VkCommandBuffer cmd,VkImage image,VkImageLayout old_layout,VkImageLayout new_layout,VkAccessFlags src_access,VkAccessFlags dst_access,VkPipelineStageFlags src_stage,VkPipelineStageFlags dst_stage){
    VkImageMemoryBarrier barrier;ls_zero(&barrier,sizeof(barrier));barrier.sType=VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER;barrier.srcAccessMask=src_access;barrier.dstAccessMask=dst_access;barrier.oldLayout=old_layout;barrier.newLayout=new_layout;barrier.srcQueueFamilyIndex=VK_QUEUE_FAMILY_IGNORED;barrier.dstQueueFamilyIndex=VK_QUEUE_FAMILY_IGNORED;barrier.image=image;barrier.subresourceRange.aspectMask=VK_IMAGE_ASPECT_COLOR_BIT;barrier.subresourceRange.levelCount=1;barrier.subresourceRange.layerCount=1;c->vkCmdPipelineBarrier(cmd,src_stage,dst_stage,0,0,0,0,0,1,&barrier);
}

LSX_EXPORT int LSX_CALL _lsxVKBegin(void* context,int width,int height,float r,float g,float b,float a){
    LSVKContext* c=(LSVKContext*)context;if(!lsx_begin_frame_commands(c,width,height))return 0;uint32_t f=c->frame;
    VkClearValue clears[2];ls_zero(clears,sizeof(clears));clears[0].color.float32[0]=r;clears[0].color.float32[1]=g;clears[0].color.float32[2]=b;clears[0].color.float32[3]=a;clears[1].depthStencil.depth=1.0f;
    VkRenderPassBeginInfo rp;ls_zero(&rp,sizeof(rp));rp.sType=VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO;rp.renderPass=c->render_pass;rp.framebuffer=c->framebuffers[c->image_index];rp.renderArea.extent=c->extent;rp.clearValueCount=2;rp.pClearValues=clears;lsx_trace_line(c,"begin.render_pass");c->vkCmdBeginRenderPass(c->command_buffers[f],&rp,VK_SUBPASS_CONTENTS_INLINE);c->frame_render_pass_open=1;
    lsx_set_frame_viewport(c,c->extent.width,c->extent.height);lsx_bind_current_graphics(c);return 1;
}

LSX_EXPORT int LSX_CALL _lsxVKBeginFramebuffer(void* context,void* value,int window_width,int window_height,float r,float g,float b,float a){
    LSVKContext* c=(LSVKContext*)context;LSVKFramebuffer* target=(LSVKFramebuffer*)value;if(!c||!target||!target->framebuffer||!target->render_pass)return 0;if(!lsx_begin_frame_commands(c,window_width,window_height))return 0;uint32_t f=c->frame;
    VkClearValue clears[2];ls_zero(clears,sizeof(clears));clears[0].color.float32[0]=r;clears[0].color.float32[1]=g;clears[0].color.float32[2]=b;clears[0].color.float32[3]=a;clears[1].depthStencil.depth=1.0f;
    VkRenderPassBeginInfo rp;ls_zero(&rp,sizeof(rp));rp.sType=VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO;rp.renderPass=target->render_pass;rp.framebuffer=target->framebuffer;rp.renderArea.extent.width=target->width;rp.renderArea.extent.height=target->height;rp.clearValueCount=2;rp.pClearValues=clears;c->vkCmdBeginRenderPass(c->command_buffers[f],&rp,VK_SUBPASS_CONTENTS_INLINE);c->frame_render_pass_open=1;
    lsx_set_frame_viewport(c,target->width,target->height);lsx_bind_current_graphics(c);return 1;
}

LSX_EXPORT int LSX_CALL _lsxVKFramebufferShow(void* context,void* value,int linear){
    LSVKContext* c=(LSVKContext*)context;LSVKFramebuffer* target=(LSVKFramebuffer*)value;if(!c||!target||!c->frame_open||!c->frame_render_pass_open)return 0;uint32_t f=c->frame;VkCommandBuffer cmd=c->command_buffers[f];c->vkCmdEndRenderPass(cmd);c->frame_render_pass_open=0;
    lsx_image_barrier(c,cmd,c->images[c->image_index],VK_IMAGE_LAYOUT_UNDEFINED,VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,0,VK_ACCESS_TRANSFER_WRITE_BIT,VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT,VK_PIPELINE_STAGE_TRANSFER_BIT);
    VkImageBlit blit;ls_zero(&blit,sizeof(blit));blit.srcSubresource.aspectMask=VK_IMAGE_ASPECT_COLOR_BIT;blit.srcSubresource.layerCount=1;blit.srcOffsets[1].x=(int32_t)target->width;blit.srcOffsets[1].y=(int32_t)target->height;blit.srcOffsets[1].z=1;blit.dstSubresource.aspectMask=VK_IMAGE_ASPECT_COLOR_BIT;blit.dstSubresource.layerCount=1;blit.dstOffsets[1].x=(int32_t)c->extent.width;blit.dstOffsets[1].y=(int32_t)c->extent.height;blit.dstOffsets[1].z=1;
    c->vkCmdBlitImage(cmd,target->color_image,VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL,c->images[c->image_index],VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,1,&blit,linear?VK_FILTER_LINEAR:VK_FILTER_NEAREST);
    lsx_image_barrier(c,cmd,c->images[c->image_index],VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL,VK_IMAGE_LAYOUT_PRESENT_SRC_KHR,VK_ACCESS_TRANSFER_WRITE_BIT,0,VK_PIPELINE_STAGE_TRANSFER_BIT,VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT);return 1;
}

LSX_EXPORT void LSX_CALL _lsxVKDraw(void* context,int vertices,int instances){LSVKContext* c=(LSVKContext*)context;if(!c||!c->frame_open||!c->frame_render_pass_open||!c->bound_shader||!c->bound_shader->pipeline||vertices<=0)return;c->trace_draw_count++;if(c->trace_draw_count<=2||c->trace_draw_count%64U==0U)lsx_trace_line(c,"draw.direct.sample");if(c->bound_shader->ray_flags){if(!lsx_ray_ensure_scene(c))return;lsx_set_bound_storage(c,7,c->ray_scene_storage);}if(!lsx_bind_draw_resources(c))return;c->vkCmdDraw(c->command_buffers[c->frame],(uint32_t)vertices,(uint32_t)(instances>0?instances:1),0,0);}
LSX_EXPORT void LSX_CALL _lsxVKDrawBase(void* context,int vertices,int instances,int first_vertex,int first_instance){LSVKContext* c=(LSVKContext*)context;if(!c||!c->frame_open||!c->frame_render_pass_open||!c->bound_shader||!c->bound_shader->pipeline||vertices<=0)return;c->trace_draw_count++;if(c->trace_draw_count<=2||c->trace_draw_count%64U==0U)lsx_trace_line(c,"draw.base.sample");if(c->bound_shader->ray_flags){if(!lsx_ray_ensure_scene(c))return;lsx_set_bound_storage(c,7,c->ray_scene_storage);}if(!lsx_bind_draw_resources(c))return;c->vkCmdDraw(c->command_buffers[c->frame],(uint32_t)vertices,(uint32_t)(instances>0?instances:1),(uint32_t)(first_vertex>0?first_vertex:0),(uint32_t)(first_instance>0?first_instance:0));}
LSX_EXPORT int LSX_CALL _lsxVKPresent(void* context){LSVKContext* c=(LSVKContext*)context;if(!c||!c->frame_open)return 0;uint32_t f=c->frame;lsx_trace_line(c,"present.enter");if(c->frame_render_pass_open){lsx_trace_line(c,"present.render_pass_end");c->vkCmdEndRenderPass(c->command_buffers[f]);c->frame_render_pass_open=0;}lsx_trace_line(c,"present.command_end");if(c->vkEndCommandBuffer(c->command_buffers[f])!=VK_SUCCESS){set_error(c,"Vulkan could not finish the frame command buffer.");c->frame_open=0;return 0;}VkPipelineStageFlags wait=VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT|VK_PIPELINE_STAGE_TRANSFER_BIT;VkSubmitInfo submit;ls_zero(&submit, sizeof(submit));submit.sType=VK_STRUCTURE_TYPE_SUBMIT_INFO;submit.waitSemaphoreCount=1;submit.pWaitSemaphores=&c->image_available[f];submit.pWaitDstStageMask=&wait;submit.commandBufferCount=1;submit.pCommandBuffers=&c->command_buffers[f];submit.signalSemaphoreCount=1;submit.pSignalSemaphores=&c->render_finished[f];lsx_trace_line(c,"present.queue_submit");if(c->vkQueueSubmit(c->graphics_queue,1,&submit,c->in_flight[f])!=VK_SUCCESS){set_error(c,"Vulkan could not submit the frame.");c->frame_open=0;return 0;}VkPresentInfoKHR present;ls_zero(&present, sizeof(present));present.sType=VK_STRUCTURE_TYPE_PRESENT_INFO_KHR;present.waitSemaphoreCount=1;present.pWaitSemaphores=&c->render_finished[f];present.swapchainCount=1;present.pSwapchains=&c->swapchain;present.pImageIndices=&c->image_index;lsx_trace_line(c,"present.queue_present");VkResult result=c->vkQueuePresentKHR(c->present_queue,&present);lsx_trace_line(c,"present.returned");c->frame_open=0;c->frame=(f+1)%2;c->trace_present_count++;if(result==VK_ERROR_OUT_OF_DATE_KHR||result==VK_SUBOPTIMAL_KHR){c->needs_resize=1;return 1;}if(result!=VK_SUCCESS){set_error(c,"Vulkan could not present the frame.");return 0;}return 1;}

LSX_EXPORT void LSX_CALL _lsxVKDestroy(void* context){LSVKContext* c=(LSVKContext*)context;if(!c)return;if(c->device&&c->vkDeviceWaitIdle)c->vkDeviceWaitIdle(c->device);while(c->meshes){LSVKMesh* mesh=c->meshes;c->meshes=mesh->next;if(c->device){if(mesh->index_buffer)c->vkDestroyBuffer(c->device,mesh->index_buffer,0);if(mesh->index_memory)c->vkFreeMemory(c->device,mesh->index_memory,0);if(mesh->vertex_mapped&&mesh->vertex_memory)c->vkUnmapMemory(c->device,mesh->vertex_memory);if(mesh->vertex_buffer)c->vkDestroyBuffer(c->device,mesh->vertex_buffer,0);if(mesh->vertex_memory)c->vkFreeMemory(c->device,mesh->vertex_memory,0);}ls_free(mesh->cpu_vertices);ls_free(mesh->cpu_indices);ls_free(mesh);}if(c->ray_scene_storage){LSVKStorage* scene=c->ray_scene_storage;c->ray_scene_storage=0;_lsxVKDestroyStorage(c,scene);}ls_free(c->ray_scene_cpu);c->ray_scene_cpu=0;ls_free(c->ray_triangle_scratch);ls_free(c->ray_bvh_scratch);ls_free(c->ray_index_scratch);ls_free(c->ray_order_scratch);c->ray_triangle_scratch=0;c->ray_bvh_scratch=0;c->ray_index_scratch=0;c->ray_order_scratch=0;if(c->fallback_texture){LSVKTexture* fallback=c->fallback_texture;c->fallback_texture=0;_lsxVKDestroyTexture(c,fallback);}if(c->fallback_storage){LSVKStorage* fallback=c->fallback_storage;c->fallback_storage=0;_lsxVKDestroyStorage(c,fallback);}for(uint32_t i=0;i<2;++i){if(c->device&&c->render_finished[i])c->vkDestroySemaphore(c->device,c->render_finished[i],0);if(c->device&&c->image_available[i])c->vkDestroySemaphore(c->device,c->image_available[i],0);if(c->device&&c->in_flight[i])c->vkDestroyFence(c->device,c->in_flight[i],0);}if(c->device&&c->command_pool)c->vkDestroyCommandPool(c->device,c->command_pool,0);while(c->shaders){LSVKShader* shader=c->shaders;c->shaders=shader->next;if(shader->pipeline)c->vkDestroyPipeline(c->device,shader->pipeline,0);if(shader->compute_layout)c->vkDestroyPipelineLayout(c->device,shader->compute_layout,0);if(shader->compute_descriptor_pool)c->vkDestroyDescriptorPool(c->device,shader->compute_descriptor_pool,0);if(shader->compute_descriptor_layout)c->vkDestroyDescriptorSetLayout(c->device,shader->compute_descriptor_layout,0);ls_free(shader->vertex_words);ls_free(shader->fragment_words);ls_free(shader->compute_words);ls_free(shader);}c->bound_shader=0;if(c->device&&c->pipeline_layout)c->vkDestroyPipelineLayout(c->device,c->pipeline_layout,0);for(uint32_t uniform_frame=0;uniform_frame<2;++uniform_frame){if(c->device&&c->uniform_mapped[uniform_frame]&&c->uniform_memories[uniform_frame]){c->vkUnmapMemory(c->device,c->uniform_memories[uniform_frame]);c->uniform_mapped[uniform_frame]=0;}if(c->device&&c->uniform_buffers[uniform_frame])c->vkDestroyBuffer(c->device,c->uniform_buffers[uniform_frame],0);if(c->device&&c->uniform_memories[uniform_frame])c->vkFreeMemory(c->device,c->uniform_memories[uniform_frame],0);}if(c->device&&c->uniform_descriptor_pool)c->vkDestroyDescriptorPool(c->device,c->uniform_descriptor_pool,0);if(c->device&&c->uniform_descriptor_layout)c->vkDestroyDescriptorSetLayout(c->device,c->uniform_descriptor_layout,0);if(c->device&&c->descriptor_pool)c->vkDestroyDescriptorPool(c->device,c->descriptor_pool,0);if(c->device&&c->descriptor_layout)c->vkDestroyDescriptorSetLayout(c->device,c->descriptor_layout,0);destroy_swapchain(c);if(c->device&&c->vkDestroyDevice)c->vkDestroyDevice(c->device,0);if(c->instance&&c->surface&&c->vkDestroySurfaceKHR)c->vkDestroySurfaceKHR(c->instance,c->surface,0);if(c->instance&&c->vkDestroyInstance)c->vkDestroyInstance(c->instance,0);if(c->vulkan_module)FreeLibrary(c->vulkan_module);if(c->glfw_module)FreeLibrary(c->glfw_module);lsx_trace_line(c,"destroy.complete");lsx_trace_close(c);ls_free(c);}
