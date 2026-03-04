# Pict Session Manager

> Authenticated REST session management for the Pict ecosystem

Manage multiple authenticated REST sessions with automatic credential injection, configurable authentication flows, and domain-based request matching. Built on Pict's template engine, Manyfest address resolution, and the expression parser.

- **Multi-Session** -- Manage any number of named sessions with independent authentication state
- **Auto-Injection** -- Automatically inject headers and cookies into outgoing REST requests by domain
- **Template-Driven** -- URI and body templates use Pict's `{~D:Record.Key~}` syntax for dynamic resolution
- **Pluggable Checks** -- Verify session validity with boolean markers, existence checks, or expression-based solves
- **Retry Logic** -- Configurable retry count and debounce for authentication attempts

[Quick Start](README.md)
[API Reference](api/README.md)
[GitHub](https://github.com/stevenvelozo/pict-sessionmanager)
