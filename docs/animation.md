# Animation

iced has no animation system in the React sense. There is no `useEffect` triggering a keyframe sequence, and no separate animation tree. Instead, `Animation<T>` is a value you keep **inside your state**, and the runtime redraws while it is in motion.

That design is why animations survive across `view()` rebuilds: the animation isn't recreated each frame, it's just read.

## The core type

`Animation<T>` holds a _from_ value, a _to_ value, a start instant, a duration, and an easing curve. It does **not** sample time for you; you ask it where it is at a given instant:

```rust
let t = self.opacity.interpolate(0.0f32, 1.0f32, Instant::now());
let done = !self.opacity.is_animating(Instant::now());
```

`interpolate(start, end, at)` returns `start` advanced along the animation's curve toward `end`, evaluated at `at`. Passing the animation's own two endpoints gives you the animated value; passing any other pair reuses the same curve to drive something else.

## Building one

An animation is constructed from its starting value, then configured:

```rust
let animation = Animation::new(0.0f32)
    .easing(Easing::EaseOutCubic)
    .duration(Duration::from_millis(300));
```

| Method                                                | What it does                            |
| ----------------------------------------------------- | --------------------------------------- |
| `new(state)`                                          | Create from the initial value           |
| `easing(Easing)`                                      | The curve                               |
| `duration(Duration)`                                  | How long it takes                       |
| `delay(Duration)`                                     | Wait before starting                    |
| `very_quick()` / `quick()` / `slow()` / `very_slow()` | Duration presets                        |
| `repeat(u32)`                                         | Play N times                            |
| `repeat_forever()`                                    | Loop indefinitely                       |
| `auto_reverse(bool)`                                  | Play backwards on alternate repeats     |
| `go(new_state, at)`                                   | Transition to a new value at an instant |
| `go_mut(&mut new_state, at)`                          | Same, in place                          |

The `go` / `go_mut` pair is the one that matters. Calling `go` **retargets** an in-flight animation from wherever it currently is, rather than snapping to the start. That's what makes interruption look smooth.

## The full pattern

```rust
struct State {
    expanded: bool,
    height: Animation<f32>,
}

fn update(&mut self, message: Message) {
    match message {
        Message::Toggle => {
            self.expanded = !self.expanded;
            self.height
                .go_mut(if self.expanded { 200.0 } else { 0.0 }, Instant::now());
        }
    }
}

fn view(&self) -> Element<'_, Message> {
    let height = self.height.interpolate(0.0f32, 200.0f32, Instant::now());
    container(content()).height(height).into()
}
```

Three things make this work:

1. The `Animation` lives in state, so it persists across rebuilds.
2. `go_mut` schedules the retarget, and the runtime keeps requesting frames while `is_animating` is true.
3. `view()` samples the value at `Instant::now()` each time it runs, so the UI tracks the curve.

::: warning `value()` is not a sampler
`Animation::value()` takes **no arguments** and returns the raw stored state — the last value you passed to `go`, not the current interpolated position. Reading it in `view()` gives you a widget that snaps between endpoints rather than animating. Use `interpolate` with an explicit instant.

:::

## Sampling

| Method                        | Returns                                        |
| ----------------------------- | ---------------------------------------------- |
| `interpolate(start, end, at)` | `start` eased toward `end` at the instant `at` |
| `interpolate_with(f, at)`     | Sample with a custom mapping                   |
| `is_animating(at)`            | Whether still in motion                        |
| `remaining(at)`               | Time left                                      |
| `value()`                     | The stored target value — **not** time-sampled |

`interpolate` is the one you will use most. The others earn their place when you want to drive something other than the animated value itself — a colour lerp between two palettes, for instance, via `interpolate(color_a, color_b, at)`.

## `Easing`

`Easing` comes from the `lilt` crate and covers the full CSS easing vocabulary:

| Group      | Variants                                               |
| ---------- | ------------------------------------------------------ |
| Linear     | `Linear`                                               |
| General    | `EaseIn`, `EaseOut`, `EaseInOut`                       |
| Polynomial | `EaseIn/Out/InOut` + `Quad`, `Cubic`, `Quart`, `Quint` |
| Special    | `Expo`, `Circ`, `Back`, `Elastic`, `Bounce`            |
| Custom     | `Custom(fn(f32) -> f32)`                               |

`Linear` is the default. For UI transitions, `EaseOut*` reads best when something is entering and `EaseIn*` when it's leaving. `EaseInOut*` suits things that move and settle in place.

`Custom` takes a plain function, so you can express any curve — including a spring approximation — without adding a dependency.

## Values that can be animated

`T` must be `Interpolable` from `lilt`, which covers the numeric primitives (`f32`, integers) plus tuples and `Option` of interpolable types. So `Animation<Color>` works if the type implements it, and `(f32, f32)` does too.

For a `Vec<Something>`, interpolate manually with `interpolate_with` and an index-based lookup.

## Animating layout vs. opacity

A distinction worth being deliberate about:

- **Layout properties** — width, height, padding — are sampled during `view()`, so they animate by re-running layout each frame. Correct, but it re-lays-out the whole subtree.
- **Visual properties** — opacity, colour, rotation — can be applied without re-layout, and are much cheaper.

`Image` exposes `opacity`, `scale`, and `rotation`; `Float` exposes `scale` and `translate`; `Container` has a text `color`. Prefer those when they fit, and fall back to layout animation when the geometry genuinely has to change.

## Common mistakes

**Creating the animation in `view()`.** It must be in state. An animation constructed during `view` restarts on every rebuild and never progresses.

**Retargeting from a stale instant.** `go_mut` takes an `Instant`; pass `Instant::now()` at the moment of the user action, not a value cached earlier.

**Forgetting the runtime can stop redrawing.** If you mutate animation state outside an `update`, nothing requests a frame. Always go through a message.

---

## See also

- [Theme & Style](/theming) — animating a colour is usually easier than animating a layout value
- [Graphics & Media](/widgets/graphics) — `canvas` and `shader` for effects beyond property animation
- [Time & Timers](/time) — when a timer is the right tool instead of an animation
- [Program & Runtime](/program) — how animation drives the frame loop
