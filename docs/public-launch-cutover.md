# Perfect Shade Production Domain Cutover Runbook

## Purpose and authority

This runbook covers the future move of `getyourperfectshade.com` from Wix web hosting to the
existing Perfect Shade AWS Amplify application. It is a planning artifact only. It does not
authorize DNS, AWS, Wix, registrar, email, or production changes.

Approved public-domain behavior:

- canonical site: `https://www.getyourperfectshade.com`;
- apex: `https://getyourperfectshade.com` redirects permanently to the same path and query on
  `https://www.getyourperfectshade.com`;
- HTTPS is valid on both hostnames; and
- `www` serves the accepted production Amplify `main` build.

DNS observations in this document are a read-only public snapshot taken on 2026-09-05. Export
the complete Wix DNS control-panel zone immediately before planning the live change. Public DNS
queries cannot enumerate unknown record names, mailbox aliases, forwarding rules, or records
that exist in an account but are not published.

## Current authority and web behavior

| Item | Observed value |
| --- | --- |
| Registrar | Network Solutions, LLC (ICANN RDAP) |
| Authoritative DNS provider | Wix |
| Nameservers | `ns12.wixdns.net`, `ns13.wixdns.net` |
| SOA primary | `ns12.wixdns.net` |
| SOA administrator | `support.wix.com` |
| SOA serial | `2022122100` |
| Apex HTTP | `301` to `https://getyourperfectshade.com/` |
| Apex HTTPS | `301` to the same path on `https://www.getyourperfectshade.com/` |
| WWW HTTP | `301` to HTTPS on `www` |
| WWW HTTPS | `200`, served by Wix (`Pepyaka`) |
| Current canonical convention | `www` |

The registrar and DNS provider are separate concerns. Do not transfer the registration during
the launch. A future nameserver change, if approved, belongs in Network Solutions; record edits
while Wix remains authoritative belong in Wix.

## Published DNS inventory

### Records present

| Name | Type | TTL | Published value | Classification |
| --- | --- | ---: | --- | --- |
| `@` | SOA | 3600 | Primary `ns12.wixdns.net`; administrator `support.wix.com`; serial `2022122100` | DNS authority |
| `@` | NS | 86400 | `ns12.wixdns.net` | DNS authority |
| `@` | NS | 86400 | `ns13.wixdns.net` | DNS authority |
| `@` | A | 3600 | `185.230.63.107` | **Wix web hosting** |
| `@` | A | 3600 | `185.230.63.171` | **Wix web hosting** |
| `@` | A | 3600 | `185.230.63.186` | **Wix web hosting** |
| `www` | CNAME | 3600 | `cdn1.wixdns.net` | **Wix web hosting** |
| `@` | TXT | 3600 | `v=spf1 +a +mx a:mail.getyourperfectshade.com ip4:44.232.56.54 ip4:127.0.0.1/24 include:_spf.google.com include:spf.efwd.registrar-servers.com -all` | Email authorization; **do not change in the web cutover** |
| `default._domainkey` | TXT | 3600 | `v=DKIM1; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnYilK0TImAxNWT54EbB6JeW0SabhoZAj2YLvdDe1cwijKEXH+ObhSLR8FmXHbkaUWP8DhBMJYSfXrLHaiRYVvypENcM4TweIrkqdeibGH16DrdMSXmE9PoX/28fBz0AQ6WbITdQhu9VxYUG19RncOm9IHY0eJ9YgtmSOmnjAYPuYD3ZxX/qTCNBa3745ys4YsxMXd4iEtkkKlgSi5DPqz9lFoS15VT6251L1CFijicxdDKMgougiIiMS+ouPCQAWmjMn9jhveOn5myfIvb92iIW5/OUU7yFopx5uXC8rjetDY6uz1gdw6VOXbW5QtLrV38F6mK204XQR/O/9geYqKQIDAQAB;` | DKIM public key; **do not change** |
| `_dmarc` | TXT | 3600 | `v=DMARC1; p=quarantine; adkim=s; aspf=r; sp=quarantine; pct=100; rf=afrf; ri=86400; ruf=mailto:no-reply@getyourperfectshade.com` | Email policy; **do not change** |

