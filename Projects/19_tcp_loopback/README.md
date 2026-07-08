# 19 - TCP server and client window

Starts a localhost TCP server on an LSX worker thread, opens a client connection, exchanges text in both directions, and keeps the connection open until the graphical client window closes. Connection and communication status are rendered inside the GLFW/OpenGL client window with FreeType SDF text; no console is used.
