# Behavior common-base inference

This regression project verifies project-wide inference for untyped object parameters and growable-table loop variables.

`GameObject.AddLazyBehavior` receives both `Transform` and `Spinner`. Because both inherit `LazyBehavior`, the compiler infers the parameter and table element as their nearest common base. Calls to `Start`, `Update`, and `Draw` therefore compile without explicit annotations.

Inheritance dispatch in this test remains LSX compile-time direct dispatch; this project tests inference, not runtime virtual methods.