### Records not published at the queried names

The authoritative Wix server returned no published records for:

- apex MX;
- apex AAAA;
- apex CAA;
- Google site-verification TXT at the apex;
- `google._domainkey` TXT;
- `selector1._domainkey` and `selector2._domainkey` CNAME;
- `_smtp._tls` and `_mta-sts` TXT;
- `mta-sts`, `mail`, `webmail`, and `autodiscover` host records;
- `_autodiscover._tcp`, `_submission._tcp`, and `_imaps._tcp` SRV;
- `_amazonses` TXT;
- `_acme-challenge` TXT; and
- `_domainconnect` CNAME.

The approved public contact and transactional Reply-To address is
`ps.getyourperfectshade@gmail.com`. The owner has confirmed that the domain does not need to receive
inbound mail or provide custom-domain aliases or forwarding. No MX record is required or approved;
the absence of apex MX is not a web-launch blocker. SPF can authorize senders but does not route
inbound mail, and the observed SPF reference to Google is not evidence that Google Workspace is
configured for this domain. Do not add or infer Google Workspace MX, DKIM, or any other
mail-provider records during the website cutover.

The SPF policy also contains the `a` mechanism. Replacing the apex web target changes the hosts
that this mechanism resolves to, so SPF authorization semantics can change even when the TXT value
is preserved byte-for-byte. The mail owner must assess that dependency before launch. Any SPF
cleanup belongs in a separately reviewed mail change, not in the web cutover.

Email aliases, including any Unified Techworks administrative aliases, normally live in the mail
provider or forwarding account and are not discoverable through DNS. Capture them in a separate
private administrative checklist. Do not place addresses, credentials, forwarding destinations,
or private account details in this repository.

## Records that may and may not change

### Web-hosting records to replace during the final web cutover

Only after the Amplify domain is validated and the launch is authorized:

| Name | Current record | Future record | Exact target source |
| --- | --- | --- | --- |
| `www` | CNAME `cdn1.wixdns.net` | CNAME to the Amplify/CloudFront target | Copy exactly from **Amplify > Hosting > Custom domains > View DNS records** |
| `@` | Three Wix A records | Route 53 ALIAS/Amplify-managed apex target for the Amplify root-to-`www` redirect | Created from the approved Amplify domain association in Route 53 |

The future AWS values do not exist in public DNS and cannot be known until the domain association
is created. Never guess a CloudFront hostname or copy one from another environment. Record the
exact generated values in the change ticket before the final cutover.

If the preferred Route 53 plan is approved, the registrar NS delegation and zone SOA/NS records
also change in an earlier, separate DNS-hosting migration. They are not web-routing records and
must not be changed in the same window as the Amplify cutover.

### Records that must remain untouched

- all MX records present in the control-panel export, even though none are currently published;
- the apex SPF TXT record;
- `default._domainkey` and every other DKIM selector found in the export;
- `_dmarc`;
- Google Workspace verification records;
- registrar/mail-forwarding verification and service records;
- Unified Techworks alias/forwarding administration;
- any SES records later created by the AWS email owner;
- any unrelated TXT, CNAME, SRV, CAA, or service-discovery records; and
- registrar contact, renewal, transfer-lock, and ownership settings.

Do not replace the whole zone from a hand-written list. Reconcile a control-panel export against
this snapshot and require a second-person review.

## Recommended DNS architecture

### Preferred durable path: stage Route 53 before the web cutover

AWS Amplify's third-party DNS procedure requires an apex `ANAME`/`ALIAS` for the root mapping and
recommends Route 53 when the current provider cannot supply one. Wix documents apex A records and
subdomain CNAMEs but does not document apex alias flattening. Use two separate change windows:

1. Create a Route 53 public hosted zone under the approved production AWS ownership.
2. Import or recreate the **complete reviewed Wix zone**, initially preserving the Wix A records
   and `www` CNAME exactly. Include all email and verification records from the Wix export.
