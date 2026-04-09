**SOLUTION DESIGN DOCUMENT**

**Student Enrolment Integration**

Salesforce ↔ AWS API Gateway

*EduTechCo / ALU --- Platform Engineering Lead Assignment*

Author: Rebecca Goba

Role: Salesforce Architect (Candidate)

Version: 1.0

Status: Draft for Review

**Document Control**

**Version History**

  -----------------------------------------------------------------------------
  **Version**   **Date**     **Author**    **Change Summary**
  ------------- ------------ ------------- ------------------------------------
  0.1           2026-04-08   R. Goba       Initial draft --- architecture,
                                           sequence flows, work breakdown

  1.0           2026-04-08   R. Goba       Baselined for hiring panel review
  -----------------------------------------------------------------------------

**Reviewers & Approvers**

  -----------------------------------------------------------------------
  **Name**           **Role**                   **Responsibility**
  ------------------ -------------------------- -------------------------
  TBD                VP, Enterprise             Approver
                     Transformation             

  TBD                Enterprise Architect       Technical reviewer

  TBD                Security Lead              Security & data
                                                protection sign-off

  TBD                Delivery Lead              Build delegation &
                                                scheduling
  -----------------------------------------------------------------------

**Related Documents**

-   Engineering Governance Framework (Part 2 deliverable)

-   Stabilisation Architecture & DevOps Plan (Part 1 deliverable)

-   OpenAPI 3.0 Specification --- student-enrolment-api.yaml (Appendix
    A)

-   Job Description --- Lead Salesforce Platform Engineer, ALU

**1. Executive Summary**

This Solution Design Document (SDD) describes the end-to-end
architecture for a Student Enrolment Integration that allows EduTechCo
to capture prospective student registrations through a Salesforce
Experience Cloud portal, propagate them to downstream systems via an
AWS-hosted API Gateway, and accept inbound updates from external systems
back into Salesforce --- all governed by a single OpenAPI contract.

The design treats Salesforce as the system of engagement and record for
student data, AWS API Gateway as the governed integration boundary for
all external system traffic, and Lambda as the lightweight orchestration
and routing layer. The pattern is intentionally reusable: any future
integration between Salesforce and an external system at EduTechCo can
follow the same blueprint.

**Key design principles:**

-   **Contract-first:** the OpenAPI 3.0 specification is the single
    source of truth for the integration boundary, version-controlled in
    Git and used to generate the API Gateway configuration.

-   **Loosely coupled:** Salesforce publishes Platform Events; the
    integration layer subscribes. Salesforce never blocks on AWS, and
    AWS never blocks on Salesforce.

-   **Idempotent by design:** every state-changing operation supports
    idempotency keys, so retries are safe and duplicate enrolments are
    impossible.

-   **Observable end-to-end:** a correlation ID flows from the LWC
    submission through every system, making distributed tracing trivial.

-   **Free-tier viable:** the entire reference build runs on a
    Salesforce Developer Edition org and AWS Free Tier --- zero
    infrastructure cost for the demo.

**2. Business Context & Drivers**

**2.1 Background**

EduTechCo currently captures prospective student registrations through a
portal whose data needs to land cleanly in Salesforce (the CRM and
system of engagement) while also being shared with downstream systems
--- student information systems, finance/ERP, communications platforms,
and partner integrations. Today, these integrations are point-to-point,
brittle, and inconsistently governed. There is no shared contract, no
shared error handling, no shared observability, and no shared retry
strategy.

This SDD proposes a single, governed integration pattern that solves the
immediate problem (student registration → downstream propagation) while
establishing the reference architecture for every future integration.

**2.2 Business Drivers**

  -----------------------------------------------------------------------
  **Driver**            **Why it matters**
  --------------------- -------------------------------------------------
  Stable student        Failed registrations damage brand trust and lose
  onboarding            applicants at the top of the funnel

  Single source of      Student data divergence between systems creates
  truth                 manual reconciliation and reporting errors

  Faster integration    A reusable pattern reduces every new integration
  delivery              from weeks to days

  Auditability &        POPIA/GDPR require traceability of student PII
  compliance            --- every read and write must be observable

  Vendor independence   External vendors should plug into a stable
                        contract, not into Salesforce internals
  -----------------------------------------------------------------------

**2.3 Success Criteria**

1.  A student can register through the LWC form and have their data
    persisted in Salesforce and propagated to AWS within 5 seconds
    end-to-end.

2.  A duplicate submission (same idempotency key) returns the original
    response without creating a duplicate Contact or downstream record.

3.  An external system can update an enrolment via the AWS API and the
    change is reflected in Salesforce within 3 seconds.

4.  Every transaction is traceable end-to-end via a single correlation
    ID.

5.  The OpenAPI specification fully describes the contract and is the
    source from which API Gateway is provisioned.

**3. Scope**

**3.1 In Scope**

-   Salesforce Experience Cloud Registration LWC (form capture,
    client-side validation, accessibility)

