# Email Verification Service

## 1. Goal

Build a production-grade email verification service similar in functionality to ZeroBounce.

Given:

```text
harish@gmail.com
```

the system should determine properties such as:

```json
{
  "email": "harish@gmail.com",
  "syntax": "valid",
  "domain": "valid",
  "mx": "valid",
  "smtp": "valid",
  "disposable": false,
  "role_account": false,
  "catch_all": false,
  "status": "valid"
}
```

The system should **not send an actual email** to verify the mailbox.

---

# 2. Overall Architecture

```text
                    ┌─────────────────────┐
                    │      Client         │
                    │ Web / API / Upload  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Verification API  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Verification Engine │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
        Syntax Check       DNS/MX Check    Domain Checks
              │                │                │
              └────────────────┼────────────────┘
                               │
                               ▼
                       SMTP Verification
                               │
                               ▼
                       Risk Detection
                               │
                               ▼
                       Final Classification
                               │
                               ▼
                         Database / API
```

---

# 3. Verification Pipeline

The core pipeline is:

```text
Email
 ↓
Normalize
 ↓
Syntax validation
 ↓
Extract domain
 ↓
DNS lookup
 ↓
MX lookup
 ↓
Resolve MX hostname → IP
 ↓
SMTP connection
 ↓
EHLO
 ↓
MAIL FROM
 ↓
RCPT TO
 ↓
Interpret SMTP response
 ↓
Catch-all detection
 ↓
Disposable-domain detection
 ↓
Role-account detection
 ↓
Risk/reputation checks
 ↓
Final result
```

Each step should be independently testable.

---

# 4. Step 1 — Normalize Email

Before doing anything else:

```text
"  Harish@Gmail.COM  "
```

becomes:

```text
harish@gmail.com
```

Do not blindly modify the local part because email local-part rules can be more complicated.

At minimum:

- Remove surrounding whitespace.
- Normalize the domain to lowercase.
- Preserve the original input for logging/auditing.

---

# 5. Step 2 — Syntax Validation

First determine whether the address is structurally valid.

Example:

```text
harish@gmail.com
```

is structurally valid.

```text
harish@
@gmail.com
harish gmail.com
```

are invalid.

Use a proper email-address parsing library rather than trying to write a giant regex yourself.

Important:

```text
Syntax valid ≠ Email exists
```

This only tells us that the address is correctly structured.

---

# 6. Step 3 — Extract Domain

From:

```text
harish@gmail.com
```

extract:

```text
gmail.com
```

Now the system works with the domain.

---

# 7. Step 4 — DNS Lookup

DNS is the system used to retrieve information about domains.

DNS has different record types:

```text
A       → IPv4 address
AAAA    → IPv6 address
MX      → Mail-exchange server
TXT     → Text/configuration
CNAME   → Alias
```

For email verification, the important record is:

```text
MX
```

---

# 8. Step 5 — MX Lookup

Ask DNS:

```text
"What are the MX records for gmail.com?"
```

The response conceptually looks like:

```text
Priority    Mail Server
5           gmail-smtp-in.l.google.com
10          alt1.gmail-smtp-in.l.google.com
20          alt2.gmail-smtp-in.l.google.com
30          alt3.gmail-smtp-in.l.google.com
40          alt4.gmail-smtp-in.l.google.com
```

The number is the **priority**.

Lower number means higher priority.

The hostname is the **mail server**.

Important:

We should **never hardcode Gmail/Yahoo/Outlook MX servers**.

Our application asks DNS every time it needs the information, with caching where appropriate.

---

# 9. Step 6 — Resolve MX Hostname

The MX record gives us:

```text
gmail-smtp-in.l.google.com
```

That is a hostname, not necessarily an IP.

Resolve it through DNS:

```text
gmail-smtp-in.l.google.com
              ↓
          DNS lookup
              ↓
        IP address
```

For example, conceptually:

```text
gmail-smtp-in.l.google.com
        ↓
142.xxx.xxx.xxx
```

The actual IP can change.

---

# 10. Step 7 — SMTP Connection

Now we know where the receiving mail server is.

Connect to the appropriate SMTP service.

Conceptually:

```text
Your server
    │
    │ TCP connection
    ▼
Mail server IP : 25
```

Port `25` is the standard server-to-server SMTP port.

This does **not** mean we send an email.

We're establishing an SMTP conversation.

