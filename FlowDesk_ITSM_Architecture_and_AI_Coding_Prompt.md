# FlowDesk ITSM: Architecture, Product Plan, and AI Coding App Prompt

## 1. Product Vision

Build a modern multi-tenant ITSM SaaS platform for:

- **Individuals** who sign up, log in, and immediately use a personal ITSM workspace.
- **Companies** that create an organization, teams, users, roles, and isolated team spaces.
- **Teams** that work on tickets, tasks, service requests, incidents, approvals, and knowledge articles.
- **Admins** who can configure everything from A to Z.

The system should support end-to-end ITSM operations:

- Ticket management
- Task management
- Incident management
- Service requests
- Change requests
- Problem management
- Knowledge base
- Service catalog
- SLA management
- Workflow automation
- Team spaces
- Role-based access
- Admin configuration
- AI-assisted triage and resolution
- Audit logs
- Reporting
- Integrations

The key design requirement is **secure tenant and team isolation**.

---

## 2. Core User Types

### 2.1 Individual User

An individual user owns a personal workspace.

Capabilities:

- Sign up and log in.
- Create personal tickets.
- Create personal tasks.
- Track work items.
- Maintain personal knowledge notes.
- Manage personal assets.
- Use AI to summarize, classify, and suggest next actions.
- Upgrade later to a company workspace.

---

### 2.2 Company Owner

The company owner creates the company account.

Capabilities:

- Create company workspace.
- Configure company-wide settings.
- Invite admins, managers, agents, requesters, and auditors.
- Create teams.
- Assign team-level access.
- Manage subscription and billing.
- Enable or disable modules.

---

### 2.3 Company Admin

Company admins manage the full configuration of the tenant.

Capabilities:

- Manage users.
- Manage teams.
- Manage roles and permissions.
- Configure workflows.
- Configure SLAs.
- Configure ticket forms.
- Configure fields and statuses.
- Configure queues.
- Configure email routing.
- Configure integrations.
- View audit logs.
- Manage security settings.
- Manage AI settings.

---

### 2.4 Team Manager

Team managers operate a team workspace.

Capabilities:

- Manage team queue.
- Assign tickets and tasks.
- View team reports.
- Configure team-level categories and templates if allowed.
- Approve requests.
- Manage team members if permission is enabled.

---

### 2.5 Agent / Technician

Agents work tickets and tasks.

Capabilities:

- View assigned tickets.
- View team tickets.
- Add comments.
- Add internal notes.
- Upload attachments.
- Escalate tickets.
- Assign tickets.
- Resolve and close tickets.
- Create linked tasks.
- Use knowledge suggestions.

---

### 2.6 Requester / End User

Requesters submit requests through portal, email, or integrations.

Capabilities:

- Submit tickets.
- View their own tickets.
- Add public comments.
- Upload attachments.
- Approve or reject requests where required.
- Search knowledge base.

---

### 2.7 Auditor / Read-Only User

Auditors review activity and configuration.

Capabilities:

- Read-only access to selected tenant or team data.
- Export reports.
- Review audit logs.
- Cannot modify tickets or configuration.

---

## 3. Multi-Tenant Model

Use one unified tenant model.

```text
Tenant
 ├── type: individual | company
 ├── owner_user_id
 ├── plan
 ├── settings
 ├── users
 ├── teams
 ├── tickets
 ├── tasks
 ├── assets
 ├── knowledge articles
 └── configurations
```

For an individual, the tenant has one default team:

```text
Personal Workspace
```

For a company, the tenant can have many teams:

```text
Company Tenant
 ├── Team: IT Support
 ├── Team: Security
 ├── Team: HR Helpdesk
 ├── Team: Facilities
 ├── Team: DevOps
 └── Team: Finance Operations
```

---

## 4. Tenant and Team Isolation

Every business record must include:

```text
tenant_id
team_id nullable depending on object
created_by
visibility_scope
```

Never query records without filtering by `tenant_id`.

For team-scoped data, also filter by `team_id` unless the user has cross-team permission.

Example:

```sql
SELECT *
FROM tickets
WHERE tenant_id = :tenant_id
AND team_id IN (:allowed_team_ids);
```

---

## 5. Access Scope Levels

```text
personal_only
team_only
multiple_teams
tenant_wide
platform_admin
```

---

## 6. Recommended Authorization Model

Use a combination of:

- RBAC: role-based access control.
- ABAC: attribute-based access control.
- Database-level row protection where possible.
- API-level permission checks.
- Audit logs for access and changes.

Access decision example:

```text
User wants to view ticket #123

System checks:
1. Is user authenticated?
2. Does ticket.tenant_id match user's active tenant?
3. Does user have ticket.read.all?
4. If not, does user have ticket.read.team and ticket.team_id is in user's team list?
5. If not, is user the requester and has ticket.read.own?
6. Otherwise deny access.
```

---

## 7. High-Level Architecture

```text
Frontend Web App
  |
  | HTTPS
  v
API Gateway / Backend API
  |
  ├── Auth Service
  ├── Tenant Service
  ├── User & Team Service
  ├── Ticket Service
  ├── Task Service
  ├── Workflow Service
  ├── SLA Service
  ├── Notification Service
  ├── Automation Service
  ├── Knowledge Service
  ├── Asset / CMDB Service
  ├── Reporting Service
  ├── AI Assistant Service
  ├── Integration Service
  └── Admin Configuration Service
  |
  ├── PostgreSQL
  ├── Redis
  ├── Object Storage
  ├── Search Engine
  ├── Queue / Worker System
  └── Observability Stack
```

---

## 8. Suggested MVP Tech Stack

### Frontend

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- React Hook Form
- Zod
- Zustand or Redux Toolkit

### Backend

Option A:

- Next.js full-stack with API routes/server actions

Option B:

- FastAPI backend
- Next.js frontend

For MVP speed, use Next.js full-stack.

