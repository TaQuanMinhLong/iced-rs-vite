import { defineConfig } from "vitepress";

export default defineConfig({
  title: "iced 0.14 Reference",
  description: "Complete widget & capability reference for the iced Rust GUI library — web (wasm) target focused",
  lang: "en-US",
  lastUpdated: true,
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: "Start", link: "/overview" },
      { text: "Quick Start", link: "/quick-start" },
      { text: "Widgets", link: "/widgets/index" },
      { text: "Web Target", link: "/web/" },
    ],
    sidebar: [
      {
        text: "Introduction",
        items: [
          { text: "Overview", link: "/overview" },
          { text: "Quick Start", link: "/quick-start" },
          { text: "Concepts & Philosophy", link: "/concepts" },
          { text: "Builder Patterns", link: "/chaining" },
          { text: "Architecture", link: "/architecture" },
          { text: "Feature Flags", link: "/features" },
        ],
      },
      {
        text: "Widgets",
        items: [
          { text: "All Widgets (A–Z)", link: "/widgets/index" },
          { text: "Layout", link: "/widgets/layout" },
          { text: "Input", link: "/widgets/input" },
          { text: "Selection Controls", link: "/widgets/selection" },
          { text: "Text & Rich Content", link: "/widgets/text" },
          { text: "Graphics & Media", link: "/widgets/graphics" },
          { text: "Data & Containers", link: "/widgets/data" },
        ],
      },
      {
        text: "Styling",
        items: [
          { text: "Theme & Style", link: "/theming" },
          { text: "Animation", link: "/animation" },
        ],
      },
      {
        text: "Application",
        items: [
          { text: "Program & Runtime", link: "/program" },
          { text: "Tasks & Subscriptions", link: "/async" },
          { text: "Time & Timers", link: "/time" },
          { text: "Structuring Larger Apps", link: "/scaling" },
          { text: "Keyboard & Pointer Input", link: "/input-keys" },
          { text: "Custom Widgets", link: "/custom-widgets" },
        ],
      },
      {
        text: "Web Target",
        items: [
          { text: "Overview", link: "/web/" },
          { text: "Build with Vite", link: "/web/build" },
          { text: "Renderers & Threads", link: "/web/threads" },
          { text: "Running WASM in a Worker", link: "/web/worker" },
          { text: "Browser Gotchas", link: "/web/gotchas" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/iced-rs/iced" }],
    search: { provider: "local" },
  },
});
