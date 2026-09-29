# Concepts and Philosophy

This page is about _why_ iced is the way it is: what a user interface is made of, and the reasoning behind the library's design. It is drawn from the official iced book.

For _how_ it is built — the crate stack, the `Widget` trait, the layout solver, and the concrete frame loop — see [Architecture](/architecture).

## The GUI trinity

Every user interface can be reduced to three ideas:

| Idea             | What it is                                       | In a counter             |
| ---------------- | ------------------------------------------------ | ------------------------ |
| **Widgets**      | The distinct visual elements                     | Two buttons and a number |
| **Interactions** | The actions a user can trigger                   | Pressing `+` or `-`      |
| **State**        | The condition that persists between interactions | The current number       |

These form a closed loop: widgets produce interactions, interactions change state, and the new state dictates new widgets.

```text
Widgets ──produce──▶ Interactions ──change──▶ State ──dictate──▶ Widgets
```

Building a UI, then, means defining those three things and the connections between them.

## Why this split matters

The three parts have very different reusability characteristics, and this is what determines your job.

**State and interactions are entirely application-specific.** If you describe "a numeric value with increment and decrement", anyone can guess you built a counter. Nobody can guess anything from "two buttons and a number".

**Widgets are generic.** Users expect a button to behave like a button. Deviating from that produces unintuitive interfaces and poor user experience. So you do not implement buttons — you use them.

The practical consequence: your job is the application-specific parts, namely state, interactions, how interactions change state, and how state dictates widgets. A button is generic; a button labelled `+` that increments a value is entirely yours.

## The Elm Architecture

Those four application-specific parts turn out to be exactly the four ideas of [The Elm Architecture](https://guide.elm-lang.org/architecture/), under different names:

| Elm name     | iced name    | Signature                            |
| ------------ | ------------ | ------------------------------------ |
| Model        | **state**    | your struct                          |
| Messages     | **messages** | your enum                            |
| Update logic | **update**   | `fn(&mut State, Message)`            |
| View logic   | **view**     | `fn(&State) -> Element<'_, Message>` |

iced prefers the words _state_ and _messages_ over _model_ and _interactions_, but they are interchangeable.

The pattern emerges naturally from Elm because Elm's immutability and referential transparency play unusually well with Rust's borrow checker. It also falls out of simply dissecting an interface, as above — you arrive at it whether or not you have heard of Elm.

## The runtime

You now have all four parts, but nothing connects them. The missing piece is the **runtime**: the environment where the loop takes place. It initialises state, runs view logic, gathers interactions into messages, and runs update logic.

::: note This is the conceptual loop
The loop described here is the idea, not the implementation. For how a frame is actually processed — tree diffing, layout passes, event propagation, rendering — see [the frame loop](/architecture#the-frame-loop).
:::

Build it from a hypothetical set of magic functions and the whole thing becomes obvious:

```rust
use magic::{display, interact};

// Initialise the state
let mut counter = Counter::default();

// Be interactive. All the time!
loop {
    // Run our view logic to obtain our interface
    let interface = counter.view();

    // Display the interface to the user
    display(&interface);

    // Process the user interactions and obtain our messages
    let messages = interact(&interface);

    // Update our state by processing each message
    for message in messages {
        counter.update(message);
    }
}
```

`display` and `interact` are the magic, and the runtime is nothing more than the loop that drives them. Within one pass:

- **state** is initialised once, at startup
- **view logic** runs at startup and again after every batch of interactions
- **update logic** runs once per message

`iced::run` supplies the magic — chiefly [winit](https://github.com/rust-windowing/winit), [wgpu](https://github.com/gfx-rs/wgpu), [tiny-skia](https://github.com/RazrFalcon/tiny-skia), and [cosmic-text](https://github.com/pop-os/cosmic-text) — and infers your state and message types from the signatures of `update` and `view`. Initial state comes from `Default`.

## Design principles

iced is unusually opinionated, and knowing the reasoning prevents a lot of friction.

### Rust is all you need

There is no domain-specific language for view logic and no procedural macro magic. You write everything in plain Rust, using variables, `match`, iterators, functions, and generics.

Small declarative macros are acceptable when they merely build a collection in order, with semantics as unsurprising as `vec!`. That is precisely what `row!` and `column!` do. Anything that meaningfully _extends_ the language is treated as an admission that Rust is not powerful enough, and is rejected.

### The web separation is rejected

The book's blunt position: splitting an interface into HTML, CSS, and JavaScript produces a system where concerns constantly leak between layers, and where every framework exists to manage that leak.

iced writes layout, styling, and logic directly in Rust as one cohesive whole, and stays away from anything resembling HTML, CSS, or JavaScript. On the web it renders to a canvas rather than producing a DOM — see [Web Target](/web/) for what that means practically.

### Code must be discovered

Coding is framed as a process of discovery: the problem is your starting point, the language is your map, the compiler is your compass, and the solution is your target.

Two practical consequences follow. First, formalising the problem in your language is paramount, because a mistake there sends you down the wrong path. Second, you should avoid smuggling a pre-conceived solution into the problem statement, because that rules out simpler answers emerging later.

This is also why iced tries to stay out of the way during early problem framing: it decouples itself from your types, data structures, and business logic, and only engages once a solution starts to form.

### Open source is not about you

The library is a single maintainer's personal project, worked on in his own time. The stated tradeoffs are honest rather than apologetic:

- no special effort to onboard new contributors, more time spent coding
- no effort to drive broad adoption, and direct communication instead
- breaking changes introduced freely, with no stability guarantee
- every feature built and reviewed by one person, giving high internal cohesion

Whether that philosophy suits you is a judgement call. If you need a stable, professionally-governed project, this is not one. The upside is a library with unusually consistent design and no incentive to accumulate cruft.

## Sourcing

This page summarises the official [iced book](https://github.com/iced-rs/book), which is MIT-licensed and maintained by the library's author. Where the book is unfinished — layout, styling, concurrency, and scaling are all listed as forthcoming — the widget and API pages in this reference cover them from the source instead.
