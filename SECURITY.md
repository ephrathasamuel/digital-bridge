# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for security problems. Use the repository's **Security** tab and choose
**Report a vulnerability** (GitHub private vulnerability reporting). You should get a reply within 7 days.

Useful details: what you found, how to reproduce it, and what data could be exposed.

## Personal data

This project handles sensitive information about disabled learners (support needs, phone numbers, identity routes,
Contact a person messages). Reports that show this data could leak, be logged, or reach employers without consent are
treated as high priority.

## Deploying safely

The API ships with **demo** OAuth clients and secrets (for example `alx-savanna`, `partner-demo`, `help-desk`) so it runs
out of the box. They are public and must not be used in production. Before deploying:

* Set `JWT_SECRET` to a long random value.
* Set `PARTNER_CLIENTS` to your own clients and secrets (JSON). Clients with the same name replace the demo ones.
* Serve the API over HTTPS only.

## Supported versions

Only the latest `main` branch receives security fixes.