### Database

- PostgreSQL
- Prisma ORM

### Cache / Queue

- Redis optional for MVP
- Queue abstraction for future jobs

### Storage

- Local dev storage for attachments
- S3-compatible abstraction for production
- MinIO or AWS S3 later

### Authentication

- Email/password
- Email verification placeholder
- Password reset placeholder
- MFA later
- SSO/SAML/OIDC later

### Search

- PostgreSQL full-text search for MVP
- Meilisearch, OpenSearch, or Elasticsearch later

### AI

- AI service abstraction
- Provider-neutral model router
- Mock responses for development
- Plug in OpenAI, Claude, Gemini, DeepSeek, Kimi, or local models later

### Deployment

- Railway, Render, Fly.io, or AWS Lightsail for MVP
- Vercel or Cloudflare for frontend
- PostgreSQL managed database
- S3-compatible storage

---

## 9. Production-Grade Scalable Stack

```text
Frontend:
- Next.js
- Vercel / Cloudflare / AWS

Backend:
- Modular monolith first
- API Gateway
- Split services only when needed

Database:
- PostgreSQL primary
- Read replicas later
- Row-level security
- Tenant-aware indexing
- Tenant-aware partitioning later

Workers:
- Temporal for durable workflows
- Redis for cache and lightweight jobs
- Queue workers for notifications, SLA checks, email ingestion

Storage:
- S3-compatible object storage

Search:
- OpenSearch / Elasticsearch / Meilisearch

Observability:
- OpenTelemetry
- Prometheus
- Grafana
- Loki
- Sentry
```

---

# 10. Core Modules

## 10.1 Authentication and Identity

Features:

- Signup
- Login
- Logout
- Email verification
- Password reset
- Session management
- Device/session history
- MFA later
- Company invitations
- SSO later
- SCIM later

### Individual Signup Flow

```text
1. User enters name, email, password.
2. Verify email.
3. Create tenant type = individual.
4. Create default team = Personal Workspace.
5. Create owner membership.
6. Redirect to dashboard.
```

### Company Signup Flow

```text
1. User enters name, email, password.
2. Verify email.
3. Ask company name, domain, size, industry.
4. Create tenant type = company.
5. Create default teams:
   - IT Support
   - General Requests
6. Create owner membership.
7. Redirect to admin onboarding wizard.
```

---

## 10.2 Tenant and Team Management

Features:

- Create company.
- Create teams.
- Edit teams.
- Archive teams.
- Assign users to teams.
- Team-specific queues.
- Team-specific categories.
- Team-specific forms.
- Team-specific automations.
- Team dashboards.
- Team SLA policies.
- Team notification settings.

Critical rule:

A member of Team A cannot see Team B data unless they have one of these permissions:

```text
tenant.ticket.read_all
tenant.team.cross_access
tenant.admin
platform.super_admin
```

---

## 10.3 Roles and Permissions

Default roles:

```text
Owner
Admin
Team Manager
Agent
Requester
Approver
Auditor
Billing Admin
Integration Admin
Knowledge Manager
Asset Manager
```

Permission examples:

```text
ticket.create
ticket.read.own
ticket.read.team
ticket.read.all
ticket.update.own
ticket.update.team
ticket.assign
ticket.escalate
ticket.resolve
ticket.close
ticket.delete

task.create
task.read.team
task.update.team

team.create
team.update
team.invite_user
team.remove_user

workflow.create
workflow.update
sla.create
sla.update

admin.view
admin.configure
audit.read

billing.manage
integration.manage
security.manage
```

---

# 11. Ticket System

## 11.1 Ticket Types

```text
Incident
Service Request
Task
Problem
Change
Alert
Question
Access Request
Procurement Request
Onboarding Request
Offboarding Request
Security Event
```

---

## 11.2 Ticket Fields

```text
id
tenant_id
team_id
requester_id
assignee_id
watchers
title
description
type
category
subcategory
priority
impact
urgency
status
source
channel
sla_policy_id
due_at
first_response_due_at
resolution_due_at
resolved_at
closed_at
created_at
updated_at
custom_fields
tags
linked_assets
linked_tasks
linked_tickets
attachments
```

---

## 11.3 Ticket Statuses

```text
New
Triaged
Assigned
In Progress
Waiting on Requester
Waiting on Vendor
Waiting on Approval
Pending Change
Resolved
Closed
Cancelled
Reopened
```

Admins should be able to customize statuses per ticket type and per team.

---

## 11.4 Priority Matrix

Priority should be calculated from impact and urgency.

```text
Impact:
- Low
- Medium
- High
- Critical

Urgency:
- Low
- Medium
- High
- Critical

Priority:
- P4 Low
- P3 Medium
- P2 High
- P1 Critical
```

Example:

```text
Critical Impact + Critical Urgency = P1
High Impact + High Urgency = P2
Low Impact + Low Urgency = P4
```

---

## 11.5 Ticket Lifecycle

```text
Create
 -> Auto-classify
 -> Assign team
 -> Apply SLA
 -> Notify team
 -> Triage
 -> Assign agent
 -> Work
 -> Add public comments
 -> Add internal notes
 -> Link tasks/assets/knowledge
 -> Escalate if needed
 -> Resolve
 -> Requester confirms
 -> Close
 -> CSAT survey
 -> Reporting
```

---

# 12. Task Management

Tickets can have linked tasks.

Example:

```text
Ticket: New laptop setup for employee

Tasks:
1. Confirm manager approval
2. Create user account
3. Assign laptop
4. Install software
5. Configure VPN
6. Ship laptop
7. Confirm login
```

Task fields:

```text
id
tenant_id
team_id
ticket_id nullable
project_id nullable
title
description
status
priority
assignee_id
due_at
checklist
dependencies
created_by
created_at
updated_at
```

Task statuses:

```text
To Do
In Progress
Blocked
Done
Cancelled
```

---

