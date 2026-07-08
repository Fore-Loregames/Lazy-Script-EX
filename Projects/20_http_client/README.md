# 20 - Local HTTP client and server window

Starts a small localhost HTTP server on an LSX worker thread, sends a WinHTTP request to it, validates the 200 response and body, and renders the complete exchange in a GLFW/OpenGL window using FreeType SDF text. It does not depend on an external website and does not open a console.
