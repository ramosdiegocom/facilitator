# Wireframe

Building layouts with fixed navbars, collapsible sidebars, and PWA safe areas means managing a web of interdependent CSS calculations that break whenever anything changes. Wireframe handles it all declaratively — define your dimensions once, and every margin, offset, and safe-area inset adjusts automatically.

[![Wireframe Preview](/public/og.png)](https://ramosdiego.com/wireframe/playground)

## What It Does

- **Automatic spacing**: Content automatically adjusts margins based on navbar/sidebar presence and dimensions
- **Multiple navigation types**: Fixed top/bottom navs, sticky navs, and collapsible sidebars
- **Corner control**: Define which element (navbar or sidebar) occupies each corner
- **CSS variable-driven**: Configure all dimensions and offsets through CSS variables
- **Multiple instances**: Use different configurations for different sections (e.g., blog vs. dashboard)
- **PWA support**: Automatic safe area handling for mobile devices with notches, rounded corners, and home indicators

## Installation

**1. Install using shadcn**

```bash
bunx --bun shadcn@latest add https://ramosdiego.com/r/wireframe.json
```

**2. Build your layout**

```tsx
// app/page.tsx
import {
	Wireframe,
	WireframeNav,
	WireframeSidebar,
	WireframeSidebarContent,
	WireframeSidebarFooter,
	WireframeSidebarHeader,
} from "@/components/ui/wireframe";

export default function Page() {
	return (
		<Wireframe>
			<WireframeNav position="top">
				<div className="flex h-full items-center justify-between px-4">
					<div>Logo</div>
					<nav>Navigation</nav>
				</div>
			</WireframeNav>
			<WireframeSidebar position="left">
				<WireframeSidebarHeader>Logo</WireframeSidebarHeader>
				<WireframeSidebarContent>Nav links</WireframeSidebarContent>
				<WireframeSidebarFooter>User</WireframeSidebarFooter>
			</WireframeSidebar>
			<div className="p-4">
				{/* Your content - margins adjust automatically */}
			</div>
		</Wireframe>
	);
}
```

> **⚠️ `h-full` does not work inside `<Wireframe>`.**
> This only matters if your content doesn't fill the entire screen and you need to vertically center it. Use `absolute inset-0` to fill the viewport instead:
> ```tsx
> {/* ❌ Won't work */}
> <div className="h-full flex items-center justify-center">...</div>
>
> {/* ✅ Use this */}
> <div className="absolute inset-0 flex items-center justify-center">...</div>
> ```

## Configuration

All configuration is optional and uses sensible defaults. Configuration is passed via a single `config` prop.

### Corner Behavior

Control which element occupies each corner when navbars and sidebars overlap. Default is `"sidebar"` for all corners.

- `"sidebar"` — the sidebar runs full height; the navbar is inset so it starts where the sidebar ends.
- `"navbar"` — the navbar runs full width; the sidebar is inset so it starts below/above the navbar.

```tsx
<Wireframe
	config={{
		corners: {
			topLeft: "sidebar",
			topRight: "sidebar",
			bottomLeft: "sidebar",
			bottomRight: "sidebar",
		},
	}}
>
	{children}
</Wireframe>
```

### CSS Variables

Customize dimensions and spacing by passing `config.cssVariables`. All values shown are defaults:

```tsx
<Wireframe
	config={{
		cssVariables: {
			// STICKY NAV
			"--sticky-nav-height": 12,
			"--sticky-nav-top-offset": 0,

			// TOP NAV
			"--top-nav-height": 14,
			"--top-nav-left-offset": 0,
			"--top-nav-right-offset": 0,
			"--top-nav-top-offset": 0,
			"--top-nav-bottom-offset": 0,

			// BOTTOM NAV
			"--bottom-nav-height": 14,
			"--bottom-nav-left-offset": 0,
			"--bottom-nav-right-offset": 0,
			"--bottom-nav-top-offset": 0,
			"--bottom-nav-bottom-offset": 0,

			// LEFT SIDEBAR
			"--left-sidebar-width-collapsed": 16,
			"--left-sidebar-width-expanded": 52,
			"--left-sidebar-left-offset": 0,
			"--left-sidebar-right-offset": 0,
			"--left-sidebar-top-offset": 0,
			"--left-sidebar-bottom-offset": 0,

			// RIGHT SIDEBAR
			"--right-sidebar-width-expanded": 52,
			"--right-sidebar-width-collapsed": 16,
			"--right-sidebar-left-offset": 0,
			"--right-sidebar-right-offset": 0,
			"--right-sidebar-top-offset": 0,
			"--right-sidebar-bottom-offset": 0,
		},
	}}
>
	{children}
</Wireframe>
```

Note: Numeric values are multiplied by [tailwindcss `--spacing`](https://tailwindcss.com/docs/theme#default-theme-variable-reference) variable (default `0.25rem`). If you need any other unit, use a string value (e.g., `"64px"`, `"10rem"`).

## Component Reference

### `<Wireframe>`

Root component that provides context. Wrap your app at the layout level.

**Props:**
- `config?` - Configuration object with the following optional properties:
  - `safeAreas?` - Enable PWA safe area insets (default: `true`)
  - `corners?` - Control corner behavior for fixed navs and sidebars
    ```tsx
    {
      topLeft?: "navbar" | "sidebar";      // default: "sidebar"
      topRight?: "navbar" | "sidebar";     // default: "sidebar"
      bottomLeft?: "navbar" | "sidebar";   // default: "sidebar"
      bottomRight?: "navbar" | "sidebar";  // default: "sidebar"
    }
    ```
  - `mobileBreakpoint?` - Viewport width (px) below which `isMobile` is `true`, used by `hideOn="mobile"` / `hideOn="desktop"` on `WireframeNav` and `WireframeSidebar` (default: `768`)
  - `cssVariables?` - Override default dimensions and spacing
    ```tsx
    Partial<Record<WireframeCSSVariables, string | number>>
    ```

### `<WireframeNav>`

Fixed navbar component.

**Props:**
- `position`: `"top"` | `"bottom"` (default: `"top"`)
  - `"top"`: Fixed navbar at the top
  - `"bottom"`: Fixed navbar at the bottom
- `hideOn`: `"mobile"` | `"desktop"` — conditionally render the nav only on one viewport size

### `<WireframeStickyNav>`

Sticky navbar that scrolls with content until reaching the top.

### `<WireframeSidebar>`

Sidebar with collapsed/expanded states. Use the slot subcomponents inside to structure the layout.

**Props:**
- `position`: `"left"` | `"right"` (default: `"left"`)
- `collapsed`: `boolean` (default: `false`)
- `hideOn`: `"mobile"` | `"desktop"` — conditionally render the sidebar only on one viewport size

```tsx
<WireframeSidebar position="left" collapsed={false}>
  <WireframeSidebarHeader>
    {/* Logo, workspace switcher, etc. */}
  </WireframeSidebarHeader>
  <WireframeSidebarContent>
    <WireframeSidebarGroup>
      {/* Nav links */}
    </WireframeSidebarGroup>
  </WireframeSidebarContent>
  <WireframeSidebarFooter>
    {/* User profile, settings, etc. */}
  </WireframeSidebarFooter>
</WireframeSidebar>
```

### `<WireframeSidebarHeader>`

`flex-none` slot for the top of the sidebar (logo, branding, workspace switcher).

### `<WireframeSidebarContent>`

Scrollable `flex-1` slot for the main sidebar body. Hides the scrollbar visually.

### `<WireframeSidebarGroup>`

`flex flex-col` grouping container for sections within `<WireframeSidebarContent>`.

### `<WireframeSidebarFooter>`

`flex-none` slot for the bottom of the sidebar (user profile, sign out, etc.).

### Hooks

#### `useWireframe()`

Returns `{ windowWidth: number, isMobile: boolean }` from the nearest `<Wireframe>` ancestor. Use this to build custom components that respond to the current viewport. Throws if called outside a `<Wireframe>`.

```tsx
import { useWireframe } from "@/components/ui/wireframe";

function MyNav() {
	const { isMobile } = useWireframe();
	return <nav>{isMobile ? <HamburgerMenu /> : <FullNav />}</nav>;
}
```

#### `useWindowWidth()`

Returns the current `window.innerWidth` as `number | null`. Returns `null` on the server and before the first client render. Can be used independently of `<Wireframe>`.

## Advanced Usage

### Multiple Wireframe Instances

Create separate wireframe configurations for different sections of your app.

> **Note (Next.js):** Do **not** place `<Wireframe>` in your root `app/layout.tsx` if different sections need different configurations. Instead, use [route groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups) (e.g., `(home)`, `(blog)`) and place a `<Wireframe>` in each group's `layout.tsx`. This ensures each section gets its own isolated configuration without conflicts.

#### Example: Home layout (`app/(home)/layout.tsx`)

A dashboard-style layout with sidebars, a top nav, and a bottom nav. Sidebars own all four corners.

```tsx
import { Wireframe } from "@/components/ui/wireframe";

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<Wireframe
			config={{
				corners: {
					topLeft: "sidebar",
					topRight: "sidebar",
					bottomLeft: "sidebar",
					bottomRight: "sidebar",
				},
				cssVariables: {
					"--top-nav-height": 14,
					"--bottom-nav-height": 14,
					"--left-sidebar-width-collapsed": 16,
					"--left-sidebar-width-expanded": 52,
				},
			}}
		>
			{children}
		</Wireframe>
	);
}
```

#### Example: Blog layout (`app/(blog)/layout.tsx`)

A minimal reading layout with only a sticky nav — no sidebars, no bottom nav.

```tsx
import { Wireframe } from "@/components/ui/wireframe";

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<Wireframe
			config={{
				cssVariables: {
					"--sticky-nav-height": 12,
				},
			}}
		>
			{children}
		</Wireframe>
	);
}
```

### Nested Wireframes

`<Wireframe>`s must not be nested because navbars and sidebars are positioned using `position: fixed` and `position: sticky`, which are relative to the viewport, not the parent element. Thus, there must only be one `<Wireframe>` per page.

## PWA Support

The wireframe component includes comprehensive support for Progressive Web Apps (PWAs) with automatic handling of device safe areas.

> **Required (Next.js App Router):** Export a `viewport` object from your root layout to enable proper PWA viewport behavior:
>
> ```tsx
> import type { Viewport } from "next";
>
> export const viewport: Viewport = {
> 	width: "device-width",
> 	initialScale: 1,
> 	maximumScale: 1,
> 	viewportFit: "cover",
> 	userScalable: false,
> };
> ```

### What are Safe Areas?

Safe areas are the regions of the screen that are guaranteed to be visible on all devices, accounting for:
- **Notches and camera cutouts** (e.g., iPhone X and newer)
- **Rounded corners** on modern smartphones
- **Home indicators** (the bottom bar on gesture-based navigation)
- **System UI elements** that may overlap your content

Without safe area handling, your fixed navigation bars and sidebars could be partially obscured by these hardware features.

### How It Works

The wireframe component uses CSS `env(safe-area-inset-*)` variables to automatically add padding around your layout:

1. **Automatic spacing adjustments**: All navbars and sidebars automatically include safe area insets in their positioning calculations
2. **Colored overlays**: Safe area overlays are enabled by default (`safeAreas: true`). They fill unsafe regions with your background color to prevent content from bleeding under notches or home indicators.

### Safe Area Insets

All layout calculations automatically include safe area insets:

```tsx
// Navbars and sidebars automatically account for safe areas
// For example, a top navbar is positioned at:
top: calc(var(--top-nav-top-offset) + env(safe-area-inset-top))

// Bottom navbar:
bottom: calc(var(--bottom-nav-bottom-offset) + env(safe-area-inset-bottom))

// Left sidebar:
left: calc(var(--left-sidebar-left-offset) + env(safe-area-inset-left))

// Right sidebar:
right: calc(var(--right-sidebar-right-offset) + env(safe-area-inset-right))
```

This ensures your navigation elements are never obscured by device hardware.

### Disabling Safe Area Overlays

Safe area overlays are **enabled by default**. They add four fixed-position overlays (top, bottom, left, right) that:
- Match your app's background color (uses `bg-background`)
- Are `pointer-events-none` so they don't interfere with touch/click events
- Have the highest z-index (`z-99999`) to ensure they're always on top
- Fill only the unsafe areas using `env(safe-area-inset-*)`

To disable them:

```tsx
<Wireframe
	config={{
		safeAreas: false,
	}}
>
	{children}
</Wireframe>
```

### PWA Meta Configuration

To enable safe area support in your PWA, export a `viewport` from your root layout (Next.js App Router) and use the `viewport` export instead of a manual `<meta>` tag:

```tsx
// app/layout.tsx
import type { Viewport } from "next";

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	maximumScale: 1,
	viewportFit: "cover",
	userScalable: false,
};

export default function RootLayout({ children }) {
	return (
		<html>
			<body>{children}</body>
		</html>
	);
}
```

The `viewport-fit: cover` directive is critical — it tells the browser to extend your content into the safe areas. Each route-group layout's `<Wireframe>` will then handle safe area overlays automatically (they are on by default).

### When to Disable Safe Areas

Safe areas are on by default. You may want to disable them (`safeAreas: false`) when:
- Building desktop-only applications
- Using transparent navigation elements
- Your app already has sufficient padding/margins

### Manual Safe Area Components

If you need more control, the wireframe also exports individual safe area components:

```tsx
import { 
	SafeAreaInsetTop, 
	SafeAreaInsetBottom, 
	SafeAreaInsetLeft, 
	SafeAreaInsetRight 
} from "@/components/ui/wireframe";

// Use them individually
<SafeAreaInsetTop className="bg-blue-500" />
```

These components can be used outside the `<Wireframe>` context for custom layouts.

## Caveats

### Server-Side Rendering

`<Wireframe>` renders nothing until it knows the window width. This means the entire component tree — including all children — is suppressed on the server and during the initial client render before hydration completes.

This is intentional: rendering the wrong layout variant (mobile vs. desktop) on the server would cause a hydration mismatch. The trade-off is that content inside `<Wireframe>` is not present in the initial HTML.

**If SEO matters** for your content, place that content outside the `<Wireframe>` or consider deferring only the layout chrome (navbars/sidebars) into client components.

### Full-Height Content

Setting `height: 100%` won't work on child content. This only matters if your content doesn't fill the entire screen and you need to vertically center it. The `<Wireframe>` root is `position: relative`, use `absolute inset-0` to fill the viewport instead of `h-full`:

```tsx
<Wireframe>
  <WireframeNav position="top">
    <div>Navigation</div>
  </WireframeNav>

  {/* ❌ Won't work */}
  {/* <div className="h-full flex items-center justify-center"> */}

  {/* ✅ Use this instead */}
  <div className="absolute inset-0 flex items-center justify-center">
    {/* Your content here */}
  </div>
</Wireframe>
```

**Use cases:** Vertically centered layouts where content is shorter than the viewport.