-   Apex controller for server-side validation, Contact/Community User
    creation, and Platform Event publication

-   Platform Event definition and Apex subscriber

-   Named Credential and Connected App configuration for outbound and
    inbound authentication

-   AWS API Gateway with two endpoints: POST /enrolments and PATCH
    /enrolments/{id}

-   AWS Lambda functions for both forward and reverse flow handling

-   DynamoDB table for idempotency key storage

-   AWS Secrets Manager for the Salesforce JWT signing key

-   CloudWatch logging, metrics, and alarms

-   OpenAPI 3.0 specification governing the integration contract

-   Reference deployment to a Salesforce Developer org and AWS Free Tier
    account

**3.2 Out of Scope**

-   Production hardening of the AWS account (multi-account landing zone,
    IAM Identity Center, GuardDuty, etc.)

-   Salesforce production org configuration, profile/permission set
    design beyond the demo

-   Downstream integrations to a real Student Information System or ERP
    (mocked in the Lambda layer)

-   Email verification and password reset flows for the Community User

-   Payment processing for application fees

-   Front-end branding and pixel-perfect alignment with ALU design
    system

**3.3 Assumptions**

-   A Salesforce Developer Edition org with Experience Cloud licence is
    available (free).

-   An AWS account with Free Tier eligibility and a billing alarm at \$1
    is available.

-   The candidate has admin rights in both environments.

-   Mocked downstream systems are acceptable for the demo; they will be
    replaced in production.

**4. Solution Overview**

The solution comprises three logical tiers: the engagement tier
(Salesforce Experience Cloud), the integration tier (AWS API Gateway and
Lambda), and the persistence and downstream tier (Salesforce database,
DynamoDB, and external systems). The diagram below shows the end-to-end
context.

  -----------------------------------------------------------------------
  **\[ INSERT DIAGRAM HERE: Figure 1 --- Solution Context & Component
  Architecture \]**

  -----------------------------------------------------------------------

The forward flow (student registration) is event-driven and asynchronous
from Salesforce\'s perspective: the LWC commits the data and returns
immediately, while the Platform Event subscriber handles outbound
propagation. This protects user experience from any downstream latency
or failure.

The reverse flow (external updates) is synchronous: an external system
calls the API Gateway, which routes to Lambda, which authenticates back
into Salesforce via JWT Bearer flow and updates the record. The LWC, if
open, refreshes via Lightning Data Service.

**5. Architecture**

**5.1 Logical Components**

  ---------------------------------------------------------------------------------
  **Component**              **Platform**     **Responsibility**
  -------------------------- ---------------- -------------------------------------
  Registration LWC           Salesforce       Capture form data, client-side
                             Experience Cloud validation, call Apex controller,
                                              render confirmation

  RegistrationController     Salesforce Apex  Server-side validation, Contact +
                                              User creation, Platform Event
                                              publication, return correlation ID

  Student_Registered\_\_e    Salesforce       Asynchronous decoupling between
                             Platform Events  transactional Apex and outbound
                                              integration

  EnrolmentEventSubscriber   Salesforce Apex  Subscribe to Platform Event, build
                             Trigger          payload, invoke outbound HTTP via
                                              Named Credential

  AWS_Gateway Named          Salesforce Setup Stores AWS endpoint and OAuth client
  Credential                                  credentials; abstracts secrets from
                                              Apex code

  API Gateway (REST)         AWS              Public integration boundary; schema
                                              validation; rate limiting;
                                              authentication; routing to Lambda

  EnrolmentHandler Lambda    AWS Lambda       Process inbound enrolments,
                             (Node.js 20.x)   idempotency check, persist, log,
                                              return response

  UpdateEnrolment Lambda     AWS Lambda       Authenticate to Salesforce via JWT
                             (Node.js 20.x)   Bearer, PATCH the Contact record,
                                              return result

  Idempotency Table          DynamoDB         Store idempotency keys with TTL;
                                              cache responses for replay

  JWT Signing Key            AWS Secrets      Store the private key used by Lambda
                             Manager          for Salesforce JWT Bearer auth

  Observability              CloudWatch +     Structured logs, metrics, alarms;
                             Salesforce Debug correlation IDs link both sides
                             Logs             
  ---------------------------------------------------------------------------------

**5.2 Forward Flow --- Student Registration**

The forward flow describes the end-to-end path from a student submitting
the registration form to the data being persisted in both Salesforce and
the AWS-side store, with downstream notification.

  -----------------------------------------------------------------------
  **\[ INSERT DIAGRAM HERE: Figure 2 --- Forward Flow Sequence Diagram
  \]**

  -----------------------------------------------------------------------

**Key design points in the forward flow:**

-   **Correlation ID generated in Apex:** a UUID is created at the entry
    point and stored on the Contact record, included in the Platform
    Event payload, sent in the HTTP header to AWS, and logged at every
    hop. This single ID allows full distributed tracing across both
    platforms.

