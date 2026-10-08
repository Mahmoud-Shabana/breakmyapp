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
