# UI / UX Standards

This document defines the UI practices to follow when building or modifying the frontend. The goal is a minimal, clean, functional, readable interface that prioritizes usability, clarity, consistency, accessibility, and task completion over visual novelty or unnecessary design complexity.

## 1. Core UI Principles

Every screen should have a clear purpose and primary action. Prefer simple, familiar, predictable interfaces and keep important information visible without making users remember unnecessary details. Add visual or interactive elements only when they improve comprehension, navigation, feedback, or task completion. Design for the user's task rather than demonstrating UI capabilities.

## 2. Visual Design

Use a consistent spacing scale, readable content widths, aligned layouts, and responsive dimensions. Establish hierarchy through size, weight, spacing, and position rather than excessive decoration or oversized text. Use a restrained semantic color palette with predictable meanings and sufficient contrast; never rely on color alone to communicate status, selection, errors, or permissions. Keep typography concise and readable, avoid excessive all-caps text, and strictly follow any existing application color/theme guidance.

## 3. Actions, Forms & Interaction

Use clear action-oriented button labels and distinguish primary, secondary, and destructive actions. Consequential destructive actions should require confirmation when appropriate, while operations that could cause duplicate submissions should show a processing state and prevent accidental repetition. Forms should use visible meaningful labels, logical grouping, appropriate controls and autocomplete semantics, clear required/optional indicators, useful validation, field-level errors, preserved input after recoverable failures, and submission loading states. Password and related sensitive fields should provide an eye-icon visibility toggle. User interactions should have predictable results, preserve user control, support cancellation or recovery where practical, and avoid unnecessary automatic navigation, changes, or animation.


## 4. UI States & Feedback

Interactive features must account for all relevant observable states, including default, hover, focus, active, disabled, loading, success, error, empty, selected, and permission-restricted states. Every operation that may take noticeable time should provide appropriate contextual feedback without unnecessarily blocking unrelated parts of the interface. Distinguish successful empty results from errors, explain what is empty, and provide a meaningful next action when one exists. Feedback should appear near the triggering action where possible; errors must use plain language, explain what happened and what the user can do, and never expose stack traces, database errors, raw API responses, or internal implementation details. Use persistent inline feedback when information must remain visible, and use brief non-disruptive success feedback when appropriate.

## 5. Navigation, Responsive Design & Accessibility

Navigation should reflect actual available functionality, use consistent terminology and placement, clearly indicate the current location, and provide obvious paths back to relevant parent or safe pages. Do not present unfinished functionality as usable or make normal workflows depend on browser back navigation. Use breadcrumbs only when they improve orientation. Design for small and large screens while preserving functionality, avoiding unnecessary horizontal scrolling and hover-dependent essential interactions. Follow WCAG 2.2 principles where applicable: use semantic HTML, accessible names, keyboard-accessible controls, visible focus states, correctly associated labels/descriptions/errors, sufficient contrast, appropriate dynamic focus behavior, and reduced-motion preferences. Essential information must never depend solely on color, hover, animation, or sound.

## 6. Components, Naming & Consistency

Reuse existing components and established patterns whenever they already solve the problem; do not create visually similar alternatives unnecessarily. Components should have one clear responsibility, predictable minimal APIs, and should favor composition over deeply configurable "do everything" components. Create abstractions for genuinely repeated behavior or patterns rather than trivial one-off usage. Use meaningful, specific, and stable class/component names that describe the element's purpose or responsibility rather than appearance, so developers and AI agents can reliably locate and target the correct element when making future changes. Maintain consistency across spacing, typography, colors, buttons, inputs, status indicators, icons, border radius, shadows, loading behavior, errors, empty states, navigation, and terminology.

## 7. Complex UI Patterns

Use tables when users need to compare structured values across rows; keep columns concise and meaningful, align values consistently, avoid unnecessary columns, keep important information prominent, and provide loading, empty, and error states. Large datasets should use appropriate pagination, filtering, or search, with row actions close to the affected row and critical information never hidden only behind hover states. Use modals only when the user's current task must be interrupted or contained; prefer inline UI otherwise. Dialogs should have a clear purpose, focused task, explicit cancellation/confirmation where appropriate, accessible keyboard and focus behavior, and no unnecessary nesting. When a modal contains a form, prevent background scrolling while keeping the dialog visible and usable.

## 8. Content & Microcopy

Write for the user rather than the developer using plain, direct, specific language. Avoid internal terminology, technical jargon, implementation details, and raw error codes in user-facing messages. Button labels should describe the resulting action, error messages should explain the problem and next step where possible, icons should have accessible names or accompanying labels when their meaning is not obvious, and instructions should be concise and placed where they are needed. Avoid long paragraphs inside UI components.

## 9. Performance & Perceived Performance

Avoid unnecessary animations, effects, rendering, API requests, and visual updates. Load expensive content only when needed and debounce user input when repeated requests are expected. Do not block the entire interface for localized operations; keep interactions responsive while background work is occurring and provide immediate, contextual feedback when unavoidable latency exists. Keep layouts stable while content loads where practical to reduce visual movement.

## 10. Security, Privacy & Data Integrity

Never expose secrets, sensitive information, unauthorized data, internal implementation details, raw backend errors, or security-sensitive information through the UI. User-visible states must accurately distinguish confirmed, loading, empty, failed, and unavailable data; do not present stale, partial, or failed operations as successful. Permission-restricted functionality should be represented clearly without revealing information the user is not authorized to access.

## 11. Do Not Over-Design

Do not add gradients, glassmorphism, excessive shadows, decorative illustrations, elaborate animations, complex dashboards, charts, cards, badges, tabs, dropdowns, or modals merely because they look modern. Visual elements should have a clear product or usability purpose. A simple interface that makes the task obvious is preferable to a visually impressive interface that increases cognitive load.

## 12. Implementation & Review Rules

Before considering a UI feature complete, verify that its purpose and primary action are clear, terminology is understandable, all relevant states are handled, recoverable user input is preserved, important workflows are keyboard accessible, focus states and contrast are sufficient, responsive behavior works at relevant screen sizes, existing components and patterns are reused, meaningful class/component names are used, unfinished functionality is not presented as functional, and technical or sensitive information is not exposed. When decisions conflict, prioritize correctness and task completion first, followed by accessibility, clarity and usability, consistency, performance, and finally visual polish. Visual polish must never compromise usability, accessibility, correctness, or application behavior.


# Futher Additions by me
- The forms, dialogue boxes should always be in the middle of the screen, unless specified otherwise
- The overlay background should never be scrollable from the modal component