-   **Async boundary at the Platform Event:** the user gets their
    confirmation immediately after the Salesforce commit. The outbound
    HTTP callout happens in the subscriber, off the user\'s critical
    path. If AWS is down, the user still registers successfully and the
    integration retries.

-   **Idempotency-Key header:** the subscriber sends the correlation ID
    as the Idempotency-Key. Lambda checks DynamoDB before processing; a
    replay returns the cached response without side effects.

-   **Status writeback:** after a successful AWS response, the
    subscriber updates IntegrationStatus\_\_c on the Contact so the LWC
    and admin views can show integration health.

**5.3 Reverse Flow --- External Updates**

The reverse flow allows trusted external systems (a Student Information
System, a partner university, an admissions back-office tool) to update
enrolment status in Salesforce through the same governed gateway.

  -----------------------------------------------------------------------
  **\[ INSERT DIAGRAM HERE: Figure 3 --- Reverse Flow Sequence Diagram
  \]**

  -----------------------------------------------------------------------

**Key design points in the reverse flow:**

-   **OAuth2 at the gateway:** external systems authenticate to API
    Gateway using OAuth2 client credentials. Each client gets its own
    credentials and scope, enabling per-partner audit trails and
    revocation.

-   **JWT Bearer to Salesforce:** Lambda authenticates back to
    Salesforce using the JWT Bearer flow with a key pair. The private
    key lives in AWS Secrets Manager and is never embedded in code.

-   **Live UI refresh:** if a student has the LWC open, Lightning Data
    Service automatically invalidates its cache when the Contact updates
    and the component re-renders without a manual reload.

-   **Same correlation ID convention:** external systems are required to
    send a correlation ID in the Idempotency-Key header. The same ID is
    logged in CloudWatch and stored on the Salesforce record.

**6. Data Model**

**6.1 Salesforce Objects**

The solution uses standard Contact and User objects, with a small number
of custom fields added to the Contact to support integration tracking.
No new custom objects are introduced for the registration use case ---
the goal is to use the standard data model where possible.

  ---------------------------------------------------------------------------------
  **Object**   **Field**                   **Type**         **Purpose**
  ------------ --------------------------- ---------------- -----------------------
  Contact      FirstName                   Text(40)         Standard

  Contact      MiddleName                  Text(40)         Standard

  Contact      LastName                    Text(80)         Standard

  Contact      Email                       Email            Standard, used for User
                                                            creation

  Contact      Birthdate                   Date             Standard

  Contact      Sex\_\_c                    Picklist         Custom --- Male,
                                                            Female, Prefer not to
                                                            say

  Contact      City_of_Residence\_\_c      Text(100)        Custom

  Contact      Country_of_Residence\_\_c   Picklist         Custom --- ISO country
                                                            list

  Contact      Nationality\_\_c            Picklist         Custom --- ISO
                                                            nationality list

  Contact      Phone                       Phone            Standard

  Contact      CorrelationId\_\_c          Text(36)         End-to-end trace ID
                                           External ID,     
                                           Unique           

  Contact      IntegrationStatus\_\_c      Picklist         Pending / Success /
                                                            Failed / Retrying

  Contact      IntegrationLastSync\_\_c    DateTime         Last successful AWS
                                                            sync timestamp

  User         (Community User)            Standard         Created from Contact
                                                            for portal login
  ---------------------------------------------------------------------------------

**6.2 Platform Event**

*Student_Registered\_\_e --- published by the Apex controller after a
successful Contact insert.*

  ---------------------------------------------------------------------------
  **Field**             **Type**           **Description**
  --------------------- ------------------ ----------------------------------
  CorrelationId\_\_c    Text(36)           UUID matching the Contact field

  ContactId\_\_c        Text(18)           Salesforce Contact ID

  Email\_\_c            Email              For downstream messaging

  PayloadJson\_\_c      LongTextArea       Full JSON payload to forward
                                           (avoids re-querying)

  EventTimestamp\_\_c   DateTime           When the event was published
  ---------------------------------------------------------------------------

**6.3 DynamoDB --- Idempotency Table**

  ------------------------------------------------------------------------
  **Attribute**      **Type**           **Purpose**
  ------------------ ------------------ ----------------------------------
  idempotencyKey     String (Partition  The correlation ID from the
                     Key)               request header

  responseBody       String             Cached JSON response for replay

  statusCode         Number             Cached HTTP status

  createdAt          Number (epoch)     For TTL and debugging

  ttl                Number (epoch)     DynamoDB TTL --- auto-delete after
                                        24 hours
  ------------------------------------------------------------------------

**7. API Contract**

The OpenAPI 3.0 specification (Appendix A ---
student-enrolment-api.yaml) is the authoritative contract. The summary
below describes the surface area; the full schema definitions, examples,
and security schemes live in the YAML.

