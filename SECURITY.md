# Security Policy

## Reporting a vulnerability

Please do not publish exploitable security reports in public issues. Contact the maintainer privately through GitHub's private vulnerability reporting feature (if enabled), or request a private reporting channel without disclosing technical details.

## Scope and safe usage

BreakMyApp is intended for your own local development servers and websites you are permitted to test. It is not a penetration testing or exploitation tool. The scanner loads the target page in a real browser; page scripts and requests execute as they would in a normal visit.

- Never test sites without the owner's permission.
- Do not point it at untrusted public pages on a privileged machine.
- Run untrusted targets in an isolated environment with no sensitive credentials.
- Do not upload scan artifacts before reviewing them: screenshots and JavaScript error messages may expose private information.
- Only http:// and https:// URLs without embedded credentials are accepted. The CLI is not an authenticated multi-user scanning service, and must not be deployed as a public endpoint without server-side SSRF protections, network isolation and authorization controls.

No remote telemetry is intentionally sent by BreakMyApp. The browser itself loads resources referenced by the target page.

Supported versions: currently under active early-preview development; security fixes target the latest main branch.

## Opt-in multi-page discovery

The `--crawl` / `--max-pages` modes are bounded to 25 URLs and follow only same-origin anchors. They skip URLs with query parameters, common action-like path segments and files, and they do not click buttons or submit forms. Nevertheless, loading a page executes its JavaScript, which can perform network requests. These heuristics **do not guarantee that a crawl is side-effect free**. Test only a site you own or are explicitly authorized to scan, ideally a staging environment. Cross-origin top-level navigations are blocked by the browser runner, but third-party assets can still be requested as part of normal page rendering.

## Local plugin execution

Custom --plugin modules execute with full Node.js and Playwright permissions, **not inside a sandbox**. A plugin can access local files, credentials and networks. Only run plugins you wrote or audited, preferably within an isolated environment. Never execute arbitrary community plugin URLs or auto-install plugin code.