3. Query the new Route 53 nameservers directly and compare every record and TTL with Wix.
4. Change nameservers at Network Solutions only after exact parity and owner approval.
5. Wait at least 48 hours, then prove the Wix site, HTTPS, inbound/outbound mail, forwarding, SPF,
   DKIM, DMARC, and administrative aliases still work. Do not combine this nameserver move with
   the Amplify web cutover.
6. After DNS hosting is stable, lower only the Route 53 apex and `www` web-record TTLs and perform
   the Amplify cutover in a later approved window.

This path makes the eventual rollback fast: restore the Wix web values in Route 53 without
changing nameservers again.

If the preliminary nameserver migration itself fails, restore the Network Solutions delegation
to `ns12.wixdns.net` and `ns13.wixdns.net`. The current authoritative NS TTL is 86400 seconds, so
allow for long-lived cached delegation and keep both zones identical and operational throughout
the migration. Do not use a nameserver rollback for an ordinary Amplify website issue after
Route 53 has stabilized; restore the Wix A/CNAME values in Route 53 instead.

### Interim alternative: keep Wix authoritative

Amplify can associate only `www` (using **Exclude root**) while Wix remains authoritative, but
the apex would still depend on Wix to provide the HTTPS redirect. This is acceptable only as an
explicitly approved interim arrangement after proving that Wix permits the split configuration,
preserves the apex redirect, and keeps its certificate valid. It does not complete the move away
from Wix and is not the recommended final state.

## Wix rollback inventory

These values were read directly from the authoritative Wix server on 2026-09-05:

| Record name | Type | Old value | TTL | Purpose |
| --- | --- | --- | ---: | --- |
| `@` | A | `185.230.63.107` | 3600 | Wix apex web hosting/redirect |
| `@` | A | `185.230.63.171` | 3600 | Wix apex web hosting/redirect |
| `@` | A | `185.230.63.186` | 3600 | Wix apex web hosting/redirect |
| `www` | CNAME | `cdn1.wixdns.net` | 3600 | Wix customer-facing site |

Before launch, export the Wix zone and take timestamped screenshots of the Wix domain assignment,
primary-domain setting, SSL state, and these records. Keep the Wix site and subscription active
through the rollback window.

### Fast rollback steps

1. Declare rollback when any criterion below is met; stop content and configuration changes.
2. In the authoritative DNS zone, remove or replace only the Amplify apex/`www` routing records.
3. Restore all three apex A records and the `www` CNAME above, using temporary TTL 300 if the zone
   permits it. Do not touch validation, mail, TXT, MX, DKIM, DMARC, or service records.
4. Confirm the authoritative nameservers return all three Wix A values and `cdn1.wixdns.net`.
5. From at least two independent resolvers/networks, verify:
   - apex HTTP and HTTPS redirect to the same path on `www`;
   - `www` HTTPS serves the prior Wix site with a valid certificate;
   - `/`, `/products`, `/events`, and an intentional 404 behave as before; and
   - inbound/outbound email and approved aliases still work.
6. Keep Amplify and its certificate-validation records intact while investigating unless they are
   the cause. Removing ACM validation records can prevent automatic certificate renewal.
7. Record timestamps, resolver results, reason, and owner decision. Restore the normal 3600 web
   TTL only after Wix behavior is stable for at least 24 hours.

Rollback criteria include widespread TLS failure, apex/`www` loops, path loss, wrong environment,
development authentication/API wiring, protected-route failure, broken estimate or document
output, material public-site errors, or any mail-delivery regression temporally associated with
the DNS change.

## TTL plan

Current apex and `www` web TTLs are 3600 seconds. Current NS TTL is 86400 seconds.

1. For the recommended Route 53 path, complete the nameserver migration at least 7 days before
   the web cutover and leave the Wix web values unchanged during that stabilization period.
2. At least 48 hours before the Amplify web cutover, lower only apex and `www` web-record TTLs to
   300 seconds. Do not lower mail or validation TTLs merely for the website launch.