**7.1 Endpoints**

  -----------------------------------------------------------------------------------------
  **Method**   **Path**                     **Purpose**                       **Auth**
  ------------ ---------------------------- --------------------------------- -------------
  POST         /v1/enrolments               Create a new enrolment (called by OAuth2 client
                                            Salesforce subscriber)            credentials

  GET          /v1/enrolments/{id}          Retrieve an enrolment by ID       OAuth2 client
                                                                              credentials

  PATCH        /v1/enrolments/{id}          Update an enrolment (status,      OAuth2 client
                                            decision, etc.)                   credentials

  GET          /v1/enrolments               List enrolments with filters and  OAuth2 client
                                            pagination                        credentials

  POST         /v1/webhooks/subscriptions   Register a webhook for status     OAuth2 client
                                            changes                           credentials

  GET          /v1/health                   Liveness probe                    None (public)
  -----------------------------------------------------------------------------------------

**7.2 Standard Headers**

-   **Idempotency-Key:** required on all POST and PATCH requests. UUID
    format. Server caches the first response for 24 hours and replays on
    retry.

-   **X-Correlation-Id:** optional on inbound, always echoed in
    response. Used for distributed tracing.

-   **Authorization:** Bearer \<token\> from OAuth2 client credentials
    grant.

-   **X-RateLimit-Limit / X-RateLimit-Remaining / Retry-After:**
    returned by the gateway to inform client backoff.

**7.3 Error Envelope (RFC 7807 Problem Details)**

{

\"type\": \"https://api.edutechco.com/errors/validation-failed\",

\"title\": \"Validation Failed\",

\"status\": 400,

\"detail\": \"The field \'email\' must be a valid email address.\",

\"instance\": \"/v1/enrolments\",

\"correlationId\": \"9b7c3a1e-4d2f-4e8a-b1c5-7e9f0a3b2d4e\",

\"errors\": \[

{ \"field\": \"email\", \"code\": \"INVALID_FORMAT\", \"message\":
\"\...\" }

\]

}

**7.4 Status Codes**

  --------------------------------------------------------------------------
  **Code**   **Meaning**                                  **Retryable?**
  ---------- -------------------------------------------- ------------------
  200        OK --- successful read or update             ---

  201        Created --- new enrolment                    ---

  400        Bad Request --- schema or validation error   No

  401        Unauthorized --- missing or invalid token    No (refresh token
                                                          first)

  403        Forbidden --- token lacks scope              No

  404        Not Found                                    No

  409        Conflict --- idempotency key reused with     No
             different payload                            

  422        Unprocessable --- business rule violation    No

  429        Too Many Requests                            Yes --- honour
                                                          Retry-After

  500        Server error                                 Yes ---
                                                          exponential
                                                          backoff with
                                                          jitter

  503        Service unavailable                          Yes ---
                                                          exponential
                                                          backoff with
                                                          jitter
  --------------------------------------------------------------------------

**8. Security Architecture**

**8.1 Authentication & Authorisation**

-   **Salesforce → AWS (outbound):** Named Credential stores AWS API
    Gateway URL and OAuth2 client credentials. Apex never sees the
    secret. Token caching via Custom Setting reduces auth round-trips.

-   **AWS → Salesforce (inbound):** JWT Bearer flow using a Connected
    App with the API and refresh_token scopes. Private key stored in AWS
    Secrets Manager and rotated quarterly.

-   **External → AWS (inbound):** OAuth2 client credentials at API
    Gateway level. Each external partner has unique credentials and
    scopes, enabling per-partner audit and revocation.

**8.2 Data Protection**

-   All traffic over TLS 1.2 or higher; API Gateway enforces this at the
    edge.

-   PII (name, email, DOB, nationality) is classified as sensitive.
    CloudWatch log groups have a redaction policy that masks email and
    date-of-birth fields.

-   DynamoDB encryption at rest enabled (AWS-managed key for the demo;
    CMK in production).

-   Secrets Manager values encrypted with KMS and never logged.

-   Salesforce Shield Platform Encryption recommended for production
    (out of scope for demo).

**8.3 Compliance Considerations**

Student data is subject to POPIA (South Africa) and GDPR (EU
applicants). The design supports these by: (a) capturing explicit
consent via a checkbox on the LWC form, (b) recording consent timestamp
on the Contact record, (c) ensuring all data movement is logged with a
correlation ID for audit, and (d) providing a documented deletion path
triggered by a DELETE /v1/enrolments/{id} call (not built in the demo
but specified in the OpenAPI contract).

**9. Observability & Monitoring**

**9.1 Logging**

-   **Salesforce side:** structured logging using nebula-logger or
    RFLIB. Every entry includes the correlation ID, the user ID, and the
    integration step. Logs persist for 30 days in a custom object for
    query.

-   **AWS side:** CloudWatch Logs with structured JSON. Every Lambda
    invocation logs the correlation ID, request ID, duration, status,
    and any errors. Log retention set to 30 days.

-   **End-to-end correlation:** the same correlation ID flows from LWC
    submission through every system. A single CloudWatch Logs Insights
    query joined with a SOQL query against the logging custom object
    reconstructs the entire transaction.

**9.2 Metrics**

-   CloudWatch metrics: invocation count, error count, duration
    (p50/p95/p99), DynamoDB throttles.