# 13. Service Catalog

The service catalog lets users request predefined services.

Examples:

```text
Request laptop
Reset password
Request software access
Report outage
Request VPN
Request new email group
Request employee onboarding
Request employee offboarding
Request firewall change
Request database access
Request cloud account
Request procurement approval
```

Each catalog item supports:

```text
name
description
team_id
form_schema
approval_required
approval_chain
default_priority
default_sla
default_workflow
automation_rules
visibility
```

Form field types:

```text
Text
Textarea
Dropdown
Multi-select
Checkbox
Date
DateTime
User picker
Team picker
Asset picker
Attachment
Number
Currency
URL
Email
Phone
Rich text
```

---

# 14. Workflow Engine

## 14.1 Workflow Concepts

```text
Workflow
Trigger
Condition
Action
Approval
SLA Timer
Escalation
Notification
Assignment Rule
Webhook
```

---

## 14.2 Workflow Examples

### Password Reset

```text
Trigger:
Ticket created where category = Password Reset

Actions:
- Set priority = P3
- Assign to IT Support team
- Send requester confirmation
- Start 4-hour SLA
- Suggest knowledge article
```

### Laptop Request

```text
Trigger:
Catalog item = New Laptop

Actions:
- Require manager approval
- After approval, create procurement task
- Create asset assignment task
- Notify IT hardware team
- SLA: 5 business days
```

### Security Incident

```text
Trigger:
Ticket type = Security Event OR category = Phishing

Actions:
- Priority = P1
- Assign to Security Team
- Notify security manager
- Lock editing to security team only
- Create investigation checklist
- Start 30-minute first-response SLA
```

### Change Request

```text
Trigger:
Ticket type = Change

Actions:
- Require risk assessment
- Require approval
- Add implementation plan
- Add rollback plan
- Schedule change window
- Notify affected teams
```

---

## 14.3 Workflow JSON Example

```json
{
  "name": "Security Incident Workflow",
  "trigger": {
    "event": "ticket.created",
    "conditions": [
      {
        "field": "type",
        "operator": "equals",
        "value": "security_event"
      }
    ]
  },
  "actions": [
    {
      "type": "set_priority",
      "value": "P1"
    },
    {
      "type": "assign_team",
      "team_key": "security"
    },
    {
      "type": "notify",
      "target": "team_manager"
    }
  ]
}
```

---

# 15. SLA Engine

## 15.1 SLA Types

```text
First Response SLA
Resolution SLA
Update SLA
Approval SLA
Vendor SLA
Change Completion SLA
```

---

## 15.2 SLA Inputs

```text
ticket_type
priority
team
category
customer plan
business hours
holiday calendar
contract
```

---

## 15.3 SLA Example

```text
P1 Incident:
- First response: 15 minutes
- Resolution target: 4 hours
- Escalate after 10 minutes without assignment

P2 Incident:
- First response: 1 hour
- Resolution target: 8 hours

P3 Request:
- First response: 4 hours
- Resolution target: 3 business days
```

---

## 15.4 SLA Worker

A background worker should run every few minutes:

```text
1. Find active tickets with SLA timers.
2. Calculate remaining business time.
3. Detect warning threshold.
4. Detect breach.
5. Trigger escalation workflow.
6. Write audit event.
7. Notify assignee/team manager/admin.
```

---

# 16. Knowledge Base

Features:

- Public articles.
- Internal-only articles.
- Team-specific articles.
- Draft/review/publish workflow.
- Article categories.
- Article feedback.
- Article version history.
- Link article to ticket.
- AI-generated draft from resolved ticket.
- AI suggestions during ticket creation.

Article fields:

```text
id
tenant_id
team_id nullable
title
body
status
visibility
category
tags
created_by
reviewed_by
published_at
version
usefulness_score
```

---

# 17. Asset Management / Lightweight CMDB

## 17.1 Asset Types

```text
Laptop
Desktop
Mobile phone
Server
Router
Firewall
Cloud account
Software license
SaaS application
Database
API
Printer
Network device
Certificate
Domain
Vendor contract
```

---

## 17.2 Asset Fields

```text
id
tenant_id
team_id nullable
asset_tag
name
type
status
owner_user_id
assigned_user_id
location
serial_number
vendor
purchase_date
warranty_end
metadata
relationships
```

---

## 17.3 Asset Relationships

```text
Laptop assigned to User
Server hosts Application
Application depends on Database
Firewall protects Network
Certificate belongs to Domain
Vendor supports SaaS Application
```

Tickets should link to assets.

Example:

```text
Ticket: Email outage
Linked asset: Microsoft 365 Tenant
Linked users affected: 300
Linked vendor: Microsoft
Linked SLA: Critical Vendor SLA
```

---

# 18. Admin Sections

## 18.1 Tenant Settings

- Company name.
- Logo.
- Brand color.
- Default language.
- Timezone.
- Business hours.
- Holiday calendar.
- Default team.
- Default ticket type.
- Data retention settings.
- Export settings.

---

## 18.2 User Management

- Invite users.
- Remove users.
- Suspend users.
- Reset MFA.
- Assign roles.
- Assign teams.
- Bulk import users.
- View login history.
- View user activity.

---

## 18.3 Team Management

- Create team.
- Archive team.
- Assign team manager.
- Configure team queue.
- Configure team categories.
- Configure default assignee.
- Configure team SLA.
- Configure team automation.
- Configure team visibility.

---

## 18.4 Roles and Permissions

- Create custom roles.
- Clone roles.
- Add/remove permissions.
- Team-scoped roles.
- Tenant-wide roles.
- Deny rules.
- Temporary access grants.
- Audit role changes.

---

## 18.5 Ticket Configuration

- Ticket types.
- Statuses.
- Priorities.
- Impact/urgency matrix.
- Categories.
- Subcategories.
- Tags.
- Custom fields.
- Required fields.
- Field visibility.
- Field validation.
- Ticket numbering format.