3. Wait at least two old TTLs after the authoritative zone shows 300 (minimum two hours with the
   current 3600 TTL) and verify multiple public resolvers see the reduced TTL.
4. Perform the web change during a staffed window. Allow for stale recursive caches despite the
   reduced TTL.
5. Keep TTL 300 through at least 24 hours of clean validation; 48 hours is preferred because DNS
   and certificate propagation can take that long.
6. Restore web TTLs to 3600 after acceptance and the rollback window close. Keep ACM validation
   CNAME records permanently.

## Amplify production-domain sequence

Each hold point requires recorded approval. Chat 5/AWS owners perform backend and infrastructure
steps; the public-site owner validates public behavior.

1. **Accept production backend isolation.** Confirm the separate production Cognito pool/client,
   API, database, storage, SES, alarms, backups, and recovery procedures are provisioned and
   accepted. No development identifier or data may be used.
2. **Accept the production Amplify build.** Deploy the approved `main` commit with production-only
   branch variables, manual/protected release controls, and the required environment marker.
   Validate the generated Amplify URL before attaching customer DNS.
3. **Correct the public canonical source before release.** `data/business.ts` currently sets
   `businessInfo.url` to `https://getyourperfectshade.com`. Change it on a reviewed public release
   branch to `https://www.getyourperfectshade.com`, then verify metadata base, Open Graph URLs,
   sitemap URLs, robots sitemap, and LocalBusiness JSON-LD all emit `www`.
4. **Configure exact production identity/API URLs.** Set and verify:
   - site origin: `https://www.getyourperfectshade.com`;
   - Cognito callback: `https://www.getyourperfectshade.com/auth/callback`;
   - Cognito logout: `https://www.getyourperfectshade.com/sign-in`; and
   - API CORS allowed origin: `https://www.getyourperfectshade.com`.
5. **Choose the apex strategy.** Approve the recommended Route 53 staging path or explicitly accept
   the Wix-dependent interim path. Do not proceed while this remains undecided.
6. **Add the domain.** In the existing `GetYourPerfectShade` Amplify app, open **Hosting > Custom
   domains**, add `getyourperfectshade.com`, map `www` to production `main`, and configure root as
   a permanent redirect to `www`. Use an Amplify-managed certificate for both hostnames.
7. **Publish certificate validation first.** Copy the exact Amplify/ACM ownership CNAME into the
   authoritative zone immediately. Leave Wix web routing in place. Never remove this record while
   Amplify serves the domain.
8. **Wait for validation.** Wait until Amplify reports the certificate/domain state expected before
   production traffic. Record every generated verification, `www`, and apex target. AWS notes that
   third-party verification/propagation can take up to 48 hours.
9. **Verify before customer cutover where possible.** Validate the accepted build on the generated
   Amplify hostname. Confirm the certificate has both apex and `www` names. Use controlled host/DNS
   validation only if approved; do not publish customer traffic early.
10. **Apply legacy redirects.** Add and test only reviewed redirects listed in the SEO section.
    Preserve true 404 responses; do not use a catch-all `404-200` rewrite for missing routes.
11. **Change web DNS only.** At the approved time, replace `www` with the exact Amplify CNAME and
    replace the apex Wix A set with the approved Route 53 ALIAS/Amplify root redirect target. Do
    not edit any mail, verification, or unrelated service record.
12. **Validate immediately.** Run the complete smoke checklist below from multiple networks and
    both signed-out and approved test-staff sessions.
13. **Monitor and close.** Watch Amplify, API, auth, application metrics, TLS, email delivery, and
    search endpoints through the rollback window. Restore normal TTL only after approval.

Live AWS state was not independently inventoried for this runbook because no AWS credentials were
available in the read-only shell. Before launch, an authorized operator must confirm the app name,
region, production branch, domain-association state, generated DNS targets, and certificate state
in the AWS account.

## SEO migration and URL inventory

### Current Wix URLs