-   Custom metrics emitted from Lambda: enrolments-created,
    enrolments-failed, idempotency-replays.

-   Salesforce: Platform Event publish/subscribe lag, Apex governor
    limit consumption, integration status counts.

**9.3 Alarms**

  ------------------------------------------------------------------------
  **Alarm**              **Threshold**         **Action**
  ---------------------- --------------------- ---------------------------
  Lambda error rate      \> 5% over 5 min      SNS → Slack
                                               #integration-alerts

  API Gateway 5xx rate   \> 1% over 5 min      SNS → Slack + PagerDuty

  DynamoDB throttling    \> 0 over 1 min       SNS → Slack

  Salesforce integration \> 10 in 15 min       Email to platform team
  failures                                     

  AWS billing            \> \$1 forecast       Email to account owner
                                               (cost guard for demo)
  ------------------------------------------------------------------------

**10. Error Handling & Resilience**

**10.1 Failure Modes & Responses**

  ------------------------------------------------------------------------
  **Failure**        **Detection**      **Response**
  ------------------ ------------------ ----------------------------------
  AWS API Gateway    Apex callout       Mark Contact IntegrationStatus =
  unreachable        exception          Retrying; queue retry via
                                        Queueable Apex (3 attempts,
                                        exponential backoff)

  Lambda processing  HTTP status from   Same retry strategy as above;
  error (5xx)        gateway            after 3 failures,
                                        IntegrationStatus = Failed and
                                        alert raised

  DynamoDB           AWS SDK exception  Lambda returns 503; client retries
  unavailable        in Lambda          per Retry-After header

  Salesforce REST    HTTP 429 from      Lambda backs off with jitter;
  API rate-limited   Salesforce         surfaces 503 to caller if
                                        exhausted

  Duplicate          Idempotency key    Return cached response; no side
  submission         match in DynamoDB  effects

  Validation error   Schema or business Return 400 or 422 with detailed
                     rule fails         error envelope; do not retry
  ------------------------------------------------------------------------

**10.2 Retry Strategy**

Retries are a client concern; the API enables them but does not perform
them on the server. The OpenAPI spec documents which status codes are
safe to retry, the recommended backoff (exponential with jitter, base
1s, max 30s, max 5 attempts), and the meaning of the Retry-After header.
The Salesforce subscriber implements this strategy in Apex; external
clients are expected to do the same and the contract makes the rules
explicit.

**11. Environments & Deployment**

**11.1 Environment Strategy**

  -------------------------------------------------------------------------------
  **Environment**   **Salesforce**     **AWS**            **Purpose**
  ----------------- ------------------ ------------------ -----------------------
  DEV               Developer Edition  Free Tier account, Active development,
                    org                dev stage          demo build

  QA                Sandbox (Partial   Free Tier account, Integration testing,
                    Copy)              qa stage           vendor UAT

  PROD              Production org     Production AWS     Live, change-controlled
                                       account            
  -------------------------------------------------------------------------------

**11.2 Deployment Approach**

-   **Salesforce metadata:** sfdx source format in Git. CI pipeline
    validates against a scratch org, runs Apex tests with 85%+ coverage
    gate, and deploys to target sandbox via sfdx force:source:deploy.
    Production deploy gated on manual approval.

-   **AWS infrastructure:** AWS SAM templates (YAML) for API Gateway,
    Lambda, DynamoDB, Secrets Manager, CloudWatch alarms. The OpenAPI
    spec is imported by the SAM template, so the gateway configuration
    is generated from the contract --- not hand-maintained.

-   **Single deployment artifact per release:** Salesforce metadata, SAM
    template, and OpenAPI spec are version-tagged together so that every
    release is a coherent set.

**12. Governance & Quality Gates**

This integration is governed by the EduTechCo Engineering Governance
Framework (Part 2 deliverable). The specific gates that apply to this
build:

  --------------------------------------------------------------------------
  **Gate**        **Requirement**
  --------------- ----------------------------------------------------------
  Build           Apex compiles; Lambda Node.js builds; OpenAPI spec
                  validates against the 3.0 schema

  Test            Apex coverage ≥ 85%; Jest unit tests for the LWC; Lambda
                  unit tests with mocked SDK calls

  Security        Salesforce Code Analyzer clean; npm audit clean; no
                  secrets in source; CRUD/FLS respected in Apex

  Review          Lead approval required (this touches integration boundary,
                  security, and shared data model)

  Documentation   This SDD updated for any architectural change; ADR raised
                  if a design principle changes

  Release         Tagged release in Git containing matching versions of
                  Salesforce metadata, SAM template, and OpenAPI spec
  --------------------------------------------------------------------------

