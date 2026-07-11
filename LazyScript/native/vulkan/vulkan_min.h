#ifndef LSX_VULKAN_MIN_H
#define LSX_VULKAN_MIN_H
#include <stdint.h>
#include <stddef.h>

typedef uint32_t VkBool32; typedef uint64_t VkDeviceSize; typedef uint32_t VkFlags; typedef int32_t VkResult; typedef uint32_t VkStructureType; typedef void (*PFN_vkVoidFunction)(void);

#define VK_SUCCESS (0)

#define VK_SUBOPTIMAL_KHR (1000001003)

#define VK_ERROR_OUT_OF_DATE_KHR (-1000001004)

#define VK_STRUCTURE_TYPE_APPLICATION_INFO (0)

#define VK_STRUCTURE_TYPE_INSTANCE_CREATE_INFO (1)

#define VK_STRUCTURE_TYPE_DEVICE_QUEUE_CREATE_INFO (2)

#define VK_STRUCTURE_TYPE_DEVICE_CREATE_INFO (3)

#define VK_STRUCTURE_TYPE_MEMORY_ALLOCATE_INFO (5)

#define VK_STRUCTURE_TYPE_BUFFER_CREATE_INFO (12)

#define VK_STRUCTURE_TYPE_SUBMIT_INFO (4)

#define VK_STRUCTURE_TYPE_FENCE_CREATE_INFO (8)

#define VK_STRUCTURE_TYPE_SEMAPHORE_CREATE_INFO (9)

#define VK_STRUCTURE_TYPE_IMAGE_VIEW_CREATE_INFO (15)

#define VK_STRUCTURE_TYPE_SHADER_MODULE_CREATE_INFO (16)

#define VK_STRUCTURE_TYPE_PIPELINE_SHADER_STAGE_CREATE_INFO (18)

#define VK_STRUCTURE_TYPE_PIPELINE_VERTEX_INPUT_STATE_CREATE_INFO (19)

#define VK_STRUCTURE_TYPE_PIPELINE_INPUT_ASSEMBLY_STATE_CREATE_INFO (20)

#define VK_STRUCTURE_TYPE_PIPELINE_VIEWPORT_STATE_CREATE_INFO (22)

#define VK_STRUCTURE_TYPE_PIPELINE_RASTERIZATION_STATE_CREATE_INFO (23)

#define VK_STRUCTURE_TYPE_PIPELINE_MULTISAMPLE_STATE_CREATE_INFO (24)

#define VK_STRUCTURE_TYPE_PIPELINE_COLOR_BLEND_STATE_CREATE_INFO (26)

#define VK_STRUCTURE_TYPE_PIPELINE_DYNAMIC_STATE_CREATE_INFO (27)

#define VK_STRUCTURE_TYPE_GRAPHICS_PIPELINE_CREATE_INFO (28)
#define VK_STRUCTURE_TYPE_COMPUTE_PIPELINE_CREATE_INFO (29)

#define VK_STRUCTURE_TYPE_PIPELINE_LAYOUT_CREATE_INFO (30)

#define VK_STRUCTURE_TYPE_FRAMEBUFFER_CREATE_INFO (37)

#define VK_STRUCTURE_TYPE_RENDER_PASS_CREATE_INFO (38)

#define VK_STRUCTURE_TYPE_COMMAND_POOL_CREATE_INFO (39)

#define VK_STRUCTURE_TYPE_COMMAND_BUFFER_ALLOCATE_INFO (40)

#define VK_STRUCTURE_TYPE_COMMAND_BUFFER_BEGIN_INFO (42)

#define VK_STRUCTURE_TYPE_RENDER_PASS_BEGIN_INFO (43)

#define VK_STRUCTURE_TYPE_SWAPCHAIN_CREATE_INFO_KHR (1000001000)

#define VK_STRUCTURE_TYPE_PRESENT_INFO_KHR (1000001001)

#define VK_QUEUE_GRAPHICS_BIT (0x1)
#define VK_PHYSICAL_DEVICE_TYPE_OTHER 0
#define VK_PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU 1
#define VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU 2
#define VK_PHYSICAL_DEVICE_TYPE_VIRTUAL_GPU 3
#define VK_PHYSICAL_DEVICE_TYPE_CPU 4

#define VK_FORMAT_UNDEFINED (0)
#define VK_FORMAT_B8G8R8A8_UNORM (44)
#define VK_FORMAT_B8G8R8A8_SRGB (50)

#define VK_COLOR_SPACE_SRGB_NONLINEAR_KHR (0)

#define VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT (0x10)

#define VK_BUFFER_USAGE_VERTEX_BUFFER_BIT (0x00000080)

#define VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT (0x00000002)

#define VK_MEMORY_PROPERTY_HOST_COHERENT_BIT (0x00000004)

#define VK_SHARING_MODE_EXCLUSIVE (0)

#define VK_SHARING_MODE_CONCURRENT (1)

#define VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR (0x1)

#define VK_PRESENT_MODE_IMMEDIATE_KHR (0)

#define VK_PRESENT_MODE_MAILBOX_KHR (1)

#define VK_PRESENT_MODE_FIFO_KHR (2)

#define VK_PRESENT_MODE_FIFO_RELAXED_KHR (3)

#define VK_IMAGE_VIEW_TYPE_2D (1)

#define VK_COMPONENT_SWIZZLE_IDENTITY (0)

#define VK_IMAGE_ASPECT_COLOR_BIT (0x1)

#define VK_SAMPLE_COUNT_1_BIT (0x1)

#define VK_ATTACHMENT_LOAD_OP_CLEAR (1)

#define VK_ATTACHMENT_LOAD_OP_DONT_CARE (2)

#define VK_ATTACHMENT_STORE_OP_STORE (0)

#define VK_ATTACHMENT_STORE_OP_DONT_CARE (1)

#define VK_IMAGE_LAYOUT_UNDEFINED (0)

#define VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL (2)

#define VK_IMAGE_LAYOUT_PRESENT_SRC_KHR (1000001002)

#define VK_PIPELINE_BIND_POINT_GRAPHICS (0)
#define VK_PIPELINE_BIND_POINT_COMPUTE (1)

#define VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT (0x400)

#define VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT (0x100)

#define VK_COMMAND_POOL_CREATE_RESET_COMMAND_BUFFER_BIT (0x2)

#define VK_COMMAND_BUFFER_LEVEL_PRIMARY (0)

#define VK_FENCE_CREATE_SIGNALED_BIT (0x1)

#define VK_SHADER_STAGE_VERTEX_BIT (0x1)

#define VK_SHADER_STAGE_FRAGMENT_BIT (0x10)
#define VK_SHADER_STAGE_COMPUTE_BIT (0x20)

#define VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST (3)
#define VK_PRIMITIVE_TOPOLOGY_TRIANGLE_STRIP (4)

#define VK_VERTEX_INPUT_RATE_VERTEX (0)

#define VK_FORMAT_R32_SFLOAT (100)

#define VK_FORMAT_R32G32_SFLOAT (103)

#define VK_FORMAT_R32G32B32_SFLOAT (106)