The live Wix sitemap on 2026-09-05 contains exactly:

- `/`
- `/events`
- `/products`

All three return `200` with self-referencing `www` canonicals. A random missing URL returns a true
`404`.

### New public URLs

- `/`
- `/about`
- `/contact`
- `/gallery`
- `/gallery/window-coverings`
- `/gallery/exterior-solutions`
- product selections under the existing category URLs using the current `?product=` pattern

### Redirect decisions

| Old Wix path | New target | Status |
| --- | --- | --- |
| `/products` | `/gallery` | Confirmed semantic replacement; add permanent path-preserving host redirect behavior |
| `/events` | **Owner decision required** | No current one-to-one page exists. Review the Wix page and analytics/backlinks before selecting a destination or retaining a purpose-built page. Do not guess. |

No other Wix URL appears in the live sitemap. Before release, inspect Wix analytics, Google Search
Console, inbound-link data, and any campaign URLs for non-sitemap paths. Add redirects only for
real URLs with an approved equivalent.

Before cutover, verify:

- all public metadata resolves against `https://www.getyourperfectshade.com`;
- each page keeps its current title, description, canonical, and Open Graph metadata;
- Open Graph images resolve with absolute `www` URLs;
- `/sitemap.xml` contains only canonical public URLs and returns `200` XML;
- `/robots.txt` references the canonical sitemap and disallows `/app`, `/auth`, `/sign-in`,
  `/forgot-password`, and `/reset-password`;
- protected/auth routes emit appropriate `noindex` metadata or headers in addition to robots
  rules, because robots disallow alone is not an indexing guarantee;
- LocalBusiness schema uses the canonical `www` URL and current approved business facts;
- internal links do not produce apex, Wix, development, or broken URLs;
- product links and `?product=` selections retain their accepted behavior; and
- unknown paths return a true `404`, including `/sign-up`.

## Production-domain acceptance checklist

Record pass/fail, timestamp, tester, device/browser, and evidence for each item.

### DNS, HTTPS, and routing

- [ ] Authoritative nameservers are the approved provider and match the change record.
- [ ] Apex and `www` resolve only to the approved production targets.
- [ ] `http://getyourperfectshade.com/<path>?<query>` reaches the identical path/query on HTTPS
  `www` without a loop or path loss.
- [ ] `https://getyourperfectshade.com/<path>?<query>` returns one permanent host redirect to the
  identical HTTPS `www` path/query.
- [ ] `www` serves the approved Amplify `main` commit, not Wix or development.
- [ ] TLS is valid for both names, has the expected chain, and has no mixed content.
- [ ] An unknown public path returns a real branded 404 with HTTP 404.

### Public website

- [ ] Homepage loads, brands correctly, and all primary phone/email/consultation actions work.
- [ ] Products Offered loads all approved products in the approved order.
- [ ] At least one interior and one exterior product detail selection loads directly and after
  client navigation; supporting galleries and previous/next wraparound work.
- [ ] `/about` and `/contact` load with current contact, license, and service-area facts.
- [ ] Header, footer, navigation, focus, keyboard, touch targets, reduced motion, and responsive
  layouts pass at 320, 390, 768, 1366, 1440, and wide-desktop widths.
- [ ] Images load without broken references, severe layout shift, or accidental branding.
- [ ] Browser console and network panel show no unexpected errors or missing public assets.

### Authentication and protected application (AWS/account owner)

- [ ] `/sign-up` is absent and returns 404.
- [ ] Production sign-in uses only production Cognito/API configuration.
- [ ] Cognito callback, logout, password recovery, required TOTP, refresh, and sign-out pass.
- [ ] Signed-out `/app/*` fails closed; authorized owner/admin/staff access matches role rules.
- [ ] No development identity or session can access production, and vice versa.

### Estimate and document workflow (estimate/application owner)

- [ ] Create, save, reload, edit, and version an estimate using approved test data.
- [ ] Validate calculations and issue-state immutability.
- [ ] Generate and download DOCX and PDF; compare accepted content and layout.
- [ ] Generate/inspect any required JSON output and private download behavior.
- [ ] Capture and render the approved signature workflow without exposing private artifacts.
- [ ] Confirm print/preview behavior and document history.