**13. Risks & Mitigations**

  ---------------------------------------------------------------------------------
  **Risk**               **Likelihood**   **Impact**   **Mitigation**
  ---------------------- ---------------- ------------ ----------------------------
  AWS Free Tier limits   Low              Low          Billing alarm at \$1;
  exceeded during demo                                 tear-down script after demo;
                                                       usage well within free tier

  Salesforce JWT key     Medium           High         Document rotation runbook;
  rotation breaks Lambda                               alarm on 401 spike; Secrets
  auth                                                 Manager versioning

  Platform Event         Low              Medium       Monitor publish-to-subscribe
  delivery delay                                       lag; the subscriber is
                                                       idempotent so duplicates are
                                                       safe

  External system sends  High             Low          API Gateway request
  malformed payloads                                   validation rejects at the
                                                       edge; Lambda never sees bad
                                                       data

  Correlation ID lost    Low              Medium       Code review gate;
  across hops                                          integration tests assert
                                                       correlation ID is present in
                                                       Lambda logs

  LWC accessibility      Medium           Medium       Use SLDS components; run axe
  issues                                               accessibility checks; manual
                                                       screen-reader test before
                                                       release

  POPIA/GDPR consent not Low              High         Mandatory consent checkbox
  captured                                             on the form; consent
                                                       timestamp stored on Contact
  ---------------------------------------------------------------------------------

**14. Work Breakdown for Delegation**

The build is decomposed into Jira-ready user stories grouped into three
parallel tracks. Tracks A and B can be built simultaneously by separate
agents; Track C integrates them and is sequential.

**Track A --- Salesforce**

**STORY-A1: Custom fields and Platform Event**

*As a Salesforce Architect, I want the custom fields and Platform Event
in place so that downstream stories can build on a stable data model.*

**Acceptance Criteria:**

-   All custom Contact fields per Section 6.1 created in the Dev org and
    committed to Git as sfdx source

-   Student_Registered\_\_e Platform Event created with all fields per
    Section 6.2

-   CorrelationId\_\_c marked as External ID, Unique, Case-Sensitive

-   Metadata committed to feature/sf-data-model branch

*Estimate: 1 hour*

**STORY-A2: RegistrationController Apex class**

*As a developer, I want an \@AuraEnabled Apex controller that validates
input, creates Contact and User, and publishes the Platform Event.*

**Acceptance Criteria:**

-   Single \@AuraEnabled(cacheable=false) method
    registerStudent(payload)

-   Server-side validation of all required fields with clear error
    messages

-   Generates UUID correlation ID and stores on Contact

-   Inserts Contact and creates a Community User in a single transaction
    (or rolls back both)

-   Publishes Student_Registered\_\_e with full payload

-   Returns { success, contactId, correlationId } to caller

-   Apex test class with ≥85% coverage including positive,
    validation-failure, and DML-error paths

*Estimate: 2 hours*

**STORY-A3: Registration LWC**

*As a prospective student, I want a registration form that captures my
details and confirms my submission.*

**Acceptance Criteria:**

-   LWC named registrationForm matching the field layout in the
    reference screenshot

-   Uses lightning-input, lightning-combobox, and SLDS for accessibility

-   Client-side validation for required fields, email format, date of
    birth (must be ≥16)

-   Calls RegistrationController.registerStudent on submit

-   Shows success toast with the correlation ID on success; field-level
    errors on failure

-   POPIA/GDPR consent checkbox is mandatory before submit

-   Jest unit tests covering happy path, validation failure, and Apex
    error

-   Deployed to an Experience Cloud site page named /alurwapply/register

*Estimate: 3 hours*

**STORY-A4: Platform Event subscriber and outbound callout**

*As a developer, I want an Apex trigger that subscribes to
Student_Registered\_\_e and posts to AWS via Named Credential.*

**Acceptance Criteria:**

-   Apex trigger on Student_Registered\_\_e (after insert)

-   Builds JSON payload matching the OpenAPI POST /enrolments schema

-   HTTP callout via callout:AWS_Gateway/v1/enrolments with
    Idempotency-Key and X-Correlation-Id headers

-   Updates Contact.IntegrationStatus\_\_c based on response

-   On 5xx or timeout, enqueues a Queueable for retry (3 attempts,
    exponential backoff)

-   Apex test using HttpCalloutMock covering success, 429, 500, and
    timeout scenarios

*Estimate: 2.5 hours*

**STORY-A5: Connected App and Named Credential**

*As an admin, I want the Connected App and Named Credential configured
so that authentication is centralised.*

**Acceptance Criteria:**

-   Connected App created with API and refresh_token scopes, JWT
    enabled, certificate uploaded

-   External Credential and Named Credential AWS_Gateway created (no
    secrets in code)

-   Permission Set granting access to the Named Credential

-   Documented in repo README with screenshots

*Estimate: 1 hour*

**Track B --- AWS**

**STORY-B1: AWS account bootstrap**

*As an architect, I want a free-tier AWS account ready for the
integration with cost guardrails.*

**Acceptance Criteria:**

-   AWS account created and verified

-   IAM admin user created (root account locked away)

-   Billing alarm configured at \$1 forecast

-   Region set to eu-west-1 (closest to ALU\'s South African user base
    for low latency)

