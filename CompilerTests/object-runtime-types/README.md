# Object runtime type metadata

Verifies `GetTypeName()` and `IsType(...)` on exact objects, base-typed table values, and multi-level inheritance. Polymorphic hierarchies use one hidden eight-byte runtime type ID before the object body; plain records and non-polymorphic objects retain their previous layout.
