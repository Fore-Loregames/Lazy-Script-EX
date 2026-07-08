# Inline scalar-record table regression

Verifies that records containing only scalar fields use contiguous inline table
storage. `push`, `add_copy`, indexing, `first`, `last`, and `Struct.table()` must
copy the complete record body, so destroying the temporary source does not erase
SDF glyph metrics or JSON node/member data. Reference-bearing objects continue
to use the separate pointer-identity regression.