#define VK_FORMAT_R32G32B32A32_SFLOAT (109)

#define VK_POLYGON_MODE_FILL (0)

#define VK_CULL_MODE_NONE (0)

#define VK_FRONT_FACE_CLOCKWISE (1)

#define VK_COLOR_COMPONENT_R_BIT (0x1)

#define VK_COLOR_COMPONENT_G_BIT (0x2)

#define VK_COLOR_COMPONENT_B_BIT (0x4)

#define VK_COLOR_COMPONENT_A_BIT (0x8)
#define VK_BLEND_FACTOR_ZERO (0)
#define VK_BLEND_FACTOR_ONE (1)
#define VK_BLEND_FACTOR_SRC_ALPHA (6)
#define VK_BLEND_FACTOR_ONE_MINUS_SRC_ALPHA (7)
#define VK_BLEND_OP_ADD (0)

#define VK_DYNAMIC_STATE_VIEWPORT (0)

#define VK_DYNAMIC_STATE_SCISSOR (1)

#define VK_STRUCTURE_TYPE_IMAGE_CREATE_INFO (14)
#define VK_STRUCTURE_TYPE_PIPELINE_DEPTH_STENCIL_STATE_CREATE_INFO (25)
#define VK_FORMAT_D32_SFLOAT (126)
#define VK_IMAGE_TYPE_2D (1)
#define VK_IMAGE_TILING_OPTIMAL (0)
#define VK_IMAGE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT (0x00000020)
#define VK_BUFFER_USAGE_INDEX_BUFFER_BIT (0x00000040)
#define VK_BUFFER_USAGE_STORAGE_BUFFER_BIT (0x00000020)
#define VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT (0x00000010)
#define VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT (0x00000001)
#define VK_IMAGE_ASPECT_DEPTH_BIT (0x00000002)
#define VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL (3)
#define VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT (0x00000100)
#define VK_PIPELINE_STAGE_LATE_FRAGMENT_TESTS_BIT (0x00000200)
#define VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_READ_BIT (0x00000200)
#define VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT (0x00000400)
#define VK_COMPARE_OP_LESS (1)
#define VK_STENCIL_OP_KEEP (0)
#define VK_INDEX_TYPE_UINT32 (1)

#define VK_STRUCTURE_TYPE_SAMPLER_CREATE_INFO (31)
#define VK_STRUCTURE_TYPE_DESCRIPTOR_SET_LAYOUT_CREATE_INFO (32)
#define VK_STRUCTURE_TYPE_DESCRIPTOR_POOL_CREATE_INFO (33)
#define VK_STRUCTURE_TYPE_DESCRIPTOR_SET_ALLOCATE_INFO (34)
#define VK_STRUCTURE_TYPE_WRITE_DESCRIPTOR_SET (35)
#define VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER (45)
#define VK_FORMAT_R8G8B8A8_UNORM (37)
#define VK_FORMAT_R8G8B8A8_SRGB (43)
#define VK_IMAGE_USAGE_TRANSFER_SRC_BIT (0x00000001)
#define VK_IMAGE_USAGE_TRANSFER_DST_BIT (0x00000002)
#define VK_IMAGE_USAGE_SAMPLED_BIT (0x00000004)
#define VK_BUFFER_USAGE_TRANSFER_SRC_BIT (0x00000001)
#define VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL (5)
#define VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL (6)
#define VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL (7)
#define VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT (0x00000001)
#define VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT (0x00000080)
#define VK_PIPELINE_STAGE_TRANSFER_BIT (0x00001000)
#define VK_PIPELINE_STAGE_BOTTOM_OF_PIPE_BIT (0x00002000)
#define VK_ACCESS_SHADER_READ_BIT (0x00000020)
#define VK_ACCESS_TRANSFER_READ_BIT (0x00000800)
#define VK_ACCESS_TRANSFER_WRITE_BIT (0x00001000)
#define VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER (1)
#define VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER (6)
#define VK_DESCRIPTOR_TYPE_STORAGE_BUFFER (7)
#define VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER_DYNAMIC (8)
#define VK_FILTER_NEAREST (0)
#define VK_FILTER_LINEAR (1)
#define VK_SAMPLER_MIPMAP_MODE_LINEAR (1)
#define VK_SAMPLER_ADDRESS_MODE_REPEAT (0)
#define VK_BORDER_COLOR_INT_OPAQUE_BLACK (3)
#define VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT (0x00000001)
#define VK_QUEUE_FAMILY_IGNORED (~0U)

#define VK_SUBPASS_CONTENTS_INLINE (0)

typedef struct VkBuffer_T* VkBuffer;

typedef struct VkCommandBuffer_T* VkCommandBuffer;

typedef struct VkCommandPool_T* VkCommandPool;

typedef struct VkDescriptorSetLayout_T* VkDescriptorSetLayout;
typedef struct VkDescriptorPool_T* VkDescriptorPool;
typedef struct VkDescriptorSet_T* VkDescriptorSet;
typedef struct VkSampler_T* VkSampler;

typedef struct VkDevice_T* VkDevice;

typedef struct VkFence_T* VkFence;

typedef struct VkFramebuffer_T* VkFramebuffer;

typedef struct VkImage_T* VkImage;

typedef struct VkImageView_T* VkImageView;

typedef struct VkDeviceMemory_T* VkDeviceMemory;

typedef struct VkInstance_T* VkInstance;

typedef struct VkPhysicalDevice_T* VkPhysicalDevice;

typedef struct VkPipeline_T* VkPipeline;

typedef struct VkPipelineCache_T* VkPipelineCache;

typedef struct VkPipelineLayout_T* VkPipelineLayout;

typedef struct VkQueue_T* VkQueue;

typedef struct VkRenderPass_T* VkRenderPass;

typedef struct VkSemaphore_T* VkSemaphore;

typedef struct VkShaderModule_T* VkShaderModule;

typedef struct VkSurfaceKHR_T* VkSurfaceKHR;

typedef struct VkSwapchainKHR_T* VkSwapchainKHR;

typedef struct VkAllocationCallbacks VkAllocationCallbacks;

typedef struct VkPhysicalDeviceFeatures VkPhysicalDeviceFeatures;


typedef struct VkPipelineTessellationStateCreateInfo VkPipelineTessellationStateCreateInfo;

typedef struct VkPushConstantRange VkPushConstantRange;

typedef struct VkVertexInputAttributeDescription VkVertexInputAttributeDescription;

typedef struct VkVertexInputBindingDescription VkVertexInputBindingDescription;

typedef uint32_t VkAccessFlags;

typedef uint32_t VkAttachmentDescriptionFlags;

typedef uint32_t VkAttachmentLoadOp;

typedef uint32_t VkAttachmentStoreOp;

typedef uint32_t VkBlendFactor;

typedef uint32_t VkBufferCreateFlags;

typedef uint32_t VkBufferUsageFlags;

typedef uint32_t VkBlendOp;

typedef uint32_t VkColorComponentFlags;

typedef uint32_t VkColorSpaceKHR;

