# Security Policy

Pretext Template Studio is a local-first browser application. The default editing, persistence, and export flows run locally and do not require service credentials.

## Supported Versions

Security fixes target the latest `main` branch until the project starts publishing versioned releases.

## Reporting A Vulnerability

Please do not open a public issue for a vulnerability.

If the repository owner has GitHub private vulnerability reporting enabled, use that channel. Otherwise, contact the maintainer privately through the profile or repository contact information.

Include:

- A short description of the issue.
- Steps to reproduce.
- Affected browser and operating system.
- Whether optional integrations, such as the SparkPost test-email proxy, are involved.
- Any exported file or template JSON needed to reproduce the issue.

## Security Boundaries

- The editor stores documents in browser `localStorage`.
- Uploaded images, GIFs, SVGs, and JSON animation files are handled locally by the browser.
- Exported files may include user-provided content and should be treated as untrusted input by downstream systems.
- The optional email proxy binds to loopback for local development only and should not be deployed as production infrastructure.
- Service credentials must stay out of templates, screenshots, commits, and exported sample files.