---

## 18.6 Forms and Service Catalog

- Create catalog item.
- Drag-and-drop form builder.
- Approval setup.
- Team routing.
- SLA mapping.
- Visibility rules.
- Automation rules.
- Catalog analytics.

---

## 18.7 Workflow Builder

- Trigger builder.
- Condition builder.
- Action builder.
- Approval chain builder.
- Webhook action.
- Email action.
- Slack/Teams action.
- Assignment rule.
- Escalation rule.
- Test workflow simulator.
- Workflow versioning.

---

## 18.8 SLA Configuration

- SLA policies.
- Business hours.
- Holiday calendars.
- Pause conditions.
- Breach rules.
- Escalation levels.
- Notifications.
- SLA reports.

---

## 18.9 Notification Settings

Channels:

```text
Email
In-app
Slack
Microsoft Teams
SMS later
Webhook
```

Events:

```text
Ticket created
Ticket assigned
Comment added
Status changed
SLA warning
SLA breached
Approval requested
Approval completed
Task due
Mention
```

---

## 18.10 Email Channel

- Inbound mailbox.
- Email-to-ticket.
- Email threading.
- Email parser.
- Auto-reply templates.
- Domain verification.
- Allowed senders.
- Blocklist.
- Signature stripping.
- Attachment handling.

---

## 18.11 Integrations

MVP integrations:

```text
Email
Slack
Microsoft Teams
Google Workspace
Microsoft 365
GitHub
Jira
Webhook
Zapier/n8n
```

Later integrations:

```text
Okta
Azure AD
Intune
Jamf
AWS
Azure
GCP
Datadog
PagerDuty
CrowdStrike
ServiceNow import
Freshservice import
Zendesk import
```

---

## 18.12 AI Settings

- Enable/disable AI.
- Choose model provider.
- Model routing.
- Token budget.
- PII redaction.
- AI classification.
- AI priority suggestion.
- AI summary.
- AI resolution draft.
- AI knowledge article draft.
- AI auto-response allowed/not allowed.
- Human approval required.

---

## 18.13 Audit and Compliance

- Login audit.
- Config change audit.
- Ticket change audit.
- Permission change audit.
- Data export audit.
- Admin activity audit.
- API key activity.
- Failed access attempts.
- Retention policy.
- Legal hold later.

---

## 18.14 Billing and Plans

- Individual free/paid.
- Team plan.
- Company plan.
- Enterprise plan.
- User limits.
- Team limits.
- Ticket limits.
- Attachment storage limits.
- AI token limits.
- Integration limits.

---

# 19. Database Design

## 19.1 Main Tables

```text
users
tenants
tenant_memberships
teams
team_memberships
roles
permissions
role_permissions
user_role_assignments

tickets
ticket_comments
ticket_attachments
ticket_history
ticket_watchers
ticket_links
ticket_custom_field_values

tasks
task_comments
task_history

service_catalog_items
form_definitions
form_submissions

workflows
workflow_versions
workflow_runs
workflow_run_steps

sla_policies
sla_timers
business_hours
holiday_calendars

knowledge_articles
knowledge_article_versions
knowledge_feedback

assets
asset_relationships
vendors

notifications
notification_preferences
email_threads
email_messages

integrations
webhooks
api_keys

audit_logs
billing_accounts
subscriptions
usage_events

ai_requests
ai_outputs
ai_token_usage
```

---

## 19.2 Required Fields

Every tenant-owned table must have:

```text
tenant_id
created_at
updated_at
created_by
updated_by
```

Every team-scoped table should have:

```text
team_id
```

Every sensitive change should create a record in:

```text
audit_logs
```

---

# 20. API Design

## 20.1 Auth APIs

```text
POST /auth/signup/individual
POST /auth/signup/company
POST /auth/login
POST /auth/logout
POST /auth/verify-email
POST /auth/forgot-password
POST /auth/reset-password
POST /auth/mfa/setup
POST /auth/mfa/verify
```

---

## 20.2 Tenant APIs

```text
GET /tenants/current
PATCH /tenants/current
GET /tenants/current/settings
PATCH /tenants/current/settings
```

---

## 20.3 Team APIs

```text
GET /teams
POST /teams
GET /teams/{teamId}
PATCH /teams/{teamId}
DELETE /teams/{teamId}
POST /teams/{teamId}/members
DELETE /teams/{teamId}/members/{userId}
```

---

## 20.4 Ticket APIs

```text
GET /tickets
POST /tickets
GET /tickets/{ticketId}
PATCH /tickets/{ticketId}
POST /tickets/{ticketId}/comments
POST /tickets/{ticketId}/internal-notes
POST /tickets/{ticketId}/assign
POST /tickets/{ticketId}/resolve
POST /tickets/{ticketId}/close
POST /tickets/{ticketId}/reopen
POST /tickets/{ticketId}/attachments
GET /tickets/{ticketId}/history
```

---

## 20.5 Task APIs

```text
GET /tasks
POST /tasks
GET /tasks/{taskId}
PATCH /tasks/{taskId}
DELETE /tasks/{taskId}
POST /tasks/{taskId}/comments
```

---

## 20.6 Admin APIs

```text
GET /admin/users
POST /admin/users/invite
PATCH /admin/users/{userId}
GET /admin/roles
POST /admin/roles
PATCH /admin/roles/{roleId}
GET /admin/permissions
GET /admin/audit-logs
GET /admin/config/tickets
PATCH /admin/config/tickets
GET /admin/config/slas
POST /admin/config/slas
GET /admin/config/workflows
POST /admin/config/workflows
```

---

# 21. UI / UX Structure

## 21.1 Individual User UI

```text
Dashboard
My Tickets
My Tasks
Create Ticket
Knowledge Base
My Assets
Settings
AI Assistant
```

---

## 21.2 Company User UI

