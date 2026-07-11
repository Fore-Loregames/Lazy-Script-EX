# Vulkan interface notice

LazyScriptEX uses a small local Vulkan declaration header in `native/vulkan/vulkan_min.h` so the Windows backend can load `vulkan-1.dll` dynamically without requiring the Vulkan SDK on end-user machines.

The Vulkan-Headers license is included in `VULKAN-HEADERS-LICENSE.md` for attribution and compatibility reference.