typedef uint32_t VkCommandBufferInheritanceInfo;

typedef uint32_t VkCommandBufferLevel;

typedef uint32_t VkCommandBufferResetFlags;

typedef uint32_t VkCommandBufferUsageFlags;

typedef uint32_t VkCommandPoolCreateFlags;

typedef uint32_t VkComponentSwizzle;

typedef uint32_t VkCompositeAlphaFlagBitsKHR;

typedef uint32_t VkCompositeAlphaFlagsKHR;

typedef uint32_t VkCullModeFlags;

typedef uint32_t VkDependencyFlags;

typedef uint32_t VkDeviceCreateFlags;

typedef uint32_t VkDeviceQueueCreateFlags;

typedef uint32_t VkDynamicState;

typedef uint32_t VkFenceCreateFlags;

typedef uint32_t VkFormat;

typedef uint32_t VkFramebufferCreateFlags;

typedef uint32_t VkFrontFace;

typedef uint32_t VkImageAspectFlags;
typedef uint32_t VkImageCreateFlags;
typedef uint32_t VkImageType;
typedef uint32_t VkDescriptorType;
typedef uint32_t VkDescriptorPoolCreateFlags;
typedef uint32_t VkDescriptorSetLayoutCreateFlags;
typedef uint32_t VkSamplerCreateFlags;
typedef uint32_t VkFilter;
typedef uint32_t VkSamplerMipmapMode;
typedef uint32_t VkSamplerAddressMode;
typedef uint32_t VkBorderColor;
typedef uint32_t VkImageMemoryBarrierFlags;
typedef uint32_t VkImageTiling;
typedef uint32_t VkCompareOp;
typedef uint32_t VkStencilOp;
typedef uint32_t VkIndexType;

typedef uint32_t VkImageLayout;

typedef uint32_t VkImageUsageFlags;

typedef uint32_t VkImageViewCreateFlags;

typedef uint32_t VkImageViewType;

typedef uint32_t VkMemoryHeapFlags;

typedef uint32_t VkMemoryMapFlags;

typedef uint32_t VkMemoryPropertyFlags;

typedef uint32_t VkInstanceCreateFlags;

typedef uint32_t VkLogicOp;

typedef uint32_t VkPipelineBindPoint;

typedef uint32_t VkPipelineColorBlendStateCreateFlags;

typedef uint32_t VkPipelineCreateFlags;

typedef uint32_t VkPipelineDynamicStateCreateFlags;

typedef uint32_t VkPipelineInputAssemblyStateCreateFlags;

typedef uint32_t VkPipelineLayoutCreateFlags;

typedef uint32_t VkPipelineMultisampleStateCreateFlags;

typedef uint32_t VkPipelineRasterizationStateCreateFlags;

typedef uint32_t VkPipelineShaderStageCreateFlags;

typedef uint32_t VkPipelineStageFlags;

typedef uint32_t VkPipelineVertexInputStateCreateFlags;

typedef uint32_t VkPipelineViewportStateCreateFlags;

typedef uint32_t VkPolygonMode;

typedef uint32_t VkPresentModeKHR;

typedef uint32_t VkPrimitiveTopology;

typedef uint32_t VkQueueFlags;

typedef uint32_t VkRenderPassCreateFlags;

typedef uint32_t VkSampleCountFlagBits;

typedef uint32_t VkSampleMask;

typedef uint32_t VkSemaphoreCreateFlags;

typedef uint32_t VkShaderModuleCreateFlags;

typedef uint32_t VkShaderStageFlagBits;

typedef uint32_t VkVertexInputRate;

typedef uint32_t VkSharingMode;

typedef uint32_t VkSpecializationMapEntry;

typedef uint32_t VkSubpassContents;

typedef uint32_t VkSubpassDescriptionFlags;

typedef uint32_t VkSurfaceTransformFlagBitsKHR;

typedef uint32_t VkSurfaceTransformFlagsKHR;

typedef uint32_t VkSwapchainCreateFlagsKHR;

typedef struct VkExtent2D {
    uint32_t width;
    uint32_t height;
} VkExtent2D;

typedef struct VkExtent3D {
    uint32_t width;
    uint32_t height;
    uint32_t depth;
} VkExtent3D;

typedef struct VkOffset2D {
    int32_t x;
    int32_t y;
} VkOffset2D;

typedef struct VkRect2D {
    VkOffset2D offset;
    VkExtent2D extent;
} VkRect2D;

typedef struct VkViewport {
    float x;
    float y;
    float width;
    float height;
    float minDepth;
    float maxDepth;
} VkViewport;

typedef union VkClearColorValue {
    float float32[4];
    int32_t int32[4];
    uint32_t uint32[4];
} VkClearColorValue;

typedef struct VkClearDepthStencilValue {
    float depth;
    uint32_t stencil;
} VkClearDepthStencilValue;

typedef union VkClearValue {
    VkClearColorValue color;
    VkClearDepthStencilValue depthStencil;
} VkClearValue;

typedef struct VkBufferCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkBufferCreateFlags flags;
    VkDeviceSize size;
    VkBufferUsageFlags usage;
    VkSharingMode sharingMode;
    uint32_t queueFamilyIndexCount;
    const uint32_t* pQueueFamilyIndices;
} VkBufferCreateInfo;

typedef struct VkMemoryRequirements {
    VkDeviceSize size;
    VkDeviceSize alignment;
    uint32_t memoryTypeBits;
} VkMemoryRequirements;

typedef struct VkMemoryAllocateInfo {
    VkStructureType sType;
    const void* pNext;
    VkDeviceSize allocationSize;
    uint32_t memoryTypeIndex;
} VkMemoryAllocateInfo;

typedef struct VkMemoryType {
    VkMemoryPropertyFlags propertyFlags;
    uint32_t heapIndex;
} VkMemoryType;

typedef struct VkMemoryHeap {
    VkDeviceSize size;
    VkMemoryHeapFlags flags;
} VkMemoryHeap;

typedef struct VkPhysicalDeviceMemoryProperties {
    uint32_t memoryTypeCount;
    VkMemoryType memoryTypes[32];
    uint32_t memoryHeapCount;
    VkMemoryHeap memoryHeaps[16];
} VkPhysicalDeviceMemoryProperties;

typedef struct VkVertexInputBindingDescription {
    uint32_t binding;
    uint32_t stride;
    VkVertexInputRate inputRate;
} VkVertexInputBindingDescription;

typedef struct VkVertexInputAttributeDescription {
    uint32_t location;
    uint32_t binding;
    VkFormat format;
    uint32_t offset;
} VkVertexInputAttributeDescription;

typedef struct VkApplicationInfo {
    VkStructureType sType;
    const void* pNext;
    const char* pApplicationName;
    uint32_t applicationVersion;
    const char* pEngineName;
    uint32_t engineVersion;
    uint32_t apiVersion;
} VkApplicationInfo;

typedef struct VkInstanceCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkInstanceCreateFlags flags;
    const VkApplicationInfo* pApplicationInfo;
    uint32_t enabledLayerCount;
    const char* const* ppEnabledLayerNames;
    uint32_t enabledExtensionCount;
    const char* const* ppEnabledExtensionNames;
} VkInstanceCreateInfo;