```text
Home
My Tickets
Team Queue
Tasks
Service Catalog
Knowledge Base
Assets
Reports
Approvals
Admin
```

---

## 21.3 Admin UI

```text
Admin Dashboard
Company Settings
Users
Teams
Roles & Permissions
Ticket Configuration
Forms
Service Catalog
Workflows
SLAs
Notifications
Email Channels
Integrations
AI Settings
Audit Logs
Billing
Security
Data Export
```

---

## 21.4 Ticket Detail Page

```text
Header:
- Ticket number
- Title
- Status
- Priority
- Assignee
- Team
- SLA timer

Main:
- Description
- Conversation
- Internal notes
- Attachments
- Tasks
- Linked tickets
- Linked assets
- Knowledge suggestions

Right Panel:
- Requester
- Category
- Type
- Impact
- Urgency
- Tags
- Custom fields
- Created date
- Updated date
- SLA status
```

---

# 22. AI Features

## 22.1 MVP AI Features

- Classify ticket type.
- Suggest priority.
- Suggest team routing.
- Summarize long ticket conversations.
- Draft response.
- Suggest knowledge article.
- Convert resolved ticket into knowledge draft.
- Detect duplicate tickets.
- Extract action items.
- Translate requester text.
- Detect frustration or sentiment.

---

## 22.2 AI Guardrails

- Never auto-close tickets without permission.
- Never send AI responses externally unless admin allows.
- Redact PII before sending to LLM if configured.
- Log all AI requests.
- Track token usage by tenant/team/user.
- Allow admins to disable AI per module.
- Show “AI suggested” label.

---

## 22.3 Model Router

```text
Input:
- use_case
- tenant_id
- sensitivity
- max_cost
- speed_required
- quality_required

Decision:
- Cheap model for classification
- Better model for summaries
- Stronger model for workflow generation
- Local/private model for sensitive tenants
```

---

# 23. Automation Engine

Automation rule format:

```text
WHEN event happens
IF conditions match
THEN perform actions
```

Events:

```text
ticket.created
ticket.updated
ticket.assigned
ticket.status_changed
ticket.priority_changed
ticket.comment_added
ticket.sla_warning
ticket.sla_breached
approval.requested
approval.approved
approval.rejected
task.created
task.completed
```

Conditions:

```text
field equals value
field contains value
priority greater than
team equals
requester belongs to department
created via email
SLA remaining less than
```

Actions:

```text
assign team
assign user
set priority
set status
add tag
send email
send Slack message
create task
request approval
call webhook
start workflow
pause SLA
escalate
```

---

# 24. Security Architecture

## 24.1 Required Security Controls

- Tenant isolation in every query.
- Row-level security where possible.
- Secure sessions.
- MFA.
- Email verification.
- Rate limiting.
- Brute-force protection.
- CSRF protection where applicable.
- XSS protection.
- Secure file upload scanning.
- Object-level authorization.
- API key scoping.
- Audit logs.
- Admin action confirmation.
- Encryption at rest.
- Encryption in transit.
- Secret manager.
- Backup encryption.
- Role-based access.
- Least privilege.
- Permission testing.

---

## 24.2 Critical Authorization Rule

Do not rely only on frontend hiding.

Every backend request must check:

```text
user_id
tenant_id
team_id
role
permissions
record ownership
record visibility
```

---

# 25. Observability

Track:

```text
API latency
Error rate
Ticket creation rate
SLA breach rate
Workflow failures
Email ingestion failures
AI request cost
AI token usage
Queue lag
Database slow queries
Login failures
Permission denials
```

Use:

```text
OpenTelemetry
Prometheus
Grafana
Loki
Sentry
```

---

# 26. MVP Scope

## 26.1 MVP Must Have

```text
1. Individual signup/login
2. Company signup/login
3. Tenant model
4. Teams
5. Team membership
6. Roles and permissions
7. Ticket creation
8. Ticket queue
9. Ticket detail page
10. Ticket comments and internal notes
11. Ticket assignment
12. Ticket statuses
13. Tasks linked to tickets
14. Admin user/team management
15. Basic ticket configuration
16. Basic SLA
17. Basic email notifications
18. Audit logs
19. Basic dashboard
20. AI ticket classification and summary
```

---

## 26.2 Not Required in MVP

```text
Advanced CMDB
Advanced change management
Marketplace integrations
Complex SAML/SCIM
Mobile app
Complex reporting builder
Advanced AI agents
Customer billing automation
Full no-code workflow builder
```

---

# 27. Build Phases

## Phase 1: Foundation

- Create repo.
- Set up frontend/backend/database.
- Add auth.
- Add tenant model.
- Add user memberships.
- Add teams.
- Add RBAC.
- Add audit logs.

---

## Phase 2: Tickets

- Ticket CRUD.
- Queue.
- Ticket detail.
- Comments.
- Internal notes.
- Assignment.
- Status changes.
- Attachments.
- History.

---

## Phase 3: Admin

- Admin dashboard.
- Users.
- Teams.
- Roles.
- Ticket types.
- Categories.
- Priorities.
- Statuses.
- Custom fields.

---

## Phase 4: Tasks and SLAs

- Linked tasks.
- SLA policies.
- SLA timers.
- SLA worker.
- Escalations.
- Notifications.

---

## Phase 5: Service Catalog

- Catalog items.
- Dynamic forms.
- Request portal.
- Approval basics.
- Routing rules.

---

## Phase 6: AI

- Ticket classification.
- Priority suggestion.
- Team routing.
- Summaries.
- Suggested responses.
- Knowledge article draft.

---

## Phase 7: Integrations

- Email-to-ticket.
- Slack.
- Microsoft Teams.
- Webhooks.
- API keys.

---

## Phase 8: Production Hardening

- Backups.
- Monitoring.
- Rate limits.
- MFA.
- Security tests.
- Load tests.
- Billing.
- Documentation.

---