---

# 11. Step 8 — SMTP Conversation

The receiving server normally starts with a greeting similar to:

```text
220 mail.example.com ...
```

Our client sends:

```text
EHLO verifier.yourdomain.com
```

The server responds with capabilities:

```text
250-...
250-SIZE ...
250-STARTTLS
...
```

Then we identify the sender:

```text
MAIL FROM:<verify@yourdomain.com>
```

Then the important command:

```text
RCPT TO:<harish@gmail.com>
```

The receiving server responds.

For example:

```text
250 OK
```

or:

```text
550 User unknown
```

or:

```text
4xx Temporary failure
```

---

# 12. SMTP Result Interpretation

Do NOT simply implement:

```text
250 = valid
550 = invalid
```

Real providers behave differently.

We need a classification layer.

For example:

```text
SMTP response
      ↓
Parser
      ↓
Classification
      ↓
VALID
INVALID
UNKNOWN
TEMPORARY_FAILURE
```

Example:

```text
250
 ↓
accepted
 ↓
potentially valid
```

But:

```text
4xx
 ↓
temporary condition
 ↓
UNKNOWN / RETRY
```

And some providers intentionally prevent reliable mailbox enumeration.

Therefore:

```text
SMTP accepted
```

doesn't always mean:

```text
Mailbox definitely exists
```

This distinction is extremely important for a production verifier.

---

# 13. Step 9 — Catch-All Detection

Some domains accept mail for **every possible address**.

For example:

```text
random123456789@example.com
```

may receive:

```text
250 OK
```

even though the mailbox doesn't actually exist.

To detect this, test a deliberately generated address that should not exist:

```text
random-verify-839182@example.com
```

If the server accepts both:

```text
real@example.com
```

and:

```text
random-verify-839182@example.com
```

the domain may be:

```text
catch_all = true
```

This means SMTP cannot reliably tell us whether a particular mailbox exists.

---

# 14. Step 10 — Disposable Email Detection

This does not require AI.

Maintain a continuously updated disposable-domain dataset.

Example:

```text
mailinator.com
10minutemail.com
tempmail.example
...
```

The lookup becomes:

```text
email
 ↓
extract domain
 ↓
domain database
 ↓
known disposable?
 ↓
yes / no
```

For production, the important problem is **dataset maintenance**, not the lookup itself.

The database should support:

```text
domain
source
first_seen
last_seen
confidence
status
```

Do not rely permanently on a tiny hardcoded array.

---

# 15. Step 11 — Role Account Detection

Some addresses represent a function rather than an individual.

Examples:

```text
info@example.com
support@example.com
admin@example.com
sales@example.com
billing@example.com
```

Maintain a role-prefix dataset:

```text
info
admin
support
sales
billing
contact
help
...
```

Then:

```text
support@gmail.com
       ↓
role account
```

This does not necessarily mean the email is invalid.

It is simply another classification.

---

# 16. Step 12 — Risk / Reputation

A production service needs additional signals.

Potential signals include:

```text
Disposable
Spam trap
Abuse address
Known risky domain
Free-mail provider
Role account
Domain reputation
SMTP behavior
Historical verification results
```

This should ultimately feed a result such as:

```json
{
  "status": "valid",
  "risk": "low"
}
```

rather than relying on one check.

---

# 17. Important Result Model

Do not make the database simply:

```text
valid = true/false
```

Use independent signals.

Example:

```json
{
  "email": "harish@gmail.com",

  "syntax": {
    "valid": true
  },

  "domain": {
    "valid": true
  },

  "mx": {
    "valid": true,
    "servers": []
  },

  "smtp": {
    "status": "accepted",
    "confidence": "medium"
  },

  "disposable": false,

  "role_account": false,

  "catch_all": false,

  "final_status": "valid"
}
```

This gives us flexibility later.

---

# 18. Recommended Backend Structure

A clean Node.js structure:

```text
src/
│
├── api/
│   ├── routes/
│   └── controllers/
│
├── verification/
│   ├── verifier.js
│   ├── syntax.js
│   ├── dns.js
│   ├── mx.js
│   ├── smtp.js
│   ├── catchAll.js
│   ├── disposable.js
│   ├── roleAccount.js
│   └── classifier.js
│
├── data/
│   ├── disposable/
│   └── roleAccounts/
│
├── workers/
│   └── verificationWorker.js
│
├── database/
│
└── config/
```

