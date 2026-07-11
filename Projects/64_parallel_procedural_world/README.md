# 64 - Parallel procedural world generation

Builds a real 1024 × 1024 terrain and biome map with ordinary LSX code. A persistent worker pool divides the map into reusable chunks, generates height, moisture, coast, forest, desert, rock, and snow regions in parallel, then uploads the finished image to Vulkan for display.

This is a practical procedural-generation workload rather than a synthetic compiler demonstration. It builds as a normal Windows GUI executable with O6 and AVX2/FMA enabled, keeps the console hidden, disables presentation throttling for performance testing, and reports FPS in the window title.
