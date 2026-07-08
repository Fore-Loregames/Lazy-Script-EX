# Circular borrowed object reference

This regression project verifies the normal engine ownership graph:

```text
GameObject owns Transform
Transform.lazyVars.parent.value borrows the same GameObject
```

`Transform.lsx` intentionally does not import `GameObject.lsx`. The constructor parameter receives the object through project-wide inference, and the compiler retains its hidden concrete type identity without requiring a reverse source import.

The direct `parent.value` reference is classified as borrowed. Automatic clone/destruction copies the pointer and never recursively clones or frees the parent through the Transform back-reference. The `GameObject.transform` field is classified as owned because it receives `Transform.new(self)`.
