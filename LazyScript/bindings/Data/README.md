# Data bindings

## JSON

Import the JSON module:

```lsx
use "@LazyScript/bindings/Data/Json.lsx" as Json
```

Load and read a JSON file:

```lsx
local document = Json.load("settings.json")

if document.valid then
    local volume_node = document.get(document.root, "volume")
    local volume = document.as_f32(volume_node)
end

document.destroy()
```

`Json.lsx` supports parsing, building, editing, serializing, loading, and saving JSON. The document owns its node and string storage, so values and string views should not be used after `document.destroy()`.

See `Projects/22_json` for a complete example.