-   AWS SAM CLI installed and a hello-world Lambda deployed and torn
    down to validate the toolchain

*Estimate: 1 hour*

**STORY-B2: OpenAPI specification**

*As an architect, I want a complete OpenAPI 3.0 specification that fully
describes the integration contract.*

**Acceptance Criteria:**

-   File student-enrolment-api.yaml in repo root

-   All endpoints from Section 7.1 defined with parameters,
    request/response schemas, examples

-   Standard error envelope (RFC 7807) defined as a reusable component

-   OAuth2 security scheme defined

-   Validates against OpenAPI 3.0 schema (no errors in Swagger Editor)

-   Renders cleanly in Swagger UI

*Estimate: 2 hours*

**STORY-B3: SAM template and Lambda handlers**

*As a developer, I want a SAM template that provisions API Gateway,
Lambda, DynamoDB, and Secrets Manager.*

**Acceptance Criteria:**

-   template.yaml provisioning all infrastructure components

-   API Gateway imports the OpenAPI spec as the source of endpoint
    definitions

-   EnrolmentHandler Lambda implements POST /enrolments with idempotency
    check against DynamoDB

-   UpdateEnrolment Lambda implements PATCH /enrolments/{id} with
    Salesforce JWT Bearer auth

-   Both Lambdas emit structured JSON logs to CloudWatch with
    correlation ID

-   Jest unit tests for both handlers with mocked AWS SDK

-   sam deploy succeeds against the dev stage

*Estimate: 4 hours*

**STORY-B4: CloudWatch alarms and log groups**

*As an SRE, I want alarms and log groups configured so that failures are
noticed.*

**Acceptance Criteria:**

-   All alarms from Section 9.3 created via SAM template

-   Log groups have 30-day retention

-   Email subscription for the demo (SNS → email)

*Estimate: 1 hour*

**Track C --- Integration & Demo**

**STORY-C1: End-to-end forward flow test**

*As an architect, I want to verify a real student registration flows
from LWC to AWS.*

**Acceptance Criteria:**

-   Submitting the LWC form creates a Contact, User, fires the event,
    and posts to AWS

-   AWS Lambda logs show the matching correlation ID

-   DynamoDB contains the idempotency record

-   Replaying the same submission returns the cached response without
    creating duplicates

*Estimate: 1 hour*

**STORY-C2: End-to-end reverse flow test**

*As an architect, I want to verify external updates flow back to
Salesforce.*

**Acceptance Criteria:**

-   Postman PATCH /v1/enrolments/{id} with valid OAuth token updates the
    Contact

-   CloudWatch logs show the JWT auth and Salesforce REST call

-   LWC, if open on the record, refreshes via LDS without manual reload

*Estimate: 1 hour*

**STORY-C3: Demo script and Loom recording**

*As the candidate, I want a polished walkthrough that tells the story
end-to-end.*

**Acceptance Criteria:**

-   Postman collection prepared with named requests

-   Swagger UI bookmarked to the OpenAPI spec

-   CloudWatch Logs Insights query saved to filter by correlation ID

-   Loom recording (≤15 min) following the demo script in Section 16

*Estimate: 2 hours*

**Total Effort**

  -----------------------------------------------------------------------
  **Track**                  **Stories**           **Estimated Hours**
  -------------------------- --------------------- ----------------------
  A --- Salesforce           5                     9.5

  B --- AWS                  4                     8.0

  C --- Integration & Demo   3                     4.0

  Total                      12                    21.5
  -----------------------------------------------------------------------

*With Tracks A and B running in parallel, calendar time to demo
readiness is approximately 12--14 hours of focused work.*

**15. Acceptance Criteria**

The build is considered demo-ready when all of the following are true:

6.  A student can complete the LWC form and receive a confirmation in
    under 3 seconds.

7.  A Contact and Community User exist in Salesforce with all submitted
    fields populated and a CorrelationId\_\_c set.

8.  CloudWatch Logs show a matching POST /v1/enrolments invocation
    tagged with the same correlation ID, returning 201.

9.  DynamoDB contains an idempotency record for that correlation ID with
    the cached response.

10. Replaying the same submission returns 200 with the cached body and
    creates no new records.

11. A Postman PATCH /v1/enrolments/{contactId} with a valid OAuth token
    updates IntegrationStatus\_\_c on the Contact within 3 seconds.

12. All Apex tests pass with ≥85% coverage; all Lambda Jest tests pass.

13. The OpenAPI spec validates without errors and renders correctly in
    Swagger UI.

14. The architecture, forward flow, and reverse flow diagrams are
    present in this SDD.

15. The Loom walkthrough demonstrates all of the above in under 15
    minutes.

**16. Demo Script**

The 15-minute Loom walkthrough follows this structure:

**Minute 0--1: Frame the problem**

\"EduTechCo needs a stable, governed integration pattern between its
Salesforce CRM and the wider AWS ecosystem. Today this is point-to-point
and brittle. I am going to show you the pattern I would standardise ---
using student registration as the worked example --- and demonstrate it
running end-to-end in a real Salesforce org and a real AWS account.\"