typedef struct VkExtensionProperties {
    char extensionName[256U];
    uint32_t specVersion;
} VkExtensionProperties;

typedef struct VkQueueFamilyProperties {
    VkQueueFlags queueFlags;
    uint32_t queueCount;
    uint32_t timestampValidBits;
    VkExtent3D minImageTransferGranularity;
} VkQueueFamilyProperties;

typedef struct VkSurfaceCapabilitiesKHR {
    uint32_t minImageCount;
    uint32_t maxImageCount;
    VkExtent2D currentExtent;
    VkExtent2D minImageExtent;
    VkExtent2D maxImageExtent;
    uint32_t maxImageArrayLayers;
    VkSurfaceTransformFlagsKHR supportedTransforms;
    VkSurfaceTransformFlagBitsKHR currentTransform;
    VkCompositeAlphaFlagsKHR supportedCompositeAlpha;
    VkImageUsageFlags supportedUsageFlags;
} VkSurfaceCapabilitiesKHR;

typedef struct VkSurfaceFormatKHR {
    VkFormat format;
    VkColorSpaceKHR colorSpace;
} VkSurfaceFormatKHR;

typedef struct VkDeviceQueueCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkDeviceQueueCreateFlags flags;
    uint32_t queueFamilyIndex;
    uint32_t queueCount;
    const float* pQueuePriorities;
} VkDeviceQueueCreateInfo;

typedef struct VkDeviceCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkDeviceCreateFlags flags;
    uint32_t queueCreateInfoCount;
    const VkDeviceQueueCreateInfo* pQueueCreateInfos;
    uint32_t enabledLayerCount;
    const char* const* ppEnabledLayerNames;
    uint32_t enabledExtensionCount;
    const char* const* ppEnabledExtensionNames;
    const VkPhysicalDeviceFeatures* pEnabledFeatures;
} VkDeviceCreateInfo;

typedef struct VkSwapchainCreateInfoKHR {
    VkStructureType sType;
    const void* pNext;
    VkSwapchainCreateFlagsKHR flags;
    VkSurfaceKHR surface;
    uint32_t minImageCount;
    VkFormat imageFormat;
    VkColorSpaceKHR imageColorSpace;
    VkExtent2D imageExtent;
    uint32_t imageArrayLayers;
    VkImageUsageFlags imageUsage;
    VkSharingMode imageSharingMode;
    uint32_t queueFamilyIndexCount;
    const uint32_t* pQueueFamilyIndices;
    VkSurfaceTransformFlagBitsKHR preTransform;
    VkCompositeAlphaFlagBitsKHR compositeAlpha;
    VkPresentModeKHR presentMode;
    VkBool32 clipped;
    VkSwapchainKHR oldSwapchain;
} VkSwapchainCreateInfoKHR;

typedef struct VkComponentMapping {
    VkComponentSwizzle r;
    VkComponentSwizzle g;
    VkComponentSwizzle b;
    VkComponentSwizzle a;
} VkComponentMapping;

typedef struct VkImageSubresourceRange {
    VkImageAspectFlags aspectMask;
    uint32_t baseMipLevel;
    uint32_t levelCount;
    uint32_t baseArrayLayer;
    uint32_t layerCount;
} VkImageSubresourceRange;

typedef struct VkDescriptorSetLayoutBinding {
    uint32_t binding;
    VkDescriptorType descriptorType;
    uint32_t descriptorCount;
    VkShaderStageFlagBits stageFlags;
    const VkSampler* pImmutableSamplers;
} VkDescriptorSetLayoutBinding;

typedef struct VkDescriptorSetLayoutCreateInfo {
    VkStructureType sType; const void* pNext; VkDescriptorSetLayoutCreateFlags flags;
    uint32_t bindingCount; const VkDescriptorSetLayoutBinding* pBindings;
} VkDescriptorSetLayoutCreateInfo;

typedef struct VkDescriptorPoolSize { VkDescriptorType type; uint32_t descriptorCount; } VkDescriptorPoolSize;
typedef struct VkDescriptorPoolCreateInfo {
    VkStructureType sType; const void* pNext; VkDescriptorPoolCreateFlags flags;
    uint32_t maxSets; uint32_t poolSizeCount; const VkDescriptorPoolSize* pPoolSizes;
} VkDescriptorPoolCreateInfo;
typedef struct VkDescriptorSetAllocateInfo {
    VkStructureType sType; const void* pNext; VkDescriptorPool descriptorPool;
    uint32_t descriptorSetCount; const VkDescriptorSetLayout* pSetLayouts;
} VkDescriptorSetAllocateInfo;
typedef struct VkDescriptorImageInfo { VkSampler sampler; VkImageView imageView; VkImageLayout imageLayout; } VkDescriptorImageInfo;
typedef struct VkDescriptorBufferInfo { VkBuffer buffer; VkDeviceSize offset; VkDeviceSize range; } VkDescriptorBufferInfo;
typedef struct VkWriteDescriptorSet {
    VkStructureType sType; const void* pNext; VkDescriptorSet dstSet; uint32_t dstBinding; uint32_t dstArrayElement;
    uint32_t descriptorCount; VkDescriptorType descriptorType; const VkDescriptorImageInfo* pImageInfo; const void* pBufferInfo; const void* pTexelBufferView;
} VkWriteDescriptorSet;

typedef struct VkSamplerCreateInfo {
    VkStructureType sType; const void* pNext; VkSamplerCreateFlags flags; VkFilter magFilter; VkFilter minFilter;
    VkSamplerMipmapMode mipmapMode; VkSamplerAddressMode addressModeU; VkSamplerAddressMode addressModeV; VkSamplerAddressMode addressModeW;
    float mipLodBias; VkBool32 anisotropyEnable; float maxAnisotropy; VkBool32 compareEnable; VkCompareOp compareOp;
    float minLod; float maxLod; VkBorderColor borderColor; VkBool32 unnormalizedCoordinates;
} VkSamplerCreateInfo;

typedef struct VkImageSubresourceLayers { VkImageAspectFlags aspectMask; uint32_t mipLevel; uint32_t baseArrayLayer; uint32_t layerCount; } VkImageSubresourceLayers;
typedef struct VkOffset3D { int32_t x; int32_t y; int32_t z; } VkOffset3D;
typedef struct VkBufferImageCopy {
    VkDeviceSize bufferOffset; uint32_t bufferRowLength; uint32_t bufferImageHeight; VkImageSubresourceLayers imageSubresource;
    VkOffset3D imageOffset; VkExtent3D imageExtent;
} VkBufferImageCopy;
typedef struct VkImageBlit {
    VkImageSubresourceLayers srcSubresource; VkOffset3D srcOffsets[2];
    VkImageSubresourceLayers dstSubresource; VkOffset3D dstOffsets[2];
} VkImageBlit;
typedef struct VkImageMemoryBarrier {
    VkStructureType sType; const void* pNext; VkAccessFlags srcAccessMask; VkAccessFlags dstAccessMask;
    VkImageLayout oldLayout; VkImageLayout newLayout; uint32_t srcQueueFamilyIndex; uint32_t dstQueueFamilyIndex;
    VkImage image; VkImageSubresourceRange subresourceRange;
} VkImageMemoryBarrier;

