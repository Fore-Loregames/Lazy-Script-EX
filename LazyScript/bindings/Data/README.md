# LSX data modules

## JSON

```lsx
use "@LazyScript/bindings/Data/Json.lsx" as Json
```

`Json.lsx` provides a native LSX JSON DOM, parser, builder, serializer, file loader, and saver. It uses packed LSX objects and typed tables rather than a VM or managed runtime. Parsed string views remain valid until the document's string storage is changed or the document is destroyed.