**Minute 1--3: Walk the architecture diagram**

Open the SDD to Figure 1. Trace the forward flow with the cursor.
Highlight the three design choices that matter: (1) Platform Event for
async decoupling, (2) API Gateway as the governed boundary instead of
exposing Apex REST directly, (3) idempotency keys for safe retries.

**Minute 3--5: Live forward flow**

Open the LWC registration form in the browser. Fill it in like a real
student. Submit. Show the success toast. Switch to Salesforce setup,
show the Contact created with the correlation ID. Switch to CloudWatch
Logs Insights, run the saved query filtering by that correlation ID,
show the matching Lambda invocation.

**Minute 5--7: Idempotency in action**

Re-submit the exact same form. Show that the response comes back
instantly with the same correlation ID. Switch to DynamoDB, show the
record. Switch to the Contact list view, show that no duplicate exists.
\"This is what I mean when I say the API is idempotent --- and it is
what protects you from double-charged students, duplicate enrolments,
and angry support tickets.\"

**Minute 7--10: Live reverse flow**

Open Postman. Fire a PATCH /v1/enrolments/{id} simulating a Student
Information System updating the application status. Show the 200
response. Switch back to the Salesforce Contact record, refresh, show
IntegrationStatus\_\_c updated. Show the CloudWatch logs for the Lambda
authenticating to Salesforce via JWT Bearer.

**Minute 10--12: Walk the OpenAPI spec**

Open Swagger UI rendering the OpenAPI YAML. Click through the endpoints.
Expand POST /v1/enrolments --- show the request schema, the example, the
error envelope, the security scheme. \"This is the contract. It lives in
Git, it generates the API Gateway configuration via SAM, and any vendor
we onboard codes against this --- not against my Apex.\"

**Minute 12--14: Walk the design decisions**

Flip to Section 5 of this SDD. Hit four points: (1) why Platform Events
instead of synchronous Apex callout, (2) why API Gateway instead of
exposing Apex REST, (3) why idempotency keys belong in the contract not
the implementation, (4) how the same correlation ID stitches the whole
story together for support and audit.

**Minute 14--15: Close with the pattern**

\"This is one integration. The point is that this same pattern --- LWC
or other entry, Salesforce as the system of record, Platform Event for
async decoupling, API Gateway as the boundary, Lambda for orchestration,
OpenAPI as the contract --- is what I would standardise across every
integration at EduTechCo. Salesforce ↔ NetSuite, Salesforce ↔ BambooHR,
Salesforce ↔ partner universities. One pattern, one governance model,
one observability story. That is how a platform team scales.\"

**Appendix A --- OpenAPI Specification**

The full OpenAPI 3.0 specification is maintained as a separate file:
student-enrolment-api.yaml. It is the authoritative contract for this
integration and the source from which the AWS API Gateway is generated.
The summary in Section 7 of this document is a derivative view; the YAML
is canonical.

To render: open the file in Swagger Editor (https://editor.swagger.io)
or run prism mock student-enrolment-api.yaml for a local mock server.

**Appendix B --- Glossary**

  -----------------------------------------------------------------------
  **Term**           **Definition**
  ------------------ ----------------------------------------------------
  LWC                Lightning Web Component --- Salesforce\'s modern UI
                     framework based on web standards

  Apex               Salesforce\'s server-side language, similar to Java

  Platform Event     Salesforce\'s pub/sub mechanism for async,
                     event-driven architecture

  Named Credential   Salesforce setup object that stores integration
                     endpoint and auth, abstracting secrets from code

  Connected App      Salesforce object representing an external system
                     that authenticates to the org

  JWT Bearer Flow    OAuth2 grant type that uses a signed JWT instead of
                     a user password --- ideal for system-to-system auth

  Idempotency Key    A client-supplied unique value that allows the
                     server to safely process retries without duplicating
                     side effects

  Correlation ID     A unique identifier that flows through every system
                     involved in a transaction, enabling distributed
                     tracing

  RFC 7807           IETF standard for HTTP API error responses (Problem
                     Details for HTTP APIs)

  SAM                AWS Serverless Application Model --- a framework for
                     defining serverless applications as code

  LDS                Lightning Data Service --- Salesforce\'s caching
                     layer that lets LWCs share record data and refresh
                     automatically
  -----------------------------------------------------------------------

**Appendix C --- References**

-   Salesforce Apex Developer Guide --- Platform Events

-   Salesforce Help --- Named Credentials and External Credentials

-   Salesforce Help --- OAuth 2.0 JWT Bearer Flow for Server-to-Server
    Integration

-   AWS API Gateway Developer Guide --- REST APIs from OpenAPI

-   AWS SAM Developer Guide

-   OpenAPI Initiative --- Specification 3.0.3

-   RFC 7807 --- Problem Details for HTTP APIs

-   RFC 4122 --- A Universally Unique IDentifier (UUID) URN Namespace