typedef struct VkImageCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkImageCreateFlags flags;
    VkImageType imageType;
    VkFormat format;
    VkExtent3D extent;
    uint32_t mipLevels;
    uint32_t arrayLayers;
    VkSampleCountFlagBits samples;
    VkImageTiling tiling;
    VkImageUsageFlags usage;
    VkSharingMode sharingMode;
    uint32_t queueFamilyIndexCount;
    const uint32_t* pQueueFamilyIndices;
    VkImageLayout initialLayout;
} VkImageCreateInfo;

typedef struct VkStencilOpState {
    VkStencilOp failOp;
    VkStencilOp passOp;
    VkStencilOp depthFailOp;
    VkCompareOp compareOp;
    uint32_t compareMask;
    uint32_t writeMask;
    uint32_t reference;
} VkStencilOpState;

typedef struct VkPipelineDepthStencilStateCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkFlags flags;
    VkBool32 depthTestEnable;
    VkBool32 depthWriteEnable;
    VkCompareOp depthCompareOp;
    VkBool32 depthBoundsTestEnable;
    VkBool32 stencilTestEnable;
    VkStencilOpState front;
    VkStencilOpState back;
    float minDepthBounds;
    float maxDepthBounds;
} VkPipelineDepthStencilStateCreateInfo;

typedef struct VkImageViewCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkImageViewCreateFlags flags;
    VkImage image;
    VkImageViewType viewType;
    VkFormat format;
    VkComponentMapping components;
    VkImageSubresourceRange subresourceRange;
} VkImageViewCreateInfo;

typedef struct VkAttachmentDescription {
    VkAttachmentDescriptionFlags flags;
    VkFormat format;
    VkSampleCountFlagBits samples;
    VkAttachmentLoadOp loadOp;
    VkAttachmentStoreOp storeOp;
    VkAttachmentLoadOp stencilLoadOp;
    VkAttachmentStoreOp stencilStoreOp;
    VkImageLayout initialLayout;
    VkImageLayout finalLayout;
} VkAttachmentDescription;

typedef struct VkAttachmentReference {
    uint32_t attachment;
    VkImageLayout layout;
} VkAttachmentReference;

typedef struct VkSubpassDescription {
    VkSubpassDescriptionFlags flags;
    VkPipelineBindPoint pipelineBindPoint;
    uint32_t inputAttachmentCount;
    const VkAttachmentReference* pInputAttachments;
    uint32_t colorAttachmentCount;
    const VkAttachmentReference* pColorAttachments;
    const VkAttachmentReference* pResolveAttachments;
    const VkAttachmentReference* pDepthStencilAttachment;
    uint32_t preserveAttachmentCount;
    const uint32_t* pPreserveAttachments;
} VkSubpassDescription;

typedef struct VkSubpassDependency {
    uint32_t srcSubpass;
    uint32_t dstSubpass;
    VkPipelineStageFlags srcStageMask;
    VkPipelineStageFlags dstStageMask;
    VkAccessFlags srcAccessMask;
    VkAccessFlags dstAccessMask;
    VkDependencyFlags dependencyFlags;
} VkSubpassDependency;

typedef struct VkRenderPassCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkRenderPassCreateFlags flags;
    uint32_t attachmentCount;
    const VkAttachmentDescription* pAttachments;
    uint32_t subpassCount;
    const VkSubpassDescription* pSubpasses;
    uint32_t dependencyCount;
    const VkSubpassDependency* pDependencies;
} VkRenderPassCreateInfo;

typedef struct VkFramebufferCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkFramebufferCreateFlags flags;
    VkRenderPass renderPass;
    uint32_t attachmentCount;
    const VkImageView* pAttachments;
    uint32_t width;
    uint32_t height;
    uint32_t layers;
} VkFramebufferCreateInfo;

typedef struct VkPipelineLayoutCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkPipelineLayoutCreateFlags flags;
    uint32_t setLayoutCount;
    const VkDescriptorSetLayout* pSetLayouts;
    uint32_t pushConstantRangeCount;
    const VkPushConstantRange* pPushConstantRanges;
} VkPipelineLayoutCreateInfo;

typedef struct VkCommandPoolCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkCommandPoolCreateFlags flags;
    uint32_t queueFamilyIndex;
} VkCommandPoolCreateInfo;

typedef struct VkCommandBufferAllocateInfo {
    VkStructureType sType;
    const void* pNext;
    VkCommandPool commandPool;
    VkCommandBufferLevel level;
    uint32_t commandBufferCount;
} VkCommandBufferAllocateInfo;

typedef struct VkSemaphoreCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkSemaphoreCreateFlags flags;
} VkSemaphoreCreateInfo;

typedef struct VkFenceCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkFenceCreateFlags flags;
} VkFenceCreateInfo;

typedef struct VkShaderModuleCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkShaderModuleCreateFlags flags;
    size_t codeSize;
    const uint32_t* pCode;
} VkShaderModuleCreateInfo;

typedef struct VkSpecializationInfo {
    uint32_t mapEntryCount;
    const VkSpecializationMapEntry* pMapEntries;
    size_t dataSize;
    const void* pData;
} VkSpecializationInfo;

typedef struct VkPipelineShaderStageCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkPipelineShaderStageCreateFlags flags;
    VkShaderStageFlagBits stage;
    VkShaderModule module;
    const char* pName;
    const VkSpecializationInfo* pSpecializationInfo;
} VkPipelineShaderStageCreateInfo;

typedef struct VkPipelineVertexInputStateCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkPipelineVertexInputStateCreateFlags flags;
    uint32_t vertexBindingDescriptionCount;
    const VkVertexInputBindingDescription* pVertexBindingDescriptions;
    uint32_t vertexAttributeDescriptionCount;
    const VkVertexInputAttributeDescription* pVertexAttributeDescriptions;
} VkPipelineVertexInputStateCreateInfo;

typedef struct VkPipelineInputAssemblyStateCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkPipelineInputAssemblyStateCreateFlags flags;
    VkPrimitiveTopology topology;
    VkBool32 primitiveRestartEnable;
} VkPipelineInputAssemblyStateCreateInfo;

typedef struct VkPipelineViewportStateCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkPipelineViewportStateCreateFlags flags;
    uint32_t viewportCount;
    const VkViewport* pViewports;
    uint32_t scissorCount;
    const VkRect2D* pScissors;
} VkPipelineViewportStateCreateInfo;

typedef struct VkPipelineRasterizationStateCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkPipelineRasterizationStateCreateFlags flags;
    VkBool32 depthClampEnable;
    VkBool32 rasterizerDiscardEnable;
    VkPolygonMode polygonMode;
    VkCullModeFlags cullMode;
    VkFrontFace frontFace;
    VkBool32 depthBiasEnable;
    float depthBiasConstantFactor;
    float depthBiasClamp;
    float depthBiasSlopeFactor;
    float lineWidth;
} VkPipelineRasterizationStateCreateInfo;

typedef struct VkPipelineMultisampleStateCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkPipelineMultisampleStateCreateFlags flags;
    VkSampleCountFlagBits rasterizationSamples;
    VkBool32 sampleShadingEnable;
    float minSampleShading;
    const VkSampleMask* pSampleMask;
    VkBool32 alphaToCoverageEnable;
    VkBool32 alphaToOneEnable;
} VkPipelineMultisampleStateCreateInfo;

typedef struct VkPipelineColorBlendAttachmentState {
    VkBool32 blendEnable;
    VkBlendFactor srcColorBlendFactor;
    VkBlendFactor dstColorBlendFactor;
    VkBlendOp colorBlendOp;
    VkBlendFactor srcAlphaBlendFactor;
    VkBlendFactor dstAlphaBlendFactor;
    VkBlendOp alphaBlendOp;
    VkColorComponentFlags colorWriteMask;
} VkPipelineColorBlendAttachmentState;

typedef struct VkPipelineColorBlendStateCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkPipelineColorBlendStateCreateFlags flags;
    VkBool32 logicOpEnable;
    VkLogicOp logicOp;
    uint32_t attachmentCount;
    const VkPipelineColorBlendAttachmentState* pAttachments;
    float blendConstants[4];
} VkPipelineColorBlendStateCreateInfo;

typedef struct VkPipelineDynamicStateCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkPipelineDynamicStateCreateFlags flags;
    uint32_t dynamicStateCount;
    const VkDynamicState* pDynamicStates;
} VkPipelineDynamicStateCreateInfo;

typedef struct VkGraphicsPipelineCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkPipelineCreateFlags flags;
    uint32_t stageCount;
    const VkPipelineShaderStageCreateInfo* pStages;
    const VkPipelineVertexInputStateCreateInfo* pVertexInputState;
    const VkPipelineInputAssemblyStateCreateInfo* pInputAssemblyState;
    const VkPipelineTessellationStateCreateInfo* pTessellationState;
    const VkPipelineViewportStateCreateInfo* pViewportState;
    const VkPipelineRasterizationStateCreateInfo* pRasterizationState;
    const VkPipelineMultisampleStateCreateInfo* pMultisampleState;
    const VkPipelineDepthStencilStateCreateInfo* pDepthStencilState;
    const VkPipelineColorBlendStateCreateInfo* pColorBlendState;
    const VkPipelineDynamicStateCreateInfo* pDynamicState;
    VkPipelineLayout layout;
    VkRenderPass renderPass;
    uint32_t subpass;
    VkPipeline basePipelineHandle;
    int32_t basePipelineIndex;
} VkGraphicsPipelineCreateInfo;

typedef struct VkComputePipelineCreateInfo {
    VkStructureType sType;
    const void* pNext;
    VkPipelineCreateFlags flags;
    VkPipelineShaderStageCreateInfo stage;
    VkPipelineLayout layout;
    VkPipeline basePipelineHandle;
    int32_t basePipelineIndex;
} VkComputePipelineCreateInfo;

typedef struct VkCommandBufferBeginInfo {
    VkStructureType sType;
    const void* pNext;
    VkCommandBufferUsageFlags flags;
    const VkCommandBufferInheritanceInfo* pInheritanceInfo;
} VkCommandBufferBeginInfo;

typedef struct VkRenderPassBeginInfo {
    VkStructureType sType;
    const void* pNext;
    VkRenderPass renderPass;
    VkFramebuffer framebuffer;
    VkRect2D renderArea;
    uint32_t clearValueCount;
    const VkClearValue* pClearValues;
} VkRenderPassBeginInfo;

typedef struct VkSubmitInfo {
    VkStructureType sType;
    const void* pNext;
    uint32_t waitSemaphoreCount;
    const VkSemaphore* pWaitSemaphores;
    const VkPipelineStageFlags* pWaitDstStageMask;
    uint32_t commandBufferCount;
    const VkCommandBuffer* pCommandBuffers;
    uint32_t signalSemaphoreCount;
    const VkSemaphore* pSignalSemaphores;
} VkSubmitInfo;

typedef struct VkPresentInfoKHR {
    VkStructureType sType;
    const void* pNext;
    uint32_t waitSemaphoreCount;
    const VkSemaphore* pWaitSemaphores;
    uint32_t swapchainCount;
    const VkSwapchainKHR* pSwapchains;
    const uint32_t* pImageIndices;
    VkResult* pResults;
} VkPresentInfoKHR;

typedef PFN_vkVoidFunction ( *PFN_vkGetInstanceProcAddr)(VkInstance instance, const char* pName);

typedef PFN_vkVoidFunction ( *PFN_vkGetDeviceProcAddr)(VkDevice device, const char* pName);

typedef VkResult ( *PFN_vkCreateInstance)(const VkInstanceCreateInfo* pCreateInfo, const VkAllocationCallbacks* pAllocator, VkInstance* pInstance);

typedef void ( *PFN_vkDestroyInstance)(VkInstance instance, const VkAllocationCallbacks* pAllocator);

typedef VkResult ( *PFN_vkEnumeratePhysicalDevices)(VkInstance instance, uint32_t* pPhysicalDeviceCount, VkPhysicalDevice* pPhysicalDevices);

typedef void ( *PFN_vkGetPhysicalDeviceProperties)(VkPhysicalDevice physicalDevice, void* pProperties);
typedef void ( *PFN_vkGetPhysicalDeviceQueueFamilyProperties)(VkPhysicalDevice physicalDevice, uint32_t* pQueueFamilyPropertyCount, VkQueueFamilyProperties* pQueueFamilyProperties);

typedef VkResult ( *PFN_vkEnumerateDeviceExtensionProperties)(VkPhysicalDevice physicalDevice, const char* pLayerName, uint32_t* pPropertyCount, VkExtensionProperties* pProperties);

typedef VkResult ( *PFN_vkGetPhysicalDeviceSurfaceSupportKHR)(VkPhysicalDevice physicalDevice, uint32_t queueFamilyIndex, VkSurfaceKHR surface, VkBool32* pSupported);

typedef VkResult ( *PFN_vkGetPhysicalDeviceSurfaceCapabilitiesKHR)(VkPhysicalDevice physicalDevice, VkSurfaceKHR surface, VkSurfaceCapabilitiesKHR* pSurfaceCapabilities);

typedef VkResult ( *PFN_vkGetPhysicalDeviceSurfaceFormatsKHR)(VkPhysicalDevice physicalDevice, VkSurfaceKHR surface, uint32_t* pSurfaceFormatCount, VkSurfaceFormatKHR* pSurfaceFormats);

typedef VkResult ( *PFN_vkGetPhysicalDeviceSurfacePresentModesKHR)(VkPhysicalDevice physicalDevice, VkSurfaceKHR surface, uint32_t* pPresentModeCount, VkPresentModeKHR* pPresentModes);