### Email protection and validation

- [ ] Wix/Route 53 export comparison shows no lost MX, SPF, DKIM, DMARC, verification, forwarding,
  SES, or unrelated service records.
- [x] The owner has recorded that `getyourperfectshade.com` is not expected to receive inbound
  email; no MX or Google Workspace configuration is required.
- [ ] The approved `ps.getyourperfectshade@gmail.com` public contact and Reply-To remains published
  and passes an inbound reply test.
- [ ] Approved administrative aliases and forwarding paths pass without revealing destinations
  in the launch record.
- [ ] SPF, DKIM, and DMARC evaluation is healthy for each approved sending path.
- [ ] Cognito recovery/invitation and application transactional email pass through the approved
  production sender, with bounce/complaint monitoring active.

### SEO and post-cutover monitoring

- [ ] Canonicals, Open Graph URLs, sitemap, robots, and LocalBusiness schema use HTTPS `www`.
- [ ] `/products` permanently redirects to `/gallery`.
- [ ] `/events` follows the recorded owner decision.
- [ ] Public paths are indexable; auth/protected paths are not included in the sitemap and carry
  the approved indexing controls.
- [ ] Google Search Console property/verification remains valid and the new sitemap is submitted.
- [ ] Server logs/metrics show no material 404, redirect-loop, TLS, asset, auth, API, or CORS issue.

## Launch gates and unresolved decisions

The domain is **not yet ready for a controlled cutover**. It becomes ready only when all of these
are resolved:

1. Export and second-person review of the complete Wix DNS zone.
2. Confirm `ps.getyourperfectshade@gmail.com` remains the approved, working public contact and
   Reply-To. The owner has approved no inbound custom-domain mail and no MX records.
3. Owner decision between the recommended staged Route 53 migration and the Wix-dependent interim
   apex redirect.
4. Authorized AWS inventory confirming the `GetYourPerfectShade` app, production `main` branch,
   region, production-only environment values, domain state, and generated DNS targets.
5. Production backend, Cognito, CORS, SES, recovery, document output, alarm, and rollback acceptance
   by their owning workstreams.
6. Public release fix changing `businessInfo.url` from apex to canonical `www`, followed by build
   and metadata verification.
7. Owner decision for the real legacy `/events` URL after analytics/backlink review.
8. Confirmation that the Wix site and subscription remain available through the rollback window.
9. Named launch owner, DNS operator, AWS operator, mail owner, validation team, maintenance window,
   communication path, and rollback authority.

## Read-only evidence and references

Evidence collected on 2026-09-05:

- authoritative `SOA`, `NS`, `A`, `CNAME`, `MX`, and TXT queries against `ns12.wixdns.net`;
- independent public-DNS checks for selected absent records;
- ICANN/Verisign RDAP registrar and nameserver lookup;
- HTTP/HTTPS redirect and status checks for apex, `www`, the Wix sitemap URLs, and a missing path;
- live Wix `robots.txt`, `sitemap.xml`, and `pages-sitemap.xml`; and
- repository review of `data/business.ts`, metadata, robots, sitemap, LocalBusiness schema, and
  production-readiness documents at base commit `2aba1c3b2a882fb7e5fc48ffc970e6a6553aa91c`.

Operational references:

- AWS Amplify third-party DNS procedure:
  <https://docs.aws.amazon.com/amplify/latest/userguide/to-add-a-custom-domain-managed-by-a-third-party-dns-provider.html>
- AWS Amplify custom-domain concepts:
  <https://docs.aws.amazon.com/amplify/latest/userguide/custom-domains.html>
- AWS Amplify redirects:
  <https://docs.aws.amazon.com/amplify/latest/userguide/creating-editing-redirects.html>
- Wix DNS record management:
  <https://support.wix.com/en/article/managing-dns-records-in-your-wix-account>