# 28. Product Differentiators

```text
Team-space isolation done right.
Individual + company mode in one product.
Admin-configurable everything.
AI-assisted ticket triage.
AI-generated knowledge base.
Zero-waste model routing for lower AI cost.
No-code workflows.
Fast setup for small teams.
Enterprise-ready permissions.
Simple UI, not bloated enterprise complexity.
```

---

# 29. Suggested Product Name Ideas

```text
FixDesk
FlowDesk
TeamResolve
TaskRelay
OpsNest
HelpGrid
TicketPilot
ServiceForge
DeskOrbit
ClarityDesk
```

---

# 30. Detailed AI Coding App Prompt

Use the following prompt in Cursor, Replit Agent, Lovable, Bolt, Windsurf, Claude Code, or another AI coding app.

```text
You are a senior full-stack SaaS architect and principal engineer. Build a production-grade multi-tenant ITSM platform for individuals, companies, and teams.

PRODUCT NAME:
Use a temporary name: FlowDesk ITSM.

PRIMARY GOAL:
Build a SaaS ITSM system where:
1. Individuals can sign up, log in, and immediately use a personal ITSM workspace.
2. Companies can sign up, create a company workspace, create teams, invite users, assign roles, and let each team member access only their allowed team space.
3. Admins can configure everything from A to Z: users, teams, roles, permissions, ticket types, statuses, priorities, categories, forms, workflows, SLAs, notifications, email routing, integrations, AI settings, security settings, audit logs, and billing settings.
4. Users can create and manage tickets and tasks end to end.
5. The platform must be secure, tenant-isolated, role-based, scalable, clean, and simple to use.

IMPORTANT DESIGN PRINCIPLES:
- Use a modular monolith first, not microservices.
- Every record must be tenant-aware.
- Team-scoped records must enforce team-level access.
- Never allow cross-tenant data leakage.
- Never rely on frontend-only authorization.
- All authorization must be enforced in the backend.
- Build with clean architecture and strong typing.
- Add audit logs for important actions.
- Design for future AI, workflow automation, SLA, email-to-ticket, and integrations.
- Keep the UI clean, modern, and fast.
- Use reusable components.
- Use simple code, not over-engineered code.
- Include seed data for demo.

TECH STACK:
Frontend:
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- React Hook Form
- Zod validation

Backend:
Choose one of these depending on project setup:
Option A: Next.js full-stack with server actions/API routes
Option B: FastAPI backend with Next.js frontend
If using one app, prefer Next.js full-stack for speed.

Database:
- PostgreSQL
- Prisma ORM

Cache/Queue:
- Redis optional for MVP
- Add architecture hooks for future worker jobs

Storage:
- Local storage for dev attachments
- Abstract storage service so S3/MinIO can be added later

Auth:
- Email/password login
- Email verification placeholder
- Password reset placeholder
- JWT/session-based auth
- Middleware-protected routes
- Role and permission checks

AI:
- Create AI service abstraction but do not hardcode one vendor.
- Add placeholder functions for:
  - classifyTicket
  - suggestPriority
  - suggestTeam
  - summarizeTicket
  - draftResponse
  - generateKnowledgeDraft

CORE ENTITIES:
Create database models for:

User:
- id
- name
- email
- passwordHash
- emailVerified
- avatarUrl
- status: active, invited, suspended
- createdAt
- updatedAt

Tenant:
- id
- name
- slug
- type: individual, company
- ownerUserId
- plan
- settings JSON
- createdAt
- updatedAt

TenantMembership:
- id
- tenantId
- userId
- status
- createdAt
- updatedAt

Team:
- id
- tenantId
- name
- slug
- description
- isDefault
- status
- createdAt
- updatedAt

TeamMembership:
- id
- tenantId
- teamId
- userId
- roleId
- createdAt
- updatedAt

Role:
- id
- tenantId nullable for system roles
- name
- key
- description
- scope: system, tenant, team
- isSystem
- createdAt
- updatedAt

Permission:
- id
- key
- description
- category

RolePermission:
- id
- roleId
- permissionId

UserRoleAssignment:
- id
- tenantId
- teamId nullable
- userId
- roleId
- createdAt

Ticket:
- id
- tenantId
- teamId
- ticketNumber
- requesterId
- assigneeId nullable
- title
- description
- type: incident, service_request, task, problem, change, alert, question, access_request
- status: new, triaged, assigned, in_progress, waiting_on_requester, waiting_on_vendor, waiting_on_approval, pending_change, resolved, closed, cancelled, reopened
- priority: p1, p2, p3, p4
- impact: low, medium, high, critical
- urgency: low, medium, high, critical
- category
- subcategory
- source: portal, email, api, admin, ai
- tags string array
- customFields JSON
- dueAt nullable
- firstResponseDueAt nullable
- resolutionDueAt nullable
- resolvedAt nullable
- closedAt nullable
- createdBy
- updatedBy
- createdAt
- updatedAt

TicketComment:
- id
- tenantId
- teamId
- ticketId
- authorId
- body
- visibility: public, internal
- createdAt
- updatedAt

TicketHistory:
- id
- tenantId
- teamId
- ticketId
- actorId
- action
- oldValue JSON nullable
- newValue JSON nullable
- createdAt

Task:
- id
- tenantId
- teamId
- ticketId nullable
- title
- description
- status: todo, in_progress, blocked, done, cancelled
- priority
- assigneeId nullable
- dueAt nullable
- createdBy
- updatedBy
- createdAt
- updatedAt

ServiceCatalogItem:
- id
- tenantId
- teamId
- name
- description
- category
- formSchema JSON
- defaultPriority
- defaultSlaPolicyId nullable
- approvalRequired boolean
- visibility
- status
- createdAt
- updatedAt

Workflow:
- id
- tenantId
- teamId nullable
- name
- description
- trigger JSON
- conditions JSON
- actions JSON
- enabled boolean
- version
- createdAt
- updatedAt

SLAPolicy:
- id
- tenantId
- teamId nullable
- name
- description
- ticketType nullable
- priority nullable
- firstResponseMinutes
- resolutionMinutes
- businessHoursId nullable
- enabled
- createdAt
- updatedAt

KnowledgeArticle:
- id
- tenantId
- teamId nullable
- title
- body
- status: draft, review, published, archived
- visibility: public, internal, team
- category
- tags string array
- createdBy
- reviewedBy nullable
- publishedAt nullable
- version
- createdAt
- updatedAt

Asset:
- id
- tenantId
- teamId nullable
- assetTag
- name
- type
- status
- assignedUserId nullable
- ownerUserId nullable
- location
- serialNumber
- vendor
- purchaseDate nullable
- warrantyEnd nullable
- metadata JSON
- createdAt
- updatedAt

Notification:
- id
- tenantId
- userId
- title
- body
- type
- readAt nullable
- createdAt

AuditLog:
- id
- tenantId
- teamId nullable
- actorId nullable
- action
- entityType
- entityId
- metadata JSON
- ipAddress nullable
- userAgent nullable
- createdAt

AIRequest:
- id
- tenantId
- teamId nullable
- userId
- useCase
- provider nullable
- model nullable
- inputTokens
- outputTokens
- costEstimate
- status
- createdAt

PERMISSION KEYS:
Create seed permissions:
- tenant.view
- tenant.update
- admin.view
- admin.configure
- user.invite
- user.update
- user.suspend
- team.create
- team.update
- team.delete
- team.manage_members
- role.create
- role.update
- role.assign
- ticket.create
- ticket.read.own
- ticket.read.team
- ticket.read.all
- ticket.update.own
- ticket.update.team
- ticket.update.all
- ticket.assign
- ticket.resolve
- ticket.close
- ticket.delete
- ticket.comment.public
- ticket.comment.internal
- task.create
- task.read.team
- task.update.team
- task.delete
- catalog.create
- catalog.update
- workflow.create
- workflow.update
- sla.create
- sla.update
- knowledge.create
- knowledge.publish
- asset.create
- asset.update
- report.view
- audit.read
- integration.manage
- ai.manage
- billing.manage

DEFAULT ROLES:
System Owner:
- all permissions

Tenant Admin:
- all tenant permissions except platform operations

Team Manager:
- team queue management
- ticket read/update/team assignment
- task management
- team reports

Agent:
- ticket read team
- ticket update team
- comment public/internal
- task update team

Requester:
- ticket create
- ticket read own
- public comments

Auditor:
- read-only tenant/team data
- audit read

AUTH FLOWS:
Individual signup:
1. User enters name, email, password.
2. Create user.
3. Create tenant with type = individual.
4. Create default team named Personal Workspace.
5. Add user as tenant owner/admin.
6. Assign user to default team.
7. Redirect to dashboard.

Company signup:
1. User enters name, email, password.
2. Ask company name.
3. Create user.
4. Create tenant with type = company.
5. Create default teams:
   - IT Support
   - General Requests
6. Add owner as tenant admin.
7. Assign owner to all default teams.
8. Redirect to admin onboarding wizard.

LOGIN FLOW:
- User logs in.
- If user belongs to multiple tenants, show tenant switcher.
- Store active tenant in session.
- Load allowed teams and permissions.
- Route user to dashboard.

TENANT ISOLATION:
Implement helper functions:
- getCurrentUser()
- getCurrentTenant()
- getUserTenantMembership()
- getUserTeamIds()
- requirePermission(permissionKey, options)
- canAccessTicket(user, ticket)
- canAccessTeam(user, teamId)
- requireTenantAccess(tenantId)
- requireTeamAccess(teamId)

Every API route must:
1. Authenticate user.
2. Resolve active tenant.
3. Check tenant membership.
4. Check permissions.
5. Apply tenant_id filter to every query.
6. Apply team filter when needed.
7. Write audit log for create/update/delete/admin actions.

UI PAGES:
Public:
- /
- /pricing
- /login
- /signup
- /signup/individual
- /signup/company
- /forgot-password

App:
- /app/dashboard
- /app/tickets
- /app/tickets/new
- /app/tickets/[id]
- /app/tasks
- /app/service-catalog
- /app/knowledge
- /app/assets
- /app/reports
- /app/approvals
- /app/settings

Admin:
- /app/admin
- /app/admin/company
- /app/admin/users
- /app/admin/teams
- /app/admin/roles
- /app/admin/permissions
- /app/admin/ticket-config
- /app/admin/forms
- /app/admin/service-catalog
- /app/admin/workflows
- /app/admin/slas
- /app/admin/notifications
- /app/admin/email
- /app/admin/integrations
- /app/admin/ai
- /app/admin/security
- /app/admin/audit-logs
- /app/admin/billing

DASHBOARD REQUIREMENTS:
Show cards:
- My open tickets
- Team open tickets
- P1/P2 tickets
- SLA warnings
- SLA breaches
- Tasks due today
- Tickets by status
- Tickets by priority
- Recent activity

TICKET LIST REQUIREMENTS:
- Table and kanban view
- Filters:
  - status
  - priority
  - type
  - team
  - assignee
  - requester
  - category
  - created date
  - SLA status
- Search by ticket number/title/description
- Bulk assign
- Bulk status update
- Bulk priority update
- Export CSV placeholder

TICKET DETAIL REQUIREMENTS:
Display:
- ticket number
- title
- status
- priority
- type
- team
- requester
- assignee
- SLA timers
- description
- public conversation
- internal notes
- attachments placeholder
- linked tasks
- linked assets
- history timeline
- AI summary panel
- suggested knowledge articles placeholder

Actions:
- edit ticket
- assign
- change status
- change priority
- add public reply
- add internal note
- create task
- resolve
- close
- reopen
- link asset
- link knowledge article

TASK REQUIREMENTS:
- Create task standalone or linked to ticket.
- Assign to user.
- Due date.
- Status updates.
- Show task board.

ADMIN REQUIREMENTS:
Company settings:
- edit company name/logo/timezone/business hours placeholder

Users:
- invite user
- list users
- assign role
- assign team
- suspend user

Teams:
- create team
- edit team
- assign members
- set manager

Roles:
- view default roles
- create custom role
- assign permissions

Ticket config:
- manage ticket types
- manage statuses
- manage priorities
- manage categories
- manage custom fields placeholder

Service catalog:
- create catalog item
- define form schema JSON
- set default team
- set approval required

Workflows:
- create workflow with trigger/condition/action JSON
- enable/disable workflow
- show workflow run history placeholder

SLA:
- create SLA policy
- assign by ticket type/priority/team
- display timers on tickets

Audit logs:
- searchable table
- filter by user/action/entity/date

AI:
- settings page
- enable/disable AI
- set provider placeholder
- set model placeholder
- set monthly token budget
- configure features:
  - classify tickets
  - suggest priority
  - summarize tickets
  - draft response
  - knowledge article generation

WORKFLOW ENGINE MVP:
Implement basic event dispatcher:
- emitEvent(eventName, payload)
- find enabled workflows for tenant/team
- evaluate simple conditions
- execute simple actions

Supported triggers:
- ticket.created
- ticket.updated
- ticket.status_changed
- ticket.assigned
- comment.created

Supported actions:
- set_priority
- assign_team
- assign_user
- add_tag
- send_notification
- create_task
- add_internal_note

SLA ENGINE MVP:
When ticket is created:
- Find matching SLA policy by tenant/team/type/priority.
- Set firstResponseDueAt.
- Set resolutionDueAt.

Create background-compatible function:
- checkSlaBreaches()

It should:
- find unresolved tickets with SLA due dates
- mark warning/breached in calculated response
- create notification and audit log placeholder

EMAIL NOTIFICATIONS:
For MVP:
- Create notification records in database.
- Add email service abstraction.
- Do not require real SMTP unless configured.
- Create templates:
  - ticket created
  - ticket assigned
  - ticket comment added
  - SLA warning
  - SLA breached
  - approval requested

AI SERVICE:
Create /lib/ai/aiService.ts with:
- classifyTicket(input)
- suggestPriority(input)
- suggestTeam(input)
- summarizeTicket(input)
- draftTicketResponse(input)
- generateKnowledgeArticle(input)

For now, return deterministic mock responses if API key is missing.
Code should be ready to plug in real model providers later.

SECURITY REQUIREMENTS:
- Passwords must be hashed.
- Never store plain passwords.
- Validate all inputs with Zod.
- Protect all app routes.
- Implement backend permission checks.
- Prevent IDOR by checking tenant_id and team access.
- Add rate limit placeholder.
- Add audit logs.
- Sanitize rich text.
- Validate file uploads placeholder.
- Do not expose sensitive fields in API responses.
- Use environment variables for secrets.

SEED DATA:
Create demo data:

Tenant 1: Individual Demo
- User: individual@example.com
- Team: Personal Workspace
- 3 tickets
- 3 tasks

Tenant 2: Acme Corp
- Owner/admin
- Teams:
  - IT Support
  - Security
  - Facilities
- Users:
  - admin
  - IT manager
  - IT agent
  - Security agent
  - requester
- Tickets:
  - P1 email outage
  - VPN access request
  - laptop setup
  - phishing report
  - printer issue
- Tasks linked to laptop setup
- SLA policies
- Knowledge articles
- Assets

ACCEPTANCE TESTS:
1. Individual signup creates individual tenant and personal workspace.
2. Company signup creates company tenant and default teams.
3. Team A user cannot see Team B tickets.
4. Requester can only see their own tickets.
5. Agent can see tickets in assigned teams.
6. Tenant admin can see all tenant tickets.
7. Ticket creation writes ticket history.
8. Ticket status change writes audit/history.
9. Internal notes are not visible to requester.
10. SLA due dates are applied on ticket creation.
11. Admin can create users, teams, roles, and ticket config.
12. AI mock summary works.
13. Search and filters work on ticket list.
14. Audit log records admin changes.
15. API rejects cross-tenant access even when IDs are guessed.

DELIVERABLES:
- Working app
- Database schema
- Seed script
- Clean UI
- Protected routes
- Admin pages
- Ticket workflow
- Team isolation
- RBAC
- Basic SLA
- Basic workflow engine
- AI service abstraction
- README with setup instructions
- ENV example file
- Test checklist

IMPLEMENTATION ORDER:
1. Initialize project.
2. Add database schema.
3. Add seed data.
4. Add auth.
5. Add tenant/team/RBAC helpers.
6. Add protected app layout.
7. Add dashboard.
8. Add ticket CRUD.
9. Add ticket detail.
10. Add comments/internal notes.
11. Add tasks.
12. Add admin users/teams/roles.
13. Add ticket configuration.
14. Add SLA policies.
15. Add workflow engine MVP.
16. Add knowledge base.
17. Add assets.
18. Add AI service abstraction.
19. Add audit logs everywhere.
20. Add tests and README.

Do not skip tenant isolation.
Do not skip permission checks.
Do not build fake UI only.
Every page must connect to real database-backed APIs.
Use clean, production-quality code.
```

---

# 31. Final Build Recommendation

Start with the foundation:

```text
Auth
Tenant
Teams
RBAC
Tickets
Tasks
Admin
Audit
SLA basics
AI abstraction
```

Then add:

```text
Service catalog
Workflow builder
Email-to-ticket
Knowledge base
Assets
Integrations
Advanced AI
```

The make-or-break part is tenant and team isolation. If isolation is wrong, companies will not trust the product. If isolation is right, the platform can grow into a full ITSM suite over time.