typedef void ( *PFN_vkGetPhysicalDeviceMemoryProperties)(VkPhysicalDevice physicalDevice, VkPhysicalDeviceMemoryProperties* pMemoryProperties);

typedef VkResult ( *PFN_vkCreateDevice)(VkPhysicalDevice physicalDevice, const VkDeviceCreateInfo* pCreateInfo, const VkAllocationCallbacks* pAllocator, VkDevice* pDevice);

typedef void ( *PFN_vkDestroySurfaceKHR)(VkInstance instance, VkSurfaceKHR surface, const VkAllocationCallbacks* pAllocator);

typedef void ( *PFN_vkDestroyDevice)(VkDevice device, const VkAllocationCallbacks* pAllocator);

typedef void ( *PFN_vkGetDeviceQueue)(VkDevice device, uint32_t queueFamilyIndex, uint32_t queueIndex, VkQueue* pQueue);

typedef VkResult ( *PFN_vkCreateBuffer)(VkDevice device, const VkBufferCreateInfo* pCreateInfo, const VkAllocationCallbacks* pAllocator, VkBuffer* pBuffer);

typedef void ( *PFN_vkDestroyBuffer)(VkDevice device, VkBuffer buffer, const VkAllocationCallbacks* pAllocator);

typedef void ( *PFN_vkGetBufferMemoryRequirements)(VkDevice device, VkBuffer buffer, VkMemoryRequirements* pMemoryRequirements);

typedef VkResult ( *PFN_vkCreateImage)(VkDevice device, const VkImageCreateInfo* pCreateInfo, const VkAllocationCallbacks* pAllocator, VkImage* pImage);
typedef void ( *PFN_vkDestroyImage)(VkDevice device, VkImage image, const VkAllocationCallbacks* pAllocator);
typedef void ( *PFN_vkGetImageMemoryRequirements)(VkDevice device, VkImage image, VkMemoryRequirements* pMemoryRequirements);
typedef VkResult ( *PFN_vkBindImageMemory)(VkDevice device, VkImage image, VkDeviceMemory memory, VkDeviceSize memoryOffset);
typedef VkResult ( *PFN_vkCreateSampler)(VkDevice device, const VkSamplerCreateInfo* pCreateInfo, const VkAllocationCallbacks* pAllocator, VkSampler* pSampler);
typedef void ( *PFN_vkDestroySampler)(VkDevice device, VkSampler sampler, const VkAllocationCallbacks* pAllocator);
typedef VkResult ( *PFN_vkCreateDescriptorSetLayout)(VkDevice device, const VkDescriptorSetLayoutCreateInfo* pCreateInfo, const VkAllocationCallbacks* pAllocator, VkDescriptorSetLayout* pSetLayout);
typedef void ( *PFN_vkDestroyDescriptorSetLayout)(VkDevice device, VkDescriptorSetLayout descriptorSetLayout, const VkAllocationCallbacks* pAllocator);
typedef VkResult ( *PFN_vkCreateDescriptorPool)(VkDevice device, const VkDescriptorPoolCreateInfo* pCreateInfo, const VkAllocationCallbacks* pAllocator, VkDescriptorPool* pDescriptorPool);
typedef void ( *PFN_vkDestroyDescriptorPool)(VkDevice device, VkDescriptorPool descriptorPool, const VkAllocationCallbacks* pAllocator);
typedef VkResult ( *PFN_vkAllocateDescriptorSets)(VkDevice device, const VkDescriptorSetAllocateInfo* pAllocateInfo, VkDescriptorSet* pDescriptorSets);
typedef void ( *PFN_vkUpdateDescriptorSets)(VkDevice device, uint32_t descriptorWriteCount, const VkWriteDescriptorSet* pDescriptorWrites, uint32_t descriptorCopyCount, const void* pDescriptorCopies);

typedef VkResult ( *PFN_vkAllocateMemory)(VkDevice device, const VkMemoryAllocateInfo* pAllocateInfo, const VkAllocationCallbacks* pAllocator, VkDeviceMemory* pMemory);

typedef void ( *PFN_vkFreeMemory)(VkDevice device, VkDeviceMemory memory, const VkAllocationCallbacks* pAllocator);

typedef VkResult ( *PFN_vkBindBufferMemory)(VkDevice device, VkBuffer buffer, VkDeviceMemory memory, VkDeviceSize memoryOffset);

typedef VkResult ( *PFN_vkMapMemory)(VkDevice device, VkDeviceMemory memory, VkDeviceSize offset, VkDeviceSize size, VkMemoryMapFlags flags, void** ppData);

typedef void ( *PFN_vkUnmapMemory)(VkDevice device, VkDeviceMemory memory);

typedef VkResult ( *PFN_vkCreateSwapchainKHR)(VkDevice device, const VkSwapchainCreateInfoKHR* pCreateInfo, const VkAllocationCallbacks* pAllocator, VkSwapchainKHR* pSwapchain);

typedef void ( *PFN_vkDestroySwapchainKHR)(VkDevice device, VkSwapchainKHR swapchain, const VkAllocationCallbacks* pAllocator);

typedef VkResult ( *PFN_vkGetSwapchainImagesKHR)(VkDevice device, VkSwapchainKHR swapchain, uint32_t* pSwapchainImageCount, VkImage* pSwapchainImages);

typedef VkResult ( *PFN_vkCreateImageView)(VkDevice device, const VkImageViewCreateInfo* pCreateInfo, const VkAllocationCallbacks* pAllocator, VkImageView* pView);

typedef void ( *PFN_vkDestroyImageView)(VkDevice device, VkImageView imageView, const VkAllocationCallbacks* pAllocator);

typedef VkResult ( *PFN_vkCreateRenderPass)(VkDevice device, const VkRenderPassCreateInfo* pCreateInfo, const VkAllocationCallbacks* pAllocator, VkRenderPass* pRenderPass);

typedef void ( *PFN_vkDestroyRenderPass)(VkDevice device, VkRenderPass renderPass, const VkAllocationCallbacks* pAllocator);

typedef VkResult ( *PFN_vkCreateFramebuffer)(VkDevice device, const VkFramebufferCreateInfo* pCreateInfo, const VkAllocationCallbacks* pAllocator, VkFramebuffer* pFramebuffer);

typedef void ( *PFN_vkDestroyFramebuffer)(VkDevice device, VkFramebuffer framebuffer, const VkAllocationCallbacks* pAllocator);

typedef VkResult ( *PFN_vkCreatePipelineLayout)(VkDevice device, const VkPipelineLayoutCreateInfo* pCreateInfo, const VkAllocationCallbacks* pAllocator, VkPipelineLayout* pPipelineLayout);

typedef void ( *PFN_vkDestroyPipelineLayout)(VkDevice device, VkPipelineLayout pipelineLayout, const VkAllocationCallbacks* pAllocator);

typedef VkResult ( *PFN_vkCreateShaderModule)(VkDevice device, const VkShaderModuleCreateInfo* pCreateInfo, const VkAllocationCallbacks* pAllocator, VkShaderModule* pShaderModule);