The key idea is:

**One verification check = one module.**

Don't put the entire verifier inside one giant function.

---

# 19. Infrastructure

A serious system will eventually need:

```text
API servers
      ↓
Queue
      ↓
Verification workers
      ↓
DNS / SMTP
      ↓
Database
      ↓
Results
```

Why a queue?

Because SMTP checks can take time.

If 100,000 emails arrive:

```text
API
 ↓
Queue
 ↓
Worker 1
Worker 2
Worker 3
Worker 4
...
```

The API should not keep one HTTP request open while thousands of SMTP checks happen.

---

# 20. Database

We should store things such as:

### Verification

```text
verification_id
email
domain
status
risk
created_at
completed_at
```

### Domain intelligence

```text
domain
is_disposable
is_catch_all
is_free_provider
mx_records
last_checked
```

### SMTP observations

```text
domain
mx_host
smtp_status
response_code
response_message
checked_at
```

This also allows caching.

---

# 21. Caching

DNS/MX information doesn't need to be resolved repeatedly.

For example:

```text
gmail.com
   ↓
MX lookup
   ↓
cache
```

Next request:

```text
someoneelse@gmail.com
   ↓
gmail.com
   ↓
cached MX information
```

This reduces DNS traffic and speeds up verification.

The same principle can be used for domain intelligence.

---

# 22. API Design

Eventually expose something like:

```http
POST /v1/verify
```

Request:

```json
{
  "email": "harish@gmail.com"
}
```

Response:

```json
{
  "email": "harish@gmail.com",
  "status": "valid",
  "checks": {
    "syntax": true,
    "domain": true,
    "mx": true,
    "smtp": true,
    "disposable": false,
    "role_account": false,
    "catch_all": false
  }
}
```

Later:

```http
POST /v1/verify/bulk
```

can accept thousands/millions of addresses.

---

# 23. Development Order

We should build it in this exact order:

### Phase 1 — Email fundamentals

Understand and implement:

```text
Email
 ↓
Syntax
 ↓
Domain
 ↓
DNS
 ↓
MX
```

### Phase 2 — DNS implementation

Build:

```text
getMxRecords(domain)
```

Output:

```js
[
  {
    priority: 5,
    exchange: "gmail-smtp-in.l.google.com"
  }
]
```

### Phase 3 — SMTP engine

Build:

```text
connect()
ehlo()
mailFrom()
rcptTo()
quit()
```

with:

- timeouts
- retries
- TLS handling where appropriate
- connection cleanup
- error classification

### Phase 4 — Catch-all

Implement catch-all detection.

### Phase 5 — Disposable intelligence

Integrate a serious maintained disposable-domain dataset and build the update mechanism.

### Phase 6 — Role accounts

Implement role-prefix detection.

### Phase 7 — Result classifier

Combine all signals into:

```text
valid
invalid
unknown
risky
```

### Phase 8 — Queue/workers

Move verification into asynchronous workers.

### Phase 9 — Database + caching

Persist results and cache domain intelligence.

### Phase 10 — API

Expose the verification service.

### Phase 11 — Bulk verification

CSV/API bulk processing.

### Phase 12 — Production hardening

Add:

- rate limiting
- observability
- retries
- circuit breakers
- worker scaling
- connection limits
- abuse prevention
- authentication/API keys
- billing/usage tracking
- audit logs

---

# 24. Most Important Principle

Don't think of the system as:

```text
"Check if email exists"
```

Think of it as:

```text
             ┌─ Syntax
             ├─ Domain
             ├─ MX
             ├─ SMTP
Email ───────┼─ Catch-all
             ├─ Disposable
             ├─ Role
             ├─ Reputation
             └─ Historical signals
                    ↓
              Classification
```

There is **no single check that reliably proves an email mailbox exists**.

The product's value comes from combining these signals intelligently.

---

# 25. First Implementation

We should **not start with ZeroBounce's dashboard, authentication, billing, or bulk CSV**.

The first production component we should build is the **verification engine**.

Our first actual coding milestone is:

```text
verifyEmail(email)

        ↓

normalize
        ↓
syntax
        ↓
DNS
        ↓
MX
        ↓
resolve MX
        ↓
SMTP
        ↓
structured result
```

Once this works reliably, we add the intelligence layers around it.