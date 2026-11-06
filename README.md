# EdVyro Internship Board

A responsive internship discovery board built with semantic HTML, modern CSS, vanilla JavaScript, and Node.js built-in HTTP modules. The five internship records are imported from the official EdVyro sample dataset and retain their original IDs and supplied fields.

## Features

- Search across internship title, domain, location, work mode, and skills.
- Combined domain and work mode filters with a clear-filters action.
- Internship detail dialog and application form with browser and server validation.
- Persistent JSON application storage, including duplicate detection per email and internship.
- Loading, empty, API failure, retry, validation, and success states.
- Responsive mobile navigation, visible focus, skip link, labelled forms, keyboard-operated native dialog, and reduced-motion support.
- No runtime third-party packages.

## Technology

- Frontend: HTML5, CSS3, vanilla JavaScript.
- Backend: Node.js native `http`, `fs`, `crypto`, and `url` modules (Node 18+).
- Persistence: local JSON file at `data/applications.json`, created on the first successful application. Set `APPLICATIONS_FILE` to select another absolute path.

## Project structure

```text
task-2/
├── data/
│   └── internship-records-sample.json
├── test/
│   └── api.test.js
├── app.js
├── index.html
├── package.json
├── README.md
├── server.js
└── styles.css
```

## Install and run locally

No package installation is required. From this directory:

```sh
node --version
npm start
```

Open `http://localhost:3000`. Set `PORT` to use another port. Example environment configuration (no secrets are needed):

```sh
# PowerShell
$env:PORT = "3000"
npm start
```

## API

All successful responses use `{ "status": "success", "data": ... }`. Errors use `{ "status": "error", "error": { "message": ... } }`.

| Method and path | Purpose | Success |
| --- | --- | --- |
| `GET /api/internships` | List opportunities. Optional `search`, `domain`, and `mode` query parameters can be combined. | `200`, array plus `{ "pagination": { "total": n } }` |
| `GET /api/internships/:id` | Retrieve one opportunity. | `200` or `404` |
| `POST /api/applications` | Submit `{ "name", "email", "internshipId", "portfolio" }`; portfolio may be empty. | `201` with application reference; `400` invalid; `409` duplicate |

The server checks required name, email syntax, internship ID, and portfolio URLs (`http` or `https` only; no embedded credentials). JSON request bodies are limited to 16 KB. Application submissions are limited to 10 per client IP per 10 minutes in each server process. Applications are written locally; request bodies and applicant details are not logged. Storage and the in-memory rate limiter are suitable for a small demo, not concurrent multi-instance or high-volume deployment.

## Testing

Run `npm test` (Node's built-in test runner). The test suite checks dataset IDs and fields, stylesheet serving, security headers and static-file restrictions, search with combined filters, empty results, individual details/404, invalid name/email and unsafe URLs, request size/media type, rate limiting, application persistence, and duplicate rejection. Test storage uses a unique temporary directory and does not touch local application data. Latest run: **9 passed, 0 failed**.

The tests are API-level. No browser automation tool is included, so keyboard behavior and layout at 360px, 768px, and 1366px have not been empirically browser-tested. Responsive CSS breakpoints and semantic keyboard behavior are implemented; inspect those viewports manually in a browser before submission.

## Accessibility

Semantic landmarks and heading hierarchy, skip-to-content link, native labelled controls, text status announcements, visible keyboard focus, a native modal dialog with escape-to-close and focus restoration, mobile menu expanded state, and `prefers-reduced-motion` handling are implemented. Colour contrast and screen-reader behavior still benefit from a dedicated manual audit.

## Responsive checks

CSS adapts at 800px and 600px, with one-column opportunity cards on small screens and a collapsible navigation menu on phones. The requested 360px, 768px, and 1366px widths have **not been visually inspected in a browser** in this environment; those manual checks remain before final submission.

## Deployment

Use a Node.js host that supports a persistent writable disk, set `HOST=0.0.0.0` and `PORT` as required by the host, and start with `npm start`. For durable records, set `APPLICATIONS_FILE` to a path on the persistent disk. The default server binds to `127.0.0.1` for local development. Static serving is limited to the HTML, CSS, and JavaScript entry assets; the API returns security headers and does not enable cross-origin access. Use the platform's HTTPS termination. Applications contain personal information and this demo stores it in plaintext JSON; before collecting real submissions publicly, add a privacy notice, retention/deletion controls, and protected managed storage. Before higher-volume or multi-instance production, move to a managed database and configure trusted-proxy-aware distributed rate limiting and operational monitoring. No deployment has been performed or URL assigned.

## Screenshots

No screenshots have been captured yet. Add desktop and mobile screenshots here after running the app and checking it in a browser.

## Source materials and scope notes

The task guide describes a beginner, framework-free listing with search, domain filters, empty/error states, accessibility, and one proof link. This implementation also includes the broader requested work mode filtering and application API. The official dataset was fetched from the supplied EdVyro URL. The linked product-brief page was unavailable during this build, so this README does not attribute any additional product requirements to it.

## GitHub publication

1. Review the project and remove local application records if any contain real applicant information.
2. Create an empty public GitHub repository.
3. From this directory run `git init`, `git add .`, `git commit -m "Build responsive EdVyro internship board"`, set the repository URL with `git remote add origin <repository-url>`, then `git push -u origin main`.
4. Deploy the repository on a Node-compatible host with persistent disk enabled. Configure the start command as `npm start`, set any required `PORT` setting, and verify the three API routes and application persistence on the deployed host.

Do not commit real applicant submissions. There is no deployment URL until you publish and verify it.