typedef void ( *PFN_vkDestroyShaderModule)(VkDevice device, VkShaderModule shaderModule, const VkAllocationCallbacks* pAllocator);

typedef VkResult ( *PFN_vkCreateGraphicsPipelines)(VkDevice device, VkPipelineCache pipelineCache, uint32_t createInfoCount, const VkGraphicsPipelineCreateInfo* pCreateInfos, const VkAllocationCallbacks* pAllocator, VkPipeline* pPipelines);
typedef VkResult ( *PFN_vkCreateComputePipelines)(VkDevice device, VkPipelineCache pipelineCache, uint32_t createInfoCount, const VkComputePipelineCreateInfo* pCreateInfos, const VkAllocationCallbacks* pAllocator, VkPipeline* pPipelines);

typedef void ( *PFN_vkDestroyPipeline)(VkDevice device, VkPipeline pipeline, const VkAllocationCallbacks* pAllocator);

typedef VkResult ( *PFN_vkCreateCommandPool)(VkDevice device, const VkCommandPoolCreateInfo* pCreateInfo, const VkAllocationCallbacks* pAllocator, VkCommandPool* pCommandPool);

typedef void ( *PFN_vkDestroyCommandPool)(VkDevice device, VkCommandPool commandPool, const VkAllocationCallbacks* pAllocator);

typedef VkResult ( *PFN_vkAllocateCommandBuffers)(VkDevice device, const VkCommandBufferAllocateInfo* pAllocateInfo, VkCommandBuffer* pCommandBuffers);

typedef VkResult ( *PFN_vkResetCommandBuffer)(VkCommandBuffer commandBuffer, VkCommandBufferResetFlags flags);

typedef VkResult ( *PFN_vkBeginCommandBuffer)(VkCommandBuffer commandBuffer, const VkCommandBufferBeginInfo* pBeginInfo);

typedef VkResult ( *PFN_vkEndCommandBuffer)(VkCommandBuffer commandBuffer);

typedef void ( *PFN_vkCmdBeginRenderPass)(VkCommandBuffer commandBuffer, const VkRenderPassBeginInfo* pRenderPassBegin, VkSubpassContents contents);

typedef void ( *PFN_vkCmdEndRenderPass)(VkCommandBuffer commandBuffer);

typedef void ( *PFN_vkCmdSetViewport)(VkCommandBuffer commandBuffer, uint32_t firstViewport, uint32_t viewportCount, const VkViewport* pViewports);

typedef void ( *PFN_vkCmdSetScissor)(VkCommandBuffer commandBuffer, uint32_t firstScissor, uint32_t scissorCount, const VkRect2D* pScissors);

typedef void ( *PFN_vkCmdBindPipeline)(VkCommandBuffer commandBuffer, VkPipelineBindPoint pipelineBindPoint, VkPipeline pipeline);

typedef void ( *PFN_vkCmdBindVertexBuffers)(VkCommandBuffer commandBuffer, uint32_t firstBinding, uint32_t bindingCount, const VkBuffer* pBuffers, const VkDeviceSize* pOffsets);

typedef void ( *PFN_vkCmdBindIndexBuffer)(VkCommandBuffer commandBuffer, VkBuffer buffer, VkDeviceSize offset, VkIndexType indexType);
typedef void ( *PFN_vkCmdDrawIndexed)(VkCommandBuffer commandBuffer, uint32_t indexCount, uint32_t instanceCount, uint32_t firstIndex, int32_t vertexOffset, uint32_t firstInstance);
typedef void ( *PFN_vkCmdDispatch)(VkCommandBuffer commandBuffer, uint32_t groupCountX, uint32_t groupCountY, uint32_t groupCountZ);
typedef void ( *PFN_vkCmdPipelineBarrier)(VkCommandBuffer commandBuffer, VkPipelineStageFlags srcStageMask, VkPipelineStageFlags dstStageMask, VkDependencyFlags dependencyFlags, uint32_t memoryBarrierCount, const void* pMemoryBarriers, uint32_t bufferMemoryBarrierCount, const void* pBufferMemoryBarriers, uint32_t imageMemoryBarrierCount, const VkImageMemoryBarrier* pImageMemoryBarriers);
typedef void ( *PFN_vkCmdCopyBufferToImage)(VkCommandBuffer commandBuffer, VkBuffer srcBuffer, VkImage dstImage, VkImageLayout dstImageLayout, uint32_t regionCount, const VkBufferImageCopy* pRegions);
typedef void ( *PFN_vkCmdBlitImage)(VkCommandBuffer commandBuffer, VkImage srcImage, VkImageLayout srcImageLayout, VkImage dstImage, VkImageLayout dstImageLayout, uint32_t regionCount, const VkImageBlit* pRegions, VkFilter filter);
typedef void ( *PFN_vkCmdBindDescriptorSets)(VkCommandBuffer commandBuffer, VkPipelineBindPoint pipelineBindPoint, VkPipelineLayout layout, uint32_t firstSet, uint32_t descriptorSetCount, const VkDescriptorSet* pDescriptorSets, uint32_t dynamicOffsetCount, const uint32_t* pDynamicOffsets);

typedef void ( *PFN_vkCmdDraw)(VkCommandBuffer commandBuffer, uint32_t vertexCount, uint32_t instanceCount, uint32_t firstVertex, uint32_t firstInstance);

typedef VkResult ( *PFN_vkCreateSemaphore)(VkDevice device, const VkSemaphoreCreateInfo* pCreateInfo, const VkAllocationCallbacks* pAllocator, VkSemaphore* pSemaphore);

typedef void ( *PFN_vkDestroySemaphore)(VkDevice device, VkSemaphore semaphore, const VkAllocationCallbacks* pAllocator);

typedef VkResult ( *PFN_vkCreateFence)(VkDevice device, const VkFenceCreateInfo* pCreateInfo, const VkAllocationCallbacks* pAllocator, VkFence* pFence);

typedef void ( *PFN_vkDestroyFence)(VkDevice device, VkFence fence, const VkAllocationCallbacks* pAllocator);

typedef VkResult ( *PFN_vkWaitForFences)(VkDevice device, uint32_t fenceCount, const VkFence* pFences, VkBool32 waitAll, uint64_t timeout);

typedef VkResult ( *PFN_vkResetFences)(VkDevice device, uint32_t fenceCount, const VkFence* pFences);

typedef VkResult ( *PFN_vkAcquireNextImageKHR)(VkDevice device, VkSwapchainKHR swapchain, uint64_t timeout, VkSemaphore semaphore, VkFence fence, uint32_t* pImageIndex);

typedef VkResult ( *PFN_vkQueueSubmit)(VkQueue queue, uint32_t submitCount, const VkSubmitInfo* pSubmits, VkFence fence);

typedef VkResult ( *PFN_vkQueuePresentKHR)(VkQueue queue, const VkPresentInfoKHR* pPresentInfo);
typedef VkResult ( *PFN_vkQueueWaitIdle)(VkQueue queue);

typedef VkResult ( *PFN_vkDeviceWaitIdle)(VkDevice device);

#endif