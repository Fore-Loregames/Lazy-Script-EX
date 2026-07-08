# FreeType notice

`native/libfreetype.dll` is the FreeType font engine. Portions of this software
are copyright The FreeType Project. All rights reserved. The full FreeType
Project License is included as `FREETYPE-LICENSE.txt`.

`native/LSXFreeType.dll` is a small LazyScriptEX-owned ABI bridge. It does not
rasterize fonts or generate distance fields; those operations are delegated to
FreeType.
